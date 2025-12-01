-- Fix user_roles RLS so bootstrap admin (when no admin exists) can manage roles
DROP POLICY IF EXISTS "Admins manage all user roles" ON public.user_roles;

CREATE POLICY "Admins manage all user roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.can_manage_roles(auth.uid()))
WITH CHECK (public.can_manage_roles(auth.uid()));