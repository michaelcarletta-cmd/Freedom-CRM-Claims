-- Add prior_offer column to track settlement offers before involvement
ALTER TABLE public.claim_settlements
ADD COLUMN prior_offer numeric DEFAULT 0;

-- Add comment explaining the field
COMMENT ON COLUMN public.claim_settlements.prior_offer IS 'Settlement amount offered before company involvement - fees not collected on this amount';