-- Add storage policy for claim-files bucket to allow photo annotations
-- Staff and admins can upload to photos folder within claim folders

CREATE POLICY "Staff and admins can upload annotated photos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'claim-files' 
  AND (auth.role() = 'authenticated')
  AND (
    public.has_role(auth.uid(), 'admin') 
    OR public.has_role(auth.uid(), 'staff')
  )
);

-- Staff and admins can update (upsert) annotated photos
CREATE POLICY "Staff and admins can update claim files"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'claim-files' 
  AND (auth.role() = 'authenticated')
  AND (
    public.has_role(auth.uid(), 'admin') 
    OR public.has_role(auth.uid(), 'staff')
  )
);

-- Everyone authenticated can view claim files
CREATE POLICY "Authenticated users can view claim files"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'claim-files' 
  AND (auth.role() = 'authenticated')
);