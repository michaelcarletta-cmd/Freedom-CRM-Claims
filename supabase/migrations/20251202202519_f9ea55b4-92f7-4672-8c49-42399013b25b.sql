-- Make policyholder_name nullable since all fields in New Claim dialog are optional
ALTER TABLE public.claims ALTER COLUMN policyholder_name DROP NOT NULL;