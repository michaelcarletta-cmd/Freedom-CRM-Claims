
-- Add email_id to claim_files to link attachments to their source email
ALTER TABLE public.claim_files ADD COLUMN email_id uuid REFERENCES public.emails(id) ON DELETE SET NULL;

-- Index for fast lookup
CREATE INDEX idx_claim_files_email_id ON public.claim_files(email_id) WHERE email_id IS NOT NULL;
