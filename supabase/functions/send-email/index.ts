import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Attachment {
  filePath: string;
  fileName: string;
  fileType: string | null;
}

interface RecipientInfo {
  email: string;
  name: string;
  type: string;
}

interface MailjetAttachment {
  ContentType: string;
  Filename: string;
  Base64Content: string;
}

async function sendMailjetEmail(
  toEmails: string[], 
  subject: string, 
  htmlContent: string,
  attachments?: MailjetAttachment[]
) {
  const apiKey = Deno.env.get("MAILJET_API_KEY");
  const secretKey = Deno.env.get("MAILJET_SECRET_KEY");
  
  const toRecipients = toEmails.map(email => ({ Email: email }));
  
  const message: any = {
    From: {
      Email: "claims@freedomadj.com",
      Name: "Freedom Claims"
    },
    To: toRecipients,
    Subject: subject,
    HTMLPart: htmlContent
  };

  if (attachments && attachments.length > 0) {
    message.Attachments = attachments;
  }

  const response = await fetch("https://api.mailjet.com/v3.1/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${btoa(`${apiKey}:${secretKey}`)}`,
    },
    body: JSON.stringify({
      Messages: [message]
    }),
  });

  const result = await response.json();
  
  if (!response.ok) {
    throw new Error(`Mailjet error: ${JSON.stringify(result)}`);
  }
  
  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestBody = await req.json();
    
    // Support both old single recipient format and new multiple recipients format
    let recipients: RecipientInfo[] = [];
    
    if (requestBody.recipients && Array.isArray(requestBody.recipients)) {
      // New format: multiple recipients
      recipients = requestBody.recipients;
    } else if (requestBody.to) {
      // Old format: single recipient (backwards compatibility)
      recipients = [{
        email: requestBody.to,
        name: requestBody.recipientName || requestBody.to,
        type: requestBody.recipientType || 'manual'
      }];
    }
    
    const { subject, body, claimId, attachments } = requestBody;

    if (recipients.length === 0 || !subject || !body) {
      throw new Error("Missing required fields: recipients, subject, and body are required");
    }

    // Validate all emails
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const recipient of recipients) {
      if (!emailRegex.test(recipient.email)) {
        throw new Error(`Invalid email address: ${recipient.email}`);
      }
    }

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Create Supabase client with service role for storage access
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        },
      }
    );

    // Create Supabase client with user's auth token for user data
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

    // Append signature if available
    const fullBody = emailSignature 
      ? `${body}\n\n--\n${emailSignature}`
      : body;

    // Process attachments if provided
    const emailAttachments: MailjetAttachment[] = [];
    
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      console.log(`Processing ${attachments.length} attachments`);
      
      for (const attachment of attachments as Attachment[]) {
        try {
          // Download file from storage
          const { data: fileData, error: downloadError } = await supabaseAdmin.storage
            .from('claim-files')
            .download(attachment.filePath);
          
          if (downloadError) {
            console.error(`Failed to download file ${attachment.fileName}:`, downloadError);
            continue;
          }
          
          // Convert to base64
          const arrayBuffer = await fileData.arrayBuffer();
          const base64Content = btoa(
            new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
          );
          
          emailAttachments.push({
            ContentType: attachment.fileType || 'application/octet-stream',
            Filename: attachment.fileName,
            Base64Content: base64Content,
          });
          
          console.log(`Successfully processed attachment: ${attachment.fileName}`);
        } catch (err) {
          console.error(`Error processing attachment ${attachment.fileName}:`, err);
        }
      }
    }

    // Extract all email addresses for the 'to' field
    const toEmails = recipients.map(r => r.email);

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="white-space: pre-wrap;">${fullBody}</div>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
        <p style="color: #999; font-size: 11px;">
          This email was sent from Freedom Claims CRM.
        </p>
      </div>
    `;

    console.log(`Sending email to ${toEmails.join(', ')} with ${emailAttachments.length} attachments`);

    const emailResponse = await sendMailjetEmail(
      toEmails,
      subject,
      htmlContent,
      emailAttachments.length > 0 ? emailAttachments : undefined
    );

    console.log(`Email sent:`, emailResponse);

    // Log email to database for each recipient if claimId provided
    if (claimId) {
      for (const recipient of recipients) {
        const { error: dbError } = await supabase
          .from('emails')
          .insert({
            claim_id: claimId,
            sent_by: user.id,
            recipient_email: recipient.email,
            recipient_name: recipient.name,
            recipient_type: recipient.type,
            subject: subject,
            body: body,
          });

        if (dbError) {
          console.error(`Failed to log email to database for ${recipient.email}:`, dbError);
          // Don't throw error - email was sent successfully
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        recipientCount: recipients.length,
        attachmentCount: emailAttachments.length 
      }),
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
