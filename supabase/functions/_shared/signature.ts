import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

export function getServiceSupabaseClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  return req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip");
}

export function normalizeSignAppBaseUrl(req: Request): string {
  const fromEnv = Deno.env.get("SIGN_APP_BASE_URL") || Deno.env.get("APP_BASE_URL");
  if (fromEnv && fromEnv.trim()) {
    return fromEnv.replace(/\/+$/, "");
  }

  const origin = req.headers.get("origin");
  if (origin) {
    return origin.replace(/\/+$/, "");
  }

  return "http://localhost:5173";
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function decodeBase64DataUrl(input: string): Uint8Array {
  const match = input.match(/^data:.*;base64,(.*)$/);
  const payload = match ? match[1] : input;
  return base64ToBytes(payload);
}

export function toUint8Array(content: unknown): Uint8Array {
  if (content instanceof Uint8Array) {
    return content;
  }

  if (Array.isArray(content)) {
    return new Uint8Array(content as number[]);
  }

  if (content && typeof content === "object" && "data" in (content as Record<string, unknown>)) {
    const nested = (content as { data?: unknown }).data;
    if (Array.isArray(nested)) {
      return new Uint8Array(nested as number[]);
    }
  }

  throw new Error("Unsupported binary payload format");
}

export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const raw = bytesToBase64(bytes);
  return raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sendMailjetEmail(
  toEmail: string,
  toName: string,
  subject: string,
  htmlContent: string,
): Promise<void> {
  const apiKey = Deno.env.get("MAILJET_API_KEY");
  const secretKey = Deno.env.get("MAILJET_SECRET_KEY");
  const fromEmail = Deno.env.get("MAILJET_FROM_EMAIL") || "claims@freedomclaims.work";
  const fromName = Deno.env.get("MAILJET_FROM_NAME") || "Freedom Claims";

  if (!apiKey || !secretKey) {
    throw new Error("MAILJET_API_KEY and MAILJET_SECRET_KEY are required");
  }

  const response = await fetch("https://api.mailjet.com/v3.1/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${btoa(`${apiKey}:${secretKey}`)}`,
    },
    body: JSON.stringify({
      Messages: [
        {
          From: { Email: fromEmail, Name: fromName },
          To: [{ Email: toEmail, Name: toName }],
          Subject: subject,
          HTMLPart: htmlContent,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Mailjet send failed (${response.status}): ${body}`);
  }
}

export async function appendClaimUpdate(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  claimId: string,
  content: string,
): Promise<void> {
  const { error } = await supabase.from("claim_updates").insert({
    claim_id: claimId,
    content,
    update_type: "signature",
  });

  if (error) {
    console.error("Failed to write claim update:", error);
  }
}
