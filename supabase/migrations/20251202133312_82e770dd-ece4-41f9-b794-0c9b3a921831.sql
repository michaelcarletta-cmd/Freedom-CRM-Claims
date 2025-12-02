-- Drop the existing INSERT policy on claim_updates
DROP POLICY IF EXISTS "Authenticated users can create updates" ON public.claim_updates;

-- Create corrected INSERT policy that properly handles referrers via referrers.user_id
CREATE POLICY "Authenticated users can create updates" 
ON public.claim_updates 
FOR INSERT 
WITH CHECK (
  (user_id = auth.uid()) AND (
    EXISTS (
      SELECT 1 FROM claims
      WHERE (
        claims.id = claim_updates.claim_id AND (
          has_role(auth.uid(), 'admin'::app_role) OR 
          has_role(auth.uid(), 'staff'::app_role) OR 
          (EXISTS (
            SELECT 1 FROM clients
            WHERE clients.id = claims.client_id AND clients.user_id = auth.uid()
          )) OR
          (EXISTS (
            SELECT 1 FROM claim_contractors
            WHERE claim_contractors.claim_id = claims.id AND claim_contractors.contractor_id = auth.uid()
          )) OR
          (EXISTS (
            SELECT 1 FROM referrers
            WHERE referrers.id = claims.referrer_id AND referrers.user_id = auth.uid()
          ))
        )
      )
    )
  )
);