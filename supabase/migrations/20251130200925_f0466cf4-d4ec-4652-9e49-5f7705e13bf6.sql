-- Create SMS messages table
CREATE TABLE public.sms_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  message_body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  direction TEXT NOT NULL DEFAULT 'outbound',
  twilio_sid TEXT,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;

-- Policy for admins and staff to view all SMS messages
CREATE POLICY "Admins and staff can view all SMS messages"
ON public.sms_messages
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

-- Policy for clients to view SMS for their claims
CREATE POLICY "Clients can view SMS for their claims"
ON public.sms_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.claims
    WHERE claims.id = sms_messages.claim_id
    AND claims.client_id = auth.uid()
  )
);

-- Policy for contractors to view SMS for assigned claims
CREATE POLICY "Contractors can view SMS for assigned claims"
ON public.sms_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.claim_contractors
    WHERE claim_contractors.claim_id = sms_messages.claim_id
    AND claim_contractors.contractor_id = auth.uid()
  )
);

-- Policy for admins and staff to insert SMS messages
CREATE POLICY "Admins and staff can send SMS messages"
ON public.sms_messages
FOR INSERT
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
  AND user_id = auth.uid()
);

-- Add trigger for updated_at
CREATE TRIGGER update_sms_messages_updated_at
BEFORE UPDATE ON public.sms_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX idx_sms_messages_claim_id ON public.sms_messages(claim_id);
CREATE INDEX idx_sms_messages_created_at ON public.sms_messages(created_at DESC);