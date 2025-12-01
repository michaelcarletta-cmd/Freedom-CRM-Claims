-- Helper function to determine if a user can manage roles
CREATE OR REPLACE FUNCTION public.can_manage_roles(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::app_role)
    OR NOT EXISTS (
      SELECT 1 FROM public.user_roles WHERE role = 'admin'::app_role
    );
$$;

-- Update policy to use the helper function (allows bootstrap when no admins exist)
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;

CREATE POLICY "Admins can manage all roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.can_manage_roles(auth.uid()))
WITH CHECK (public.can_manage_roles(auth.uid()));