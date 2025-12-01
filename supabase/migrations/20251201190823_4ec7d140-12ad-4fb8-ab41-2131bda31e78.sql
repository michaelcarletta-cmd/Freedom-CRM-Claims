-- Add a temporary debug policy to see what's happening
-- This policy allows ALL authenticated users to insert, for debugging
CREATE POLICY "Debug: Allow all authenticated to create claims"
ON public.claims
FOR INSERT
TO authenticated
WITH CHECK (true);

-- We'll remove this after confirming it works