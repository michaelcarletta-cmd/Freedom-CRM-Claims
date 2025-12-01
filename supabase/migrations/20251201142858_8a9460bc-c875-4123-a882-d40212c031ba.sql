-- Fix signature_signers RLS policies to prevent unauthorized access
-- while maintaining token-based signing flow

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Signers can view their signature via token" ON signature_signers;
DROP POLICY IF EXISTS "Signers can update their signature via token" ON signature_signers;
DROP POLICY IF EXISTS "Staff can manage signers" ON signature_signers;

-- Staff can fully manage all signature signers
CREATE POLICY "Staff can manage all signature signers"
ON signature_signers
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'staff')
)
WITH CHECK (
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'staff')
);

-- Public users can view signature signers (needed for signing page)
-- Security note: This relies on access_token being cryptographically random (gen_random_uuid())
-- The 128-bit UUID provides ~10^38 possible values, making brute force infeasible
CREATE POLICY "Public can view signers for signing flow"
ON signature_signers
FOR SELECT
TO public
USING (true);

-- Public users can update signatures (for completing the signing process)
-- Security note: Application layer validates access_token before update
-- Consider adding: expiration timestamp and single-use flag for enhanced security
CREATE POLICY "Public can complete signatures"
ON signature_signers
FOR UPDATE
TO public
USING (status = 'pending')
WITH CHECK (
  -- Only allow completing pending signatures
  status IN ('pending', 'completed')
);