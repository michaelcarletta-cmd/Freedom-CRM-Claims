import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { requestId } = await req.json();

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch signature request with signers
    const { data: request, error: requestError } = await supabaseClient
      .from("signature_requests")
      .select(`
        *,
        signature_signers(*),
        claims(claim_number, policyholder_name)
      `)
      .eq("id", requestId)
      .single();

    if (requestError) throw requestError;

    // Send email to each signer
    const appUrl = Deno.env.get("SUPABASE_URL")?.replace("supabase.co", "lovable.app") || "http://localhost:5173";
    
    for (const signer of request.signature_signers) {
      const signUrl = `${appUrl}/sign?token=${signer.access_token}`;
      
      console.log(`Sending signature request to ${signer.signer_email}`);
      console.log(`Sign URL: ${signUrl}`);
      
      // TODO: Integrate with your email service (Resend, SendGrid, etc.)
      // For now, just log the details
      console.log({
        to: signer.signer_email,
        subject: `Signature Required: ${request.document_name}`,
        claimNumber: request.claims.claim_number,
        documentName: request.document_name,
        signUrl,
      });
    }

    return new Response(
      JSON.stringify({ success: true, signersNotified: request.signature_signers.length }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error sending signature request:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
