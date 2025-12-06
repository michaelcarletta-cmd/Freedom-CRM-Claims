import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Decode quoted-printable encoding
function decodeQuotedPrintable(str: string): string {
  return str
    .replace(/=\r?\n/g, '') // Remove soft line breaks
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// Extract clean text from raw MIME email
function extractEmailBody(rawContent: string): { text: string; html: string } {
  let text = '';
  let html = '';

  // Check if it's a multipart message
  const boundaryMatch = rawContent.match(/boundary="?([^"\s;]+)"?/i);
  
  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const parts = rawContent.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    
    for (const part of parts) {
      if (part.includes('Content-Type: text/plain')) {
        // Extract plain text content
        const contentMatch = part.match(/Content-Transfer-Encoding:\s*(\S+)/i);
        const encoding = contentMatch ? contentMatch[1].toLowerCase() : '';
        
        // Find the actual content (after the headers, separated by double newline)
        const bodyMatch = part.split(/\r?\n\r?\n/);
        if (bodyMatch.length > 1) {
          let content = bodyMatch.slice(1).join('\n\n').trim();
          
          // Remove trailing boundary markers
          content = content.replace(/--$/, '').trim();
          
          if (encoding === 'quoted-printable') {
            content = decodeQuotedPrintable(content);
          }
          text = content;
        }
      } else if (part.includes('Content-Type: text/html')) {
        // Extract HTML content
        const contentMatch = part.match(/Content-Transfer-Encoding:\s*(\S+)/i);
        const encoding = contentMatch ? contentMatch[1].toLowerCase() : '';
        
        const bodyMatch = part.split(/\r?\n\r?\n/);
        if (bodyMatch.length > 1) {
          let content = bodyMatch.slice(1).join('\n\n').trim();
          content = content.replace(/--$/, '').trim();
          
          if (encoding === 'quoted-printable') {
            content = decodeQuotedPrintable(content);
          }
          
          // Strip HTML tags to get plain text version if needed
          html = content;
        }
      }
    }
  } else {
    // Single part message - check if it needs decoding
    if (rawContent.includes('Content-Transfer-Encoding: quoted-printable')) {
      const bodyMatch = rawContent.split(/\r?\n\r?\n/);
      if (bodyMatch.length > 1) {
        text = decodeQuotedPrintable(bodyMatch.slice(1).join('\n\n'));
      }
    } else {
      text = rawContent;
    }
  }

  return { text, html };
}

// Strip HTML tags to get plain text
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    
    console.log("Received inbound email payload:", JSON.stringify(payload, null, 2).substring(0, 2000));

    // Support multiple formats:
    // 1. Cloudflare Email Workers format (preferred)
    // 2. Mailjet Parse API format (legacy)
    // 3. Resend format (legacy)
    
    let from: string = '';
    let to: string = '';
    let subject: string = '';
    let text: string = '';
    let html: string = '';
    let rawContent: string = '';

    // Cloudflare Email Workers format
    if (payload.from && payload.to && payload.source === 'cloudflare') {
      from = payload.from;
      to = payload.to;
      subject = payload.subject || '(No Subject)';
      text = payload.text || '';
      html = payload.html || '';
      rawContent = payload.raw || '';
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
      rawContent = payload.raw || '';
      console.log("Processing generic payload");
    }

    // If we have raw content but no clean text/html, parse it
    if (rawContent && (!text || text.includes('Content-Type:') || text.includes('--_'))) {
      console.log("Parsing raw MIME content...");
      const extracted = extractEmailBody(rawContent);
      if (extracted.text) text = extracted.text;
      if (extracted.html) html = extracted.html;
    }

    // If text still looks like raw MIME, try to extract it
    if (text && (text.includes('Content-Type:') || text.includes('--_') || text.includes('boundary='))) {
      console.log("Text appears to be raw MIME, extracting...");
      const extracted = extractEmailBody(text);
      if (extracted.text) {
        text = extracted.text;
      } else if (extracted.html) {
        text = stripHtml(extracted.html);
      }
    }

    // If we only have HTML, convert to plain text for display
    if (!text && html) {
      text = stripHtml(html);
    }

    // Final cleanup - remove any remaining MIME artifacts
    text = text
      .replace(/^[\s\S]*?Content-Transfer-Encoding:[^\n]*\n\n/i, '')
      .replace(/--_[^\s]+--?\s*$/g, '')
      .trim();

    console.log("Final cleaned text:", text.substring(0, 500));

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
    const { data: insertedEmail, error: insertError } = await supabase
      .from('emails')
      .insert({
        claim_id: claim.id,
        recipient_email: senderEmail, // Store sender as "recipient" for inbound
        recipient_name: senderName,
        recipient_type: 'inbound',
        subject: subject,
        body: text || '(No Content)',
        sent_by: null, // Inbound emails have no internal sender
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to insert email:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to save email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Email logged to claim ${claim.claim_number} (policy: ${claim.policy_number}) from ${senderEmail}`);

    // Check if this claim has AI automation enabled
    const { data: automation } = await supabase
      .from('claim_automations')
      .select('*')
      .eq('claim_id', claim.id)
      .eq('is_enabled', true)
      .maybeSingle();

    if (automation) {
      const settings = automation.settings as { auto_respond_emails?: boolean; auto_update_notes?: boolean } | null;
      
      // IMPORTANT: Stop follow-ups when a response is received
      if (automation.follow_up_enabled && !automation.follow_up_stopped_at) {
        console.log(`Stopping follow-ups for claim ${claim.claim_number} - response received`);
        
        await supabase
          .from('claim_automations')
          .update({
            follow_up_stopped_at: new Date().toISOString(),
            follow_up_stop_reason: 'response_received',
          })
          .eq('id', automation.id);
      }
      
      if (settings?.auto_respond_emails) {
        console.log(`Triggering AI response draft for claim ${claim.claim_number}`);
        
        // Trigger AI to draft a response (fire and forget)
        fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/process-claim-ai-action`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'draft_email_response',
            claimId: claim.id,
            emailId: insertedEmail.id,
          }),
        }).catch(err => console.error('Failed to trigger AI draft:', err));
      }

      // Add a note if auto_update_notes is enabled
      if (settings?.auto_update_notes) {
        await supabase
          .from('claim_updates')
          .insert({
            claim_id: claim.id,
            content: `📧 Inbound email received from ${senderName} (${senderEmail}): "${subject}"`,
            update_type: 'inbound_email',
          });
      }
    }

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
