-- Allow admins and staff to delete any claim update, not just their own
DROP POLICY IF EXISTS "Users can delete their own updates" ON public.claim_updates;

CREATE POLICY "Users can delete their own updates"
ON public.claim_updates
FOR DELETE
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'staff'::app_role)
);