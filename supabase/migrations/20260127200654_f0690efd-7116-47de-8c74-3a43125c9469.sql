-- Add coverage type limits to claims table
ALTER TABLE public.claims
ADD COLUMN IF NOT EXISTS dwelling_limit numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS personal_property_limit numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS ale_limit numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS other_structures_limit numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS deductible numeric DEFAULT 0;

-- Add document versioning to claim_files
ALTER TABLE public.claim_files
ADD COLUMN IF NOT EXISTS version integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS version_label text,
ADD COLUMN IF NOT EXISTS parent_file_id uuid REFERENCES public.claim_files(id),
ADD COLUMN IF NOT EXISTS is_latest_version boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS extracted_text text,
ADD COLUMN IF NOT EXISTS ocr_processed_at timestamptz;

-- Add source citations to AI conversations for grounded responses
ALTER TABLE public.claim_ai_conversations
ADD COLUMN IF NOT EXISTS source_citations jsonb,
ADD COLUMN IF NOT EXISTS confidence_score numeric,
ADD COLUMN IF NOT EXISTS needs_review boolean DEFAULT false;

-- Add fraud/inconsistency flags to claims
ALTER TABLE public.claims
ADD COLUMN IF NOT EXISTS fraud_flag boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS fraud_flag_reason text,
ADD COLUMN IF NOT EXISTS fraud_flagged_at timestamptz,
ADD COLUMN IF NOT EXISTS fraud_flagged_by uuid;

-- Create index for finding latest file versions
CREATE INDEX IF NOT EXISTS idx_claim_files_latest_version ON public.claim_files(claim_id, is_latest_version) WHERE is_latest_version = true;

-- Create index for OCR processing queue
CREATE INDEX IF NOT EXISTS idx_claim_files_ocr_pending ON public.claim_files(claim_id) WHERE extracted_text IS NULL AND file_type IN ('application/pdf', 'image/jpeg', 'image/png');