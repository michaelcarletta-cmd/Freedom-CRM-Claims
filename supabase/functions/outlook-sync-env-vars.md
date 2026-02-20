# Outlook sync env vars

## Required

- `SUPABASE_URL`  
  Used by `outlook-email-sync` and `outlook-oauth-callback`.

- `SUPABASE_SERVICE_ROLE_KEY`  
  Used for DB/storage access in both functions.

- `MS_CLIENT_ID`  
  Microsoft OAuth app client id.

- `MS_CLIENT_SECRET`  
  Microsoft OAuth app client secret.

## Recommended

- `OUTLOOK_OAUTH_STATE_SECRET`  
  Used to sign/verify OAuth `state` payload.  
  Falls back to `CRON_SECRET` if not set.

- `CRON_SECRET`  
  Used by `sync_all_claims` via `x-cron-secret` header.

## Function behaviors

- `outlook-email-sync` actions:
  - `get_auth_url`
  - `sync_claim`
  - `sync_all_claims`
  - `delete_connection`

- `outlook-oauth-callback`:
  - exchanges code for tokens
  - resolves `/me` profile
  - upserts `email_connections` with explicit OAuth fields
