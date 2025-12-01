-- Update RLS policies to ensure referrers can see their claims
CREATE POLICY "Referrers can view their claims"
ON public.claims
FOR SELECT
TO authenticated
USING (referrer_id = auth.uid());

-- Update claim_files RLS to allow referrers and contractors to view files
DROP POLICY IF EXISTS "Users can view files for their claims" ON public.claim_files;

CREATE POLICY "Users can view files for accessible claims"
ON public.claim_files
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM claims
    WHERE claims.id = claim_files.claim_id
    AND (
      has_role(auth.uid(), 'admin') OR 
      has_role(auth.uid(), 'staff') OR
      claims.client_id = auth.uid() OR
      claims.referrer_id = auth.uid() OR
      EXISTS (
        SELECT 1 FROM claim_contractors
        WHERE claim_contractors.claim_id = claims.id
        AND claim_contractors.contractor_id = auth.uid()
      ) OR
      EXISTS (
        SELECT 1 FROM claim_staff
        WHERE claim_staff.claim_id = claims.id
        AND claim_staff.staff_id = auth.uid()
      )
    )
  )
);

-- Update other related tables RLS for referrers and contractors
-- Claim updates
DROP POLICY IF EXISTS "Users can view updates for accessible claims" ON public.claim_updates;

CREATE POLICY "Users can view updates for accessible claims"
ON public.claim_updates
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM claims
    WHERE claims.id = claim_updates.claim_id
    AND (
      has_role(auth.uid(), 'admin') OR 
      has_role(auth.uid(), 'staff') OR
      claims.client_id = auth.uid() OR
      claims.referrer_id = auth.uid() OR
      EXISTS (
        SELECT 1 FROM claim_contractors
        WHERE claim_contractors.claim_id = claims.id
        AND claim_contractors.contractor_id = auth.uid()
      )
    )
  )
);

-- Tasks
DROP POLICY IF EXISTS "Users can view tasks for their claims" ON public.tasks;

CREATE POLICY "Users can view tasks for accessible claims"
ON public.tasks
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM claims
    WHERE claims.id = tasks.claim_id
    AND (
      has_role(auth.uid(), 'admin') OR 
      has_role(auth.uid(), 'staff') OR
      claims.client_id = auth.uid() OR
      claims.referrer_id = auth.uid() OR
      EXISTS (
        SELECT 1 FROM claim_contractors
        WHERE claim_contractors.claim_id = claims.id
        AND claim_contractors.contractor_id = auth.uid()
      ) OR
      tasks.assigned_to = auth.uid()
    )
  )
);