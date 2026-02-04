import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Status values indicating waiting on RD check
const WAITING_RD_CHECK_STATUSES = [
  'Waiting on Recoverable Depreciation',
  'Waiting on RD Check',
  'RD Check Pending',
  'Awaiting RD Check',
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate CRON_SECRET for security
  const cronSecret = Deno.env.get('CRON_SECRET');
  const providedSecret = req.headers.get('x-cron-secret');
  
  if (cronSecret && providedSecret !== cronSecret) {
    console.error('Invalid or missing cron secret');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log("Processing RD check tracking...");

    // Get global settings for RD check tracking
    const { data: globalSettings } = await supabase
      .from('global_automation_settings')
      .select('setting_value')
      .eq('setting_key', 'rd_follow_up_defaults')
      .single();

    const rdSettings = globalSettings?.setting_value || {
      rd_check_expected_days: 10,
      rd_check_alert_after_days: 14,
      rd_check_follow_up_interval_days: 3,
      rd_check_max_follow_ups: 5,
    };

    // Find all claims with RD check tracking enabled that are overdue
    const { data: overdueChecks, error: fetchError } = await supabase
      .from('claim_automations')
      .select(`
        *,
        claims!inner(
          id,
          claim_number,
          policy_number,
          policyholder_name,
          policyholder_email,
          policyholder_phone,
          adjuster_name,
          adjuster_email,
          status,
          insurance_company
        )
      `)
      .eq('is_enabled', true)
      .eq('rd_check_tracking_enabled', true)
      .is('rd_check_received_at', null)
      .not('rd_check_released_at', 'is', null);

    if (fetchError) {
      console.error("Failed to fetch RD check tracking:", fetchError);
      throw fetchError;
    }

    const now = new Date();
    const results: any[] = [];

    for (const automation of overdueChecks || []) {
      const claim = (automation as any).claims;
      const releasedAt = new Date(automation.rd_check_released_at);
      const daysSinceRelease = Math.floor((now.getTime() - releasedAt.getTime()) / (1000 * 60 * 60 * 24));
      
      // Check if we've exceeded max follow-ups
      if (automation.rd_check_follow_up_count >= rdSettings.rd_check_max_follow_ups) {
        console.log(`Claim ${claim.claim_number}: Max RD check follow-ups reached`);
        continue;
      }

      // Only follow up if past expected date and it's time for next follow-up
      const expectedDays = rdSettings.rd_check_expected_days;
      if (daysSinceRelease < expectedDays) {
        console.log(`Claim ${claim.claim_number}: Still within expected window (${daysSinceRelease}/${expectedDays} days)`);
        continue;
      }

      // Check if it's time for next follow-up
      if (automation.rd_check_next_follow_up_at && new Date(automation.rd_check_next_follow_up_at) > now) {
        continue;
      }

      // Determine if this is overdue (past alert threshold)
      const isOverdue = daysSinceRelease >= rdSettings.rd_check_alert_after_days;
      const followUpCount = automation.rd_check_follow_up_count + 1;

      // Send notification to policyholder to check their mail
      const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
      if (!lovableApiKey) {
        console.error('LOVABLE_API_KEY not configured');
        continue;
      }

      const systemPrompt = `You are a professional public adjuster assistant for Freedom Claims. Generate a brief, friendly follow-up to the policyholder about their Recoverable Depreciation check.

CLAIM CONTEXT:
- Claim Number: ${claim.claim_number || 'N/A'}
- Policyholder: ${claim.policyholder_name || 'N/A'}
- Insurance Company: ${claim.insurance_company || 'the carrier'}
- RD Check Released: ${releasedAt.toLocaleDateString()}
- Days Since Release: ${daysSinceRelease}

This is check status follow-up #${followUpCount}.
${isOverdue ? 'NOTE: This check is now OVERDUE based on expected delivery timeframe.' : ''}

PURPOSE:
This is a friendly check-in with the policyholder to:
1. Ask if they've received the Recoverable Depreciation check from ${claim.insurance_company || 'the carrier'}
2. If not, suggest checking with neighbors, the mailbox, etc.
3. If overdue, mention that we can follow up with the carrier to trace the check

GUIDELINES:
1. Be warm, helpful, and brief
2. Don't cause alarm - just checking in
3. Ask them to let us know once they receive the check
4. Keep it under 100 words
5. Sign off as "Freedom Claims Team"
6. Use plain text only`;

      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: isOverdue 
              ? `Generate a follow-up asking if the policyholder has received their RD check. It's now ${daysSinceRelease} days since release - mention we can contact the carrier to trace it if needed.`
              : `Generate a friendly check-in asking if the policyholder has received their RD check yet.` 
            }
          ],
        }),
      });

      const aiData = await aiResponse.json();
      
      if (!aiResponse.ok) {
        console.error('AI gateway error:', aiData);
        continue;
      }

      const messageBody = aiData.choices[0].message.content;
      const recipientEmail = claim.policyholder_email;

      if (recipientEmail) {
        // Send email to policyholder
        const subject = isOverdue 
          ? `Overdue: Have you received your RD check? - Claim ${claim.claim_number}`
          : `Checking in: RD Check Status - Claim ${claim.claim_number}`;

        const sanitizedPolicyNumber = claim.policy_number 
          ? claim.policy_number.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
          : claim.id.slice(0, 8);
        const claimEmail = `claim-${sanitizedPolicyNumber}@claims.freedomclaims.work`;

        const sendResponse = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              recipients: [{ email: recipientEmail, name: claim.policyholder_name, type: 'rd_check_follow_up' }],
              subject,
              body: messageBody,
              claimId: claim.id,
              claimEmailCc: claimEmail,
            }),
          }
        );

        if (!sendResponse.ok) {
          const errorText = await sendResponse.text();
          console.error(`Failed to send RD check follow-up for claim ${claim.claim_number}:`, errorText);
          continue;
        }

        console.log(`RD Check follow-up #${followUpCount} sent for claim ${claim.claim_number}`);
      }

      // Update tracking
      const nextFollowUpAt = new Date();
      nextFollowUpAt.setDate(nextFollowUpAt.getDate() + rdSettings.rd_check_follow_up_interval_days);

      await supabase
        .from('claim_automations')
        .update({
          rd_check_follow_up_count: followUpCount,
          rd_check_last_follow_up_at: now.toISOString(),
          rd_check_next_follow_up_at: nextFollowUpAt.toISOString(),
        })
        .eq('id', automation.id);

      // Add activity note
      await supabase
        .from('claim_updates')
        .insert({
          claim_id: claim.id,
          content: `📬 RD Check Follow-up #${followUpCount} sent to ${claim.policyholder_name} - ${isOverdue ? 'Check is overdue' : 'Checking if check was received'} (${daysSinceRelease} days since release)`,
          update_type: 'rd_check_follow_up',
        });

      results.push({
        claimId: claim.id,
        claimNumber: claim.claim_number,
        followUpCount,
        daysSinceRelease,
        isOverdue,
      });
    }

    console.log(`Processed ${results.length} RD check follow-ups`);

    return new Response(
      JSON.stringify({ success: true, processed: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error processing RD check tracking:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
