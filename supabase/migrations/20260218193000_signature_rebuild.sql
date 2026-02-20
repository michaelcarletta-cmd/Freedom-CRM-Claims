-- Rebuild signature request data model for secure, reliable in-app signing.
-- This migration upgrades existing legacy signature tables in place and adds
-- normalized signature fields/value storage.

-- Optional bucket for handwritten signature assets.
INSERT INTO storage.buckets (id, name, public)
VALUES ('signature-assets', 'signature-assets', false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- signature_requests
-- ---------------------------------------------------------------------------
ALTER TABLE public.signature_requests
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS draft_pdf_path text,
  ADD COLUMN IF NOT EXISTS final_pdf_path text,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.signature_requests
  ALTER COLUMN document_name DROP NOT NULL,
  ALTER COLUMN document_path DROP NOT NULL;

UPDATE public.signature_requests
SET draft_pdf_path = COALESCE(draft_pdf_path, document_path)
WHERE draft_pdf_path IS NULL;

UPDATE public.signature_requests
SET source_type = 'uploaded_pdf'
WHERE source_type IS NULL OR source_type NOT IN ('uploaded_pdf', 'generated');

UPDATE public.signature_requests
SET status = CASE
  WHEN status = 'pending' THEN 'draft'
  WHEN status = 'declined' THEN 'void'
  ELSE status
END
WHERE status IN ('pending', 'declined');

ALTER TABLE public.signature_requests
  ALTER COLUMN source_type SET DEFAULT 'uploaded_pdf',
  ALTER COLUMN source_type SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'draft';

ALTER TABLE public.signature_requests
  DROP CONSTRAINT IF EXISTS valid_status;

ALTER TABLE public.signature_requests
  DROP CONSTRAINT IF EXISTS signature_requests_status_check;

ALTER TABLE public.signature_requests
  DROP CONSTRAINT IF EXISTS signature_requests_source_type_check;

ALTER TABLE public.signature_requests
  ADD CONSTRAINT signature_requests_status_check
  CHECK (status IN ('draft', 'sent', 'in_progress', 'completed', 'void'));

ALTER TABLE public.signature_requests
  ADD CONSTRAINT signature_requests_source_type_check
  CHECK (source_type IN ('uploaded_pdf', 'generated'));

CREATE INDEX IF NOT EXISTS idx_signature_requests_claim_status
  ON public.signature_requests(claim_id, status);

-- ---------------------------------------------------------------------------
-- signature_signers (legacy columns are renamed and hardened)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'signature_signers'
      AND column_name = 'signature_request_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'signature_signers'
      AND column_name = 'request_id'
  ) THEN
    ALTER TABLE public.signature_signers
      RENAME COLUMN signature_request_id TO request_id;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'signature_signers'
      AND column_name = 'signer_name'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'signature_signers'
      AND column_name = 'name'
  ) THEN
    ALTER TABLE public.signature_signers
      RENAME COLUMN signer_name TO name;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'signature_signers'
      AND column_name = 'signer_email'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'signature_signers'
      AND column_name = 'email'
  ) THEN
    ALTER TABLE public.signature_signers
      RENAME COLUMN signer_email TO email;
  END IF;
END
$$;

ALTER TABLE public.signature_signers
  ADD COLUMN IF NOT EXISTS token_hash text,
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS ip text,
  ADD COLUMN IF NOT EXISTS user_agent text;

ALTER TABLE public.signature_signers
  ALTER COLUMN signer_type DROP NOT NULL;

-- Never keep raw signer tokens in DB.
ALTER TABLE public.signature_signers
  DROP COLUMN IF EXISTS access_token;

-- Legacy denormalized field_values/signature_data are replaced by signature_field_values.
ALTER TABLE public.signature_signers
  DROP COLUMN IF EXISTS field_values,
  DROP COLUMN IF EXISTS signature_data;

UPDATE public.signature_signers
SET status = CASE
  WHEN status = 'signed' THEN 'signed'
  WHEN status = 'viewed' THEN 'viewed'
  ELSE 'pending'
END;

ALTER TABLE public.signature_signers
  ALTER COLUMN request_id SET NOT NULL,
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN email SET NOT NULL,
  ALTER COLUMN signing_order SET DEFAULT 1,
  ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE public.signature_signers
  DROP CONSTRAINT IF EXISTS valid_signer_status;

ALTER TABLE public.signature_signers
  DROP CONSTRAINT IF EXISTS signature_signers_status_check;

