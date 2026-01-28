-- Add client-specific mortgage portal credentials to claims table
ALTER TABLE public.claims 
ADD COLUMN IF NOT EXISTS mortgage_portal_site text,
ADD COLUMN IF NOT EXISTS mortgage_portal_username text,
ADD COLUMN IF NOT EXISTS mortgage_portal_password text;