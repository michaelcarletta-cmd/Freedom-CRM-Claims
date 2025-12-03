-- Add approval status to profiles for staff signups
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved';

-- Add comment explaining the column
COMMENT ON COLUMN public.profiles.approval_status IS 'pending, approved, or denied - for staff signup approval workflow';

-- Update existing profiles to be approved (they were already in the system)
UPDATE public.profiles SET approval_status = 'approved' WHERE approval_status IS NULL OR approval_status = '';