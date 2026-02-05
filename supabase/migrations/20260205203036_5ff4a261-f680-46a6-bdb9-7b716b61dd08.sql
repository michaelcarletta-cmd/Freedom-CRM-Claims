-- Add policy_number field to clients table for storing the client's primary policy number
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS policy_number text;