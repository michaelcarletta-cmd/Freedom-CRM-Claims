-- Drop existing address column and add new address fields
ALTER TABLE public.clients DROP COLUMN IF EXISTS address;
ALTER TABLE public.clients ADD COLUMN street TEXT;
ALTER TABLE public.clients ADD COLUMN city TEXT;
ALTER TABLE public.clients ADD COLUMN state TEXT;
ALTER TABLE public.clients ADD COLUMN zip_code TEXT;