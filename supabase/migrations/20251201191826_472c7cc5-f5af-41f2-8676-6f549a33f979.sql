-- Remove the temporary debug policies now that claim creation is working via the backend function
DROP POLICY IF EXISTS "Debug: Allow ALL roles to create claims" ON public.claims;
DROP POLICY IF EXISTS "Debug: Allow all authenticated to create claims" ON public.claims;