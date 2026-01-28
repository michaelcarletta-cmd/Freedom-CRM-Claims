-- Add new columns for mortgage company details
ALTER TABLE public.mortgage_companies 
ADD COLUMN IF NOT EXISTS loan_number text,
ADD COLUMN IF NOT EXISTS last_four_ssn text,
ADD COLUMN IF NOT EXISTS portal_username text,
ADD COLUMN IF NOT EXISTS portal_password text,
ADD COLUMN IF NOT EXISTS mortgage_site text;