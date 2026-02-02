-- Phase 1: Darwin Autonomous Operations Mode

-- Add autonomy settings to claim_automations
ALTER TABLE claim_automations ADD COLUMN IF NOT EXISTS autonomy_level TEXT DEFAULT 'supervised';
ALTER TABLE claim_automations ADD COLUMN IF NOT EXISTS auto_respond_without_approval BOOLEAN DEFAULT FALSE;
ALTER TABLE claim_automations ADD COLUMN IF NOT EXISTS auto_complete_tasks BOOLEAN DEFAULT FALSE;
ALTER TABLE claim_automations ADD COLUMN IF NOT EXISTS auto_escalate_urgency BOOLEAN DEFAULT FALSE;
ALTER TABLE claim_automations ADD COLUMN IF NOT EXISTS daily_action_limit INTEGER DEFAULT 10;
ALTER TABLE claim_automations ADD COLUMN IF NOT EXISTS keyword_blockers TEXT[] DEFAULT ARRAY['lawsuit', 'attorney', 'bad faith', 'legal action', 'litigation'];

-- Add auto_executed tracking to pending actions
ALTER TABLE claim_ai_pending_actions ADD COLUMN IF NOT EXISTS auto_executed BOOLEAN DEFAULT FALSE;
ALTER TABLE claim_ai_pending_actions ADD COLUMN IF NOT EXISTS auto_executed_at TIMESTAMPTZ;

-- Create darwin_action_log table for tracking all autonomous actions
CREATE TABLE IF NOT EXISTS darwin_action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID REFERENCES claims(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  action_details JSONB,
  was_auto_executed BOOLEAN DEFAULT FALSE,
  executed_at TIMESTAMPTZ DEFAULT now(),
  result TEXT,
  error_message TEXT,
  trigger_source TEXT,
  created_by TEXT DEFAULT 'darwin'
);

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_darwin_action_log_claim_id ON darwin_action_log(claim_id);
CREATE INDEX IF NOT EXISTS idx_darwin_action_log_executed_at ON darwin_action_log(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_darwin_action_log_action_type ON darwin_action_log(action_type);

-- Enable RLS on darwin_action_log
ALTER TABLE darwin_action_log ENABLE ROW LEVEL SECURITY;

-- RLS policies for darwin_action_log
CREATE POLICY "Users can view darwin action logs" 
ON darwin_action_log 
FOR SELECT 
USING (true);

CREATE POLICY "System can insert darwin action logs" 
ON darwin_action_log 
FOR INSERT 
WITH CHECK (true);

-- Enable realtime for action log
ALTER PUBLICATION supabase_realtime ADD TABLE darwin_action_log;