
-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Staff and admins can insert photos" ON public.claim_photos;

-- Create new policy that allows any staff to insert photos (consistent with claim_files)
CREATE POLICY "Staff and admins can insert photos" 
ON public.claim_photos 
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'staff'::app_role)
);

-- Also update the UPDATE and DELETE policies for consistency
DROP POLICY IF EXISTS "Staff and admins can update photos" ON public.claim_photos;
CREATE POLICY "Staff and admins can update photos" 
ON public.claim_photos 
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'staff'::app_role)
);

DROP POLICY IF EXISTS "Staff and admins can delete photos" ON public.claim_photos;
CREATE POLICY "Staff and admins can delete photos" 
ON public.claim_photos 
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'staff'::app_role)
);

-- Update SELECT policy to allow any staff to view
DROP POLICY IF EXISTS "Staff and admins can view photos on assigned claims" ON public.claim_photos;
CREATE POLICY "Staff and admins can view all photos" 
ON public.claim_photos 
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'staff'::app_role)
);