-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view members of their org" ON public.org_members;

-- Create a security definer function to get user's org_id without recursion
CREATE OR REPLACE FUNCTION public.user_org_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.org_members WHERE user_id = _user_id LIMIT 1
$$;

-- Recreate the policy using the function
CREATE POLICY "Users can view members of their org"
ON public.org_members
FOR SELECT
USING (
  org_id = user_org_id(auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
);