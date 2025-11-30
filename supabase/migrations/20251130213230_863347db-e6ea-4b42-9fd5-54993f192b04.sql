-- Create templates table
CREATE TABLE public.document_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  category TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  is_active BOOLEAN DEFAULT true
);

-- Enable RLS
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

-- Admins and staff can manage templates
CREATE POLICY "Admins and staff can manage templates"
ON public.document_templates
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

-- Anyone authenticated can view active templates
CREATE POLICY "Authenticated users can view active templates"
ON public.document_templates
FOR SELECT
USING (is_active = true);

-- Create storage bucket for templates
INSERT INTO storage.buckets (id, name, public)
VALUES ('document-templates', 'document-templates', false);

-- Storage policies for templates
CREATE POLICY "Admins and staff can upload templates"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'document-templates' AND
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
);

CREATE POLICY "Admins and staff can view templates"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'document-templates' AND
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
);

CREATE POLICY "Admins and staff can delete templates"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'document-templates' AND
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
);

-- Add trigger for updated_at
CREATE TRIGGER update_document_templates_updated_at
BEFORE UPDATE ON public.document_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();