-- =====================================================
-- DARWIN STRATEGIC ENHANCEMENT - ALL 4 PHASES SCHEMA
-- =====================================================

-- Phase 1: Enhanced Second Brain Mode
-- Add columns to claim_warnings_log for enhanced context
ALTER TABLE claim_warnings_log 
  ADD COLUMN IF NOT EXISTS trigger_context TEXT,
  ADD COLUMN IF NOT EXISTS action_recommendation TEXT,
  ADD COLUMN IF NOT EXISTS precedent_claim_ids UUID[];

-- Store policy analysis results
CREATE TABLE IF NOT EXISTS claim_policy_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  policy_file_id UUID REFERENCES claim_files(id) ON DELETE SET NULL,
  coverage_limits JSONB DEFAULT '{}',
  exclusions JSONB DEFAULT '[]',
  special_conditions JSONB DEFAULT '[]',
  contradictions_found JSONB DEFAULT '[]',
  policy_summary TEXT,
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Phase 4: Carrier Behavior Modeling
-- Create carrier_playbooks table for playbook rules engine
CREATE TABLE IF NOT EXISTS carrier_playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_name TEXT NOT NULL,
  state_code TEXT,
  trigger_condition JSONB NOT NULL,
  recommended_action TEXT NOT NULL,
  action_type TEXT DEFAULT 'general',
  success_rate NUMERIC,
  sample_size INTEGER DEFAULT 0,
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Phase 3: Learning System Loop Enhancement
-- Add unique constraint on claim_id for upsert capability
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'claim_outcomes_claim_id_key'
  ) THEN
    ALTER TABLE claim_outcomes ADD CONSTRAINT claim_outcomes_claim_id_key UNIQUE (claim_id);
  END IF;
END $$;

-- Create trigger for auto-capturing claim outcomes on settlement
CREATE OR REPLACE FUNCTION capture_claim_outcome()
RETURNS TRIGGER AS $$
DECLARE
  settlement_record RECORD;
BEGIN
  -- Only proceed if status changed to 'Claim Settled'
  IF NEW.status = 'Claim Settled' AND (OLD.status IS NULL OR OLD.status != 'Claim Settled') THEN
    -- Get the latest settlement data
    SELECT * INTO settlement_record
    FROM claim_settlements
    WHERE claim_id = NEW.id
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- Insert or update claim outcomes
    INSERT INTO claim_outcomes (
      claim_id,
      final_settlement,
      days_to_final_settlement,
      initial_estimate,
      resolution_date,
      resolution_type
    )
    VALUES (
      NEW.id,
      COALESCE(settlement_record.total_settlement, 0),
      EXTRACT(DAY FROM NOW() - NEW.created_at)::INTEGER,
      COALESCE(settlement_record.estimate_amount, NEW.claim_amount, 0),
      NOW(),
      'settled'
    )
    ON CONFLICT (claim_id) DO UPDATE SET
      final_settlement = EXCLUDED.final_settlement,
      days_to_final_settlement = EXCLUDED.days_to_final_settlement,
      resolution_date = NOW(),
      resolution_type = 'settled',
      updated_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on claims table
DROP TRIGGER IF EXISTS trigger_capture_claim_outcome ON claims;
CREATE TRIGGER trigger_capture_claim_outcome
  AFTER UPDATE ON claims
  FOR EACH ROW
  EXECUTE FUNCTION capture_claim_outcome();

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_claim_policy_analysis_claim_id ON claim_policy_analysis(claim_id);
CREATE INDEX IF NOT EXISTS idx_carrier_playbooks_carrier_name ON carrier_playbooks(carrier_name);
CREATE INDEX IF NOT EXISTS idx_carrier_playbooks_state ON carrier_playbooks(state_code);
CREATE INDEX IF NOT EXISTS idx_claim_outcomes_carrier_lookup ON claim_outcomes(claim_id);

-- Enable RLS on new tables
ALTER TABLE claim_policy_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE carrier_playbooks ENABLE ROW LEVEL SECURITY;

-- RLS policies for claim_policy_analysis (staff/admin access)
CREATE POLICY "Staff can view claim policy analysis"
  ON claim_policy_analysis FOR SELECT
  USING (
    public.has_role(auth.uid(), 'staff'::app_role) OR 
    public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Staff can insert claim policy analysis"
  ON claim_policy_analysis FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'staff'::app_role) OR 
    public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Staff can update claim policy analysis"
  ON claim_policy_analysis FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'staff'::app_role) OR 
    public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Staff can delete claim policy analysis"
  ON claim_policy_analysis FOR DELETE
  USING (
    public.has_role(auth.uid(), 'staff'::app_role) OR 
    public.has_role(auth.uid(), 'admin'::app_role)
  );

-- RLS policies for carrier_playbooks (admin manage, staff view)
CREATE POLICY "Staff can view carrier playbooks"
  ON carrier_playbooks FOR SELECT
  USING (
    public.has_role(auth.uid(), 'staff'::app_role) OR 
    public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Admin can insert carrier playbooks"
  ON carrier_playbooks FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can update carrier playbooks"
  ON carrier_playbooks FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can delete carrier playbooks"
  ON carrier_playbooks FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Insert some default carrier playbooks
INSERT INTO carrier_playbooks (carrier_name, trigger_condition, recommended_action, action_type, priority) VALUES
('State Farm', '{"delay_days": {"gte": 14}}', 'Send formal escalation letter citing prompt pay statute. State Farm typically responds faster to formal written complaints referencing regulatory deadlines.', 'escalation', 1),
('State Farm', '{"supplement_pending": true, "days_waiting": {"gte": 21}}', 'Request scope meeting and submit photo matrix. State Farm adjusters often need visual documentation to approve supplements.', 'supplement', 2),
('Allstate', '{"lowball_estimate": true}', 'Counter with line-item breakdown + manufacturer specifications. Allstate responds to technical documentation backing each line item.', 'negotiation', 1),
('Allstate', '{"delay_days": {"gte": 21}}', 'Allstate delays average 21 days - consider formal escalation letter at day 14 with bad faith language.', 'escalation', 2),
('Nationwide', '{"engineer_report_received": true}', 'Immediately request scope meeting + submit counter photo matrix. Nationwide often relies heavily on engineer reports.', 'rebuttal', 1),
('Liberty Mutual', '{"first_denial": true}', 'Liberty Mutual denials often cite broad exclusions. Review policy language carefully and request specific clause citations.', 'denial_response', 1),
('Travelers', '{"supplement_count": {"gte": 2}}', 'Travelers has lower supplement approval rates after 2nd submission. Consider demand letter with regulatory citations.', 'supplement', 2),
('USAA', '{"communication_gap_days": {"gte": 10}}', 'USAA typically responsive - communication gap may indicate file reassignment. Request adjuster confirmation.', 'communication', 1)
ON CONFLICT DO NOTHING;

-- Add realtime for claim_policy_analysis
ALTER PUBLICATION supabase_realtime ADD TABLE claim_policy_analysis;