-- Add matched_playbooks column to claim_strategic_insights
ALTER TABLE public.claim_strategic_insights 
ADD COLUMN IF NOT EXISTS matched_playbooks JSONB DEFAULT '[]'::jsonb;