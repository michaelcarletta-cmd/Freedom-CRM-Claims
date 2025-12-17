-- Add direction field to claim_payments to distinguish released vs received payments
ALTER TABLE public.claim_payments 
ADD COLUMN IF NOT EXISTS direction text DEFAULT 'released';

-- Add comment explaining the field
COMMENT ON COLUMN public.claim_payments.direction IS 'Payment direction: released (outgoing) or received (incoming from workspace sync)';

-- Update existing payments to be "released" (outgoing)
UPDATE public.claim_payments SET direction = 'released' WHERE direction IS NULL;