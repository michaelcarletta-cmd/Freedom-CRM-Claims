# pdf-renderer service

Minimal sidecar service for converting DOCX to PDF outside Supabase Edge Runtime.

## Endpoints

- `GET /health`
- `POST /render/docx-to-pdf`

`/render/docx-to-pdf` accepts one of:

1. JSON `{ "docxBase64": "<base64>" }`
2. JSON `{ "docxBytes": [ ...byte integers... ] }`
3. Multipart form-data with file field `file`
4. JSON `{ "storagePath": "<path>", "bucket": "document-templates" }`

Returns raw PDF bytes (`Content-Type: application/pdf`).

## Environment Variables

- `PORT` (default `8080`)
- `PDF_RENDERER_BACKEND` (`libreoffice` by default)
- `PDF_RENDERER_API_KEY` (optional; if set, requires `x-api-key` header)
- `SUPABASE_URL` (required for `storagePath` mode)
- `SUPABASE_SERVICE_ROLE_KEY` (required for `storagePath` mode)

## Run locally

```bash
cd pdf-renderer
npm install
npm start
```

## Docker

```bash
cd pdf-renderer
docker build -t freedom-pdf-renderer .
docker run --rm -p 8080:8080 \
  -e PDF_RENDERER_API_KEY=change-me \
  -e SUPABASE_URL=https://YOUR_PROJECT.supabase.co \
  -e SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY \
  freedom-pdf-renderer
```

