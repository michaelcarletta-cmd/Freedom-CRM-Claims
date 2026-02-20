import express from "express";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import { renderDocxToPdf } from "./renderers/index.js";

const app = express();
const port = Number(process.env.PORT || 8080);
const apiKey = process.env.PDF_RENDERER_API_KEY || "";

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 },
});

function requireApiKey(req, res, next) {
  if (!apiKey) {
    return next();
  }

  if (req.header("x-api-key") !== apiKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return next();
}

function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for storage path mode");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function downloadDocxFromStorage(bucket, path) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(error?.message || "Failed to download DOCX from Supabase storage");
  }

  return Buffer.from(await data.arrayBuffer());
}

async function resolveDocxBuffer(req) {
  if (req.file?.buffer) {
    return req.file.buffer;
  }

  if (typeof req.body?.docxBase64 === "string" && req.body.docxBase64.trim()) {
    return Buffer.from(req.body.docxBase64, "base64");
  }

  if (Array.isArray(req.body?.docxBytes)) {
    return Buffer.from(req.body.docxBytes);
  }

  const storagePath = req.body?.storagePath || req.body?.storage_path;
  if (typeof storagePath === "string" && storagePath.trim()) {
    const bucket = req.body?.bucket || "document-templates";
    return await downloadDocxFromStorage(bucket, storagePath);
  }

  throw new Error("Provide docxBase64, docxBytes, multipart file, or storagePath");
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    backend: process.env.PDF_RENDERER_BACKEND || "libreoffice",
  });
});

app.post("/render/docx-to-pdf", requireApiKey, upload.single("file"), async (req, res) => {
  try {
    const docxBuffer = await resolveDocxBuffer(req);
    const pdfBuffer = await renderDocxToPdf(docxBuffer);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", String(pdfBuffer.length));
    res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error("DOCX to PDF render failed:", error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Unknown render error",
    });
  }
});

app.listen(port, () => {
  console.log(`pdf-renderer listening on :${port}`);
});
