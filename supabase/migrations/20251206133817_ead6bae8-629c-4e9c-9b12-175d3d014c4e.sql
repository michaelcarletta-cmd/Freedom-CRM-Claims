-- Create table for claim-specific AI automations
CREATE TABLE public.claim_automations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  settings JSONB NOT NULL DEFAULT '{"auto_respond_emails": true, "auto_update_notes": true, "auto_send_sms": false}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create table for pending AI actions requiring approval
CREATE TABLE public.claim_ai_pending_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('email_response', 'sms', 'note')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'sent')),
  trigger_email_id UUID REFERENCES public.emails(id),
  draft_content JSONB NOT NULL,
  ai_reasoning TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.claim_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_ai_pending_actions ENABLE ROW LEVEL SECURITY;

-- RLS policies for claim_automations (staff/admin only)
CREATE POLICY "Staff and admins can view claim automations"
ON public.claim_automations FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'staff')
  )
);

CREATE POLICY "Staff and admins can create claim automations"
ON public.claim_automations FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'staff')
  )
);

CREATE POLICY "Staff and admins can update claim automations"
ON public.claim_automations FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'staff')
  )
);

CREATE POLICY "Staff and admins can delete claim automations"
ON public.claim_automations FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'staff')
  )
);

-- RLS policies for claim_ai_pending_actions (staff/admin only)
CREATE POLICY "Staff and admins can view pending actions"
ON public.claim_ai_pending_actions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'staff')
  )
);

CREATE POLICY "Staff and admins can create pending actions"
ON public.claim_ai_pending_actions FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'staff')
  )
);

CREATE POLICY "Staff and admins can update pending actions"
ON public.claim_ai_pending_actions FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'staff')
  )
);

-- Create indexes for performance
CREATE INDEX idx_claim_automations_claim_id ON public.claim_automations(claim_id);
CREATE INDEX idx_claim_ai_pending_actions_claim_id ON public.claim_ai_pending_actions(claim_id);
CREATE INDEX idx_claim_ai_pending_actions_status ON public.claim_ai_pending_actions(status);

-- Add trigger for updated_at
CREATE TRIGGER update_claim_automations_updated_at
BEFORE UPDATE ON public.claim_automations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_claim_ai_pending_actions_updated_at
BEFORE UPDATE ON public.claim_ai_pending_actions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();