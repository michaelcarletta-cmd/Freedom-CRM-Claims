-- Simplify and harden user_roles policy: only admins (by role) can manage roles
DROP POLICY IF EXISTS "Owner and admins manage all user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Owner and admins manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;

CREATE POLICY "Admins manage all user roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));