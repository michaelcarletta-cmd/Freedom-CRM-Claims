-- Add e-sign fields to claims table
ALTER TABLE public.claims 
ADD COLUMN IF NOT EXISTS esign_provider text,
ADD COLUMN IF NOT EXISTS esign_document_id text,
ADD COLUMN IF NOT EXISTS esign_status text DEFAULT 'draft',
ADD COLUMN IF NOT EXISTS esign_sent_at timestamptz,
ADD COLUMN IF NOT EXISTS esign_completed_at timestamptz,
ADD COLUMN IF NOT EXISTS signed_pdf_url text,
ADD COLUMN IF NOT EXISTS esign_audit_url text,
ADD COLUMN IF NOT EXISTS esign_error_message text,
ADD COLUMN IF NOT EXISTS esign_signing_link text,
ADD COLUMN IF NOT EXISTS contract_pdf_path text;

-- Add e-sign settings to company_branding
ALTER TABLE public.company_branding
ADD COLUMN IF NOT EXISTS esign_email_subject text DEFAULT 'Please sign your document',
ADD COLUMN IF NOT EXISTS esign_email_body text DEFAULT 'Please click the link to review and sign your document.',
ADD COLUMN IF NOT EXISTS esign_signature_page integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS esign_signature_x integer DEFAULT 100,
ADD COLUMN IF NOT EXISTS esign_signature_y integer DEFAULT 600,
ADD COLUMN IF NOT EXISTS esign_signature_width integer DEFAULT 200,
ADD COLUMN IF NOT EXISTS esign_signature_height integer DEFAULT 50,
ADD COLUMN IF NOT EXISTS esign_date_page integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS esign_date_x integer DEFAULT 350,
ADD COLUMN IF NOT EXISTS esign_date_y integer DEFAULT 600,
ADD COLUMN IF NOT EXISTS esign_date_width integer DEFAULT 100,
ADD COLUMN IF NOT EXISTS esign_date_height integer DEFAULT 25;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_claims_esign_status ON public.claims(esign_status);
CREATE INDEX IF NOT EXISTS idx_claims_esign_document_id ON public.claims(esign_document_id);