-- Add logo_url column to profiles for contractor logos
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS logo_url text;