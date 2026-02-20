import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import {
  appendClaimUpdate,
  corsHeaders,
  decodeBase64DataUrl,
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
}

interface SignatureFieldValueUpsertRow {
  field_id: string;
  signer_id: string;
  value_text: string | null;
  value_bool: boolean | null;
  value_asset_path: string | null;
  filled_at: string;
}

interface IncomingFieldValue {
  fieldId: string;
  valueText: string | null;
  valueBool: boolean | null;
  valueAssetPath: string | null;
  signatureBase64: string | null;
}

interface SignerLookupRow {
  id: string;
  request_id: string;
  name: string;
  email: string;
  signing_order: number;
  status: string;
  signed_at: string | null;
  expires_at: string | null;
  signature_requests: {
    id: string;
    claim_id: string;
    status: string;
    source_type: "uploaded_pdf" | "generated";
    draft_pdf_path: string | null;
    final_pdf_path: string | null;
  };
}

function extractToken(req: Request, body: Record<string, unknown>): string | null {
  if (typeof body.token === "string" && body.token.trim()) {
    return body.token.trim();
  }

  const fromQuery = new URL(req.url).searchParams.get("token");
  if (fromQuery && fromQuery.trim()) {
    return fromQuery.trim();
  }

  return null;
}

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (["true", "1", "yes", "on", "checked"].includes(lower)) return true;
    if (["false", "0", "no", "off", "unchecked"].includes(lower)) return false;
  }
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return null;
}

function normalizeFieldValues(input: unknown): Map<string, IncomingFieldValue> {
  const map = new Map<string, IncomingFieldValue>();

  const upsert = (entry: IncomingFieldValue) => {
    map.set(entry.fieldId, entry);
  };

  if (Array.isArray(input)) {
    for (const item of input) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const fieldId = String(row.field_id ?? row.fieldId ?? "").trim();
      if (!fieldId) continue;

      const valueTextRaw = row.value_text ?? row.valueText;
      const valueText = typeof valueTextRaw === "string" ? valueTextRaw : valueTextRaw != null
        ? String(valueTextRaw)
        : null;

      const signatureBase64Raw = row.signature_base64 ?? row.signatureBase64;
      const signatureBase64 = typeof signatureBase64Raw === "string" && signatureBase64Raw.trim()
        ? signatureBase64Raw
        : null;

      upsert({
        fieldId,
        valueText,
        valueBool: parseBoolean(row.value_bool ?? row.valueBool),
        valueAssetPath: typeof (row.value_asset_path ?? row.valueAssetPath) === "string"
          ? String(row.value_asset_path ?? row.valueAssetPath)
          : null,
        signatureBase64,
      });
    }
    return map;
  }

  if (input && typeof input === "object") {
    for (const [fieldId, value] of Object.entries(input as Record<string, unknown>)) {
      if (!fieldId) continue;
      if (value && typeof value === "object") {
        const row = value as Record<string, unknown>;
        upsert({
          fieldId,
          valueText: typeof (row.value_text ?? row.valueText) === "string"
            ? String(row.value_text ?? row.valueText)
            : null,
          valueBool: parseBoolean(row.value_bool ?? row.valueBool),
          valueAssetPath: typeof (row.value_asset_path ?? row.valueAssetPath) === "string"
            ? String(row.value_asset_path ?? row.valueAssetPath)
            : null,
          signatureBase64: typeof (row.signature_base64 ?? row.signatureBase64) === "string"
            ? String(row.signature_base64 ?? row.signatureBase64)
            : null,
        });
        continue;
      }

      if (typeof value === "string") {
        const isDataUrl = value.trim().startsWith("data:image/");
        upsert({
          fieldId,
          valueText: isDataUrl ? null : value,
          valueBool: parseBoolean(value),
          valueAssetPath: null,
          signatureBase64: isDataUrl ? value : null,
        });
        continue;
      }

      upsert({
        fieldId,
        valueText: value == null ? null : String(value),
        valueBool: parseBoolean(value),
        valueAssetPath: null,
        signatureBase64: null,
      });
    }
  }

  return map;
}

