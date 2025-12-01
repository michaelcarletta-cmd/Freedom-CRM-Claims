-- Remove the authenticated-only debug policy
DROP POLICY IF EXISTS "Debug: Allow all authenticated to create claims" ON public.claims;

-- Add a new debug policy that applies to ALL roles (authenticated AND anon)
-- This will help us determine if the issue is with authentication
CREATE POLICY "Debug: Allow ALL roles to create claims"
ON public.claims
FOR INSERT
WITH CHECK (true);

-- This policy has no TO clause, so it applies to all roles