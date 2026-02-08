
-- Table to store the Claim Thesis Object (Step C of the strategic pipeline)
-- Each claim gets exactly one thesis that must be validated before strategic outputs
CREATE TABLE public.claim_thesis_objects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  primary_cause_of_loss TEXT NOT NULL,
  primary_coverage_theory TEXT NOT NULL,
  primary_carrier_error TEXT NOT NULL,
  evidence_map JSONB NOT NULL DEFAULT '[]'::jsonb,
  anticipated_pushback TEXT,
  pushback_counter TEXT,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  locked_at TIMESTAMPTZ,
  locked_by UUID,
  pipeline_version TEXT DEFAULT 'v1',
  last_memory_snapshot JSONB,
  last_deltas_reviewed_at TIMESTAMPTZ,
  cross_claim_lessons JSONB DEFAULT '[]'::jsonb,
  industry_notes_used JSONB DEFAULT '[]'::jsonb,
  web_search_performed BOOLEAN DEFAULT false,
  web_search_results JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  CONSTRAINT unique_claim_thesis UNIQUE (claim_id)
);

ALTER TABLE public.claim_thesis_objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view thesis objects" ON public.claim_thesis_objects
  FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert thesis objects" ON public.claim_thesis_objects
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update thesis objects" ON public.claim_thesis_objects
  FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete thesis objects" ON public.claim_thesis_objects
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- Cache table for industry notes (state regulations, manufacturer specs, etc.)
CREATE TABLE public.industry_notes_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT NOT NULL,
  state_code TEXT,
  peril TEXT,
  material TEXT,
  denial_theme TEXT,
  content TEXT NOT NULL,
  source_url TEXT,
  source_type TEXT NOT NULL DEFAULT 'regulation',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_cache_key UNIQUE (cache_key)
);

ALTER TABLE public.industry_notes_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read industry cache" ON public.industry_notes_cache
  FOR SELECT USING (true);
CREATE POLICY "Service role can manage industry cache" ON public.industry_notes_cache
  FOR ALL USING (true);

-- Trigger for updated_at on thesis objects
CREATE TRIGGER update_claim_thesis_objects_updated_at
  BEFORE UPDATE ON public.claim_thesis_objects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_industry_notes_cache_updated_at
  BEFORE UPDATE ON public.industry_notes_cache
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
