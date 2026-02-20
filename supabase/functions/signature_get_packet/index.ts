import {
  appendClaimUpdate,
  corsHeaders,
  getClientIp,
  getServiceSupabaseClient,
  jsonResponse,
  sha256Hex,
} from "../_shared/signature.ts";

interface SignatureFieldRow {
  id: string;
  request_id: string;
  assigned_signer_id: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  type: "signature" | "date" | "text" | "checkbox";
  required: boolean;
  label: string | null;
  meta: Record<string, unknown> | null;
}

interface SignatureFieldValueRow {
  field_id: string;
  value_text: string | null;
  value_bool: boolean | null;
  value_asset_path: string | null;
  filled_at: string | null;
}

interface SignerLookupRow {
  id: string;
  request_id: string;
  name: string;
  email: string;
  signing_order: number;
  status: string;
  signed_at: string | null;
  viewed_at: string | null;
  expires_at: string | null;
  signature_requests: {
    id: string;
    claim_id: string;
    source_type: "uploaded_pdf" | "generated";
    draft_pdf_path: string | null;
    final_pdf_path: string | null;
    status: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
    claims: {
      id: string;
      claim_number: string | null;
      policyholder_name: string | null;
    } | null;
  };
}

function extractToken(req: Request, body: Record<string, unknown>): string | null {
  if (typeof body.token === "string" && body.token.trim()) {
    return body.token.trim();
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (token && token.trim()) {
    return token.trim();
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = req.method === "GET" ? {} : await req.json().catch(() => ({}));
    const token = extractToken(req, body as Record<string, unknown>);
    if (!token) {
      return jsonResponse({ error: "Missing token" }, 400);
    }

    const tokenHash = await sha256Hex(token);
    const supabase = getServiceSupabaseClient();

    const { data: signerData, error: signerError } = await supabase
      .from("signature_signers")
      .select(`
        id,
        request_id,
        name,
        email,
        signing_order,
        status,
        signed_at,
        viewed_at,
        expires_at,
        signature_requests!inner (
          id,
          claim_id,
          source_type,
          draft_pdf_path,
          final_pdf_path,
          status,
          metadata,
          created_at,
          claims (
            id,
            claim_number,
            policyholder_name
          )
        )
      `)
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (signerError) {
      throw signerError;
    }

    const signer = signerData as unknown as SignerLookupRow | null;
    if (!signer) {
      return jsonResponse({ error: "Not found" }, 404);
    }

    if (signer.expires_at && new Date(signer.expires_at).getTime() < Date.now()) {
      return jsonResponse({ error: "Not found" }, 404);
    }

    const request = signer.signature_requests;
    if (!request?.draft_pdf_path) {
      return jsonResponse({ error: "Document not available yet" }, 404);
    }

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("claim-files")
      .createSignedUrl(request.draft_pdf_path, 1800);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      throw new Error(signedUrlError?.message || "Failed creating PDF signed URL");
    }

    const { data: fieldsData, error: fieldsError } = await supabase
      .from("signature_fields")
      .select(`
        id,
        request_id,
        assigned_signer_id,
        page,
        x,
        y,
        w,
        h,
        type,
        required,
        label,
        meta
      `)
      .eq("request_id", request.id)
      .eq("assigned_signer_id", signer.id)
      .order("page", { ascending: true })
      .order("created_at", { ascending: true });

    if (fieldsError) {
      throw fieldsError;
    }

    const fields = (fieldsData ?? []) as SignatureFieldRow[];

    const { data: valuesData, error: valuesError } = await supabase
      .from("signature_field_values")
      .select(`
        field_id,
        value_text,
        value_bool,
        value_asset_path,
        filled_at
      `)
      .eq("signer_id", signer.id);

    if (valuesError) {
      throw valuesError;
    }

    const valuesByField = new Map<string, SignatureFieldValueRow>();
    (valuesData as SignatureFieldValueRow[] | null)?.forEach((value) => {
      valuesByField.set(value.field_id, value);
    });

    const pendingPriorSignerQuery = await supabase
      .from("signature_signers")
      .select("id")
      .eq("request_id", request.id)
      .lt("signing_order", signer.signing_order)
      .neq("status", "signed");

    if (pendingPriorSignerQuery.error) {
      throw pendingPriorSignerQuery.error;
    }

    const canSign = !pendingPriorSignerQuery.data || pendingPriorSignerQuery.data.length === 0;

    let responseSignerStatus = signer.status;
    if (signer.status === "pending") {
      const nowIso = new Date().toISOString();
      const clientIp = getClientIp(req);
      const userAgent = req.headers.get("user-agent");

      const { data: viewedRows, error: viewedError } = await supabase
        .from("signature_signers")
        .update({
          status: "viewed",
          viewed_at: nowIso,
          ip: clientIp,
          user_agent: userAgent,
        })
        .eq("id", signer.id)
        .eq("status", "pending")
        .select("id");

      if (viewedError) {
        throw viewedError;
      }

      if (viewedRows && viewedRows.length === 1) {
        responseSignerStatus = "viewed";
        await appendClaimUpdate(
          supabase,
          request.claim_id,
          `Signer ${signer.name} viewed signature request ${request.id}.`,
        );
      }
    }

    const responseFields = fields.map((field) => {
      const value = valuesByField.get(field.id);
      return {
        ...field,
        value_text: value?.value_text ?? null,
        value_bool: value?.value_bool ?? null,
        value_asset_path: value?.value_asset_path ?? null,
        filled_at: value?.filled_at ?? null,
      };
    });

    return jsonResponse({
      signer: {
        id: signer.id,
        request_id: signer.request_id,
        name: signer.name,
        email: signer.email,
        signing_order: signer.signing_order,
        status: responseSignerStatus,
        signed_at: signer.signed_at,
        viewed_at: signer.viewed_at,
        expires_at: signer.expires_at,
      },
      request: {
        id: request.id,
        claim_id: request.claim_id,
        source_type: request.source_type,
        draft_pdf_path: request.draft_pdf_path,
        final_pdf_path: request.final_pdf_path,
        status: request.status,
        metadata: request.metadata,
        claim: request.claims,
      },
      can_sign: canSign,
      pdf_url: signedUrlData.signedUrl,
      fields: responseFields,
    });
  } catch (error) {
    console.error("signature_get_packet failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
