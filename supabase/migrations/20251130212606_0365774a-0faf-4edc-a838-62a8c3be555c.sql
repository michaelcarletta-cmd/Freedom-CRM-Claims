-- Create claim payments table
CREATE TABLE public.claim_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  payment_date date NOT NULL,
  amount numeric NOT NULL,
  payment_method text NOT NULL, -- 'check', 'direct_deposit', 'ach'
  check_number text,
  recipient_type text NOT NULL, -- 'client', 'contractor', 'referrer'
  recipient_id uuid, -- References profiles for contractor, referrers for referrer, null for client
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.claim_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins and staff can manage payments"
ON public.claim_payments
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

CREATE POLICY "Users can view payments for accessible claims"
ON public.claim_payments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM claims
    WHERE claims.id = claim_payments.claim_id
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'staff'::app_role)
      OR claims.client_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM claim_contractors
        WHERE claim_contractors.claim_id = claims.id
        AND claim_contractors.contractor_id = auth.uid()
      )
    )
  )
);

-- Create trigger for updated_at
CREATE TRIGGER update_claim_payments_updated_at
  BEFORE UPDATE ON public.claim_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();