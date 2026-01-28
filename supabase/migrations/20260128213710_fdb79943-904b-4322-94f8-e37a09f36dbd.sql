-- =============================================
-- STRATEGIC DARWIN: OUTCOME TRACKING & LEARNING
-- =============================================

-- 1. Claim Outcomes - Track what actually happened
CREATE TABLE public.claim_outcomes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  
  -- Financial outcomes
  initial_estimate NUMERIC,
  final_settlement NUMERIC,
  settlement_variance NUMERIC GENERATED ALWAYS AS (final_settlement - initial_estimate) STORED,
  recovery_percentage NUMERIC,
  
  -- Timeline outcomes
  days_to_first_payment INTEGER,
  days_to_final_settlement INTEGER,
  total_supplements_submitted INTEGER DEFAULT 0,
  supplements_approved INTEGER DEFAULT 0,
  
  -- Resolution details
  resolution_type TEXT, -- 'full_payment', 'partial_settlement', 'litigation', 'appraisal', 'denial_upheld'
  resolution_date TIMESTAMP WITH TIME ZONE,
  
  -- What worked
  winning_arguments JSONB DEFAULT '[]'::jsonb, -- Array of argument types that succeeded
  effective_evidence JSONB DEFAULT '[]'::jsonb, -- Evidence types that moved the needle
  key_leverage_points JSONB DEFAULT '[]'::jsonb, -- What created pressure
  
  -- What didn't work
  failed_arguments JSONB DEFAULT '[]'::jsonb,
  missing_evidence_impact TEXT,
  
  -- Learning metadata
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID
);

-- 2. Carrier Behavior Profiles - Track patterns by carrier
CREATE TABLE public.carrier_behavior_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  carrier_name TEXT NOT NULL,
  
  -- Response patterns
  avg_initial_response_days NUMERIC,
  avg_supplement_response_days NUMERIC,
  typical_denial_reasons JSONB DEFAULT '[]'::jsonb,
  common_lowball_tactics JSONB DEFAULT '[]'::jsonb,
  
  -- Approval patterns
  supplement_approval_rate NUMERIC,
  first_offer_vs_final_ratio NUMERIC, -- How much they typically move
  
  -- Escalation triggers
  escalation_effectiveness JSONB DEFAULT '{}'::jsonb, -- What causes them to move
  preferred_communication TEXT, -- 'email', 'phone', 'formal_letter'
  
  -- Adjuster patterns (aggregated)
  adjuster_notes JSONB DEFAULT '[]'::jsonb,
  
  -- Playbooks
  recommended_approach TEXT,
  counter_sequences JSONB DEFAULT '[]'::jsonb, -- Ordered steps that work
  
  -- Stats
  total_claims_tracked INTEGER DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Evidence Effectiveness - Track what evidence actually works
CREATE TABLE public.evidence_effectiveness (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id UUID REFERENCES public.claims(id) ON DELETE SET NULL,
  
  evidence_type TEXT NOT NULL, -- 'photo', 'engineer_report', 'moisture_map', 'weather_data', 'invoice', etc.
  evidence_category TEXT, -- 'causation', 'scope', 'pricing', 'code_upgrade'
  
  -- Scoring
  quality_score INTEGER CHECK (quality_score >= 1 AND quality_score <= 10),
  sufficiency_rating TEXT, -- 'strong', 'adequate', 'weak', 'missing'
  
  -- Impact tracking
  was_cited_in_settlement BOOLEAN DEFAULT false,
  carrier_response TEXT, -- How carrier reacted to this evidence
  moved_settlement BOOLEAN DEFAULT false,
  settlement_impact_amount NUMERIC,
  
  -- Recommendations generated
  improvement_suggestions JSONB DEFAULT '[]'::jsonb,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID
);

-- 4. Claim Strategic Insights - Darwin's opinions per claim
CREATE TABLE public.claim_strategic_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  
  -- Health Score Components (1-100)
  coverage_strength_score INTEGER,
  evidence_quality_score INTEGER,
  leverage_score INTEGER,
  timeline_risk_score INTEGER,
  overall_health_score INTEGER,
  
  -- Active Warnings
  warnings JSONB DEFAULT '[]'::jsonb, -- Array of {type, severity, message, action}
  
  -- Opportunities
  leverage_points JSONB DEFAULT '[]'::jsonb, -- Array of {type, description, impact}
  coverage_triggers_detected JSONB DEFAULT '[]'::jsonb, -- If/then coverage opportunities
  
  -- Gaps
  evidence_gaps JSONB DEFAULT '[]'::jsonb, -- What's missing
  documentation_holes JSONB DEFAULT '[]'::jsonb, -- Liability risks
  
  -- Recommendations
  recommended_next_moves JSONB DEFAULT '[]'::jsonb, -- Prioritized actions
  counter_strategies JSONB DEFAULT '[]'::jsonb, -- Based on carrier behavior
  
  -- PA Mode
  senior_pa_opinion TEXT, -- "What would a senior PA do?"
  
  -- Metadata
  analysis_version TEXT,
  last_analyzed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  auto_refresh_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 5. Claim Warnings Log - Track warnings shown and actions taken
CREATE TABLE public.claim_warnings_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  
  warning_type TEXT NOT NULL, -- 'coverage_gap', 'deadline_risk', 'evidence_weak', 'contradiction', etc.
  severity TEXT NOT NULL, -- 'critical', 'high', 'medium', 'low'
  
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  context JSONB, -- Additional context (e.g., which document, which deadline)
  
  -- Recommendations
  suggested_action TEXT,
  action_taken TEXT,
  
  -- Status
  is_dismissed BOOLEAN DEFAULT false,
  dismissed_at TIMESTAMP WITH TIME ZONE,
  dismissed_by UUID,
  dismiss_reason TEXT,
  
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID,
  
  -- Display tracking
  shown_in_context TEXT, -- 'email_composer', 'package_builder', 'insights_panel', etc.
  times_shown INTEGER DEFAULT 1,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.claim_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carrier_behavior_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_effectiveness ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_strategic_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_warnings_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies (authenticated users can access)
CREATE POLICY "Authenticated users can manage claim outcomes"
ON public.claim_outcomes FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view carrier profiles"
ON public.carrier_behavior_profiles FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage carrier profiles"
ON public.carrier_behavior_profiles FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage evidence effectiveness"
ON public.evidence_effectiveness FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage strategic insights"
ON public.claim_strategic_insights FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage warnings log"
ON public.claim_warnings_log FOR ALL USING (auth.uid() IS NOT NULL);

-- Indexes for performance
CREATE INDEX idx_claim_outcomes_claim_id ON public.claim_outcomes(claim_id);
CREATE INDEX idx_carrier_behavior_name ON public.carrier_behavior_profiles(carrier_name);
CREATE INDEX idx_evidence_effectiveness_claim ON public.evidence_effectiveness(claim_id);
CREATE INDEX idx_evidence_effectiveness_type ON public.evidence_effectiveness(evidence_type);
CREATE INDEX idx_strategic_insights_claim ON public.claim_strategic_insights(claim_id);
CREATE INDEX idx_warnings_log_claim ON public.claim_warnings_log(claim_id);
CREATE INDEX idx_warnings_log_active ON public.claim_warnings_log(claim_id) WHERE NOT is_dismissed AND NOT is_resolved;

-- Updated_at trigger
CREATE TRIGGER update_claim_outcomes_updated_at
BEFORE UPDATE ON public.claim_outcomes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_strategic_insights_updated_at
BEFORE UPDATE ON public.claim_strategic_insights
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();