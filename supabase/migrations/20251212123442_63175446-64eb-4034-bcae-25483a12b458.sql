-- Add follow-up automation fields to tasks table
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS follow_up_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS follow_up_interval_days integer DEFAULT 3,
ADD COLUMN IF NOT EXISTS follow_up_max_count integer DEFAULT 5,
ADD COLUMN IF NOT EXISTS follow_up_current_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS follow_up_next_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS follow_up_last_sent_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS follow_up_stopped_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS follow_up_stop_reason text;