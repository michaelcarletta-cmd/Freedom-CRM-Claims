-- Add follow-up tracking columns to claim_automations
ALTER TABLE public.claim_automations 
ADD COLUMN IF NOT EXISTS follow_up_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS follow_up_interval_days integer NOT NULL DEFAULT 3,
ADD COLUMN IF NOT EXISTS follow_up_max_count integer NOT NULL DEFAULT 3,
ADD COLUMN IF NOT EXISTS follow_up_current_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS follow_up_last_sent_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS follow_up_next_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS follow_up_stopped_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS follow_up_stop_reason text;

-- Create index for efficient follow-up queries
CREATE INDEX IF NOT EXISTS idx_claim_automations_follow_up 
ON public.claim_automations (follow_up_enabled, follow_up_next_at) 
WHERE follow_up_enabled = true AND follow_up_stopped_at IS NULL;