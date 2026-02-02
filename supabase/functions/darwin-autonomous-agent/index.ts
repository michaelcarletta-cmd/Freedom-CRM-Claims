import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Keywords that should trigger escalation
const ESCALATION_KEYWORDS = [
  'lawsuit', 'attorney', 'lawyer', 'legal action', 'litigation',
  'bad faith', 'sue', 'court', 'complaint', 'demand letter'
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log("Darwin Autonomous Agent starting...");

    // Get all claims with autonomy enabled
    const { data: automatedClaims, error: fetchError } = await supabase
      .from('claim_automations')
      .select(`
        *,
        claims(
          id,
          claim_number,
          policyholder_name,
          status,
          insurance_company
        )
      `)
      .eq('is_enabled', true)
      .in('autonomy_level', ['semi_autonomous', 'fully_autonomous']);

    if (fetchError) {
      console.error("Failed to fetch automated claims:", fetchError);
      throw fetchError;
    }

    console.log(`Found ${automatedClaims?.length || 0} claims with autonomy enabled`);

    const results = {
      processed: 0,
      tasks_completed: 0,
      emails_sent: 0,
      escalations: 0,
      errors: [] as string[],
    };

    for (const automation of automatedClaims || []) {
      const claim = automation.claims;
      if (!claim) continue;

      try {
        console.log(`Processing claim ${claim.claim_number}...`);

        // Check daily action limit
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const { count: todayActions } = await supabase
          .from('darwin_action_log')
          .select('*', { count: 'exact', head: true })
          .eq('claim_id', claim.id)
          .eq('was_auto_executed', true)
          .gte('executed_at', today.toISOString());

        if ((todayActions || 0) >= (automation.daily_action_limit || 10)) {
          console.log(`Claim ${claim.claim_number} hit daily action limit`);
          continue;
        }

        // 1. AUTO-COMPLETE TASKS (if enabled)
        if (automation.auto_complete_tasks) {
          await processAutoCompleteTasks(supabase, claim.id, results);
        }

        // 2. AUTO-SEND PENDING EMAILS (if fully autonomous)
        if (automation.auto_respond_without_approval) {
          await processAutoSendEmails(supabase, claim.id, automation, results);
        }

        // 3. CHECK FOR ESCALATIONS (if enabled)
        if (automation.auto_escalate_urgency) {
          await checkForEscalations(supabase, claim.id, automation, results);
        }

        results.processed++;
      } catch (err) {
        const errorMsg = `Error processing claim ${claim.claim_number}: ${err}`;
        console.error(errorMsg);
        results.errors.push(errorMsg);
      }
    }

    console.log("Darwin Autonomous Agent completed:", results);

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Darwin Autonomous Agent error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function processAutoCompleteTasks(
  supabase: any,
  claimId: string,
  results: any
) {
  // Find follow-up tasks that should be auto-completed
  const { data: followUpTasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('claim_id', claimId)
    .eq('is_completed', false)
    .or('title.ilike.%follow up%,title.ilike.%follow-up%,title.ilike.%reminder%');

  for (const task of followUpTasks || []) {
    // Check if there's been recent activity (email received) that would complete this task
    const { data: recentEmails } = await supabase
      .from('emails')
      .select('id')
      .eq('claim_id', claimId)
      .eq('recipient_type', 'inbound')
      .gte('sent_at', task.created_at)
      .limit(1);

    if (recentEmails && recentEmails.length > 0) {
      // Auto-complete the task
      await supabase
        .from('tasks')
        .update({
          is_completed: true,
          completed_at: new Date().toISOString(),
          completed_by: null, // System completed
        })
        .eq('id', task.id);

      // Log the action
      await supabase
        .from('darwin_action_log')
        .insert({
          claim_id: claimId,
          action_type: 'task_completed',
          action_details: { task_id: task.id, task_title: task.title, reason: 'response_received' },
          was_auto_executed: true,
          result: `Auto-completed task "${task.title}" - response received`,
          trigger_source: 'darwin_autonomous_agent',
        });

      results.tasks_completed++;
    }
  }
}

async function processAutoSendEmails(
  supabase: any,
  claimId: string,
  automation: any,
  results: any
) {
  // Find pending email drafts that can be auto-sent
  const { data: pendingActions } = await supabase
    .from('claim_ai_pending_actions')
    .select('*')
    .eq('claim_id', claimId)
    .eq('status', 'pending')
    .eq('action_type', 'email_response');

  for (const action of pendingActions || []) {
    const draft = action.draft_content as any;
    
    // Check for keyword blockers
    const content = `${draft.subject || ''} ${draft.body || ''}`.toLowerCase();
    const keywordBlockers = automation.keyword_blockers || ESCALATION_KEYWORDS;
    
    const blockedKeyword = keywordBlockers.find((kw: string) => 
      content.includes(kw.toLowerCase())
    );

    if (blockedKeyword) {
      // Create escalation instead of auto-sending
      await supabase
        .from('darwin_action_log')
        .insert({
          claim_id: claimId,
          action_type: 'escalation',
          action_details: { 
            pending_action_id: action.id, 
            blocked_keyword: blockedKeyword,
            draft_subject: draft.subject 
          },
          was_auto_executed: false,
          result: `Email blocked due to keyword "${blockedKeyword}" - requires human review`,
          trigger_source: 'darwin_autonomous_agent',
        });

      results.escalations++;
      continue;
    }

    // Auto-send the email
    try {
      const sendResponse = await fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recipients: [{ email: draft.to_email, name: draft.to_name }],
            subject: draft.subject,
            body: draft.body,
            claimId: claimId,
          }),
        }
      );

      if (sendResponse.ok) {
        // Update pending action as auto-executed
        await supabase
          .from('claim_ai_pending_actions')
          .update({
            status: 'sent',
            auto_executed: true,
            auto_executed_at: new Date().toISOString(),
          })
          .eq('id', action.id);

        // Log the action
        await supabase
          .from('darwin_action_log')
          .insert({
            claim_id: claimId,
            action_type: 'email_sent',
            action_details: { 
              pending_action_id: action.id, 
              to: draft.to_email,
              subject: draft.subject 
            },
            was_auto_executed: true,
            result: `Auto-sent email to ${draft.to_email}: ${draft.subject}`,
            trigger_source: 'darwin_autonomous_agent',
          });

        results.emails_sent++;
      }
    } catch (err) {
      console.error(`Failed to auto-send email for action ${action.id}:`, err);
    }
  }
}

