-- Add loan number and SSN last four to claims table
ALTER TABLE public.claims
ADD COLUMN loan_number TEXT,
ADD COLUMN ssn_last_four TEXT;