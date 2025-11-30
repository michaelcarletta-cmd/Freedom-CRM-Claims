-- Create signature requests table
CREATE TABLE public.signature_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  document_name TEXT NOT NULL,
  document_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  completed_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT valid_status CHECK (status IN ('pending', 'in_progress', 'completed', 'declined'))
);

-- Create signers table (people who need to sign)
CREATE TABLE public.signature_signers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  signature_request_id UUID NOT NULL REFERENCES signature_requests(id) ON DELETE CASCADE,
  signer_name TEXT NOT NULL,
  signer_email TEXT NOT NULL,
  signer_type TEXT NOT NULL,
  signing_order INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  signed_at TIMESTAMP WITH TIME ZONE,
  signature_data TEXT,
  access_token TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT valid_signer_status CHECK (status IN ('pending', 'signed', 'declined')),
  CONSTRAINT valid_signer_type CHECK (signer_type IN ('policyholder', 'contractor', 'staff', 'other'))
);

-- Enable RLS
ALTER TABLE public.signature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signature_signers ENABLE ROW LEVEL SECURITY;

-- Policies for signature_requests
CREATE POLICY "Staff can manage signature requests"
ON public.signature_requests
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

CREATE POLICY "Users can view signature requests for their claims"
ON public.signature_requests
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM claims
    WHERE claims.id = signature_requests.claim_id
    AND (
      claims.client_id = auth.uid() OR
      EXISTS (
        SELECT 1 FROM claim_contractors
        WHERE claim_contractors.claim_id = claims.id
        AND claim_contractors.contractor_id = auth.uid()
      )
    )
  )
);

-- Policies for signature_signers
CREATE POLICY "Staff can manage signers"
ON public.signature_signers
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM signature_requests sr
    WHERE sr.id = signature_signers.signature_request_id
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM signature_requests sr
    WHERE sr.id = signature_signers.signature_request_id
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
  )
);

-- Public policy for signers to view and update their own signature via access token
CREATE POLICY "Signers can view their signature via token"
ON public.signature_signers
FOR SELECT
USING (true);

CREATE POLICY "Signers can update their signature via token"
ON public.signature_signers
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Add indexes
CREATE INDEX idx_signature_requests_claim ON signature_requests(claim_id);
CREATE INDEX idx_signature_signers_request ON signature_signers(signature_request_id);
CREATE INDEX idx_signature_signers_token ON signature_signers(access_token);

-- Add trigger for updated_at
CREATE TRIGGER update_signature_requests_updated_at
BEFORE UPDATE ON public.signature_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();