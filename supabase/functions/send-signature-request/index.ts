import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

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

    // Initialize Resend
    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    
    // Send email to each signer
    const appUrl = Deno.env.get("SUPABASE_URL")?.replace("supabase.co", "lovable.app") || "http://localhost:5173";
    
    for (const signer of request.signature_signers) {
      const signUrl = `${appUrl}/sign?token=${signer.access_token}`;
      
      console.log(`Sending signature request to ${signer.signer_email}`);
      console.log(`Sign URL: ${signUrl}`);
      
      // Send email via Resend
      const emailResponse = await resend.emails.send({
        from: "Freedom Claims <onboarding@resend.dev>",
        to: [signer.signer_email],
        subject: `Signature Required: ${request.document_name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Signature Request</h2>
            <p>Hello ${signer.signer_name},</p>
            <p>You have been requested to sign the following document:</p>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>Claim Number:</strong> ${request.claims.claim_number}</p>
              <p style="margin: 5px 0;"><strong>Document:</strong> ${request.document_name}</p>
            </div>
            <p>Please click the button below to review and sign the document:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${signUrl}" 
                 style="background: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                Sign Document
              </a>
            </div>
            <p style="color: #666; font-size: 12px;">
              If you cannot click the button, copy and paste this link into your browser:<br>
              <a href="${signUrl}" style="color: #0066cc;">${signUrl}</a>
            </p>
            <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
            <p style="color: #999; font-size: 11px;">
              This is an automated message from Freedom Claims. Please do not reply to this email.
            </p>
          </div>
        `,
      });

      console.log(`Email sent to ${signer.signer_email}:`, emailResponse);
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
