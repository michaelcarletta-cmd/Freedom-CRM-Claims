-- Fix claim_updates SELECT policy - referrer check is wrong
DROP POLICY IF EXISTS "Users can view updates for accessible claims" ON public.claim_updates;
CREATE POLICY "Users can view updates for accessible claims" ON public.claim_updates
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM claims
    WHERE claims.id = claim_updates.claim_id
    AND (
      has_role(auth.uid(), 'admin') OR 
      has_role(auth.uid(), 'staff') OR
      EXISTS (SELECT 1 FROM clients WHERE clients.id = claims.client_id AND clients.user_id = auth.uid()) OR
      EXISTS (SELECT 1 FROM referrers WHERE referrers.id = claims.referrer_id AND referrers.user_id = auth.uid()) OR
      EXISTS (SELECT 1 FROM claim_contractors WHERE claim_contractors.claim_id = claims.id AND claim_contractors.contractor_id = auth.uid()) OR
      EXISTS (SELECT 1 FROM claim_staff WHERE claim_staff.claim_id = claims.id AND claim_staff.staff_id = auth.uid())
    )
  )
);

-- Fix claim_files SELECT policy - referrer check is wrong  
DROP POLICY IF EXISTS "Users can view files for accessible claims" ON public.claim_files;
CREATE POLICY "Users can view files for accessible claims" ON public.claim_files
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM claims
    WHERE claims.id = claim_files.claim_id
    AND (
      has_role(auth.uid(), 'admin') OR 
      has_role(auth.uid(), 'staff') OR
      EXISTS (SELECT 1 FROM clients WHERE clients.id = claims.client_id AND clients.user_id = auth.uid()) OR
      EXISTS (SELECT 1 FROM referrers WHERE referrers.id = claims.referrer_id AND referrers.user_id = auth.uid()) OR
      EXISTS (SELECT 1 FROM claim_contractors WHERE claim_contractors.claim_id = claims.id AND claim_contractors.contractor_id = auth.uid()) OR
      EXISTS (SELECT 1 FROM claim_staff WHERE claim_staff.claim_id = claims.id AND claim_staff.staff_id = auth.uid())
    )
  )
);

-- Add INSERT policy for portal users on claim_files
CREATE POLICY "Portal users can upload files to accessible claims" ON public.claim_files
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM claims
    WHERE claims.id = claim_files.claim_id
    AND (
      EXISTS (SELECT 1 FROM clients WHERE clients.id = claims.client_id AND clients.user_id = auth.uid()) OR
      EXISTS (SELECT 1 FROM referrers WHERE referrers.id = claims.referrer_id AND referrers.user_id = auth.uid()) OR
      EXISTS (SELECT 1 FROM claim_contractors WHERE claim_contractors.claim_id = claims.id AND claim_contractors.contractor_id = auth.uid())
    )
  )
);

-- Fix claim_folders SELECT policy - missing referrer check
DROP POLICY IF EXISTS "Users can view folders for their claims" ON public.claim_folders;
CREATE POLICY "Users can view folders for their claims" ON public.claim_folders
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM claims
    WHERE claims.id = claim_folders.claim_id
    AND (
      has_role(auth.uid(), 'admin') OR 
      has_role(auth.uid(), 'staff') OR
      EXISTS (SELECT 1 FROM clients WHERE clients.id = claims.client_id AND clients.user_id = auth.uid()) OR
      EXISTS (SELECT 1 FROM referrers WHERE referrers.id = claims.referrer_id AND referrers.user_id = auth.uid()) OR
      EXISTS (SELECT 1 FROM claim_contractors WHERE claim_contractors.claim_id = claims.id AND claim_contractors.contractor_id = auth.uid()) OR
      EXISTS (SELECT 1 FROM claim_staff WHERE claim_staff.claim_id = claims.id AND claim_staff.staff_id = auth.uid())
    )
  )
);