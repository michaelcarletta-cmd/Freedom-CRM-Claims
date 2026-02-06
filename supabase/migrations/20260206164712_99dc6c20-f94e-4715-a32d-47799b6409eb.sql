
-- Store Claim Context Pipeline runs
CREATE TABLE public.claim_context_pipelines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',
  stage TEXT NOT NULL DEFAULT 'ingest',
  claim_context JSONB NOT NULL DEFAULT '{}',
  estimate_result JSONB,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.claim_context_pipelines ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view pipeline runs" ON public.claim_context_pipelines
  FOR SELECT USING (true);

CREATE POLICY "Users can create pipeline runs" ON public.claim_context_pipelines
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update pipeline runs" ON public.claim_context_pipelines
  FOR UPDATE USING (true);

CREATE POLICY "Users can delete pipeline runs" ON public.claim_context_pipelines
  FOR DELETE USING (true);

-- Timestamp trigger
CREATE TRIGGER update_claim_context_pipelines_updated_at
  BEFORE UPDATE ON public.claim_context_pipelines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
