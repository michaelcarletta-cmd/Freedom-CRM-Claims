-- Create custom_fields table to define field types
CREATE TABLE public.custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL, -- 'text', 'textarea', 'select', 'number', 'date', 'checkbox'
  options JSONB DEFAULT '[]', -- For select fields, array of options
  is_required BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create claim_custom_field_values table to store values
CREATE TABLE public.claim_custom_field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  custom_field_id UUID NOT NULL REFERENCES public.custom_fields(id) ON DELETE CASCADE,
  value TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(claim_id, custom_field_id)
);

-- Enable RLS
ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_custom_field_values ENABLE ROW LEVEL SECURITY;

-- RLS policies for custom_fields
CREATE POLICY "Admins can manage custom fields"
  ON public.custom_fields
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'));

-- RLS policies for claim_custom_field_values
CREATE POLICY "Users can view custom field values for accessible claims"
  ON public.claim_custom_field_values
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM claims
      WHERE claims.id = claim_custom_field_values.claim_id
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

CREATE POLICY "Staff can manage custom field values"
  ON public.claim_custom_field_values
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'));

-- Create indexes
CREATE INDEX idx_custom_fields_active ON public.custom_fields(is_active, display_order);
CREATE INDEX idx_claim_custom_field_values_claim_id ON public.claim_custom_field_values(claim_id);
CREATE INDEX idx_claim_custom_field_values_field_id ON public.claim_custom_field_values(custom_field_id);

-- Add update trigger
CREATE TRIGGER update_custom_fields_updated_at
  BEFORE UPDATE ON public.custom_fields
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_claim_custom_field_values_updated_at
  BEFORE UPDATE ON public.claim_custom_field_values
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();