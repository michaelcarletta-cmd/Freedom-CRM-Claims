-- Add AI analysis columns to claim_photos for storing Darwin's condition and damage assessments
ALTER TABLE public.claim_photos 
ADD COLUMN IF NOT EXISTS ai_condition_rating TEXT,
ADD COLUMN IF NOT EXISTS ai_condition_notes TEXT,
ADD COLUMN IF NOT EXISTS ai_detected_damages JSONB,
ADD COLUMN IF NOT EXISTS ai_material_type TEXT,
ADD COLUMN IF NOT EXISTS ai_analysis_summary TEXT,
ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMP WITH TIME ZONE;

-- Add index for quick lookups of analyzed photos
CREATE INDEX IF NOT EXISTS idx_claim_photos_ai_analyzed ON public.claim_photos(claim_id) WHERE ai_analyzed_at IS NOT NULL;

COMMENT ON COLUMN public.claim_photos.ai_condition_rating IS 'Overall condition rating: excellent, good, fair, poor, failed';
COMMENT ON COLUMN public.claim_photos.ai_condition_notes IS 'Detailed AI notes about the condition';
COMMENT ON COLUMN public.claim_photos.ai_detected_damages IS 'JSON array of detected damages with type, severity, and notes';
COMMENT ON COLUMN public.claim_photos.ai_material_type IS 'Material identified: architectural shingles, 3-tab, vinyl siding, etc.';
COMMENT ON COLUMN public.claim_photos.ai_analysis_summary IS 'Brief summary of AI findings for this photo';
COMMENT ON COLUMN public.claim_photos.ai_analyzed_at IS 'Timestamp when AI analysis was performed';