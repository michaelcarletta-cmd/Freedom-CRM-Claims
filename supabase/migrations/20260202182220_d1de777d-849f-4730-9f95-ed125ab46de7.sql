-- Create a table to track contractor documents
CREATE TABLE public.contractor_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contractor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL, -- 'w9', 'insurance', 'license', 'contract', 'other'
  document_name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT,
  expiration_date DATE, -- For insurance/license docs that expire
  notes TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contractor_documents ENABLE ROW LEVEL SECURITY;

-- Policies: staff can view/manage all contractor documents
CREATE POLICY "Staff can view contractor documents"
ON public.contractor_documents
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'staff')
  )
);

CREATE POLICY "Staff can insert contractor documents"
ON public.contractor_documents
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'staff')
  )
);

CREATE POLICY "Staff can update contractor documents"
ON public.contractor_documents
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'staff')
  )
);

CREATE POLICY "Staff can delete contractor documents"
ON public.contractor_documents
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'staff')
  )
);

-- Contractors can view their own documents
CREATE POLICY "Contractors can view own documents"
ON public.contractor_documents
FOR SELECT
USING (contractor_id = auth.uid());

-- Create storage bucket for contractor documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('contractor-documents', 'contractor-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Staff can upload contractor documents"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'contractor-documents' AND
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'staff')
  )
);

CREATE POLICY "Staff can view contractor documents storage"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'contractor-documents' AND
  (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'staff')
    )
    OR
    -- Contractors can view their own folder
    (storage.foldername(name))[1] = auth.uid()::text
  )
);

CREATE POLICY "Staff can delete contractor documents storage"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'contractor-documents' AND
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'staff')
  )
);

-- Add trigger for updated_at
CREATE TRIGGER update_contractor_documents_updated_at
BEFORE UPDATE ON public.contractor_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();