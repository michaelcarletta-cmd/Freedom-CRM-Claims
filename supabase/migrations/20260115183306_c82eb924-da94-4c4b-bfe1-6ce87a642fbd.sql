-- Add phone_extension column to adjusters table
ALTER TABLE public.adjusters ADD COLUMN IF NOT EXISTS phone_extension text;

-- Add phone_extension column to insurance_companies table
ALTER TABLE public.insurance_companies ADD COLUMN IF NOT EXISTS phone_extension text;

-- Add phone_extension column to mortgage_companies table
ALTER TABLE public.mortgage_companies ADD COLUMN IF NOT EXISTS phone_extension text;