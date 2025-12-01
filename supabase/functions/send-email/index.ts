import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
    const { to, subject, body, claimNumber } = await req.json();

    if (!to || !subject || !body) {
      throw new Error("Missing required fields");
    }

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

    const emailResponse = await resend.emails.send({
      from: "Freedom Claims <onboarding@resend.dev>",
      to: [to],
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          ${claimNumber ? `<p style="color: #666; font-size: 12px; margin-bottom: 20px;">Claim: ${claimNumber}</p>` : ''}
          <div style="white-space: pre-wrap;">${body}</div>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
          <p style="color: #999; font-size: 11px;">
            This email was sent from Freedom Claims CRM.
          </p>
        </div>
      `,
    });

    console.log(`Email sent to ${to}:`, emailResponse);

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error sending email:", error);
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
