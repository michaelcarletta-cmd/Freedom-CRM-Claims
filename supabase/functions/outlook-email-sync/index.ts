import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Refresh Microsoft OAuth tokens
async function refreshTokens(refreshToken: string): Promise<{ access_token: string; refresh_token: string; expires_at: string }> {
  const MS_CLIENT_ID = Deno.env.get('MS_CLIENT_ID')!;
  const MS_CLIENT_SECRET = Deno.env.get('MS_CLIENT_SECRET')!;

  const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: MS_CLIENT_ID,
      client_secret: MS_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: 'https://graph.microsoft.com/Mail.Read offline_access User.Read',
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Token refresh failed: ${errText}`);
  }

  const tokens = await response.json();
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  };
}

// Get a valid access token, refreshing if needed
async function getAccessToken(connection: any, supabase: any): Promise<string> {
  let tokenData: any;
  try {
    tokenData = JSON.parse(connection.encrypted_password);
  } catch {
    throw new Error('Invalid token data. Please reconnect your Outlook account.');
  }

  const expiresAt = new Date(tokenData.expires_at);
  // Refresh if expires within 5 minutes
  if (expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    const newTokens = await refreshTokens(tokenData.refresh_token);
    // Update stored tokens
    await supabase
      .from('email_connections')
      .update({
        encrypted_password: JSON.stringify(newTokens),
        last_sync_error: null,
      })
      .eq('id', connection.id);
    return newTokens.access_token;
  }

  return tokenData.access_token;
}

// Fetch emails from Microsoft Graph API
async function fetchGraphEmails(accessToken: string): Promise<any[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages?` +
    `$filter=receivedDateTime ge ${thirtyDaysAgo}` +
    `&$select=from,toRecipients,subject,receivedDateTime,bodyPreview,internetMessageId` +
    `&$top=100&$orderby=receivedDateTime desc`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Graph API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return (data.value || []).map((msg: any) => ({
    from: msg.from?.emailAddress?.address || 'Unknown',
    from_name: msg.from?.emailAddress?.name || '',
    to: msg.toRecipients?.[0]?.emailAddress?.address || 'Unknown',
    to_name: msg.toRecipients?.[0]?.emailAddress?.name || '',
    subject: msg.subject || '(No Subject)',
    date: msg.receivedDateTime,
    body_preview: msg.bodyPreview || '',
    message_id: msg.internetMessageId || '',
  }));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Not authenticated');
    const token = authHeader.replace('Bearer ', '');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Not authenticated');

    const { action, claim_id, connection_id } = await req.json();

    if (action === 'get_auth_url') {
      const MS_CLIENT_ID = Deno.env.get('MS_CLIENT_ID');
      if (!MS_CLIENT_ID) throw new Error('Microsoft OAuth not configured');

      const redirectUri = `${supabaseUrl}/functions/v1/outlook-oauth-callback`;
      const origin = req.headers.get('origin') || req.headers.get('referer') || '';
      const state = btoa(JSON.stringify({
        userId: user.id,
        redirectUrl: origin.replace(/\/$/, '') + '/settings',
      }));

      const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
        `client_id=${MS_CLIENT_ID}` +
        `&response_type=code` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent('https://graph.microsoft.com/Mail.Read offline_access User.Read')}` +
        `&state=${state}` +
        `&response_mode=query`;

      return new Response(JSON.stringify({ authUrl }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'sync_emails') {
      if (!claim_id) throw new Error('claim_id is required');

      // Get user's email connection
      let query = supabase
        .from('email_connections')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (connection_id) query = query.eq('id', connection_id);

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

      // Get access token (auto-refreshes if needed)
      let accessToken: string;
      try {
        accessToken = await getAccessToken(connection, supabase);
      } catch (tokenErr: any) {
        await supabase
          .from('email_connections')
          .update({ last_sync_error: tokenErr.message })
          .eq('id', connection.id);
        throw new Error(`Authentication failed: ${tokenErr.message}. Please reconnect your Outlook account.`);
      }

      // Fetch emails via Microsoft Graph
      let emails: any[];
      try {
        emails = await fetchGraphEmails(accessToken);
      } catch (graphErr: any) {
        await supabase
          .from('email_connections')
          .update({ last_sync_error: graphErr.message })
          .eq('id', connection.id);
        throw new Error(`Email fetch failed: ${graphErr.message}`);
      }

      // Build matching keywords
      const matchTerms = [
        claim.claim_number,
        claim.policyholder_email,
        claim.policyholder_name,
        claim.insurance_email,
      ].filter(Boolean).map(t => t!.toLowerCase());

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

      // Filter matching emails
      const matchingEmails = emails.filter(email => {
        const searchText = `${email.from} ${email.from_name} ${email.to} ${email.to_name} ${email.subject} ${email.body_preview}`.toLowerCase();
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
        let sentAt: string;
        try {
          sentAt = new Date(email.date).toISOString();
        } catch {
          sentAt = new Date().toISOString();
        }

        const key = `${email.subject}|${sentAt.substring(0, 16)}`;
        if (existingKeys.has(key)) continue;

        const isInbound = email.to.toLowerCase() === connection.email_address.toLowerCase() ||
                          email.from.toLowerCase() !== connection.email_address.toLowerCase();

        const { error: insertError } = await supabase
          .from('emails')
          .insert({
            claim_id,
            subject: email.subject,
            body: email.body_preview,
            recipient_email: isInbound ? email.from : email.to,
            recipient_name: isInbound ? email.from_name : email.to_name,
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
        imported: importedCount,
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