async function checkForEscalations(
  supabase: any,
  claimId: string,
  automation: any,
  results: any
) {
  // Check for stalled claims (no activity in X days)
  const stalledDays = 7;
  const stalledDate = new Date();
  stalledDate.setDate(stalledDate.getDate() - stalledDays);

  const { data: recentActivity } = await supabase
    .from('claim_updates')
    .select('id')
    .eq('claim_id', claimId)
    .gte('created_at', stalledDate.toISOString())
    .limit(1);

  if (!recentActivity || recentActivity.length === 0) {
    // Check if we already escalated for this
    const { data: existingEscalation } = await supabase
      .from('darwin_action_log')
      .select('id')
      .eq('claim_id', claimId)
      .eq('action_type', 'escalation')
      .contains('action_details', { reason: 'stalled_claim' })
      .gte('executed_at', stalledDate.toISOString())
      .limit(1);

    if (!existingEscalation || existingEscalation.length === 0) {
      await supabase
        .from('darwin_action_log')
        .insert({
          claim_id: claimId,
          action_type: 'escalation',
          action_details: { reason: 'stalled_claim', days_inactive: stalledDays },
          was_auto_executed: true,
          result: `Claim has had no activity for ${stalledDays} days - needs attention`,
          trigger_source: 'darwin_autonomous_agent',
        });

      results.escalations++;
    }
  }

  // Check for approaching deadlines
  const { data: upcomingDeadlines } = await supabase
    .from('claim_carrier_deadlines')
    .select('*')
    .eq('claim_id', claimId)
    .eq('status', 'pending')
    .lte('deadline_date', new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString())
    .gte('deadline_date', new Date().toISOString());

  for (const deadline of upcomingDeadlines || []) {
    const { data: existingEscalation } = await supabase
      .from('darwin_action_log')
      .select('id')
      .eq('claim_id', claimId)
      .eq('action_type', 'escalation')
      .contains('action_details', { deadline_id: deadline.id })
      .limit(1);

    if (!existingEscalation || existingEscalation.length === 0) {
      await supabase
        .from('darwin_action_log')
        .insert({
          claim_id: claimId,
          action_type: 'escalation',
          action_details: { 
            reason: 'approaching_deadline',
            deadline_id: deadline.id,
            deadline_type: deadline.deadline_type,
            deadline_date: deadline.deadline_date
          },
          was_auto_executed: true,
          result: `Deadline approaching: ${deadline.deadline_type} due ${deadline.deadline_date}`,
          trigger_source: 'darwin_autonomous_agent',
        });

      results.escalations++;
    }
  }
}
