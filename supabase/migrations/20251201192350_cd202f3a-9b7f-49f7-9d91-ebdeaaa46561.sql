-- Add DELETE policy for claims - only admins can delete claims
CREATE POLICY "Admins can delete claims"
ON public.claims
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));