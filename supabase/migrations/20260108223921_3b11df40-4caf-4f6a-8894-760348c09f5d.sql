-- Add storage policy to allow contractors to upload files to claims they're assigned to
CREATE POLICY "Contractors can upload claim files"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'claim-files' 
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM claim_contractors cc
    WHERE cc.contractor_id = auth.uid()
    AND (cc.claim_id)::text = (storage.foldername(name))[1]
  )
);

-- Also add UPDATE policy for contractors to update their uploaded files
CREATE POLICY "Contractors can update claim files"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'claim-files' 
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM claim_contractors cc
    WHERE cc.contractor_id = auth.uid()
    AND (cc.claim_id)::text = (storage.foldername(name))[1]
  )
);