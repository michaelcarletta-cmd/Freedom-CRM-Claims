-- Create claim_adjusters table for multiple adjusters per claim
CREATE TABLE public.claim_adjusters (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  adjuster_name text NOT NULL,
  adjuster_email text,
  adjuster_phone text,
  company text,
  is_primary boolean DEFAULT false,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid
);

-- Enable RLS
ALTER TABLE public.claim_adjusters ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins and staff can manage adjusters"
ON public.claim_adjusters
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

CREATE POLICY "Users can view adjusters for accessible claims"
ON public.claim_adjusters
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM claims
  WHERE claims.id = claim_adjusters.claim_id
  AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'staff'::app_role) OR
    (EXISTS (SELECT 1 FROM clients WHERE clients.id = claims.client_id AND clients.user_id = auth.uid())) OR
    (EXISTS (SELECT 1 FROM referrers WHERE referrers.id = claims.referrer_id AND referrers.user_id = auth.uid())) OR
    (EXISTS (SELECT 1 FROM claim_contractors WHERE claim_contractors.claim_id = claims.id AND claim_contractors.contractor_id = auth.uid()))
  )
));

-- Migrate existing adjuster data from claims table
INSERT INTO public.claim_adjusters (claim_id, adjuster_name, adjuster_email, adjuster_phone, company, is_primary)
SELECT id, adjuster_name, adjuster_email, adjuster_phone, insurance_company, true
FROM public.claims
WHERE adjuster_name IS NOT NULL AND adjuster_name != '';