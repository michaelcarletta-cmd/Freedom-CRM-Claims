-- Outlook sync rebuild: explicit OAuth fields, reliable dedupe keys, and sync metadata.

-- Safe JSON parser for legacy encrypted_password migration.
CREATE OR REPLACE FUNCTION public.try_parse_jsonb(input_text text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN input_text::jsonb;
EXCEPTION
  WHEN others THEN
    RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- email_connections: move from generic IMAP shape to explicit OAuth metadata.
-- ---------------------------------------------------------------------------
ALTER TABLE public.email_connections
  ADD COLUMN IF NOT EXISTS oauth_access_token text,
  ADD COLUMN IF NOT EXISTS oauth_refresh_token text,
  ADD COLUMN IF NOT EXISTS oauth_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS oauth_scope text,
  ADD COLUMN IF NOT EXISTS graph_user_id text,
  ADD COLUMN IF NOT EXISTS graph_tenant_id text,
  ADD COLUMN IF NOT EXISTS sync_cursor text,
  ADD COLUMN IF NOT EXISTS sync_window_start timestamptz,
  ADD COLUMN IF NOT EXISTS sync_mode text NOT NULL DEFAULT 'outlook_graph',
  ADD COLUMN IF NOT EXISTS last_sync_stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS disconnected_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill new oauth columns from legacy encrypted_password JSON when possible.
WITH parsed AS (
  SELECT
    id,
    public.try_parse_jsonb(encrypted_password) AS token_json
  FROM public.email_connections
)
UPDATE public.email_connections ec
SET
  oauth_access_token = COALESCE(ec.oauth_access_token, parsed.token_json ->> 'access_token'),
  oauth_refresh_token = COALESCE(ec.oauth_refresh_token, parsed.token_json ->> 'refresh_token'),
  oauth_expires_at = COALESCE(
    ec.oauth_expires_at,
    NULLIF(parsed.token_json ->> 'expires_at', '')::timestamptz
  )
FROM parsed
WHERE ec.id = parsed.id
  AND parsed.token_json IS NOT NULL;

UPDATE public.email_connections
SET provider = 'outlook_oauth'
WHERE provider IS NULL OR provider = 'outlook';

ALTER TABLE public.email_connections
  ALTER COLUMN provider SET DEFAULT 'outlook_oauth',
  ALTER COLUMN provider SET NOT NULL;

ALTER TABLE public.email_connections
  DROP CONSTRAINT IF EXISTS email_connections_provider_check;

ALTER TABLE public.email_connections
  ADD CONSTRAINT email_connections_provider_check
  CHECK (provider IN ('outlook_oauth'));

CREATE INDEX IF NOT EXISTS idx_email_connections_user_active
  ON public.email_connections(user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_email_connections_provider_active
  ON public.email_connections(provider, is_active);

-- Optional uniqueness for provider account IDs when available.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_connections_provider_account_unique
  ON public.email_connections(provider, graph_user_id)
  WHERE graph_user_id IS NOT NULL AND disconnected_at IS NULL;

-- ---------------------------------------------------------------------------
-- emails: add stable source IDs to make sync idempotent.
-- ---------------------------------------------------------------------------
ALTER TABLE public.emails
  ADD COLUMN IF NOT EXISTS external_message_id text,
  ADD COLUMN IF NOT EXISTS external_thread_id text,
  ADD COLUMN IF NOT EXISTS source_provider text,
  ADD COLUMN IF NOT EXISTS source_connection_id uuid REFERENCES public.email_connections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS direction text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.emails
SET source_provider = COALESCE(source_provider, 'manual')
WHERE source_provider IS NULL;

ALTER TABLE public.emails
  ALTER COLUMN source_provider SET DEFAULT 'manual',
  ALTER COLUMN source_provider SET NOT NULL;

ALTER TABLE public.emails
  DROP CONSTRAINT IF EXISTS emails_source_provider_check;

ALTER TABLE public.emails
  ADD CONSTRAINT emails_source_provider_check
  CHECK (source_provider IN ('manual', 'outlook_graph'));

ALTER TABLE public.emails
  DROP CONSTRAINT IF EXISTS emails_direction_check;

ALTER TABLE public.emails
  ADD CONSTRAINT emails_direction_check
  CHECK (direction IS NULL OR direction IN ('inbound', 'outbound'));

CREATE INDEX IF NOT EXISTS idx_emails_external_message
  ON public.emails(external_message_id)
  WHERE external_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_emails_source_connection
  ON public.emails(source_connection_id)
  WHERE source_connection_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_emails_claim_source_external_unique
  ON public.emails(claim_id, source_provider, external_message_id)
  WHERE external_message_id IS NOT NULL;

