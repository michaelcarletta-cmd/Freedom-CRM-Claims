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
    // Mailjet sends inbound emails via Parse API webhook
    const payload = await req.json();
    
    console.log("Received inbound email payload:", JSON.stringify(payload, null, 2));

    // Handle Mailjet Parse API format
    // Mailjet fields: Sender, Recipient, From, Subject, Text-part, Html-part, Date, Headers
    const {
      Sender,
      Recipient,
      From,
      Subject,
      "Text-part": textPart,
      "Html-part": htmlPart,
    } = payload;

    // Also support Resend format for backwards compatibility
    const from = From || payload.from;
    const to = Recipient || payload.to;
    const subject = Subject || payload.subject;
    const text = textPart || payload.text;
    const html = htmlPart || payload.html;

    // Parse the "to" address to find the claim identifier
    // Expected formats: 
    //   claim-{policy_number}@domain (new format with policy number)
    //   claim-{claim_email_id}@domain (fallback format)
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
    // The identifier might be a sanitized policy number, so we need to match loosely
    let claim = null;
    let claimError = null;

    // First, try exact match on claim_email_id (legacy format)
    const { data: claimById, error: errorById } = await supabase
      .from('claims')
      .select('id, claim_number, policy_number')
      .eq('claim_email_id', claimIdentifier)
      .single();

    if (claimById) {
      claim = claimById;
    } else {
      // Try to match by sanitized policy number
      // Get all claims and check if their sanitized policy number matches
      const { data: allClaims, error: allError } = await supabase
        .from('claims')
        .select('id, claim_number, policy_number, claim_email_id')
        .not('policy_number', 'is', null);

      if (allError) {
        console.error("Error fetching claims:", allError);
        claimError = allError;
      } else if (allClaims) {
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
      console.error("Claim not found for identifier:", claimIdentifier, claimError);
      return new Response(
        JSON.stringify({ error: "Claim not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract sender info - handle both Mailjet and Resend formats
    let senderEmail = '';
    let senderName = '';

    if (Sender) {
      // Mailjet format: just email
      senderEmail = Sender;
      // Parse name from "From" field if available (e.g., "Name <email@domain.com>")
      if (From) {
        const fromMatch = From.match(/^(.+?)\s*<(.+)>$/);
        if (fromMatch) {
          senderName = fromMatch[1].trim();
          senderEmail = fromMatch[2];
        } else {
          senderName = From.split('@')[0];
        }
      } else {
        senderName = Sender.split('@')[0];
      }
    } else if (from) {
      // Resend format
      senderEmail = typeof from === 'string' ? from : from?.email || from;
      senderName = typeof from === 'string' ? from.split('@')[0] : (from?.name || from?.email || 'Unknown');
    }

    // Log the email to the emails table
    const { error: insertError } = await supabase
      .from('emails')
      .insert({
        claim_id: claim.id,
        recipient_email: senderEmail, // Store sender as "recipient" for inbound
        recipient_name: senderName,
        recipient_type: 'inbound',
        subject: subject || '(No Subject)',
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
