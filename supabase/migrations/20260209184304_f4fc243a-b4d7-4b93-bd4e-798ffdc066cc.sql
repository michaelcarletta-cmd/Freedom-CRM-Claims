
ALTER TABLE public.mortgage_companies ADD COLUMN IF NOT EXISTS address_line_1 text;
ALTER TABLE public.mortgage_companies ADD COLUMN IF NOT EXISTS address_line_2 text;
ALTER TABLE public.mortgage_companies ADD COLUMN IF NOT EXISTS address_line_3 text;
ALTER TABLE public.mortgage_companies ADD COLUMN IF NOT EXISTS address_line_4 text;
ALTER TABLE public.mortgage_companies ADD COLUMN IF NOT EXISTS address_line_5 text;
ALTER TABLE public.mortgage_companies DROP COLUMN IF EXISTS address;
