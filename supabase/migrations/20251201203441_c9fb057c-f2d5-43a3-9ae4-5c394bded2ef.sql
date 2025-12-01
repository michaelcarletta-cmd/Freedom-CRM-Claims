-- Allow the primary admin (Michael) to always manage user roles to fix RLS issues
-- This keeps access restricted to a specific trusted user while we debug can_manage_roles behavior

CREATE POLICY "Primary admin can manage roles"
ON public.user_roles
AS PERMISSIVE
FOR ALL
USING (auth.uid() = '9c362364-cb1b-4b4b-880d-b1a455a9e468')
WITH CHECK (auth.uid() = '9c362364-cb1b-4b4b-880d-b1a455a9e468');