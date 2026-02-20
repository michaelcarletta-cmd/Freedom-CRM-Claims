# Signature system environment variables

## Edge Functions (`signature_send`, `signature_get_packet`, `signature_submit`)

- `SUPABASE_URL`  
  Used in all three functions (via `_shared/signature.ts`) to create the service-role Supabase client.

- `SUPABASE_SERVICE_ROLE_KEY`  
  Used in all three functions for privileged DB/storage access. Also used by `signature_send` when calling `generate-document`.

- `SIGN_APP_BASE_URL` *(optional)*  
  Used by `signature_send` to build signer links: `${SIGN_APP_BASE_URL}/sign?token=...`.

- `SIGN_TOKEN_TTL_HOURS` *(optional, default `168`)*  
  Used by `signature_send` to set `signature_signers.expires_at`.

- `MAILJET_API_KEY`  
  Used by `signature_send` mail helper to send signer emails.

- `MAILJET_SECRET_KEY`  
  Used by `signature_send` mail helper to send signer emails.

- `MAILJET_FROM_EMAIL` *(optional)*  
  Used by `signature_send` mail helper. Defaults to `claims@freedomclaims.work`.

- `MAILJET_FROM_NAME` *(optional)*  
  Used by `signature_send` mail helper. Defaults to `Freedom Claims`.

- `PDF_RENDERER_URL`  
  Used by `signature_send` when a generated DOCX must be converted to PDF.

- `PDF_RENDERER_API_KEY` *(optional but recommended)*  
  Added as `x-api-key` header when `signature_send` calls `pdf-renderer`.

## pdf-renderer service (`/pdf-renderer`)

- `PORT` *(optional, default `8080`)*  
  Express server port.

- `PDF_RENDERER_BACKEND` *(optional, default `libreoffice`)*  
  Renderer backend selector (`libreoffice` implemented).

- `PDF_RENDERER_API_KEY` *(optional but recommended)*  
  If set, requests must include matching `x-api-key` header.

- `SUPABASE_URL` *(required for `storagePath` mode)*  
  Used by pdf-renderer to download DOCX from Supabase storage when request sends `storagePath`.

- `SUPABASE_SERVICE_ROLE_KEY` *(required for `storagePath` mode)*  
  Used by pdf-renderer storage download path.
