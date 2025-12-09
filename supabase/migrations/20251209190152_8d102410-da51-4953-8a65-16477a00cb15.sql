-- Create table to track linked claims between instances
CREATE TABLE public.linked_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  external_instance_url text NOT NULL,
  external_claim_id uuid,
  instance_name text NOT NULL,
  linked_at timestamp with time zone DEFAULT now(),
  last_synced_at timestamp with time zone,
  sync_status text DEFAULT 'pending',
  created_by uuid REFERENCES auth.users(id),
  UNIQUE(claim_id, external_instance_url)
);

-- Enable RLS
ALTER TABLE public.linked_claims ENABLE ROW LEVEL SECURITY;

-- Only admins and staff can manage linked claims
CREATE POLICY "Staff and admins can manage linked claims"
ON public.linked_claims
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

-- Create index for faster lookups
CREATE INDEX idx_linked_claims_claim_id ON public.linked_claims(claim_id);
CREATE INDEX idx_linked_claims_external ON public.linked_claims(external_instance_url, external_claim_id);