async function uploadSignatureAsset(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  requestId: string,
  signerId: string,
  fieldId: string,
  signatureBase64: string,
): Promise<string> {
  const bytes = decodeBase64DataUrl(signatureBase64);
  const assetPath = `signatures/${requestId}/${signerId}-${fieldId}.png`;

  const { error } = await supabase.storage
    .from("signature-assets")
    .upload(
      assetPath,
      bytes,
      { upsert: true, contentType: "image/png" },
    );

  if (error) {
    throw new Error(`Failed storing signature image: ${error.message}`);
  }

  return assetPath;
}

async function downloadSignatureImageBytes(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  path: string,
): Promise<Uint8Array> {
  const fromSignatureAssets = await supabase.storage.from("signature-assets").download(path);
  if (!fromSignatureAssets.error && fromSignatureAssets.data) {
    return new Uint8Array(await fromSignatureAssets.data.arrayBuffer());
  }

  const fromClaimFiles = await supabase.storage.from("claim-files").download(path);
  if (!fromClaimFiles.error && fromClaimFiles.data) {
    return new Uint8Array(await fromClaimFiles.data.arrayBuffer());
  }

  const errorMessage = fromSignatureAssets.error?.message || fromClaimFiles.error?.message || "Unknown storage error";
  throw new Error(`Unable to download signature image asset ${path}: ${errorMessage}`);
}

