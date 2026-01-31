-- Create table for causation rubric weights (configurable scoring)
CREATE TABLE public.causation_rubric_weights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL, -- 'directional', 'collateral', 'pattern', 'competing_cause', 'timeline', 'roof_condition'
  indicator_key TEXT NOT NULL,
  indicator_label TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 0, -- positive = supports peril, negative = supports alternative
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(category, indicator_key)
);

-- Enable RLS
ALTER TABLE public.causation_rubric_weights ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read weights
CREATE POLICY "Authenticated users can view rubric weights"
ON public.causation_rubric_weights
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Only admins can modify (for now, all authenticated users - can be restricted later)
CREATE POLICY "Authenticated users can manage rubric weights"
ON public.causation_rubric_weights
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Create table for storing causation test results
CREATE TABLE public.claim_causation_tests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  peril_tested TEXT NOT NULL,
  damage_type TEXT NOT NULL,
  event_date TIMESTAMP WITH TIME ZONE,
  damage_noticed_date TIMESTAMP WITH TIME ZONE,
  directional_indicators JSONB DEFAULT '[]',
  collateral_damage JSONB DEFAULT '[]',
  pattern_dispersion TEXT,
  roof_age INTEGER,
  shingle_type TEXT,
  manufacturer TEXT,
  prior_repairs TEXT,
  weather_evidence TEXT,
  competing_causes JSONB DEFAULT '[]',
  observations_notes TEXT,
  -- Results
  decision TEXT, -- 'supported', 'not_supported', 'indeterminate'
  decision_statement TEXT,
  reasoning JSONB DEFAULT '[]',
  alternatives_considered JSONB DEFAULT '[]',
  evidence_gaps JSONB DEFAULT '[]',
  total_score INTEGER,
  score_breakdown JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.claim_causation_tests ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to manage their causation tests
CREATE POLICY "Authenticated users can view causation tests"
ON public.claim_causation_tests
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create causation tests"
ON public.claim_causation_tests
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update causation tests"
ON public.claim_causation_tests
FOR UPDATE
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete causation tests"
ON public.claim_causation_tests
FOR DELETE
USING (auth.uid() IS NOT NULL);

-- Insert default rubric weights
INSERT INTO public.causation_rubric_weights (category, indicator_key, indicator_label, weight, description) VALUES
-- Directional Indicators (support peril causation)
('directional', 'lifted_tabs', 'Lifted/creased tabs in consistent direction', 15, 'Strong indicator of wind damage when directionally consistent'),
('directional', 'missing_shingles_directional', 'Missing shingles with directional pattern', 20, 'Very strong wind indicator'),
('directional', 'debris_pattern', 'Debris scattered in directional pattern', 10, 'Moderate wind indicator'),
('directional', 'edge_damage', 'Damage concentrated at roof edges/ridges', 12, 'Wind typically affects edges first'),

-- Collateral Damage (support peril causation)
('collateral', 'gutter_damage', 'Gutter damage consistent with event', 10, 'Supporting evidence of storm event'),
('collateral', 'flashing_damage', 'Flashing lifted or displaced', 12, 'Often accompanies wind damage'),
('collateral', 'siding_damage', 'Siding damage on same exposure', 15, 'Strong corroborating evidence'),
('collateral', 'nearby_structures', 'Damage to nearby structures', 8, 'Area-wide event indicator'),
('collateral', 'tree_limb_damage', 'Tree/limb damage in area', 10, 'Storm severity indicator'),

-- Pattern/Dispersion (mixed - can support or refute)
('pattern', 'localized_damage', 'Damage localized to specific area', 5, 'May indicate event-specific impact'),
('pattern', 'uniform_aging', 'Uniform wear across entire roof', -15, 'Suggests age/wear rather than event'),
('pattern', 'random_scattered', 'Random scattered damage pattern', -5, 'Less consistent with single event'),
('pattern', 'slope_specific', 'Damage on specific slope/exposure', 10, 'Consistent with directional event'),

-- Competing Causes (subtract from peril causation)
('competing_cause', 'wear_and_tear', 'General wear and tear evident', -15, 'Reduces event causation likelihood'),
('competing_cause', 'thermal_cycling', 'Thermal cycling damage present', -12, 'Age-related deterioration'),
('competing_cause', 'manufacturing_defect', 'Manufacturing defect suspected', -20, 'Alternative root cause'),
('competing_cause', 'installation_issues', 'Installation defects visible', -18, 'Alternative root cause'),
('competing_cause', 'foot_traffic', 'Foot traffic damage patterns', -10, 'Human-caused damage'),
('competing_cause', 'hail_damage', 'Hail damage indicators', 0, 'Different peril - neutral unless testing hail'),
('competing_cause', 'animal_damage', 'Animal/pest damage', -8, 'Non-weather causation'),

-- Timeline factors
('timeline', 'immediate_notice', 'Damage noticed within 24hrs of event', 10, 'Strong temporal correlation'),
('timeline', 'delayed_notice', 'Damage noticed 1-7 days after event', 5, 'Reasonable discovery period'),
('timeline', 'late_notice', 'Damage noticed 7+ days after event', -5, 'Weakens temporal link'),
('timeline', 'pre_existing', 'Evidence of pre-existing condition', -20, 'Suggests damage predates event'),

-- Roof Condition factors
('roof_condition', 'new_roof', 'Roof age under 5 years', 10, 'Less likely to fail from age alone'),
('roof_condition', 'mid_life_roof', 'Roof age 5-15 years', 0, 'Neutral - could be either'),
('roof_condition', 'aging_roof', 'Roof age 15-20 years', -5, 'More susceptible to both event and age'),
('roof_condition', 'end_of_life', 'Roof age over 20 years', -10, 'High baseline failure risk'),
('roof_condition', 'architectural_shingles', 'Architectural/dimensional shingles', 5, 'More wind resistant design'),
('roof_condition', '3_tab_shingles', '3-tab shingles', -3, 'Less wind resistant design'),
('roof_condition', 'prior_repairs_good', 'Prior repairs properly done', 0, 'Neutral'),
('roof_condition', 'prior_repairs_poor', 'Prior repairs poorly done', -8, 'Weakens overall roof integrity');

-- Add trigger for updated_at
CREATE TRIGGER update_causation_rubric_weights_updated_at
BEFORE UPDATE ON public.causation_rubric_weights
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_claim_causation_tests_updated_at
BEFORE UPDATE ON public.claim_causation_tests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();