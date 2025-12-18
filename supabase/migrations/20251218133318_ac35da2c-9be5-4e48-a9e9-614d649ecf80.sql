-- Add partner_construction_status column to claims table
ALTER TABLE public.claims 
ADD COLUMN IF NOT EXISTS partner_construction_status text DEFAULT NULL;