-- Create signature field templates table
CREATE TABLE IF NOT EXISTS public.signature_field_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  field_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID,
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.signature_field_templates ENABLE ROW LEVEL SECURITY;

-- Staff can manage field templates
CREATE POLICY "Staff can manage field templates"
  ON public.signature_field_templates
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

-- Add updated_at trigger
CREATE TRIGGER update_signature_field_templates_updated_at
  BEFORE UPDATE ON public.signature_field_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for faster lookups
CREATE INDEX idx_signature_field_templates_active ON public.signature_field_templates(is_active) WHERE is_active = true;