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

const MATCH_MIN_SCORE_IMPORT = 8;
const MATCH_MIN_MARGIN_IMPORT = 2;
const MATCH_MIN_SCORE_RECONCILE = 10;
const MATCH_MIN_MARGIN_RECONCILE = 4;

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
}

interface SchemaCapabilities {
  modernConnectionColumns: boolean;
  modernEmailColumns: boolean;
  modernClaimFilesEmailId: boolean;
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
  weightedTerms: Array<{ term: string; weight: number }>;
}

interface ClaimMatchSelection {
  claim: ClaimRow;
  score: number;
  secondScore: number;
  margin: number;
}

interface OutlookEmailRow {
  id: string;
  claim_id: string;
  subject: string;
  body: string;
  recipient_email: string;
  recipient_name: string | null;
  recipient_type?: string | null;
  sent_by?: string | null;
  source_connection_id: string | null;
  source_provider: string | null;
  metadata: JsonRecord | null;
}

interface ReconciliationResult {
  scanned: number;
  reassigned: number;
  unchanged: number;
  insufficient_match: number;
  proposed_reassignments?: number;
  dry_run?: boolean;
  proposals?: ReconciliationProposal[];
}

interface ReconciliationProposal {
  email_id: string;
  subject: string;
  from_claim_id: string;
  from_claim_number: string | null;
  to_claim_id: string;
  to_claim_number: string | null;
  score: number;
  margin: number;
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

function toBool(value: unknown, defaultValue: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return defaultValue;
}

function toInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

function getOauthStateSecret(): string {
  return Deno.env.get("OUTLOOK_OAUTH_STATE_SECRET") || Deno.env.get("CRON_SECRET") || "outlook-state-secret";
}

function encodeBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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

function toOriginUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const parsed = new URL(input);
    return parsed.origin;
  } catch {
    return null;
  }
}

function isMissingColumnError(message: string | undefined | null): boolean {
  const text = (message || "").toLowerCase();
  return text.includes("column") && text.includes("does not exist");
}

