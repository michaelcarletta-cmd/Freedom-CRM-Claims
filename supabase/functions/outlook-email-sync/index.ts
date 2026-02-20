import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_SCOPE = "https://graph.microsoft.com/Mail.Read offline_access User.Read";
const GRAPH_MESSAGES_PAGE_SIZE = 50;
const GRAPH_MAX_MESSAGES_PER_SYNC = 300;

type JsonRecord = Record<string, unknown>;

interface AuthUser {
  id: string;
}

interface OutlookConnection {
  id: string;
  user_id: string;
  email_address: string;
  provider: string;
  oauth_access_token: string | null;
  oauth_refresh_token: string | null;
  oauth_expires_at: string | null;
  encrypted_password: string;
  sync_window_start: string | null;
  last_sync_at: string | null;
  metadata: JsonRecord | null;
}

interface ClaimRow {
  id: string;
  claim_number: string | null;
  policy_number: string | null;
  policyholder_name: string | null;
  policyholder_email: string | null;
  insurance_company: string | null;
  insurance_email: string | null;
  adjuster_name: string | null;
  adjuster_email: string | null;
  is_closed: boolean | null;
}

interface GraphEmailAddress {
  address?: string;
  name?: string;
}

interface GraphRecipient {
  emailAddress?: GraphEmailAddress;
}

interface GraphMessage {
  id: string;
  internetMessageId?: string;
  conversationId?: string;
  subject?: string;
  from?: { emailAddress?: GraphEmailAddress };
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  receivedDateTime?: string;
  sentDateTime?: string;
  bodyPreview?: string;
  webLink?: string;
  hasAttachments?: boolean;
}

interface ClaimMatcher {
  claim: ClaimRow;
  terms: string[];
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getServiceClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getOauthStateSecret(): string {
  return Deno.env.get("OUTLOOK_OAUTH_STATE_SECRET") || Deno.env.get("CRON_SECRET") || "outlook-state-secret";
}

function encodeBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string {
  let base = value.replace(/-/g, "+").replace(/_/g, "/");
  while (base.length % 4 !== 0) base += "=";
  return atob(base);
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function signStatePayload(payload: JsonRecord): Promise<string> {
  const body = encodeBase64Url(JSON.stringify(payload));
  const signature = await sha256Hex(`${body}.${getOauthStateSecret()}`);
  return `${body}.${signature}`;
}

async function getAuthenticatedUser(req: Request, supabase: ReturnType<typeof getServiceClient>): Promise<AuthUser> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Not authenticated");
  }

  const token = authHeader.slice("Bearer ".length);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new Error("Not authenticated");
  }

  return { id: data.user.id };
}

function normalizeText(input: string | null | undefined): string | null {
  if (!input) return null;
  const value = input.trim().toLowerCase();
  return value.length > 0 ? value : null;
}

function claimNumberVariants(claimNumber: string | null | undefined): string[] {
  const normalized = normalizeText(claimNumber);
  if (!normalized) return [];
  const collapsed = normalized.replace(/[^a-z0-9]/g, "");
  const variants = new Set<string>([normalized, collapsed]);
  if (collapsed.length >= 6) {
    variants.add(`${collapsed.slice(0, 2)}-${collapsed.slice(2)}`);
    variants.add(`${collapsed.slice(0, 4)}-${collapsed.slice(4)}`);
  }
  if (collapsed.length >= 8) {
    variants.add(`${collapsed.slice(0, 2)}-${collapsed.slice(2, 6)}-${collapsed.slice(6)}`);
  }
  return Array.from(variants).filter((term) => term.length >= 4);
}

function extractMessageHaystack(message: GraphMessage): string {
  const from = message.from?.emailAddress;
  const toRecipients = (message.toRecipients || [])
    .map((recipient) => `${recipient.emailAddress?.name || ""} ${recipient.emailAddress?.address || ""}`)
    .join(" ");
  const ccRecipients = (message.ccRecipients || [])
    .map((recipient) => `${recipient.emailAddress?.name || ""} ${recipient.emailAddress?.address || ""}`)
    .join(" ");

  return [
    message.subject || "",
    message.bodyPreview || "",
    from?.name || "",
    from?.address || "",
    toRecipients,
    ccRecipients,
    message.internetMessageId || "",
  ]
    .join(" ")
    .toLowerCase();
}