ALTER TABLE public.signature_signers
  ADD CONSTRAINT signature_signers_status_check
  CHECK (status IN ('pending', 'viewed', 'signed'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'signature_signers_request_id_fkey'
  ) THEN
    ALTER TABLE public.signature_signers
      ADD CONSTRAINT signature_signers_request_id_fkey
      FOREIGN KEY (request_id) REFERENCES public.signature_requests(id) ON DELETE CASCADE;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_signature_signers_token_hash_unique
  ON public.signature_signers(token_hash)
  WHERE token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_signature_signers_request_order
  ON public.signature_signers(request_id, signing_order);

CREATE INDEX IF NOT EXISTS idx_signature_signers_email
  ON public.signature_signers(email);

-- ---------------------------------------------------------------------------
-- New normalized signature field definitions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.signature_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.signature_requests(id) ON DELETE CASCADE,
  assigned_signer_id uuid NOT NULL REFERENCES public.signature_signers(id) ON DELETE CASCADE,
  page integer NOT NULL CHECK (page > 0),
  x double precision NOT NULL CHECK (x >= 0 AND x <= 1),
  y double precision NOT NULL CHECK (y >= 0 AND y <= 1),
  w double precision NOT NULL CHECK (w > 0 AND w <= 1),
  h double precision NOT NULL CHECK (h > 0 AND h <= 1),
  type text NOT NULL CHECK (type IN ('signature', 'date', 'text', 'checkbox')),
  required boolean NOT NULL DEFAULT true,
  label text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signature_fields_request
  ON public.signature_fields(request_id);

CREATE INDEX IF NOT EXISTS idx_signature_fields_signer
  ON public.signature_fields(assigned_signer_id);

CREATE INDEX IF NOT EXISTS idx_signature_fields_request_page
  ON public.signature_fields(request_id, page);

-- ---------------------------------------------------------------------------
-- New normalized signature field values
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.signature_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id uuid NOT NULL REFERENCES public.signature_fields(id) ON DELETE CASCADE,
  signer_id uuid NOT NULL REFERENCES public.signature_signers(id) ON DELETE CASCADE,
  value_text text,
  value_bool boolean,
  value_asset_path text,
  filled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signature_field_values_field_signer_unique UNIQUE (field_id, signer_id)
);

CREATE INDEX IF NOT EXISTS idx_signature_field_values_signer
  ON public.signature_field_values(signer_id);

CREATE INDEX IF NOT EXISTS idx_signature_field_values_field
  ON public.signature_field_values(field_id);

DROP TRIGGER IF EXISTS update_signature_field_values_updated_at ON public.signature_field_values;
CREATE TRIGGER update_signature_field_values_updated_at
BEFORE UPDATE ON public.signature_field_values
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- RLS policies (service role bypasses; these control authenticated UI access)
-- ---------------------------------------------------------------------------
ALTER TABLE public.signature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signature_signers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signature_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signature_field_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can manage signature requests" ON public.signature_requests;
DROP POLICY IF EXISTS "Users can view signature requests for their claims" ON public.signature_requests;

CREATE POLICY "Staff can manage signature requests"
ON public.signature_requests
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

CREATE POLICY "Users can view signature requests for accessible claims"
ON public.signature_requests
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.claims c
    WHERE c.id = signature_requests.claim_id
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'staff'::app_role)
        OR c.client_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.claim_contractors cc
          WHERE cc.claim_id = c.id
            AND cc.contractor_id = auth.uid()
        )
      )
  )
);

DROP POLICY IF EXISTS "Staff can manage signers" ON public.signature_signers;
DROP POLICY IF EXISTS "Signers can view their signature via token" ON public.signature_signers;
DROP POLICY IF EXISTS "Signers can update their signature via token" ON public.signature_signers;

CREATE POLICY "Staff can manage signers"
ON public.signature_signers
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.signature_requests sr
    WHERE sr.id = signature_signers.request_id
      AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.signature_requests sr
    WHERE sr.id = signature_signers.request_id
      AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
  )
);

DROP POLICY IF EXISTS "Staff can manage signature fields" ON public.signature_fields;
CREATE POLICY "Staff can manage signature fields"
ON public.signature_fields
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.signature_requests sr
    WHERE sr.id = signature_fields.request_id
      AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.signature_requests sr
    WHERE sr.id = signature_fields.request_id
      AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
  )
);

DROP POLICY IF EXISTS "Staff can manage signature field values" ON public.signature_field_values;
CREATE POLICY "Staff can manage signature field values"
ON public.signature_field_values
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.signature_fields sf
    JOIN public.signature_requests sr ON sr.id = sf.request_id
    WHERE sf.id = signature_field_values.field_id
      AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.signature_fields sf
    JOIN public.signature_requests sr ON sr.id = sf.request_id
    WHERE sf.id = signature_field_values.field_id
      AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
  )
);
