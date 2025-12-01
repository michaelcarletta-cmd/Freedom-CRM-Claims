-- Create emails table to log sent emails
CREATE TABLE IF NOT EXISTS public.emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  sent_by uuid REFERENCES auth.users(id),
  recipient_email text NOT NULL,
  recipient_name text,
  recipient_type text, -- 'policyholder', 'adjuster', 'contractor', 'referrer', 'other'
  subject text NOT NULL,
  body text NOT NULL,
  sent_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;

-- Staff can manage emails
CREATE POLICY "Staff can manage emails"
  ON public.emails
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

-- Users can view emails for their claims
CREATE POLICY "Users can view emails for accessible claims"
  ON public.emails
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM claims
      WHERE claims.id = emails.claim_id
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'staff'::app_role)
        OR EXISTS (
          SELECT 1 FROM clients
          WHERE clients.id = claims.client_id
          AND clients.user_id = auth.uid()
        )
        OR claims.referrer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM claim_contractors
          WHERE claim_contractors.claim_id = claims.id
          AND claim_contractors.contractor_id = auth.uid()
        )
      )
    )
  );

-- Create index for performance
CREATE INDEX idx_emails_claim_id ON public.emails(claim_id);
CREATE INDEX idx_emails_sent_at ON public.emails(sent_at DESC);