async function buildFlattenedFinalPdf(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  requestId: string,
  draftPdfPath: string,
): Promise<Uint8Array> {
  const { data: draftPdfBlob, error: downloadError } = await supabase.storage
    .from("claim-files")
    .download(draftPdfPath);

  if (downloadError || !draftPdfBlob) {
    throw new Error(downloadError?.message || "Failed downloading draft PDF");
  }

  const originalPdfBytes = new Uint8Array(await draftPdfBlob.arrayBuffer());
  const pdfDoc = await PDFDocument.load(originalPdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

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
      label
    `)
    .eq("request_id", requestId)
    .order("page", { ascending: true });

  if (fieldsError) {
    throw fieldsError;
  }

  const fields = (fieldsData ?? []) as SignatureFieldRow[];
  if (fields.length === 0) {
    return await pdfDoc.save();
  }

  const fieldIds = fields.map((field) => field.id);
  const { data: valuesData, error: valuesError } = await supabase
    .from("signature_field_values")
    .select(`
      field_id,
      value_text,
      value_bool,
      value_asset_path
    `)
    .in("field_id", fieldIds);

  if (valuesError) {
    throw valuesError;
  }

  const valuesByField = new Map<string, {
    value_text: string | null;
    value_bool: boolean | null;
    value_asset_path: string | null;
  }>();
  (valuesData ?? []).forEach((row: any) => {
    valuesByField.set(row.field_id, {
      value_text: row.value_text,
      value_bool: row.value_bool,
      value_asset_path: row.value_asset_path,
    });
  });

  const pages = pdfDoc.getPages();
  const imageCache = new Map<string, Awaited<ReturnType<typeof pdfDoc.embedPng>>>();

  for (const field of fields) {
    const value = valuesByField.get(field.id);
    if (!value) continue;

    const pageIndex = field.page - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) continue;
    const page = pages[pageIndex];
    const { width, height } = page.getSize();

    const x = field.x * width;
    const boxWidth = field.w * width;
    const boxHeight = field.h * height;
    const y = height - (field.y * height) - boxHeight;

    if (field.type === "checkbox") {
      if (value.value_bool === true) {
        const size = Math.max(10, Math.min(boxWidth, boxHeight) * 0.9);
        page.drawText("✓", {
          x: x + (boxWidth - size) / 2,
          y: y + (boxHeight - size) / 2,
          size,
          font,
          color: rgb(0, 0, 0),
        });
      }
      continue;
    }

    if (field.type === "signature") {
      if (!value.value_asset_path) continue;

      let embedded = imageCache.get(value.value_asset_path);
      if (!embedded) {
        const bytes = await downloadSignatureImageBytes(supabase, value.value_asset_path);
        try {
          embedded = await pdfDoc.embedPng(bytes);
        } catch {
          embedded = await pdfDoc.embedJpg(bytes);
        }
        imageCache.set(value.value_asset_path, embedded);
      }

      const imageSize = embedded.scale(1);
      const ratio = Math.min(boxWidth / imageSize.width, boxHeight / imageSize.height);
      const drawWidth = imageSize.width * ratio;
      const drawHeight = imageSize.height * ratio;

      page.drawImage(embedded, {
        x: x + (boxWidth - drawWidth) / 2,
        y: y + (boxHeight - drawHeight) / 2,
        width: drawWidth,
        height: drawHeight,
      });
      continue;
    }

    const text = value.value_text?.trim();
    if (!text) continue;

    const size = Math.max(8, Math.min(14, boxHeight * 0.65));
    page.drawText(text, {
      x: x + 2,
      y: y + Math.max(2, (boxHeight - size) / 2),
      size,
      font,
      color: rgb(0, 0, 0),
      maxWidth: Math.max(0, boxWidth - 4),
    });
  }

  return await pdfDoc.save();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const token = extractToken(req, body as Record<string, unknown>);
    if (!token) {
      return jsonResponse({ error: "Missing token" }, 400);
    }

    const tokenHash = await sha256Hex(token);
    const supabase = getServiceSupabaseClient();
    const nowIso = new Date().toISOString();

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
        expires_at,
        signature_requests!inner(
          id,
          claim_id,
          status,
          source_type,
          draft_pdf_path,
          final_pdf_path
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

    if (signer.status === "signed") {
      return jsonResponse({ error: "Document already signed", already_signed: true }, 400);
    }

    const request = signer.signature_requests;
    if (["void", "completed"].includes(request.status)) {
      return jsonResponse({ error: `Cannot sign request in status ${request.status}` }, 400);
    }

    if (!request.draft_pdf_path) {
      return jsonResponse({ error: "Draft PDF is missing" }, 400);
    }

    const { data: pendingPriorData, error: pendingPriorError } = await supabase
      .from("signature_signers")
      .select("id")
      .eq("request_id", request.id)
      .lt("signing_order", signer.signing_order)
      .neq("status", "signed");

    if (pendingPriorError) {
      throw pendingPriorError;
    }

    if (pendingPriorData && pendingPriorData.length > 0) {
      return jsonResponse({
        error: "Previous signer(s) in the signing order have not completed yet.",
      }, 409);
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
        label
      `)
      .eq("request_id", request.id)
      .eq("assigned_signer_id", signer.id)
      .order("page", { ascending: true });

    if (fieldsError) {
      throw fieldsError;
    }

    const fields = (fieldsData ?? []) as SignatureFieldRow[];
    if (fields.length === 0) {
      return jsonResponse({ error: "No fields assigned for this signer" }, 400);
    }

    const normalizedInput = normalizeFieldValues(
      (body as Record<string, unknown>).fieldValues ??
        (body as Record<string, unknown>).field_values ??
        {},
    );

    const globalSignatureBase64 = typeof (body as Record<string, unknown>).signatureImage === "string"
      ? String((body as Record<string, unknown>).signatureImage)
      : typeof (body as Record<string, unknown>).signature_image === "string"
      ? String((body as Record<string, unknown>).signature_image)
      : null;

    const signatureFieldCount = fields.filter((field) => field.type === "signature").length;
    const valueRows: SignatureFieldValueUpsertRow[] = [];

    for (const field of fields) {
      const incoming = normalizedInput.get(field.id);
      const label = field.label || `${field.type} field`;

      if (field.type === "signature") {
        let valueAssetPath = incoming?.valueAssetPath || null;
        const signatureBase64 = incoming?.signatureBase64 ||
          (signatureFieldCount === 1 ? globalSignatureBase64 : null);

        if (!valueAssetPath && signatureBase64) {
          valueAssetPath = await uploadSignatureAsset(
            supabase,
            request.id,
            signer.id,
            field.id,
            signatureBase64,
          );
        }

        if (field.required && !valueAssetPath) {
          return jsonResponse({ error: `Required field missing: ${label}` }, 400);
        }

        if (valueAssetPath) {
          valueRows.push({
            field_id: field.id,
            signer_id: signer.id,
            value_text: null,
            value_bool: null,
            value_asset_path: valueAssetPath,
            filled_at: nowIso,
          });
        }
        continue;
      }

      if (field.type === "checkbox") {
        const parsedBool = incoming?.valueBool ?? parseBoolean(incoming?.valueText);
        if (field.required && parsedBool !== true) {
          return jsonResponse({ error: `Required checkbox must be checked: ${label}` }, 400);
        }

        if (parsedBool !== null) {
          valueRows.push({
            field_id: field.id,
            signer_id: signer.id,
            value_text: null,
            value_bool: parsedBool,
            value_asset_path: null,
            filled_at: nowIso,
          });
        }
        continue;
      }

      const textValue = (incoming?.valueText ?? "").trim();
      if (field.required && !textValue) {
        return jsonResponse({ error: `Required field missing: ${label}` }, 400);
      }

      if (textValue) {
        valueRows.push({
          field_id: field.id,
          signer_id: signer.id,
          value_text: textValue,
          value_bool: null,
          value_asset_path: null,
          filled_at: nowIso,
        });
      }
    }

    if (valueRows.length > 0) {
      const { error: upsertError } = await supabase
        .from("signature_field_values")
        .upsert(valueRows, { onConflict: "field_id,signer_id" });

      if (upsertError) {
        throw upsertError;
      }
    }

    const { data: signerUpdateRows, error: signerUpdateError } = await supabase
      .from("signature_signers")
      .update({
        status: "signed",
        signed_at: nowIso,
        ip: getClientIp(req),
        user_agent: req.headers.get("user-agent"),
      })
      .eq("id", signer.id)
      .eq("request_id", request.id)
      .neq("status", "signed")
      .select("id");

    if (signerUpdateError) {
      throw signerUpdateError;
    }

    if (!signerUpdateRows || signerUpdateRows.length !== 1) {
      throw new Error("Failed to mark signer as signed");
    }

    await appendClaimUpdate(
      supabase,
      request.claim_id,
      `Signer ${signer.name} signed signature request ${request.id}.`,
    );

    const { data: signerStatuses, error: statusError } = await supabase
      .from("signature_signers")
      .select("id, status, signing_order")
      .eq("request_id", request.id)
      .order("signing_order", { ascending: true });

    if (statusError) {
      throw statusError;
    }

    const allSigned = (signerStatuses ?? []).every((row: any) => row.status === "signed");
    if (allSigned) {
      const finalPdfBytes = await buildFlattenedFinalPdf(
        supabase,
        request.id,
        request.draft_pdf_path,
      );
      const finalPdfPath = `signed/${request.claim_id}/${request.id}-final.pdf`;

      const { error: finalUploadError } = await supabase.storage
        .from("claim-files")
        .upload(
          finalPdfPath,
          finalPdfBytes,
          { upsert: true, contentType: "application/pdf" },
        );

      if (finalUploadError) {
        throw new Error(`Failed uploading final signed PDF: ${finalUploadError.message}`);
      }

      const { data: requestUpdateRows, error: requestUpdateError } = await supabase
        .from("signature_requests")
        .update({
          status: "completed",
          final_pdf_path: finalPdfPath,
        })
        .eq("id", request.id)
        .select("id");

      if (requestUpdateError) {
        throw requestUpdateError;
      }

      if (!requestUpdateRows || requestUpdateRows.length !== 1) {
        throw new Error("Failed to update request to completed");
      }

      const { data: existingClaimFile, error: existingClaimFileError } = await supabase
        .from("claim_files")
        .select("id")
        .eq("claim_id", request.claim_id)
        .eq("file_path", finalPdfPath)
        .maybeSingle();

      if (existingClaimFileError) {
        throw existingClaimFileError;
      }

      if (!existingClaimFile) {
        const { error: claimFileInsertError } = await supabase
          .from("claim_files")
          .insert({
            claim_id: request.claim_id,
            file_name: `${request.id}-final.pdf`,
            file_path: finalPdfPath,
            file_size: finalPdfBytes.length,
            file_type: "application/pdf",
            source: "signature",
          });

        if (claimFileInsertError) {
          throw claimFileInsertError;
        }
      }

      await appendClaimUpdate(
        supabase,
        request.claim_id,
        `Signature request ${request.id} completed. Final signed PDF attached to claim.`,
      );

      return jsonResponse({
        success: true,
        all_signed: true,
        request_status: "completed",
        final_pdf_path: finalPdfPath,
      });
    }

    const { data: inProgressRows, error: inProgressError } = await supabase
      .from("signature_requests")
      .update({ status: "in_progress" })
      .eq("id", request.id)
      .select("id");

    if (inProgressError) {
      throw inProgressError;
    }

    if (!inProgressRows || inProgressRows.length !== 1) {
      throw new Error("Failed to update request status to in_progress");
    }

    return jsonResponse({
      success: true,
      all_signed: false,
      request_status: "in_progress",
    });
  } catch (error) {
    console.error("signature_submit failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
