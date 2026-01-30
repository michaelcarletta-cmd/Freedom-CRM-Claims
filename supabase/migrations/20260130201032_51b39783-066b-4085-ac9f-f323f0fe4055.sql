-- Add unique constraint on claim_id for upsert operations
ALTER TABLE public.claim_strategic_insights 
ADD CONSTRAINT claim_strategic_insights_claim_id_key UNIQUE (claim_id);