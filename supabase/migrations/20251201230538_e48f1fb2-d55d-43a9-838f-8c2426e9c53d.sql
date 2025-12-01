-- Add field_data column to signature_requests to store field positions and types
ALTER TABLE signature_requests 
ADD COLUMN field_data JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN signature_requests.field_data IS 'Stores field positions, types, and properties for signature placement';

-- Add field_values column to signature_signers to store the filled field data
ALTER TABLE signature_signers
ADD COLUMN field_values JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN signature_signers.field_values IS 'Stores the actual values entered by the signer for each field';
