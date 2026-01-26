-- Create clawdbot_config table for storing user configuration
CREATE TABLE public.clawdbot_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  webhook_secret TEXT NOT NULL,
  clawdbot_endpoint TEXT,
  notification_preferences JSONB DEFAULT '{"tasks_due_today": true, "tasks_overdue": true, "new_documents": true, "approaching_deadlines": true, "check_received": true, "inactive_claims_days": 7}'::jsonb,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT clawdbot_config_user_id_unique UNIQUE (user_id)
);

-- Create clawdbot_message_log table for tracking all messages
CREATE TABLE public.clawdbot_message_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_content TEXT NOT NULL,
  action_type TEXT,
  claim_id UUID REFERENCES public.claims(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX idx_clawdbot_config_user_id ON public.clawdbot_config(user_id);
CREATE INDEX idx_clawdbot_config_active ON public.clawdbot_config(active);
CREATE INDEX idx_clawdbot_message_log_user_id ON public.clawdbot_message_log(user_id);
CREATE INDEX idx_clawdbot_message_log_claim_id ON public.clawdbot_message_log(claim_id);
CREATE INDEX idx_clawdbot_message_log_created_at ON public.clawdbot_message_log(created_at DESC);

-- Enable RLS
ALTER TABLE public.clawdbot_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clawdbot_message_log ENABLE ROW LEVEL SECURITY;

-- RLS policies for clawdbot_config - users can only manage their own config
CREATE POLICY "Users can view their own clawdbot config"
  ON public.clawdbot_config FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own clawdbot config"
  ON public.clawdbot_config FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own clawdbot config"
  ON public.clawdbot_config FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own clawdbot config"
  ON public.clawdbot_config FOR DELETE
  USING (auth.uid() = user_id);

-- RLS policies for clawdbot_message_log - staff/admin can view all, users can view their own
CREATE POLICY "Staff and admin can view all message logs"
  ON public.clawdbot_message_log FOR SELECT
  USING (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own message logs"
  ON public.clawdbot_message_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert message logs"
  ON public.clawdbot_message_log FOR INSERT
  WITH CHECK (true);

-- Add updated_at trigger for clawdbot_config
CREATE TRIGGER update_clawdbot_config_updated_at
  BEFORE UPDATE ON public.clawdbot_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();