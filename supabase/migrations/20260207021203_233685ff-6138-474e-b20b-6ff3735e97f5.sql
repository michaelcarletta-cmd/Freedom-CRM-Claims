
CREATE TABLE public.darwin_declared_positions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  primary_cause_of_loss TEXT,
  primary_coverage_theory TEXT,
  primary_carrier_error TEXT,
  carrier_dependency_statement TEXT,
  confidence_level TEXT DEFAULT 'low' CHECK (confidence_level IN ('high', 'medium', 'low')),
  reasoning_complete BOOLEAN NOT NULL DEFAULT false,
  position_locked BOOLEAN NOT NULL DEFAULT false,
  risk_flags TEXT[] DEFAULT '{}',
  missing_inputs TEXT[] DEFAULT '{}',
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_darwin_declared_positions_claim_id ON public.darwin_declared_positions(claim_id);

ALTER TABLE public.darwin_declared_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view positions"
  ON public.darwin_declared_positions FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create positions"
  ON public.darwin_declared_positions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update positions"
  ON public.darwin_declared_positions FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete positions"
  ON public.darwin_declared_positions FOR DELETE
  USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_darwin_declared_positions_updated_at
  BEFORE UPDATE ON public.darwin_declared_positions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
