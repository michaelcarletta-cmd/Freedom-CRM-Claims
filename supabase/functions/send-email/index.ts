import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
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
    const { to, subject, body, claimId, recipientName, recipientType } = await req.json();

    if (!to || !subject || !body) {
      throw new Error("Missing required fields");
    }

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Create Supabase client with user's auth token
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
        auth: {
          persistSession: false,
        },
      }
    );

    // Get current user from the JWT token
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (userError || !user) {
      console.error('Auth error:', userError);
      throw new Error('Unauthorized');
    }

    // Fetch user's email signature from profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('email_signature')
      .eq('id', user.id)
      .single();

    const emailSignature = (profile as any)?.email_signature || '';

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

    // Append signature if available
    const fullBody = emailSignature 
      ? `${body}\n\n--\n${emailSignature}`
      : body;

    const emailResponse = await resend.emails.send({
      from: "Freedom Claims <onboarding@resend.dev>",
      to: [to],
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="white-space: pre-wrap;">${fullBody}</div>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
          <p style="color: #999; font-size: 11px;">
            This email was sent from Freedom Claims CRM.
          </p>
        </div>
      `,
    });

    console.log(`Email sent to ${to}:`, emailResponse);

    // Log email to database if claimId provided
    if (claimId) {
      const { error: dbError } = await supabase
        .from('emails')
        .insert({
          claim_id: claimId,
          sent_by: user.id,
          recipient_email: to,
          recipient_name: recipientName,
          recipient_type: recipientType,
          subject: subject,
          body: body,
        });

      if (dbError) {
        console.error('Failed to log email to database:', dbError);
        // Don't throw error - email was sent successfully
      }
    }

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