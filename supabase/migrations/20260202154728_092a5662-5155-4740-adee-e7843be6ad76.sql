-- Add classification columns to claim_files
ALTER TABLE claim_files 
  ADD COLUMN IF NOT EXISTS document_classification TEXT,
  ADD COLUMN IF NOT EXISTS classification_confidence NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS classification_metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS processed_by_darwin BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS darwin_processed_at TIMESTAMPTZ;

-- Index for efficient queries on unprocessed files
CREATE INDEX IF NOT EXISTS idx_claim_files_unprocessed 
  ON claim_files(claim_id) 
  WHERE document_classification IS NULL AND processed_by_darwin = FALSE;

-- Document type index for filtering
CREATE INDEX IF NOT EXISTS idx_claim_files_classification 
  ON claim_files(document_classification);

-- Add comment for documentation
COMMENT ON COLUMN claim_files.document_classification IS 'AI-detected document type: estimate, denial, approval, rfi, engineering_report, policy, correspondence, invoice, photo, other';
COMMENT ON COLUMN claim_files.classification_confidence IS 'AI confidence score 0.00-1.00';
COMMENT ON COLUMN claim_files.classification_metadata IS 'Extracted metadata: dates, amounts, key phrases, etc.';
COMMENT ON COLUMN claim_files.processed_by_darwin IS 'Whether Darwin has processed this file';
COMMENT ON COLUMN claim_files.darwin_processed_at IS 'When Darwin processed this file';