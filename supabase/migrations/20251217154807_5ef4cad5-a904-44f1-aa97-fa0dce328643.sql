-- Drop the problematic SELECT policy that has recursion
DROP POLICY IF EXISTS "Users can view orgs they belong to" ON public.orgs;

-- Recreate SELECT policy using the security definer function
CREATE POLICY "Users can view orgs they belong to"
ON public.orgs
FOR SELECT
USING (
  id = user_org_id(auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Add INSERT policy allowing authenticated users to create orgs
CREATE POLICY "Authenticated users can create orgs"
ON public.orgs
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Also need INSERT policy for org_members so user can add themselves
DROP POLICY IF EXISTS "Users can insert themselves into their org" ON public.org_members;

CREATE POLICY "Users can insert themselves into their org"
ON public.org_members
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR is_org_admin(auth.uid(), org_id)
);