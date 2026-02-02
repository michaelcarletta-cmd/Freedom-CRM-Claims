-- Add source column to track file origin
ALTER TABLE claim_files 
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'upload';

-- Add index for filtering by source
CREATE INDEX IF NOT EXISTS idx_claim_files_source 
  ON claim_files(source);

-- Add comment for documentation
COMMENT ON COLUMN claim_files.source IS 
  'Origin of file: upload, email_attachment, template, generated';