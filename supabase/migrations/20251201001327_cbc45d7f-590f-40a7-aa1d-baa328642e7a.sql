-- Drop existing policies for accounting tables
DROP POLICY IF EXISTS "Admins and staff can manage settlements" ON public.claim_settlements;
DROP POLICY IF EXISTS "Admins and staff can manage checks" ON public.claim_checks;
DROP POLICY IF EXISTS "Admins and staff can manage expenses" ON public.claim_expenses;
DROP POLICY IF EXISTS "Admins and staff can manage fees" ON public.claim_fees;
DROP POLICY IF EXISTS "Staff can view fees for accessible claims" ON public.claim_fees;

-- Create new policies for claim_settlements
CREATE POLICY "Only admins can manage settlements" 
ON public.claim_settlements 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create new policies for claim_checks
CREATE POLICY "Only admins can manage checks" 
ON public.claim_checks 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create new policies for claim_expenses
CREATE POLICY "Only admins can manage expenses" 
ON public.claim_expenses 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create new policies for claim_fees
CREATE POLICY "Only admins can manage fees" 
ON public.claim_fees 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow all users to view fees for accessible claims
CREATE POLICY "Users can view fees for accessible claims" 
ON public.claim_fees 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1
    FROM claims
    WHERE claims.id = claim_fees.claim_id
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'staff'::app_role)
        OR claims.client_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM claim_contractors
          WHERE claim_contractors.claim_id = claims.id
            AND claim_contractors.contractor_id = auth.uid()
        )
      )
  )
);