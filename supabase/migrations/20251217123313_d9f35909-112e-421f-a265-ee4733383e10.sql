-- Drop existing settlements policies
DROP POLICY IF EXISTS "Only admins can manage settlements" ON public.claim_settlements;
DROP POLICY IF EXISTS "Users can view settlements for accessible claims" ON public.claim_settlements;

-- Staff can view settlements for their assigned claims, admins can view all
CREATE POLICY "Users can view settlements for accessible claims"
ON public.claim_settlements
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  (has_role(auth.uid(), 'staff'::app_role) AND EXISTS (
    SELECT 1 FROM claim_staff WHERE claim_staff.claim_id = claim_settlements.claim_id AND claim_staff.staff_id = auth.uid()
  )) OR
  (EXISTS (
    SELECT 1 FROM claims
    WHERE claims.id = claim_settlements.claim_id AND (
      (EXISTS (SELECT 1 FROM clients WHERE clients.id = claims.client_id AND clients.user_id = auth.uid())) OR
      (EXISTS (SELECT 1 FROM claim_contractors WHERE claim_contractors.claim_id = claims.id AND claim_contractors.contractor_id = auth.uid()))
    )
  ))
);

-- Admins can do everything, staff can insert and update on assigned claims (not delete)
CREATE POLICY "Admins can manage settlements"
ON public.claim_settlements
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can insert settlements on assigned claims"
ON public.claim_settlements
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'staff'::app_role) AND EXISTS (
    SELECT 1 FROM claim_staff WHERE claim_staff.claim_id = claim_settlements.claim_id AND claim_staff.staff_id = auth.uid()
  )
);

CREATE POLICY "Staff can update settlements on assigned claims"
ON public.claim_settlements
FOR UPDATE
USING (
  has_role(auth.uid(), 'staff'::app_role) AND EXISTS (
    SELECT 1 FROM claim_staff WHERE claim_staff.claim_id = claim_settlements.claim_id AND claim_staff.staff_id = auth.uid()
  )
)
WITH CHECK (
  has_role(auth.uid(), 'staff'::app_role) AND EXISTS (
    SELECT 1 FROM claim_staff WHERE claim_staff.claim_id = claim_settlements.claim_id AND claim_staff.staff_id = auth.uid()
  )
);