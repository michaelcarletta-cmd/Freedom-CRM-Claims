import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_SCOPE = "https://graph.microsoft.com/Mail.Read offline_access User.Read";

function decodeBase64Url(value: string): string {
  let base = value.replace(/-/g, "+").replace(/_/g, "/");
  while (base.length % 4 !== 0) base += "=";
  return atob(base);
}

function getOauthStateSecret(): string {
  return Deno.env.get("OUTLOOK_OAUTH_STATE_SECRET") || Deno.env.get("CRON_SECRET") || "outlook-state-secret";
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyStateToken(state: string): Promise<{ userId: string; redirectUrl: string; issuedAt: number }> {
  const [body, signature] = state.split(".");
  if (!body || !signature) {
    throw new Error("Invalid OAuth state");
  }

  const expectedSignature = await sha256Hex(`${body}.${getOauthStateSecret()}`);
  if (expectedSignature !== signature) {
    throw new Error("OAuth state signature mismatch");
  }

  const payload = JSON.parse(decodeBase64Url(body)) as {
    userId?: string;
    redirectUrl?: string;
    issuedAt?: number;
  };

  if (!payload.userId || !payload.redirectUrl || !payload.issuedAt) {
    throw new Error("OAuth state payload missing required fields");
  }

  const maxAgeMs = 30 * 60 * 1000;
  if (Date.now() - payload.issuedAt > maxAgeMs) {
    throw new Error("OAuth state expired");
  }

  return {
    userId: payload.userId,
    redirectUrl: payload.redirectUrl,
    issuedAt: payload.issuedAt,
  };
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

function redirectWithError(redirectUrl: string, message: string): Response {
  const separator = redirectUrl.includes("?") ? "&" : "?";
  const location = `${redirectUrl}${separator}outlook_error=${encodeURIComponent(message)}`;
  return new Response(null, { status: 302, headers: { Location: location } });
}

function redirectWithSuccess(redirectUrl: string): Response {
  const separator = redirectUrl.includes("?") ? "&" : "?";
  const location = `${redirectUrl}${separator}outlook_connected=true`;
  return new Response(null, { status: 302, headers: { Location: location } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");
    const oauthErrorDescription = url.searchParams.get("error_description");

    const fallbackRedirect = toOriginUrl(Deno.env.get("SIGN_APP_BASE_URL")) ||
      toOriginUrl(Deno.env.get("APP_BASE_URL")) ||
      "/";

    if (oauthError) {
      return redirectWithError(
        fallbackRedirect,
        oauthErrorDescription || oauthError || "OAuth failed",
      );
    }

    if (!code || !stateParam) {
      return redirectWithError(fallbackRedirect, "Missing OAuth code or state");
    }

    const state = await verifyStateToken(stateParam);
    const redirectUrl = toOriginUrl(state.redirectUrl) || fallbackRedirect;

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const clientId = Deno.env.get("MS_CLIENT_ID");
    const clientSecret = Deno.env.get("MS_CLIENT_SECRET");
    if (!supabaseUrl || !serviceRoleKey || !clientId || !clientSecret) {
      return redirectWithError(redirectUrl, "Outlook OAuth is not configured");
    }

    const callbackUrl = `${supabaseUrl}/functions/v1/outlook-oauth-callback`;
    const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: callbackUrl,
        grant_type: "authorization_code",
        scope: GRAPH_SCOPE,
      }),
    });

    if (!tokenResponse.ok) {
      const body = await tokenResponse.text();
      console.error("Outlook token exchange failed:", body);
      return redirectWithError(redirectUrl, "Token exchange failed");
    }

    const tokenJson = await tokenResponse.json();
    const accessToken = String(tokenJson.access_token || "");
    const refreshToken = String(tokenJson.refresh_token || "");
    const scope = String(tokenJson.scope || GRAPH_SCOPE);
    const expiresAt = new Date(Date.now() + Number(tokenJson.expires_in || 3600) * 1000).toISOString();
    if (!accessToken || !refreshToken) {
      return redirectWithError(redirectUrl, "OAuth token payload incomplete");
    }

    const profileResponse = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileResponse.ok) {
      const body = await profileResponse.text();
      console.error("Graph profile fetch failed:", body);
      return redirectWithError(redirectUrl, "Unable to read Outlook profile");
    }

    const profile = await profileResponse.json();
    const graphUserId = String(profile.id || "");
    const emailAddress = String(profile.mail || profile.userPrincipalName || "").toLowerCase();
    if (!emailAddress) {
      return redirectWithError(redirectUrl, "Outlook profile email is unavailable");
    }

    const legacyBundle = JSON.stringify({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
    });

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: upsertError } = await supabase.from("email_connections").upsert({
      user_id: state.userId,
      provider: "outlook_oauth",
      email_address: emailAddress,
      imap_host: "graph.microsoft.com",
      imap_port: 443,
      encrypted_password: legacyBundle,
      oauth_access_token: accessToken,
      oauth_refresh_token: refreshToken,
      oauth_expires_at: expiresAt,
      oauth_scope: scope,
      graph_user_id: graphUserId || null,
      sync_mode: "outlook_graph",
      is_active: true,
      disconnected_at: null,
      last_sync_error: null,
      sync_window_start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      metadata: {
        oauth_callback_at: new Date().toISOString(),
      },
    } as never, { onConflict: "user_id,email_address" });

    if (upsertError) {
      console.error("Outlook connection upsert failed:", upsertError);
      return redirectWithError(redirectUrl, "Failed to save Outlook connection");
    }

    return redirectWithSuccess(redirectUrl);
  } catch (error) {
    console.error("Outlook OAuth callback error:", error);
    const message = error instanceof Error ? error.message : "OAuth callback failed";
    const redirect = toOriginUrl(Deno.env.get("APP_BASE_URL")) || "/";
    return redirectWithError(redirect, message);
  }
});
