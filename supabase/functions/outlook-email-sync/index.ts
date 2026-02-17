import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Simple IMAP client using Deno's TCP
async function connectIMAP(host: string, port: number, email: string, password: string): Promise<any[]> {
  const conn = await Deno.connectTls({ hostname: host, port });
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  
  const readResponse = async (): Promise<string> => {
    const buf = new Uint8Array(65536);
    const n = await conn.read(buf);
    if (n === null) return '';
    return decoder.decode(buf.subarray(0, n));
  };

  const sendCommand = async (tag: string, cmd: string): Promise<string> => {
    await conn.write(encoder.encode(`${tag} ${cmd}\r\n`));
    let response = '';
    let attempts = 0;
    while (attempts < 20) {
      const chunk = await readResponse();
      response += chunk;
      if (response.includes(`${tag} OK`) || response.includes(`${tag} NO`) || response.includes(`${tag} BAD`)) {
        break;
      }
      attempts++;
    }
    return response;
  };

  try {
    // Read greeting
    await readResponse();

    // Login
    const loginResp = await sendCommand('A1', `LOGIN "${email}" "${password}"`);
    if (loginResp.includes('A1 NO') || loginResp.includes('A1 BAD')) {
      throw new Error('Authentication failed. Check your email and app password.');
    }

    // Select INBOX
    await sendCommand('A2', 'SELECT INBOX');

    // Search for recent emails (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateStr = thirtyDaysAgo.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }).replace(',', '');
    // Format: DD-Mon-YYYY
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const formattedDate = `${thirtyDaysAgo.getDate()}-${months[thirtyDaysAgo.getMonth()]}-${thirtyDaysAgo.getFullYear()}`;
    
    const searchResp = await sendCommand('A3', `SEARCH SINCE ${formattedDate}`);
    
    // Parse message IDs from search response
    const searchLine = searchResp.split('\r\n').find(l => l.startsWith('* SEARCH'));
    if (!searchLine || searchLine.trim() === '* SEARCH') {
      await sendCommand('A99', 'LOGOUT');
      conn.close();
      return [];
    }

    const msgIds = searchLine.replace('* SEARCH ', '').trim().split(' ').filter(Boolean);
    
    // Limit to most recent 50 messages
    const recentIds = msgIds.slice(-50);
    
    const emails: any[] = [];
    
    for (const id of recentIds) {
      try {
        // Fetch headers and body preview
        const fetchResp = await sendCommand(`F${id}`, `FETCH ${id} (BODY[HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID)] BODY[TEXT]<0.2000>)`);
        
        // Parse headers
        const fromMatch = fetchResp.match(/From:\s*(.+?)(?:\r\n(?!\s)|$)/i);
        const toMatch = fetchResp.match(/To:\s*(.+?)(?:\r\n(?!\s)|$)/i);
        const subjectMatch = fetchResp.match(/Subject:\s*(.+?)(?:\r\n(?!\s)|$)/i);
        const dateMatch = fetchResp.match(/Date:\s*(.+?)(?:\r\n(?!\s)|$)/i);
        const messageIdMatch = fetchResp.match(/Message-ID:\s*(.+?)(?:\r\n(?!\s)|$)/i);
        
        // Extract body text (simplified)
        const bodyParts = fetchResp.split('BODY[TEXT]<0>');
        let bodyText = '';
        if (bodyParts.length > 1) {
          bodyText = bodyParts[1].substring(0, 2000);
          // Clean up IMAP artifacts
          bodyText = bodyText.replace(/\)\r\n.*$/s, '').trim();
        }

        emails.push({
          from: fromMatch?.[1]?.trim() || 'Unknown',
          to: toMatch?.[1]?.trim() || 'Unknown',
          subject: subjectMatch?.[1]?.trim() || '(No Subject)',
          date: dateMatch?.[1]?.trim() || new Date().toISOString(),
          message_id: messageIdMatch?.[1]?.trim() || '',
          body_preview: bodyText.substring(0, 500),
        });
      } catch (e) {
        console.error(`Error fetching message ${id}:`, e);
      }
    }

    // Logout
    await sendCommand('A99', 'LOGOUT');
    conn.close();
    
    return emails;
  } catch (error) {
    try { conn.close(); } catch(_) {}
    throw error;
  }
}

