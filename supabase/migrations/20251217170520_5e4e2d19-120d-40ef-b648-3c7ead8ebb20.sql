-- Add policy allowing staff/admin users to manage linked workspaces
CREATE POLICY "Staff and admins can manage linked workspaces"
ON public.linked_workspaces
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role)
);