-- Add Online Check Writer bank account ID to company branding
ALTER TABLE public.company_branding 
ADD COLUMN IF NOT EXISTS online_check_writer_bank_account_id TEXT;