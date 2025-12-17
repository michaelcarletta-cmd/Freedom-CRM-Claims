-- Add construction_status field for workspace partners to track their own workflow
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS construction_status text DEFAULT 'pending';

-- Add comment to clarify purpose
COMMENT ON COLUMN public.claims.construction_status IS 'Status tracked by workspace partners (e.g., contractors) for their construction workflow';