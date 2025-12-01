-- Update user_roles policy to explicitly allow your user to manage roles
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;

CREATE POLICY "Owner and admins manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  auth.uid() = '90adb85c-a407-4d24-b2a0-55b13fe7c2ec'::uuid
  OR public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  auth.uid() = '90adb85c-a407-4d24-b2a0-55b13fe7c2ec'::uuid
  OR public.has_role(auth.uid(), 'admin'::app_role)
);