function buildClaimMatchers(claims: ClaimRow[], adjustersByClaim: Map<string, Array<{ adjuster_email: string | null; adjuster_name: string | null }>>): ClaimMatcher[] {
  return claims.map((claim) => {
    const terms = new Set<string>();
    const push = (value: string | null | undefined) => {
      const normalized = normalizeText(value);
      if (normalized && normalized.length >= 3) terms.add(normalized);
    };

    claimNumberVariants(claim.claim_number).forEach((variant) => terms.add(variant));
    push(claim.policy_number);
    push(claim.policyholder_email);
    push(claim.policyholder_name);
    push(claim.insurance_company);
    push(claim.insurance_email);
    push(claim.adjuster_name);
    push(claim.adjuster_email);

    for (const adjuster of adjustersByClaim.get(claim.id) || []) {
      push(adjuster.adjuster_email);
      push(adjuster.adjuster_name);
    }

    return { claim, terms: Array.from(terms) };
  });
}

function selectClaimMatch(message: GraphMessage, matchers: ClaimMatcher[]): ClaimRow | null {
  const haystack = extractMessageHaystack(message);
  for (const matcher of matchers) {
    if (matcher.terms.some((term) => haystack.includes(term))) {
      return matcher.claim;
    }
  }
  return null;
}

function resolveDirection(message: GraphMessage, mailboxAddress: string): "inbound" | "outbound" {
  const fromAddress = normalizeText(message.from?.emailAddress?.address) || "";
  const mailbox = normalizeText(mailboxAddress) || "";
  return fromAddress === mailbox ? "outbound" : "inbound";
}

function resolveRecipient(message: GraphMessage, direction: "inbound" | "outbound"): { email: string; name: string | null } {
  if (direction === "inbound") {
    return {
      email: message.from?.emailAddress?.address || "unknown@unknown",
      name: message.from?.emailAddress?.name || null,
    };
  }
  const firstTo = message.toRecipients?.[0]?.emailAddress;
  return {
    email: firstTo?.address || "unknown@unknown",
    name: firstTo?.name || null,
  };
}

function parseLegacyTokenBundle(connection: OutlookConnection): JsonRecord | null {
  try {
    return JSON.parse(connection.encrypted_password);
  } catch {
    return null;
  }
}

async function refreshAccessToken(
  supabase: ReturnType<typeof getServiceClient>,
  connection: OutlookConnection,
): Promise<string> {
  let accessToken = connection.oauth_access_token;
  let refreshToken = connection.oauth_refresh_token;
  let expiresAt = connection.oauth_expires_at;

  if (!accessToken || !refreshToken || !expiresAt) {
    const legacy = parseLegacyTokenBundle(connection);
    accessToken = accessToken || String(legacy?.access_token || "");
    refreshToken = refreshToken || String(legacy?.refresh_token || "");
    expiresAt = expiresAt || String(legacy?.expires_at || "");
  }

  if (!refreshToken) {
    throw new Error("Missing refresh token. Reconnect Outlook.");
  }

  const expiresAtMillis = expiresAt ? new Date(expiresAt).getTime() : 0;
  const now = Date.now();
  if (accessToken && expiresAtMillis > now + 2 * 60 * 1000) {
    return accessToken;
  }

  const clientId = Deno.env.get("MS_CLIENT_ID");
  const clientSecret = Deno.env.get("MS_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("MS_CLIENT_ID and MS_CLIENT_SECRET are required");
  }

  const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: GRAPH_SCOPE,
    }),
  });

  if (!tokenResponse.ok) {
    const body = await tokenResponse.text();
    throw new Error(`Token refresh failed: ${body}`);
  }

  const tokenJson = await tokenResponse.json();
  const nextAccessToken = String(tokenJson.access_token || "");
  const nextRefreshToken = String(tokenJson.refresh_token || refreshToken);
  const nextExpiresAt = new Date(Date.now() + Number(tokenJson.expires_in || 3600) * 1000).toISOString();

  if (!nextAccessToken) {
    throw new Error("Token refresh response missing access_token");
  }

  const legacyPayload = JSON.stringify({
    access_token: nextAccessToken,
    refresh_token: nextRefreshToken,
    expires_at: nextExpiresAt,
  });

  const { error } = await supabase
    .from("email_connections")
    .update({
      oauth_access_token: nextAccessToken,
      oauth_refresh_token: nextRefreshToken,
      oauth_expires_at: nextExpiresAt,
      encrypted_password: legacyPayload,
      last_sync_error: null,
    })
    .eq("id", connection.id);

  if (error) {
    console.error("Failed to persist refreshed tokens:", error);
  }

  return nextAccessToken;
}

