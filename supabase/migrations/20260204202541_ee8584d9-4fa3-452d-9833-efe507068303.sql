-- Create global automation settings table
CREATE TABLE IF NOT EXISTS public.global_automation_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key text NOT NULL UNIQUE,
  setting_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.global_automation_settings ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read/update
CREATE POLICY "Authenticated users can view settings" 
ON public.global_automation_settings FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update settings" 
ON public.global_automation_settings FOR UPDATE 
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert settings" 
ON public.global_automation_settings FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

-- Insert default RD settings
INSERT INTO public.global_automation_settings (setting_key, setting_value, description) VALUES
('rd_follow_up_defaults', '{
  "rd_request_interval_days": 3,
  "rd_request_max_count": 10,
  "rd_check_expected_days": 10,
  "rd_check_alert_after_days": 14,
  "rd_check_follow_up_interval_days": 3,
  "rd_check_max_follow_ups": 5
}'::jsonb, 'Default settings for Recoverable Depreciation tracking'),
('follow_up_defaults', '{
  "general_interval_days": 3,
  "general_max_count": 3,
  "task_interval_days": 3,
  "task_max_count": 5
}'::jsonb, 'Default settings for general follow-ups');

-- Add RD check receipt tracking fields to claim_automations
ALTER TABLE public.claim_automations
ADD COLUMN IF NOT EXISTS rd_check_tracking_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS rd_check_released_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS rd_check_expected_by timestamp with time zone,
ADD COLUMN IF NOT EXISTS rd_check_received_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS rd_check_follow_up_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS rd_check_last_follow_up_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS rd_check_next_follow_up_at timestamp with time zone;

-- Add comments
COMMENT ON COLUMN public.claim_automations.rd_check_tracking_enabled IS 'Track RD check receipt after release';
COMMENT ON COLUMN public.claim_automations.rd_check_released_at IS 'Date carrier released/mailed the RD check';
COMMENT ON COLUMN public.claim_automations.rd_check_expected_by IS 'Expected receipt date (released_at + expected_days)';
COMMENT ON COLUMN public.claim_automations.rd_check_received_at IS 'Date check was actually received';