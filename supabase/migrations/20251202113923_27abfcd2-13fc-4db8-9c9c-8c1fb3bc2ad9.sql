-- Add UPDATE policy for claim_updates table
-- Users can update their own updates
CREATE POLICY "Users can update their own updates"
ON claim_updates
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Add DELETE policy for claim_updates table
-- Users can delete their own updates
CREATE POLICY "Users can delete their own updates"
ON claim_updates
FOR DELETE
TO authenticated
USING (user_id = auth.uid());