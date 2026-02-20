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

- `OUTLOOK_AUTO_SYNC_ENABLED` *(default `true`)*  
  Used by `check-scheduled-automations` to decide whether to trigger Outlook auto-sync.

- `OUTLOOK_AUTO_RECONCILE_ENABLED` *(default `true`)*  
  Used by `sync_all_claims` to run claim reassignment reconciliation after import.

- `OUTLOOK_RECONCILE_LIMIT` *(default `2500`)*  
  Max Outlook-imported emails scanned per reconciliation run.

## Function behaviors

- `outlook-email-sync` actions:
  - `get_auth_url`
  - `sync_claim`
  - `sync_all_claims`
  - `reconcile_claim_assignments`
  - `delete_connection`

- `outlook-oauth-callback`:
  - exchanges code for tokens
  - resolves `/me` profile
  - upserts `email_connections` with explicit OAuth fields
