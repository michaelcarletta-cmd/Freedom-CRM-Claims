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
    // Resend sends inbound emails as JSON
    const payload = await req.json();
    
    console.log("Received inbound email payload:", JSON.stringify(payload, null, 2));

    // Extract email details from Resend webhook
    const {
      from,
      to,
      subject,
      text,
      html,
    } = payload;

    // Parse the "to" address to find the claim email ID
    // Expected format: claim-{claim_email_id}@your-domain.com
    const toAddresses = Array.isArray(to) ? to : [to];
    let claimEmailId: string | null = null;

    for (const addr of toAddresses) {
      const email = typeof addr === 'string' ? addr : addr.email;
      const match = email.match(/claim-([a-f0-9]+)@/i);
      if (match) {
        claimEmailId = match[1];
        break;
      }
    }

    if (!claimEmailId) {
      console.log("No claim email ID found in recipient addresses");
      return new Response(
        JSON.stringify({ error: "No claim email ID found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role for backend operations
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Find the claim by email ID
    const { data: claim, error: claimError } = await supabase
      .from('claims')
      .select('id, claim_number')
      .eq('claim_email_id', claimEmailId)
      .single();

    if (claimError || !claim) {
      console.error("Claim not found for email ID:", claimEmailId, claimError);
      return new Response(
        JSON.stringify({ error: "Claim not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract sender info
    const senderEmail = typeof from === 'string' ? from : from.email;
    const senderName = typeof from === 'string' ? from.split('@')[0] : (from.name || from.email);

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

    console.log(`Email logged to claim ${claim.claim_number} from ${senderEmail}`);

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