async function detectSchemaCapabilities(
  supabase: ReturnType<typeof getServiceClient>,
): Promise<SchemaCapabilities> {
  let modernConnectionColumns = true;
  const connectionProbe = await supabase
    .from("email_connections")
    .select("oauth_access_token,oauth_refresh_token,oauth_expires_at,sync_window_start,last_sync_stats")
    .limit(1);
  if (connectionProbe.error && isMissingColumnError(connectionProbe.error.message)) {
    modernConnectionColumns = false;
  }

  let modernEmailColumns = true;
  const emailProbe = await supabase
    .from("emails")
    .select("source_provider,source_connection_id,external_message_id,metadata,direction")
    .limit(1);
  if (emailProbe.error && isMissingColumnError(emailProbe.error.message)) {
    modernEmailColumns = false;
  }

  let modernClaimFilesEmailId = true;
  const claimFilesProbe = await supabase
    .from("claim_files")
    .select("email_id")
    .limit(1);
  if (claimFilesProbe.error && isMissingColumnError(claimFilesProbe.error.message)) {
    modernClaimFilesEmailId = false;
  }

  return {
    modernConnectionColumns,
    modernEmailColumns,
    modernClaimFilesEmailId,
  };
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

function addWeightedTerm(collector: Map<string, number>, value: string | null | undefined, weight: number, minLen = 3) {
  const normalized = normalizeText(value);
  if (!normalized || normalized.length < minLen) return;
  const existing = collector.get(normalized) ?? 0;
  if (weight > existing) {
    collector.set(normalized, weight);
  }
}

function buildClaimMatchers(
  claims: ClaimRow[],
  adjustersByClaim: Map<string, Array<{ adjuster_email: string | null; adjuster_name: string | null }>>,
): ClaimMatcher[] {
  return claims.map((claim) => {
    const weighted = new Map<string, number>();

    for (const variant of claimNumberVariants(claim.claim_number)) {
      addWeightedTerm(weighted, variant, 12, 4);
    }

    addWeightedTerm(weighted, claim.policy_number, 8, 4);
    addWeightedTerm(weighted, claim.policyholder_email, 10, 5);
    addWeightedTerm(weighted, claim.insurance_email, 10, 5);
    addWeightedTerm(weighted, claim.adjuster_email, 10, 5);

    addWeightedTerm(weighted, claim.policyholder_name, 4, 4);
    addWeightedTerm(weighted, claim.insurance_company, 3, 4);
    addWeightedTerm(weighted, claim.adjuster_name, 4, 4);

    for (const adjuster of adjustersByClaim.get(claim.id) || []) {
      addWeightedTerm(weighted, adjuster.adjuster_email, 10, 5);
      addWeightedTerm(weighted, adjuster.adjuster_name, 4, 4);
    }

    return {
      claim,
      weightedTerms: Array.from(weighted.entries()).map(([term, weight]) => ({ term, weight })),
    };
  });
}

function scoreClaimMatch(haystack: string, matcher: ClaimMatcher, currentClaimId?: string): number {
  let score = 0;
  for (const weightedTerm of matcher.weightedTerms) {
    if (haystack.includes(weightedTerm.term)) {
      score += weightedTerm.weight;
    }
  }
  if (currentClaimId && matcher.claim.id === currentClaimId) {
    score += 1;
  }
  return score;
}

function pickBestClaimMatch(params: {
  haystack: string;
  matchers: ClaimMatcher[];
  minScore: number;
  minMargin: number;
  currentClaimId?: string;
}): ClaimMatchSelection | null {
  let best: ClaimMatchSelection | null = null;
  let secondScore = 0;

  for (const matcher of params.matchers) {
    const score = scoreClaimMatch(params.haystack, matcher, params.currentClaimId);
    if (!best || score > best.score) {
      secondScore = best?.score ?? secondScore;
      best = {
        claim: matcher.claim,
        score,
        secondScore: secondScore,
        margin: 0,
      };
      continue;
    }

    if (score > secondScore) {
      secondScore = score;
    }
  }

  if (!best) return null;
  best.secondScore = secondScore;
  best.margin = best.score - secondScore;

  if (best.score < params.minScore) return null;
  if (best.margin < params.minMargin) return null;
  return best;
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

function extractStoredEmailHaystack(email: OutlookEmailRow): string {
  const metadata = email.metadata || {};
  const fromAddress = typeof metadata.from_address === "string" ? metadata.from_address : "";
  const fromName = typeof metadata.from_name === "string" ? metadata.from_name : "";

  const toAddresses = Array.isArray(metadata.to_addresses) ? metadata.to_addresses.join(" ") : "";
  const toNames = Array.isArray(metadata.to_names) ? metadata.to_names.join(" ") : "";
  const ccAddresses = Array.isArray(metadata.cc_addresses) ? metadata.cc_addresses.join(" ") : "";
  const ccNames = Array.isArray(metadata.cc_names) ? metadata.cc_names.join(" ") : "";

  return [
    email.subject || "",
    email.body || "",
    email.recipient_email || "",
    email.recipient_name || "",
    fromAddress,
    fromName,
    toAddresses,
    toNames,
    ccAddresses,
    ccNames,
  ]
    .join(" ")
    .toLowerCase();
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
  capabilities: SchemaCapabilities,
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
  if (accessToken && expiresAtMillis > Date.now() + 2 * 60 * 1000) {
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

  const tokenJson = await tokenResponse.json() as Record<string, unknown>;
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

  const updatePayload = capabilities.modernConnectionColumns
    ? {
      oauth_access_token: nextAccessToken,
      oauth_refresh_token: nextRefreshToken,
      oauth_expires_at: nextExpiresAt,
      encrypted_password: legacyPayload,
      last_sync_error: null,
    }
    : {
      encrypted_password: legacyPayload,
      last_sync_error: null,
    };

  const { error } = await supabase
    .from("email_connections")
    .update(updatePayload as never)
    .eq("id", connection.id);

  if (error) {
    console.error("Failed to persist refreshed tokens:", error);
  }

  return nextAccessToken;
}

function buildMessagesUrl(sinceIso: string): string {
  const base = new URL("https://graph.microsoft.com/v1.0/me/messages");
  base.searchParams.set(
    "$select",
    "id,internetMessageId,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,bodyPreview,webLink,hasAttachments",
  );
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
    const pageMessages = Array.isArray(payload.value) ? payload.value : [];
    messages.push(...pageMessages);
    nextUrl = payload["@odata.nextLink"] || null;
  }

  return messages.slice(0, GRAPH_MAX_MESSAGES_PER_SYNC);
}

async function getConnectionForUser(
  supabase: ReturnType<typeof getServiceClient>,
  userId: string,
  capabilities: SchemaCapabilities,
  connectionId?: string,
): Promise<OutlookConnection> {
  let query = supabase
    .from("email_connections")
    .select("*")
    .eq("user_id", userId)
    .in("provider", ["outlook_oauth", "outlook"])
    .eq("is_active", true);

  if (capabilities.modernConnectionColumns) {
    query = query.is("disconnected_at", null);
  }

  if (connectionId) query = query.eq("id", connectionId);

  const { data, error } = await query.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("No active Outlook connection found. Connect Outlook in Settings first.");

  return data as OutlookConnection;
}

async function fetchAdjustersByClaim(
  supabase: ReturnType<typeof getServiceClient>,
  claimIds: string[],
): Promise<Map<string, Array<{ adjuster_email: string | null; adjuster_name: string | null }>>> {
  const map = new Map<string, Array<{ adjuster_email: string | null; adjuster_name: string | null }>>();
  if (claimIds.length === 0) return map;

  const { data } = await supabase
    .from("claim_adjusters")
    .select("claim_id, adjuster_email, adjuster_name")
    .in("claim_id", claimIds);

  for (const row of data || []) {
    const list = map.get(row.claim_id) || [];
    list.push({
      adjuster_email: row.adjuster_email,
      adjuster_name: row.adjuster_name,
    });
    map.set(row.claim_id, list);
  }

  return map;
}

async function importMessagesForClaims(params: {
  supabase: ReturnType<typeof getServiceClient>;
  connection: OutlookConnection;
  messages: GraphMessage[];
  matchers: ClaimMatcher[];
  capabilities: SchemaCapabilities;
}): Promise<{ imported: number; matched: number }> {
  const { supabase, connection, messages, matchers, capabilities } = params;

  let matched = 0;
  let imported = 0;

  for (const message of messages) {
    const haystack = extractMessageHaystack(message);
    const selected = pickBestClaimMatch({
      haystack,
      matchers,
      minScore: MATCH_MIN_SCORE_IMPORT,
      minMargin: MATCH_MIN_MARGIN_IMPORT,
    });
    if (!selected) continue;
    matched += 1;

    const externalMessageId = message.internetMessageId || message.id;
    if (!externalMessageId) continue;

    const direction = resolveDirection(message, connection.email_address);
    const recipient = resolveRecipient(message, direction);
    const sentAt = message.receivedDateTime || message.sentDateTime || new Date().toISOString();

    if (capabilities.modernEmailColumns) {
      const { data: existingRow } = await supabase
        .from("emails")
        .select("id")
        .eq("source_provider", "outlook_graph")
        .eq("external_message_id", externalMessageId)
        .limit(1)
        .maybeSingle();
      if (existingRow) continue;
    } else {
      const { data: existingRow } = await supabase
        .from("emails")
        .select("id")
        .eq("claim_id", selected.claim.id)
        .eq("subject", message.subject || "(No Subject)")
        .eq("sent_at", sentAt)
        .limit(1)
        .maybeSingle();
      if (existingRow) continue;
    }

    const fromAddress = message.from?.emailAddress?.address || null;
    const fromName = message.from?.emailAddress?.name || null;
    const toAddresses = (message.toRecipients || []).map((recipientItem) => recipientItem.emailAddress?.address || "").filter(Boolean);
    const toNames = (message.toRecipients || []).map((recipientItem) => recipientItem.emailAddress?.name || "").filter(Boolean);
    const ccAddresses = (message.ccRecipients || []).map((recipientItem) => recipientItem.emailAddress?.address || "").filter(Boolean);
    const ccNames = (message.ccRecipients || []).map((recipientItem) => recipientItem.emailAddress?.name || "").filter(Boolean);

    const insertPayload = capabilities.modernEmailColumns
      ? {
        claim_id: selected.claim.id,
        sent_by: null,
        recipient_email: recipient.email,
        recipient_name: recipient.name,
        recipient_type: direction === "inbound" ? "outlook_inbound" : "outlook_sync",
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
          from_address: fromAddress,
          from_name: fromName,
          to_addresses: toAddresses,
          to_names: toNames,
          cc_addresses: ccAddresses,
          cc_names: ccNames,
          matching_score: selected.score,
          matching_margin: selected.margin,
        },
      }
      : {
        claim_id: selected.claim.id,
        sent_by: null,
        recipient_email: recipient.email,
        recipient_name: recipient.name,
        recipient_type: direction === "inbound" ? "outlook_inbound" : "outlook_sync",
        subject: message.subject || "(No Subject)",
        body: message.bodyPreview || "",
        sent_at: sentAt,
      };

    const { error: insertError } = await supabase.from("emails").insert(insertPayload as never);

    if (insertError) {
      const msg = (insertError.message || "").toLowerCase();
      if (!msg.includes("duplicate")) {
        console.error("Email import failed:", insertError);
      }
      continue;
    }

    imported += 1;
  }

  return { imported, matched };
}

async function reconcileOutlookClaimAssignments(params: {
  supabase: ReturnType<typeof getServiceClient>;
  claims: ClaimRow[];
  connectionIds?: string[];
  limitRows: number;
  capabilities: SchemaCapabilities;
  dryRun?: boolean;
  previewLimit?: number;
}): Promise<ReconciliationResult> {
  const { supabase, claims, connectionIds, limitRows, capabilities, dryRun = false, previewLimit = 50 } = params;
  if (claims.length === 0) {
    return { scanned: 0, reassigned: 0, unchanged: 0, insufficient_match: 0 };
  }

  const adjustersByClaim = await fetchAdjustersByClaim(supabase, claims.map((claim) => claim.id));
  const matchers = buildClaimMatchers(claims, adjustersByClaim);

  let emailRows: OutlookEmailRow[] | null = null;
  if (capabilities.modernEmailColumns) {
    let modernQuery = supabase
      .from("emails")
      .select("id, claim_id, subject, body, recipient_email, recipient_name, recipient_type, sent_by, source_connection_id, source_provider, metadata")
      .eq("source_provider", "outlook_graph")
      .order("sent_at", { ascending: false })
      .limit(limitRows);

    if (connectionIds && connectionIds.length > 0) {
      if (connectionIds.length === 1) {
        modernQuery = modernQuery.eq("source_connection_id", connectionIds[0]);
      } else {
        modernQuery = modernQuery.in("source_connection_id", connectionIds);
      }
    }

    const { data, error } = await modernQuery;
    if (error) throw error;
    emailRows = (data || []) as OutlookEmailRow[];
  } else {
    const { data, error } = await supabase
      .from("emails")
      .select("id, claim_id, subject, body, recipient_email, recipient_name, recipient_type, sent_by")
      .in("recipient_type", ["outlook_sync", "outlook_inbound", "outlook_outbound"])
      .is("sent_by", null)
      .order("sent_at", { ascending: false })
      .limit(limitRows);
    if (error) throw error;
    emailRows = (data || []) as OutlookEmailRow[];
  }

  let scanned = 0;
  let reassigned = 0;
  let unchanged = 0;
  let insufficientMatch = 0;
  let proposedReassignments = 0;
  const proposals: ReconciliationProposal[] = [];

  for (const row of (emailRows || []) as OutlookEmailRow[]) {
    scanned += 1;
    const haystack = extractStoredEmailHaystack(row);
    const selected = pickBestClaimMatch({
      haystack,
      matchers,
      currentClaimId: row.claim_id,
      minScore: MATCH_MIN_SCORE_RECONCILE,
      minMargin: MATCH_MIN_MARGIN_RECONCILE,
    });

    if (!selected) {
      insufficientMatch += 1;
      continue;
    }

    if (selected.claim.id === row.claim_id) {
      unchanged += 1;
      continue;
    }

    if (dryRun) {
      proposedReassignments += 1;
      if (proposals.length < previewLimit) {
        const fromClaim = claims.find((claim) => claim.id === row.claim_id);
        proposals.push({
          email_id: row.id,
          subject: row.subject,
          from_claim_id: row.claim_id,
          from_claim_number: fromClaim?.claim_number || null,
          to_claim_id: selected.claim.id,
          to_claim_number: selected.claim.claim_number || null,
          score: selected.score,
          margin: selected.margin,
        });
      }
      continue;
    }

    let updateRows: Array<{ id: string }> | null = null;

    if (capabilities.modernEmailColumns) {
      const updatedMetadata: JsonRecord = {
        ...(row.metadata || {}),
        reconciliation: {
          reassigned_at: new Date().toISOString(),
          from_claim_id: row.claim_id,
          to_claim_id: selected.claim.id,
          score: selected.score,
          margin: selected.margin,
        },
      };

      const { data: modernRows, error: modernError } = await supabase
        .from("emails")
        .update({
          claim_id: selected.claim.id,
          metadata: updatedMetadata,
        })
        .eq("id", row.id)
        .eq("claim_id", row.claim_id)
        .select("id");

      if (modernError) {
        console.error("Failed to reassign email", row.id, modernError);
        continue;
      }

      updateRows = modernRows as Array<{ id: string }> | null;
    } else {
      const { data: legacyRows, error: legacyError } = await supabase
        .from("emails")
        .update({
          claim_id: selected.claim.id,
        })
        .eq("id", row.id)
        .eq("claim_id", row.claim_id)
        .select("id");

      if (legacyError) {
        console.error("Failed to reassign email", row.id, legacyError);
        continue;
      }

      updateRows = legacyRows as Array<{ id: string }> | null;
    }

    if (!updateRows || updateRows.length !== 1) {
      continue;
    }

    if (capabilities.modernClaimFilesEmailId) {
      await supabase
        .from("claim_files")
        .update({ claim_id: selected.claim.id })
        .eq("email_id", row.id)
        .eq("claim_id", row.claim_id);
    }

    await supabase.from("claim_updates").insert([
      {
        claim_id: row.claim_id,
        content: `Outlook reconciliation moved email "${row.subject}" to claim ${selected.claim.claim_number || selected.claim.id}.`,
        update_type: "email",
      },
      {
        claim_id: selected.claim.id,
        content: `Outlook reconciliation moved email "${row.subject}" here from another claim.`,
        update_type: "email",
      },
    ] as never);

    reassigned += 1;
  }

  return {
    scanned,
    reassigned,
    unchanged,
    insufficient_match: insufficientMatch,
    dry_run: dryRun,
    proposed_reassignments: proposedReassignments,
    proposals: dryRun ? proposals : undefined,
  };
}

async function runSyncForClaims(params: {
  supabase: ReturnType<typeof getServiceClient>;
  connection: OutlookConnection;
  claims: ClaimRow[];
  capabilities: SchemaCapabilities;
}): Promise<{ fetched: number; imported: number; matched: number; since: string }> {
  const { supabase, connection, claims, capabilities } = params;
  const adjustersByClaim = await fetchAdjustersByClaim(supabase, claims.map((claim) => claim.id));
  const matchers = buildClaimMatchers(claims, adjustersByClaim);

  const lastSync = connection.last_sync_at ? new Date(connection.last_sync_at).getTime() : 0;
  const baseWindow = capabilities.modernConnectionColumns && connection.sync_window_start
    ? new Date(connection.sync_window_start).getTime()
    : Date.now() - 30 * 24 * 60 * 60 * 1000;
  const overlap = 2 * 60 * 60 * 1000;
  const sinceMillis = Math.max(baseWindow, lastSync > 0 ? lastSync - overlap : baseWindow);
  const sinceIso = new Date(sinceMillis).toISOString();

  const accessToken = await refreshAccessToken(supabase, connection, capabilities);
  const graphMessages = await fetchGraphMessages(accessToken, sinceIso);
  const importResult = await importMessagesForClaims({
    supabase,
    connection,
    messages: graphMessages,
    matchers,
    capabilities,
  });

  return {
    fetched: graphMessages.length,
    imported: importResult.imported,
    matched: importResult.matched,
    since: sinceIso,
  };
}

async function updateConnectionSyncState(
  supabase: ReturnType<typeof getServiceClient>,
  connectionId: string,
  capabilities: SchemaCapabilities,
  payload: {
    fetched: number;
    imported: number;
    matched: number;
    since: string;
    mode: string;
    claimId?: string;
    claimsCount?: number;
    reassigned?: number;
    error?: string;
  },
) {
  const nowIso = new Date().toISOString();
  const updatePayload = capabilities.modernConnectionColumns
    ? {
      last_sync_at: nowIso,
      last_sync_error: payload.error || null,
      last_sync_stats: {
        fetched: payload.fetched,
        imported: payload.imported,
        matched: payload.matched,
        reassigned: payload.reassigned ?? 0,
        since: payload.since,
        mode: payload.mode,
        claim_id: payload.claimId || null,
        claims_count: payload.claimsCount || null,
        synced_at: nowIso,
      },
      sync_window_start: payload.since,
    }
    : {
      last_sync_at: nowIso,
      last_sync_error: payload.error || null,
    };

  const { error } = await supabase
    .from("email_connections")
    .update(updatePayload as never)
    .eq("id", connectionId);

  if (error) {
    console.error("Failed to update connection sync state:", error);
  }
}

async function loadClaimsForSync(supabase: ReturnType<typeof getServiceClient>): Promise<ClaimRow[]> {
  const { data, error } = await supabase
    .from("claims")
    .select("id, claim_number, policy_number, policyholder_name, policyholder_email, insurance_company, insurance_email, adjuster_name, adjuster_email, is_closed")
    .eq("is_closed", false);
  if (error) throw error;
  return (data || []) as ClaimRow[];
}

async function loadClaimsForReconciliation(supabase: ReturnType<typeof getServiceClient>): Promise<ClaimRow[]> {
  const { data, error } = await supabase
    .from("claims")
    .select("id, claim_number, policy_number, policyholder_name, policyholder_email, insurance_company, insurance_email, adjuster_name, adjuster_email, is_closed");
  if (error) throw error;
  return (data || []) as ClaimRow[];
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
    const capabilities = await detectSchemaCapabilities(supabase);

    if (action === "get_auth_url") {
      const user = await getAuthenticatedUser(req, supabase);
      const clientId = Deno.env.get("MS_CLIENT_ID");
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      if (!clientId || !supabaseUrl) {
        throw new Error("Microsoft OAuth is not configured");
      }

      const origin = req.headers.get("origin") || "";
      const requestedRedirect = typeof body?.redirect_url === "string" ? body.redirect_url : "";
      const redirectUrl = toOriginUrl(requestedRedirect) || toOriginUrl(origin) || toOriginUrl(Deno.env.get("APP_BASE_URL")) || "/";

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

      const deletePayload = capabilities.modernConnectionColumns
        ? {
          is_active: false,
          disconnected_at: new Date().toISOString(),
          oauth_access_token: null,
          oauth_refresh_token: null,
          oauth_expires_at: null,
          encrypted_password: "{}",
        }
        : {
          is_active: false,
          encrypted_password: "{}",
        };

      const { error } = await supabase
        .from("email_connections")
        .update(deletePayload as never)
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

      const connection = await getConnectionForUser(supabase, user.id, capabilities, connectionId);

      try {
        const result = await runSyncForClaims({
          supabase,
          connection,
          claims: [claim as ClaimRow],
          capabilities,
        });

        await updateConnectionSyncState(supabase, connection.id, capabilities, {
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
        await updateConnectionSyncState(supabase, connection.id, capabilities, {
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

    if (action === "reconcile_claim_assignments") {
      const cronSecret = req.headers.get("x-cron-secret");
      const expectedCronSecret = Deno.env.get("CRON_SECRET");
      const isCronAuthorized = !!cronSecret && !!expectedCronSecret && cronSecret === expectedCronSecret;
      const user = isCronAuthorized ? null : await getAuthenticatedUser(req, supabase);

      let connectionIds: string[] = [];
      if (user) {
        const connectionId = typeof body?.connection_id === "string" ? body.connection_id : undefined;
        const connection = await getConnectionForUser(supabase, user.id, capabilities, connectionId);
        connectionIds = [connection.id];
      } else {
        let activeConnectionsQuery = supabase
          .from("email_connections")
          .select("id")
          .eq("is_active", true)
          .in("provider", ["outlook_oauth", "outlook"]);
        if (capabilities.modernConnectionColumns) {
          activeConnectionsQuery = activeConnectionsQuery.is("disconnected_at", null);
        }
        const { data: activeConnections } = await activeConnectionsQuery;
        connectionIds = (activeConnections || []).map((row: { id: string }) => row.id);
      }

      if (connectionIds.length === 0) {
        return jsonResponse({ success: true, scanned: 0, reassigned: 0, dry_run: toBool(body?.dry_run, false) });
      }

      const claims = await loadClaimsForReconciliation(supabase);
      const maxRows = toInteger(
        body?.limit_rows ?? body?.max_rows ?? Deno.env.get("OUTLOOK_RECONCILE_LIMIT") ?? 2500,
        2500,
      );
      const dryRun = toBool(body?.dry_run ?? body?.preview_only, false);
      const previewLimit = toInteger(body?.preview_limit ?? 50, 50);

      const reconcileResult = await reconcileOutlookClaimAssignments({
        supabase,
        claims,
        connectionIds,
        limitRows: maxRows,
        capabilities,
        dryRun,
        previewLimit,
      });

      return jsonResponse({
        success: true,
        schema_mode: capabilities.modernEmailColumns ? "modern" : "legacy",
        ...reconcileResult,
      });
    }

    if (action === "sync_all_claims") {
      const cronSecret = req.headers.get("x-cron-secret");
      const expectedCronSecret = Deno.env.get("CRON_SECRET");
      const isCronAuthorized = !!cronSecret && !!expectedCronSecret && cronSecret === expectedCronSecret;
      if (!isCronAuthorized) {
        await getAuthenticatedUser(req, supabase);
      }

      let connectionsQuery = supabase
        .from("email_connections")
        .select("*")
        .eq("is_active", true)
        .in("provider", ["outlook_oauth", "outlook"]);
      if (capabilities.modernConnectionColumns) {
        connectionsQuery = connectionsQuery.is("disconnected_at", null);
      }
      const { data: connections, error: connectionsError } = await connectionsQuery;

      if (connectionsError) throw connectionsError;
      if (!connections || connections.length === 0) {
        return jsonResponse({
          success: true,
          total_imported: 0,
          total_matching: 0,
          total_fetched: 0,
          total_reassigned: 0,
          connections_synced: 0,
        });
      }

      const claimsForSync = await loadClaimsForSync(supabase);
      if (claimsForSync.length === 0) {
        return jsonResponse({
          success: true,
          total_imported: 0,
          total_matching: 0,
          total_fetched: 0,
          total_reassigned: 0,
          connections_synced: 0,
        });
      }

      let totalImported = 0;
      let totalMatched = 0;
      let totalFetched = 0;
      let connectionsSynced = 0;
      const errors: string[] = [];
      const syncedConnectionIds: string[] = [];

      for (const rawConnection of connections as OutlookConnection[]) {
        try {
          const result = await runSyncForClaims({
            supabase,
            connection: rawConnection,
            claims: claimsForSync,
            capabilities,
          });

          totalImported += result.imported;
          totalMatched += result.matched;
          totalFetched += result.fetched;
          connectionsSynced += 1;
          syncedConnectionIds.push(rawConnection.id);

          await updateConnectionSyncState(supabase, rawConnection.id, capabilities, {
            ...result,
            mode: "sync_all_claims",
            claimsCount: claimsForSync.length,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Sync failed";
          errors.push(`${rawConnection.email_address}: ${message}`);
          await updateConnectionSyncState(supabase, rawConnection.id, capabilities, {
            fetched: 0,
            matched: 0,
            imported: 0,
            since: new Date().toISOString(),
            mode: "sync_all_claims",
            claimsCount: claimsForSync.length,
            error: message,
          });
        }
      }

      const reconcileEnabled = toBool(
        body?.reconcile_existing ?? Deno.env.get("OUTLOOK_AUTO_RECONCILE_ENABLED"),
        true,
      );
      let reconciliation: ReconciliationResult = {
        scanned: 0,
        reassigned: 0,
        unchanged: 0,
        insufficient_match: 0,
      };

      if (reconcileEnabled && syncedConnectionIds.length > 0) {
        const claimsForReconcile = await loadClaimsForReconciliation(supabase);
        const limitRows = toInteger(
          body?.reconcile_limit ?? Deno.env.get("OUTLOOK_RECONCILE_LIMIT") ?? 2500,
          2500,
        );
        reconciliation = await reconcileOutlookClaimAssignments({
          supabase,
          claims: claimsForReconcile,
          connectionIds: syncedConnectionIds,
          limitRows,
          capabilities,
        });
      }

      return jsonResponse({
        success: true,
        total_fetched: totalFetched,
        total_matching: totalMatched,
        total_imported: totalImported,
        total_reassigned: reconciliation.reassigned,
        reconciliation,
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
