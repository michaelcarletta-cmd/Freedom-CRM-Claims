-- Drop the broken policy
DROP POLICY IF EXISTS "Contractors can view assigned claims" ON public.claims;

-- Create the fixed policy with correct join condition
CREATE POLICY "Contractors can view assigned claims"
ON public.claims
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM claim_contractors
    WHERE claim_contractors.claim_id = claims.id
      AND claim_contractors.contractor_id = auth.uid()
  )
);