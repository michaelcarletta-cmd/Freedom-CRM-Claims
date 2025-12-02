-- Add user_id column to referrers table to link to auth users
ALTER TABLE public.referrers ADD COLUMN IF NOT EXISTS user_id uuid;

-- Drop the incorrect RLS policy
DROP POLICY IF EXISTS "Referrers can view their claims" ON public.claims;

-- Create correct RLS policy that joins through referrers table
CREATE POLICY "Referrers can view their referred claims"
ON public.claims
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.referrers
    WHERE referrers.id = claims.referrer_id
    AND referrers.user_id = auth.uid()
  )
);