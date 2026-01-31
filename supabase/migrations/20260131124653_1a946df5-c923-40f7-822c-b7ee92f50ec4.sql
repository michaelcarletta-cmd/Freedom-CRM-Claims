-- Add loss type consistency columns to claim_photos table
ALTER TABLE public.claim_photos 
ADD COLUMN IF NOT EXISTS ai_loss_type_consistency TEXT,
ADD COLUMN IF NOT EXISTS ai_loss_type_consistency_notes TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.claim_photos.ai_loss_type_consistency IS 'Whether damage is consistent with reported cause of loss: consistent, inconsistent, or inconclusive';
COMMENT ON COLUMN public.claim_photos.ai_loss_type_consistency_notes IS 'AI explanation of why damage is or is not consistent with the reported loss type';