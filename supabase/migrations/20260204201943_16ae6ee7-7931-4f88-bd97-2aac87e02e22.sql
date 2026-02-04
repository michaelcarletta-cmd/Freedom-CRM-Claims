-- Add Recoverable Depreciation follow-up fields to claim_automations
ALTER TABLE public.claim_automations
ADD COLUMN IF NOT EXISTS rd_follow_up_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS rd_follow_up_interval_days integer NOT NULL DEFAULT 3,
ADD COLUMN IF NOT EXISTS rd_follow_up_max_count integer NOT NULL DEFAULT 10,
ADD COLUMN IF NOT EXISTS rd_follow_up_current_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS rd_follow_up_last_sent_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS rd_follow_up_next_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS rd_follow_up_stopped_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS rd_follow_up_stop_reason text;

-- Add comment to explain purpose
COMMENT ON COLUMN public.claim_automations.rd_follow_up_enabled IS 'Enable dedicated RD follow-ups when claim is in Recoverable Depreciation Requested status';
COMMENT ON COLUMN public.claim_automations.rd_follow_up_interval_days IS 'Days between RD follow-up emails';
COMMENT ON COLUMN public.claim_automations.rd_follow_up_max_count IS 'Maximum RD follow-ups before stopping';
COMMENT ON COLUMN public.claim_automations.rd_follow_up_current_count IS 'Number of RD follow-ups sent';
COMMENT ON COLUMN public.claim_automations.rd_follow_up_stop_reason IS 'Reason RD follow-ups stopped: rd_released, max_count_reached, manual, status_changed';