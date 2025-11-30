-- Create inspections table
CREATE TABLE public.inspections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  inspection_date DATE NOT NULL,
  inspection_type TEXT,
  inspector_name TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins and staff can manage inspections"
ON public.inspections
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

CREATE POLICY "Users can view inspections for their claims"
ON public.inspections
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM claims
    WHERE claims.id = inspections.claim_id
    AND claims.client_id = auth.uid()
  )
);

CREATE POLICY "Contractors can view inspections for assigned claims"
ON public.inspections
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM claim_contractors
    WHERE claim_contractors.claim_id = inspections.claim_id
    AND claim_contractors.contractor_id = auth.uid()
  )
);

-- Create trigger for updated_at
CREATE TRIGGER update_inspections_updated_at
BEFORE UPDATE ON public.inspections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for better performance
CREATE INDEX idx_inspections_claim_id ON public.inspections(claim_id);
CREATE INDEX idx_inspections_date ON public.inspections(inspection_date);