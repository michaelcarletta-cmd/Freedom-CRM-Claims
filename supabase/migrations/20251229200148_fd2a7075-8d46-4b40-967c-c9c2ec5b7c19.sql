-- Add storage policies for company-branding bucket to allow user uploads
CREATE POLICY "Users can upload their own logos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'company-branding' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own logos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'company-branding' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Anyone can view company branding"
ON storage.objects FOR SELECT
USING (bucket_id = 'company-branding');