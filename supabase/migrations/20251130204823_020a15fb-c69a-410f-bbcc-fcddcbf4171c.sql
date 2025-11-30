-- Create storage bucket for claim files
INSERT INTO storage.buckets (id, name, public)
VALUES ('claim-files', 'claim-files', false);

-- Create claim_folders table
CREATE TABLE public.claim_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_predefined BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  display_order INTEGER DEFAULT 0
);

-- Create claim_files table
CREATE TABLE public.claim_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES claim_folders(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  file_type TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Insert predefined folders for all existing claims
INSERT INTO public.claim_folders (claim_id, name, is_predefined, display_order)
SELECT 
  id,
  folder_name,
  true,
  folder_order
FROM claims
CROSS JOIN (
  VALUES 
    ('Carrier Documents', 1),
    ('Freedom Adjustment Documents', 2),
    ('Invoicing', 3),
    ('Certificate of Completion', 4),
    ('Supporting Evidence', 5),
    ('Mortgage Documents', 6)
) AS folders(folder_name, folder_order);

-- Enable RLS on claim_folders
ALTER TABLE public.claim_folders ENABLE ROW LEVEL SECURITY;

-- RLS policies for claim_folders
CREATE POLICY "Admins and staff can manage folders"
ON public.claim_folders
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'))
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'));

CREATE POLICY "Users can view folders for their claims"
ON public.claim_folders
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM claims
    WHERE claims.id = claim_folders.claim_id
    AND (
      has_role(auth.uid(), 'admin')
      OR has_role(auth.uid(), 'staff')
      OR claims.client_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM claim_contractors
        WHERE claim_contractors.claim_id = claims.id
        AND claim_contractors.contractor_id = auth.uid()
      )
    )
  )
);

-- Enable RLS on claim_files
ALTER TABLE public.claim_files ENABLE ROW LEVEL SECURITY;

-- RLS policies for claim_files
CREATE POLICY "Admins and staff can manage files"
ON public.claim_files
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'))
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'));

CREATE POLICY "Users can view files for their claims"
ON public.claim_files
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM claims
    WHERE claims.id = claim_files.claim_id
    AND (
      has_role(auth.uid(), 'admin')
      OR has_role(auth.uid(), 'staff')
      OR claims.client_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM claim_contractors
        WHERE claim_contractors.claim_id = claims.id
        AND claim_contractors.contractor_id = auth.uid()
      )
    )
  )
);

-- Storage policies for claim-files bucket
CREATE POLICY "Users can view files for accessible claims"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'claim-files'
  AND (
    has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'staff')
    OR EXISTS (
      SELECT 1 FROM claim_files cf
      JOIN claims c ON c.id = cf.claim_id
      WHERE cf.file_path = storage.objects.name
      AND (
        c.client_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM claim_contractors
          WHERE claim_contractors.claim_id = c.id
          AND claim_contractors.contractor_id = auth.uid()
        )
      )
    )
  )
);

CREATE POLICY "Admins and staff can upload files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'claim-files'
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'))
);

CREATE POLICY "Admins and staff can delete files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'claim-files'
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'))
);

-- Create indexes
CREATE INDEX idx_claim_folders_claim_id ON claim_folders(claim_id);
CREATE INDEX idx_claim_files_claim_id ON claim_files(claim_id);
CREATE INDEX idx_claim_files_folder_id ON claim_files(folder_id);

-- Create trigger to auto-create predefined folders for new claims
CREATE OR REPLACE FUNCTION create_predefined_folders()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.claim_folders (claim_id, name, is_predefined, display_order)
  VALUES 
    (NEW.id, 'Carrier Documents', true, 1),
    (NEW.id, 'Freedom Adjustment Documents', true, 2),
    (NEW.id, 'Invoicing', true, 3),
    (NEW.id, 'Certificate of Completion', true, 4),
    (NEW.id, 'Supporting Evidence', true, 5),
    (NEW.id, 'Mortgage Documents', true, 6);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_create_predefined_folders
AFTER INSERT ON claims
FOR EACH ROW
EXECUTE FUNCTION create_predefined_folders();