-- Add profile fields for email signature and licensing
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS email_signature text,
ADD COLUMN IF NOT EXISTS license_number text,
ADD COLUMN IF NOT EXISTS license_state text,
ADD COLUMN IF NOT EXISTS title text;

-- Add claim-specific email identifier to claims
ALTER TABLE public.claims
ADD COLUMN IF NOT EXISTS claim_email_id text UNIQUE DEFAULT (encode(gen_random_bytes(8), 'hex'));

-- Create index for faster email lookups
CREATE INDEX IF NOT EXISTS idx_claims_claim_email_id ON public.claims(claim_email_id);