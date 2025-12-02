-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Admins can manage referrers" ON public.referrers;
DROP POLICY IF EXISTS "Staff can view active referrers" ON public.referrers;

-- Create new policy allowing staff and admins to manage referrers
CREATE POLICY "Admins and staff can manage referrers"
ON public.referrers
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));