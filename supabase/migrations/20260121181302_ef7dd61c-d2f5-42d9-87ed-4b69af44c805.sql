-- Phase 3: Workflow Intelligence Tables

-- Smart Follow-up Recommendations
CREATE TABLE public.smart_follow_up_recommendations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  recommendation_type TEXT NOT NULL, -- 'call', 'email', 'document_request', 'inspection_schedule', 'escalation'
  priority TEXT NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  recommended_date TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  target_recipient TEXT, -- 'adjuster', 'carrier', 'client', 'contractor'
  suggested_template_id UUID REFERENCES public.email_templates(id),
  ai_confidence DECIMAL(3,2) DEFAULT 0.80,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by UUID,
  dismissed BOOLEAN DEFAULT false,
  dismissed_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-generated Tasks from AI
CREATE TABLE public.ai_generated_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id), -- Link to actual task if created
  suggested_title TEXT NOT NULL,
  suggested_description TEXT,
  suggested_due_date DATE,
  suggested_priority TEXT DEFAULT 'medium',
  suggested_assignee_id UUID,
  generation_reason TEXT NOT NULL, -- Why AI suggested this task
  source_analysis_type TEXT, -- Which Darwin tool generated it
  is_approved BOOLEAN DEFAULT false,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  is_dismissed BOOLEAN DEFAULT false,
  dismissed_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Claim Outcome Predictions
CREATE TABLE public.claim_outcome_predictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  predicted_settlement_low DECIMAL(12,2),
  predicted_settlement_high DECIMAL(12,2),
  predicted_settlement_likely DECIMAL(12,2),
  settlement_probability DECIMAL(3,2), -- 0.00 to 1.00
  predicted_timeline_days INTEGER,
  risk_factors JSONB DEFAULT '[]',
  opportunity_factors JSONB DEFAULT '[]',
  comparable_claims JSONB DEFAULT '[]', -- Similar claim outcomes for reference
  analysis_notes TEXT,
  model_version TEXT DEFAULT 'v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

-- Workflow Automation Rules (user-configurable)
CREATE TABLE public.workflow_automation_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  trigger_event TEXT NOT NULL, -- 'status_change', 'days_since_activity', 'document_uploaded', 'payment_received'
  trigger_config JSONB DEFAULT '{}',
  action_type TEXT NOT NULL, -- 'create_task', 'send_notification', 'update_status', 'schedule_follow_up'
  action_config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  priority_order INTEGER DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.smart_follow_up_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_generated_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_outcome_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_automation_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies (authenticated users can access)
CREATE POLICY "Authenticated users can manage follow-up recommendations" ON public.smart_follow_up_recommendations
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage AI generated tasks" ON public.ai_generated_tasks
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage outcome predictions" ON public.claim_outcome_predictions
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage workflow rules" ON public.workflow_automation_rules
  FOR ALL USING (auth.role() = 'authenticated');

-- Seed default workflow automation rules
INSERT INTO public.workflow_automation_rules (name, description, trigger_event, trigger_config, action_type, action_config, priority_order) VALUES
('No Activity 7 Days', 'Create follow-up task when no activity for 7 days', 'days_since_activity', '{"days": 7}', 'create_task', '{"title": "Follow up on claim - no recent activity", "priority": "medium"}', 1),
('Inspection Scheduled', 'Remind to prepare client 2 days before inspection', 'inspection_scheduled', '{"days_before": 2}', 'create_task', '{"title": "Prepare client for upcoming inspection", "priority": "high"}', 2),
('Payment Received', 'Create task to update settlement tracking when payment received', 'payment_received', '{}', 'create_task', '{"title": "Update settlement tracking with new payment", "priority": "medium"}', 3),
('Denial Letter Uploaded', 'Alert team when denial letter detected', 'document_uploaded', '{"keywords": ["denial", "denied", "decline"]}', 'send_notification', '{"message": "Denial letter detected - review required", "priority": "high"}', 4),
('30 Days Since Loss', 'Create milestone review task at 30 days', 'days_since_loss', '{"days": 30}', 'create_task', '{"title": "30-day claim review", "priority": "medium"}', 5);

-- Index for performance
CREATE INDEX idx_follow_up_recommendations_claim ON public.smart_follow_up_recommendations(claim_id);
CREATE INDEX idx_follow_up_recommendations_date ON public.smart_follow_up_recommendations(recommended_date);
CREATE INDEX idx_ai_generated_tasks_claim ON public.ai_generated_tasks(claim_id);
CREATE INDEX idx_outcome_predictions_claim ON public.claim_outcome_predictions(claim_id);