// Parse email address from "Name <email@domain.com>" format
function parseEmailAddress(raw: string): { name: string; email: string } {
  const match = raw.match(/^"?([^"<]*)"?\s*<?([^>]+)>?$/);
  if (match) {
    return { name: match[1].trim() || match[2].trim(), email: match[2].trim() };
  }
  return { name: raw.trim(), email: raw.trim() };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Not authenticated');
    const token = authHeader.replace('Bearer ', '');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Not authenticated');

    const { action, claim_id, connection_id, email_address, password, imap_host, imap_port } = await req.json();

    if (action === 'test_connection') {
      // Test IMAP connection
      const emails = await connectIMAP(
        imap_host || 'outlook.office365.com',
        imap_port || 993,
        email_address,
        password
      );
      
      return new Response(JSON.stringify({ success: true, email_count: emails.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'save_connection') {
      // Save connection (password stored as-is — in production, encrypt server-side)
      const { data, error } = await supabase
        .from('email_connections')
        .upsert({
          user_id: user.id,
          email_address,
          imap_host: imap_host || 'outlook.office365.com',
          imap_port: imap_port || 993,
          encrypted_password: password,
          provider: 'outlook',
          is_active: true,
          last_sync_error: null,
        }, { onConflict: 'user_id,email_address' })
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, connection: { id: data.id, email_address: data.email_address } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'sync_emails') {
      if (!claim_id) throw new Error('claim_id is required');

      // Get the user's email connection
      let query = supabase
        .from('email_connections')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true);
      
      if (connection_id) {
        query = query.eq('id', connection_id);
      }
      
      const { data: connections, error: connError } = await query.limit(1).single();
      if (connError || !connections) throw new Error('No active email connection found. Please connect your Outlook account in Settings.');

      const connection = connections;

      // Get claim details for matching
      const { data: claim } = await supabase
        .from('claims')
        .select('claim_number, policyholder_email, policyholder_name, insurance_company, insurance_email')
        .eq('id', claim_id)
        .single();

      if (!claim) throw new Error('Claim not found');

      // Fetch emails via IMAP
      let emails: any[];
      try {
        emails = await connectIMAP(
          connection.imap_host,
          connection.imap_port,
          connection.email_address,
          connection.encrypted_password
        );
      } catch (imapError: any) {
        // Update connection with error
        await supabase
          .from('email_connections')
          .update({ last_sync_error: imapError.message })
          .eq('id', connection.id);
        throw new Error(`IMAP connection failed: ${imapError.message}`);
      }

      // Build matching keywords from claim
      const matchTerms = [
        claim.claim_number,
        claim.policyholder_email,
        claim.policyholder_name,
        claim.insurance_email,
      ].filter(Boolean).map(t => t!.toLowerCase());

      // Also match on adjuster emails
      const { data: adjusters } = await supabase
        .from('claim_adjusters')
        .select('adjuster_email, adjuster_name')
        .eq('claim_id', claim_id);

      if (adjusters) {
        adjusters.forEach(adj => {
          if (adj.adjuster_email) matchTerms.push(adj.adjuster_email.toLowerCase());
          if (adj.adjuster_name) matchTerms.push(adj.adjuster_name.toLowerCase());
        });
      }

      // Filter emails that match claim
      const matchingEmails = emails.filter(email => {
        const searchText = `${email.from} ${email.to} ${email.subject} ${email.body_preview}`.toLowerCase();
        return matchTerms.some(term => searchText.includes(term));
      });

      // Get existing emails to avoid duplicates
      const { data: existingEmails } = await supabase
        .from('emails')
        .select('subject, sent_at')
        .eq('claim_id', claim_id);

      const existingKeys = new Set(
        existingEmails?.map(e => `${e.subject}|${new Date(e.sent_at).toISOString().substring(0, 16)}`) || []
      );

      // Insert new emails
      let importedCount = 0;
      for (const email of matchingEmails) {
        const parsedFrom = parseEmailAddress(email.from);
        const parsedTo = parseEmailAddress(email.to);
        
        let sentAt: string;
        try {
          sentAt = new Date(email.date).toISOString();
        } catch {
          sentAt = new Date().toISOString();
        }

        const key = `${email.subject}|${sentAt.substring(0, 16)}`;
        if (existingKeys.has(key)) continue;

        // Determine if inbound or outbound
        const isInbound = parsedTo.email.toLowerCase() === connection.email_address.toLowerCase() ||
                          parsedFrom.email.toLowerCase() !== connection.email_address.toLowerCase();

        const { error: insertError } = await supabase
          .from('emails')
          .insert({
            claim_id,
            subject: email.subject,
            body: email.body_preview,
            recipient_email: isInbound ? parsedFrom.email : parsedTo.email,
            recipient_name: isInbound ? parsedFrom.name : parsedTo.name,
            recipient_type: isInbound ? 'inbound' : 'outlook_sync',
            sent_at: sentAt,
          });

        if (!insertError) {
          importedCount++;
          existingKeys.add(key);
        }
      }

      // Update last sync
      await supabase
        .from('email_connections')
        .update({ last_sync_at: new Date().toISOString(), last_sync_error: null })
        .eq('id', connection.id);

      return new Response(JSON.stringify({ 
        success: true, 
        total_fetched: emails.length,
        matching: matchingEmails.length,
        imported: importedCount 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'delete_connection') {
      const { error } = await supabase
        .from('email_connections')
        .delete()
        .eq('id', connection_id)
        .eq('user_id', user.id);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error: any) {
    console.error('Outlook sync error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
