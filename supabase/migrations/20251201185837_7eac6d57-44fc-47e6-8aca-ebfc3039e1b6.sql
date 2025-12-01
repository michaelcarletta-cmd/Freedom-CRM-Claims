-- Allow staff to assign themselves to claims
CREATE POLICY "Staff can assign themselves to claims"
ON public.claim_staff
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'staff'::app_role) 
  AND staff_id = auth.uid()
);