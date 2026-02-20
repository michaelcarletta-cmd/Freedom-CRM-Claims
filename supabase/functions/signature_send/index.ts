import {
  appendClaimUpdate,
  bytesToBase64,
  corsHeaders,
  getServiceSupabaseClient,
  jsonResponse,
  normalizeSignAppBaseUrl,
  randomToken,
  sendMailjetEmail,
  sha256Hex,
  toUint8Array,
} from "../_shared/signature.ts";

interface SignatureSignerRow {
  id: string;
  name: string;
  email: string;
  signing_order: number;
  status: string;
}

interface SignatureRequestRow {
  id: string;
  claim_id: string;
  source_type: "uploaded_pdf" | "generated";
  draft_pdf_path: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  claims: {
    id: string;
    claim_number: string | null;
    policyholder_name: string | null;
  } | null;
  signature_signers: SignatureSignerRow[];
}

function getTokenTtlHours(): number {
  const raw = Number(Deno.env.get("SIGN_TOKEN_TTL_HOURS") ?? "168");
  if (!Number.isFinite(raw) || raw <= 0) {
    return 168;
  }
  return raw;
}

function signEmailHtml(params: {
  signerName: string;
  claimNumber: string;
  policyholderName: string;
  signUrl: string;
  expiresAtIso: string;
}): string {
  const expiresAt = new Date(params.expiresAtIso).toLocaleString();
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="margin-bottom: 8px;">Signature Required</h2>
      <p>Hello ${params.signerName || "Signer"},</p>
      <p>Please review and sign the Freedom CRM document for claim <strong>${params.claimNumber}</strong>.</p>
      <p>Policyholder: <strong>${params.policyholderName || "-"}</strong></p>
      <p>This secure signing link expires on <strong>${expiresAt}</strong>.</p>
      <p style="margin: 24px 0;">
        <a href="${params.signUrl}" style="background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">
          Open document and sign
        </a>
      </p>
      <p style="font-size:12px;color:#666;">If the button does not work, paste this link into your browser:</p>
      <p style="font-size:12px;word-break:break-all;"><a href="${params.signUrl}">${params.signUrl}</a></p>
    </div>
  `;
}

async function convertDocxToPdf(docxBytes: Uint8Array): Promise<Uint8Array> {
  const rendererUrl = Deno.env.get("PDF_RENDERER_URL");
  if (!rendererUrl) {
    throw new Error("PDF_RENDERER_URL is required for DOCX to PDF conversion");
  }

  const rendererApiKey = Deno.env.get("PDF_RENDERER_API_KEY");
  const response = await fetch(`${rendererUrl.replace(/\/+$/, "")}/render/docx-to-pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(rendererApiKey ? { "x-api-key": rendererApiKey } : {}),
    },
    body: JSON.stringify({
      docxBase64: bytesToBase64(docxBytes),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`pdf-renderer conversion failed (${response.status}): ${body}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

async function generateDraftPdfForRequest(request: SignatureRequestRow): Promise<Uint8Array> {
  const metadata = request.metadata ?? {};
  const templateId = String(metadata.template_id ?? metadata.templateId ?? "").trim();
  if (!templateId) {
    throw new Error("Generated signature requests require metadata.template_id");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  const generateResponse = await fetch(`${supabaseUrl}/functions/v1/generate-document`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      templateId,
      claimId: request.claim_id,
    }),
  });

  if (!generateResponse.ok) {
    const body = await generateResponse.text();
    throw new Error(`generate-document failed (${generateResponse.status}): ${body}`);
  }

  const payload = await generateResponse.json();
  if (payload?.error) {
    throw new Error(payload.details || payload.error);
  }

  const generatedBytes = toUint8Array(payload?.content);
  if (payload?.isPDF) {
    return generatedBytes;
  }

  return await convertDocxToPdf(generatedBytes);
}

async function ensureDraftPdfPath(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  request: SignatureRequestRow,
): Promise<string> {
  if (request.draft_pdf_path) {
    return request.draft_pdf_path;
  }

  if (request.source_type !== "generated") {
    throw new Error("draft_pdf_path is required for uploaded_pdf signature requests");
  }

  const pdfBytes = await generateDraftPdfForRequest(request);
  const draftPath = `drafts/${request.claim_id}/${request.id}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from("claim-files")
    .upload(
      draftPath,
      new Blob([pdfBytes], { type: "application/pdf" }),
      { upsert: true, contentType: "application/pdf" },
    );

  if (uploadError) {
    throw new Error(`Failed uploading generated draft PDF: ${uploadError.message}`);
  }

  const mergedMetadata = {
    ...(request.metadata ?? {}),
    generated_pdf_at: new Date().toISOString(),
  };

  const { data: updatedRows, error: requestUpdateError } = await supabase
    .from("signature_requests")
    .update({
      draft_pdf_path: draftPath,
      metadata: mergedMetadata,
    })
    .eq("id", request.id)
    .select("id");

  if (requestUpdateError) {
    throw requestUpdateError;
  }

  if (!updatedRows || updatedRows.length !== 1) {
    throw new Error("Failed to update draft_pdf_path for signature request");
  }

  return draftPath;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const requestId = body?.request_id ?? body?.requestId;
    if (!requestId) {
      return jsonResponse({ error: "request_id is required" }, 400);
    }

    const supabase = getServiceSupabaseClient();

    const { data: requestData, error: requestError } = await supabase
      .from("signature_requests")
      .select(`
        id,
        claim_id,
        source_type,
        draft_pdf_path,
        status,
        metadata,
        claims (
          id,
          claim_number,
          policyholder_name
        ),
        signature_signers (
          id,
          name,
          email,
          signing_order,
          status
        )
      `)
      .eq("id", requestId)
      .single();

    if (requestError) {
      throw requestError;
    }

    const requestRow = requestData as unknown as SignatureRequestRow;
    if (!requestRow) {
      return jsonResponse({ error: "Signature request not found" }, 404);
    }

    if (!["draft", "void"].includes(requestRow.status)) {
      return jsonResponse({
        error: `Only draft/void requests can be sent (current status: ${requestRow.status})`,
      }, 400);
    }

    const signers = [...(requestRow.signature_signers || [])].sort(
      (a, b) => a.signing_order - b.signing_order,
    );

    if (signers.length === 0) {
      return jsonResponse({ error: "At least one signer is required" }, 400);
    }

    const draftPdfPath = await ensureDraftPdfPath(supabase, requestRow);
    const signAppBase = normalizeSignAppBaseUrl(req);
    const nowIso = new Date().toISOString();
    const ttlHours = getTokenTtlHours();
    const claimNumber = requestRow.claims?.claim_number || requestRow.claim_id;
    const policyholderName = requestRow.claims?.policyholder_name || "";

    let sentCount = 0;
    for (const signer of signers) {
      const rawToken = randomToken();
      const tokenHash = await sha256Hex(rawToken);
      const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
      const signUrl = `${signAppBase}/sign?token=${encodeURIComponent(rawToken)}`;

      const { data: signerUpdateRows, error: signerUpdateError } = await supabase
        .from("signature_signers")
        .update({
          token_hash: tokenHash,
          status: "pending",
          viewed_at: null,
          signed_at: null,
          ip: null,
          user_agent: null,
          expires_at: expiresAt,
        })
        .eq("id", signer.id)
        .eq("request_id", requestRow.id)
        .select("id");

      if (signerUpdateError) {
        throw signerUpdateError;
      }

      if (!signerUpdateRows || signerUpdateRows.length !== 1) {
        throw new Error(`Failed updating signer token for signer ${signer.id}`);
      }

      await sendMailjetEmail(
        signer.email,
        signer.name,
        `Signature required for claim ${claimNumber}`,
        signEmailHtml({
          signerName: signer.name,
          claimNumber,
          policyholderName,
          signUrl,
          expiresAtIso: expiresAt,
        }),
      );

      sentCount += 1;
    }

    const { data: requestUpdateRows, error: requestUpdateError } = await supabase
      .from("signature_requests")
      .update({
        status: "sent",
        sent_at: nowIso,
        draft_pdf_path: draftPdfPath,
      })
      .eq("id", requestRow.id)
      .select("id");

    if (requestUpdateError) {
      throw requestUpdateError;
    }

    if (!requestUpdateRows || requestUpdateRows.length !== 1) {
      throw new Error("Failed to update signature request status to sent");
    }

    await appendClaimUpdate(
      supabase,
      requestRow.claim_id,
      `Signature request ${requestRow.id} sent to ${sentCount} signer(s).`,
    );

    return jsonResponse({
      success: true,
      request_id: requestRow.id,
      signers_notified: sentCount,
      draft_pdf_path: draftPdfPath,
      status: "sent",
    });
  } catch (error) {
    console.error("signature_send failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
