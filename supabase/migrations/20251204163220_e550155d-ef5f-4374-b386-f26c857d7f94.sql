-- Drop the unnecessary public SELECT policy on signature_signers
-- This policy is no longer needed since the signing flow uses edge functions with service role keys
DROP POLICY IF EXISTS "Public can view signers for signing flow" ON signature_signers;