-- Drop the restrictive SELECT policy
DROP POLICY IF EXISTS "Users can view orgs they belong to" ON public.orgs;

-- Create a new policy that allows any authenticated user to view orgs
-- This is needed for invitation lookups by slug
CREATE POLICY "Authenticated users can view orgs"
ON public.orgs
FOR SELECT
USING (auth.uid() IS NOT NULL);