function buildMessagesUrl(sinceIso: string): string {
  const base = new URL("https://graph.microsoft.com/v1.0/me/messages");
  base.searchParams.set("$select", "id,internetMessageId,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,bodyPreview,webLink,hasAttachments");
  base.searchParams.set("$orderby", "receivedDateTime desc");
  base.searchParams.set("$top", String(GRAPH_MESSAGES_PAGE_SIZE));
  base.searchParams.set("$filter", `receivedDateTime ge ${sinceIso}`);
  return base.toString();
}

async function fetchGraphMessages(accessToken: string, sinceIso: string): Promise<GraphMessage[]> {
  const messages: GraphMessage[] = [];
  let nextUrl: string | null = buildMessagesUrl(sinceIso);

  while (nextUrl && messages.length < GRAPH_MAX_MESSAGES_PER_SYNC) {
    const response: Response = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'outlook.body-content-type="text"',
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Graph API error (${response.status}): ${body}`);
    }

    const payload = await response.json() as { value?: GraphMessage[]; "@odata.nextLink"?: string };
    const pageMessages: GraphMessage[] = Array.isArray(payload.value) ? payload.value : [];
    messages.push(...pageMessages);
    nextUrl = payload["@odata.nextLink"] || null;
  }

  return messages.slice(0, GRAPH_MAX_MESSAGES_PER_SYNC);
}

async function getConnectionForUser(
  supabase: ReturnType<typeof getServiceClient>,
  userId: string,
  connectionId?: string,
): Promise<OutlookConnection> {
  let query = supabase
    .from("email_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "outlook_oauth")
    .eq("is_active", true)
    .is("disconnected_at", null);

  if (connectionId) {
    query = query.eq("id", connectionId);
  }

  const { data, error } = await query.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error("No active Outlook connection found. Connect Outlook in Settings first.");
  }

  return data as OutlookConnection;
}

async function importMessagesForClaims(params: {
  supabase: ReturnType<typeof getServiceClient>;
  connection: OutlookConnection;
  messages: GraphMessage[];
  matchers: ClaimMatcher[];
}): Promise<{ imported: number; matched: number }> {
  const { supabase, connection, messages, matchers } = params;

  let matched = 0;
  let imported = 0;

  for (const message of messages) {
    const claim = selectClaimMatch(message, matchers);
    if (!claim) continue;
    matched += 1;

    const externalMessageId = message.internetMessageId || message.id;
    if (!externalMessageId) continue;

    const { data: existingRow } = await supabase
      .from("emails")
      .select("id")
      .eq("claim_id", claim.id)
      .eq("source_provider", "outlook_graph")
      .eq("external_message_id", externalMessageId)
      .limit(1)
      .maybeSingle();

    if (existingRow) continue;

    const direction = resolveDirection(message, connection.email_address);
    const recipient = resolveRecipient(message, direction);
    const sentAt = message.receivedDateTime || message.sentDateTime || new Date().toISOString();

    const { error: insertError } = await supabase.from("emails").insert({
      claim_id: claim.id,
      sent_by: null,
      recipient_email: recipient.email,
      recipient_name: recipient.name,
      recipient_type: direction === "inbound" ? "inbound" : "outlook_sync",
      subject: message.subject || "(No Subject)",
      body: message.bodyPreview || "",
      sent_at: sentAt,
      external_message_id: externalMessageId,
      external_thread_id: message.conversationId || null,
      source_provider: "outlook_graph",
      source_connection_id: connection.id,
      direction,
      metadata: {
        graph_message_id: message.id,
        has_attachments: !!message.hasAttachments,
        web_link: message.webLink || null,
      },
    } as never);

    if (insertError) {
      // Ignore rare race duplicates while keeping sync resilient.
      const msg = insertError.message || "";
      if (!msg.toLowerCase().includes("duplicate")) {
        console.error("Email import failed:", insertError);
      }
      continue;
    }

    imported += 1;
  }

  return { imported, matched };
}

async function runSyncForClaims(params: {
  supabase: ReturnType<typeof getServiceClient>;
  connection: OutlookConnection;
  claims: ClaimRow[];
}): Promise<{ fetched: number; imported: number; matched: number; since: string }> {
  const { supabase, connection, claims } = params;
  const { data: adjustersRows } = await supabase
    .from("claim_adjusters")
    .select("claim_id, adjuster_email, adjuster_name")
    .in("claim_id", claims.map((claim) => claim.id));

  const adjustersByClaim = new Map<string, Array<{ adjuster_email: string | null; adjuster_name: string | null }>>();
  for (const row of adjustersRows || []) {
    const list = adjustersByClaim.get(row.claim_id) || [];
    list.push({
      adjuster_email: row.adjuster_email,
      adjuster_name: row.adjuster_name,
    });
    adjustersByClaim.set(row.claim_id, list);
  }

  const matchers = buildClaimMatchers(claims, adjustersByClaim);

  const lastSync = connection.last_sync_at ? new Date(connection.last_sync_at).getTime() : 0;
  const baseWindow = connection.sync_window_start
    ? new Date(connection.sync_window_start).getTime()
    : Date.now() - 30 * 24 * 60 * 60 * 1000;
  const overlap = 2 * 60 * 60 * 1000;
  const sinceMillis = Math.max(baseWindow, lastSync > 0 ? lastSync - overlap : baseWindow);
  const sinceIso = new Date(sinceMillis).toISOString();

  const accessToken = await refreshAccessToken(supabase, connection);
  const graphMessages = await fetchGraphMessages(accessToken, sinceIso);
  const result = await importMessagesForClaims({
    supabase,
    connection,
    messages: graphMessages,
    matchers,
  });

  return {
    fetched: graphMessages.length,
    imported: result.imported,
    matched: result.matched,
    since: sinceIso,
  };
}

async function updateConnectionSyncState(
  supabase: ReturnType<typeof getServiceClient>,
  connectionId: string,
  payload: {
    fetched: number;
    imported: number;
    matched: number;
    since: string;
    mode: string;
    claimId?: string;
    claimsCount?: number;
    error?: string;
  },
) {
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("email_connections")
    .update({
      last_sync_at: nowIso,
      last_sync_error: payload.error || null,
      last_sync_stats: {
        fetched: payload.fetched,
        imported: payload.imported,
        matched: payload.matched,
        since: payload.since,
        mode: payload.mode,
        claim_id: payload.claimId || null,
        claims_count: payload.claimsCount || null,
        synced_at: nowIso,
      },
      sync_window_start: payload.since,
    })
    .eq("id", connectionId);

  if (error) {
    console.error("Failed to update connection sync state:", error);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    if (!action) {
      return jsonResponse({ error: "action is required" }, 400);
    }

    const supabase = getServiceClient();

    if (action === "get_auth_url") {
      const user = await getAuthenticatedUser(req, supabase);
      const clientId = Deno.env.get("MS_CLIENT_ID");
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      if (!clientId || !supabaseUrl) {
        throw new Error("Microsoft OAuth is not configured");
      }

      const origin = req.headers.get("origin") || "";
      const requestedRedirect = typeof body?.redirect_url === "string" ? body.redirect_url : "";
      const redirectUrl = requestedRedirect || (origin ? `${origin.replace(/\/+$/, "")}/settings` : "/settings");

      const state = await signStatePayload({
        userId: user.id,
        redirectUrl,
        issuedAt: Date.now(),
      });

      const callbackUrl = `${supabaseUrl}/functions/v1/outlook-oauth-callback`;
      const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
        `client_id=${encodeURIComponent(clientId)}` +
        `&response_type=code` +
        `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
        `&response_mode=query` +
        `&scope=${encodeURIComponent(GRAPH_SCOPE)}` +
        `&state=${encodeURIComponent(state)}`;

      return jsonResponse({ authUrl });
    }

    if (action === "delete_connection") {
      const user = await getAuthenticatedUser(req, supabase);
      const connectionId = String(body?.connection_id || body?.connectionId || "");
      if (!connectionId) {
        return jsonResponse({ error: "connection_id is required" }, 400);
      }

      const { error } = await supabase
        .from("email_connections")
        .update({
          is_active: false,
          disconnected_at: new Date().toISOString(),
          oauth_access_token: null,
          oauth_refresh_token: null,
          oauth_expires_at: null,
          encrypted_password: "{}",
        })
        .eq("id", connectionId)
        .eq("user_id", user.id);

      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (action === "sync_claim") {
      const user = await getAuthenticatedUser(req, supabase);
      const claimId = String(body?.claim_id || body?.claimId || "");
      const connectionId = typeof body?.connection_id === "string" ? body.connection_id : undefined;
      if (!claimId) {
        return jsonResponse({ error: "claim_id is required" }, 400);
      }

      const { data: claim, error: claimError } = await supabase
        .from("claims")
        .select("id, claim_number, policy_number, policyholder_name, policyholder_email, insurance_company, insurance_email, adjuster_name, adjuster_email, is_closed")
        .eq("id", claimId)
        .single();

      if (claimError || !claim) {
        return jsonResponse({ error: "Claim not found" }, 404);
      }

      const connection = await getConnectionForUser(supabase, user.id, connectionId);

      try {
        const result = await runSyncForClaims({
          supabase,
          connection,
          claims: [claim as ClaimRow],
        });

        await updateConnectionSyncState(supabase, connection.id, {
          ...result,
          mode: "sync_claim",
          claimId,
          claimsCount: 1,
        });

        return jsonResponse({
          success: true,
          claim_id: claimId,
          fetched: result.fetched,
          matching: result.matched,
          imported: result.imported,
          since: result.since,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Sync failed";
        await updateConnectionSyncState(supabase, connection.id, {
          fetched: 0,
          matched: 0,
          imported: 0,
          since: new Date().toISOString(),
          mode: "sync_claim",
          claimId,
          claimsCount: 1,
          error: message,
        });
        throw error;
      }
    }

    if (action === "sync_all_claims") {
      const cronSecret = req.headers.get("x-cron-secret");
      const expectedCronSecret = Deno.env.get("CRON_SECRET");
      const isCronAuthorized = !!cronSecret && !!expectedCronSecret && cronSecret === expectedCronSecret;
      if (!isCronAuthorized) {
        await getAuthenticatedUser(req, supabase);
      }

      const { data: connections, error: connectionsError } = await supabase
        .from("email_connections")
        .select("*")
        .eq("is_active", true)
        .eq("provider", "outlook_oauth")
        .is("disconnected_at", null);

      if (connectionsError) throw connectionsError;
      if (!connections || connections.length === 0) {
        return jsonResponse({ success: true, total_imported: 0, claims_synced: 0, connections_synced: 0 });
      }

      const { data: claims, error: claimsError } = await supabase
        .from("claims")
        .select("id, claim_number, policy_number, policyholder_name, policyholder_email, insurance_company, insurance_email, adjuster_name, adjuster_email, is_closed")
        .eq("is_closed", false);

      if (claimsError) throw claimsError;
      if (!claims || claims.length === 0) {
        return jsonResponse({ success: true, total_imported: 0, claims_synced: 0, connections_synced: 0 });
      }

      let totalImported = 0;
      let totalMatched = 0;
      let totalFetched = 0;
      let connectionsSynced = 0;
      const errors: string[] = [];

      for (const rawConnection of connections as OutlookConnection[]) {
        try {
          const result = await runSyncForClaims({
            supabase,
            connection: rawConnection,
            claims: claims as ClaimRow[],
          });

          totalImported += result.imported;
          totalMatched += result.matched;
          totalFetched += result.fetched;
          connectionsSynced += 1;

          await updateConnectionSyncState(supabase, rawConnection.id, {
            ...result,
            mode: "sync_all_claims",
            claimsCount: claims.length,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Sync failed";
          errors.push(`${rawConnection.email_address}: ${message}`);
          await updateConnectionSyncState(supabase, rawConnection.id, {
            fetched: 0,
            matched: 0,
            imported: 0,
            since: new Date().toISOString(),
            mode: "sync_all_claims",
            claimsCount: claims.length,
            error: message,
          });
        }
      }

      return jsonResponse({
        success: true,
        total_fetched: totalFetched,
        total_matching: totalMatched,
        total_imported: totalImported,
        claims_synced: totalImported > 0 ? undefined : 0,
        connections_synced: connectionsSynced,
        errors: errors.length > 0 ? errors : undefined,
      });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    console.error("Outlook sync error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
