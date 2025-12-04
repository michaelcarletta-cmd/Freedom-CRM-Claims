-- Add contractor and referrer fee columns to claim_fees
ALTER TABLE public.claim_fees
ADD COLUMN IF NOT EXISTS contractor_fee_percentage numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS contractor_fee_amount numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS referrer_fee_percentage numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS referrer_fee_amount numeric NOT NULL DEFAULT 0;