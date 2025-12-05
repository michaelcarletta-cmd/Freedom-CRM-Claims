import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    
    console.log("Received inbound email payload:", JSON.stringify(payload, null, 2));

    // Support multiple formats:
    // 1. Cloudflare Email Workers format (preferred)
    // 2. Mailjet Parse API format (legacy)
    // 3. Resend format (legacy)
    
    let from: string = '';
    let to: string = '';
    let subject: string = '';
    let text: string = '';
    let html: string = '';

    // Cloudflare Email Workers format
    if (payload.from && payload.to && payload.source === 'cloudflare') {
      from = payload.from;
      to = payload.to;
      subject = payload.subject || '(No Subject)';
      text = payload.text || '';
      html = payload.html || '';
      console.log("Processing Cloudflare Email Worker payload");
    }
    // Mailjet Parse API format
    else if (payload.Sender || payload.Recipient) {
      from = payload.From || payload.Sender || '';
      to = payload.Recipient || '';
      subject = payload.Subject || '(No Subject)';
      text = payload["Text-part"] || '';
      html = payload["Html-part"] || '';
      console.log("Processing Mailjet payload");
    }
    // Resend/generic format
    else {
      from = typeof payload.from === 'string' ? payload.from : payload.from?.email || '';
      to = typeof payload.to === 'string' ? payload.to : (Array.isArray(payload.to) ? payload.to[0] : payload.to?.email || '');
      subject = payload.subject || '(No Subject)';
      text = payload.text || '';
      html = payload.html || '';
      console.log("Processing generic payload");
    }

    // Parse the "to" address to find the claim identifier
    // Expected format: claim-{policy_number}@claims.freedomclaims.work
    const toAddresses = Array.isArray(to) ? to : [to];
    let claimIdentifier: string | null = null;

    for (const addr of toAddresses) {
      const email = typeof addr === 'string' ? addr : addr?.email || addr;
      if (!email) continue;
      
      // Match claim-{identifier}@ pattern
      const match = email.match(/claim-([a-z0-9-]+)@/i);
      if (match) {
        claimIdentifier = match[1];
        break;
      }
    }

    if (!claimIdentifier) {
      console.log("No claim identifier found in recipient addresses:", toAddresses);
      return new Response(
        JSON.stringify({ error: "No claim identifier found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Found claim identifier:", claimIdentifier);

    // Create Supabase client with service role for backend operations
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Try to find the claim by policy_number first (new format)
    let claim = null;

    // First, try exact match on claim_email_id (legacy format)
    const { data: claimById } = await supabase
      .from('claims')
      .select('id, claim_number, policy_number')
      .eq('claim_email_id', claimIdentifier)
      .single();

    if (claimById) {
      claim = claimById;
    } else {
      // Try to match by sanitized policy number
      const { data: allClaims } = await supabase
        .from('claims')
        .select('id, claim_number, policy_number, claim_email_id')
        .not('policy_number', 'is', null);

      if (allClaims) {
        // Find claim with matching sanitized policy number
        for (const c of allClaims) {
          if (c.policy_number) {
            const sanitized = c.policy_number
              .toLowerCase()
              .replace(/[^a-z0-9]/g, '-')
              .replace(/-+/g, '-')
              .replace(/^-|-$/g, '');
            
            if (sanitized === claimIdentifier.toLowerCase()) {
              claim = c;
              break;
            }
          }
        }
      }
    }

    if (!claim) {
      console.error("Claim not found for identifier:", claimIdentifier);
      return new Response(
        JSON.stringify({ error: "Claim not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract sender info
    let senderEmail = '';
    let senderName = '';

    // Parse "Name <email>" format
    const fromMatch = from.match(/^(.+?)\s*<(.+)>$/);
    if (fromMatch) {
      senderName = fromMatch[1].trim().replace(/^["']|["']$/g, '');
      senderEmail = fromMatch[2];
    } else {
      senderEmail = from;
      senderName = from.split('@')[0];
    }

    // Log the email to the emails table
    const { error: insertError } = await supabase
      .from('emails')
      .insert({
        claim_id: claim.id,
        recipient_email: senderEmail, // Store sender as "recipient" for inbound
        recipient_name: senderName,
        recipient_type: 'inbound',
        subject: subject,
        body: text || html || '(No Content)',
        sent_by: null, // Inbound emails have no internal sender
      });

    if (insertError) {
      console.error("Failed to insert email:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to save email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Email logged to claim ${claim.claim_number} (policy: ${claim.policy_number}) from ${senderEmail}`);

    return new Response(
      JSON.stringify({ success: true, claim_id: claim.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error processing inbound email:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
