-- Add business_loans column to bank_balance table
ALTER TABLE public.bank_balance ADD COLUMN business_loans NUMERIC NOT NULL DEFAULT 0;