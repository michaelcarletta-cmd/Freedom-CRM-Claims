-- Create SMS templates table
CREATE TABLE public.sms_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  description TEXT,
  category TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;

-- Staff can manage SMS templates
CREATE POLICY "Staff can manage SMS templates"
ON public.sms_templates FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

-- Authenticated users can view active templates
CREATE POLICY "Authenticated users can view active SMS templates"
ON public.sms_templates FOR SELECT
USING (is_active = true);

-- Add updated_at trigger
CREATE TRIGGER update_sms_templates_updated_at
BEFORE UPDATE ON public.sms_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default templates
INSERT INTO public.sms_templates (name, body, category, description) VALUES
('Appointment Reminder', 'Hi {claim.policyholder_name}, this is a reminder about your upcoming appointment on {inspection.date} at {inspection.time}. Please reply to confirm.', 'Reminders', 'Reminder for scheduled appointments'),
('Follow-up', 'Hi {claim.policyholder_name}, we wanted to follow up on your claim #{claim.claim_number}. Please contact us if you have any questions.', 'Follow-ups', 'General follow-up message'),
('Inspection Scheduled', 'Hi {claim.policyholder_name}, your inspection has been scheduled for {inspection.date} at {inspection.time}. Our inspector {inspection.inspector} will be there.', 'Notifications', 'Notification when inspection is scheduled'),
('Document Request', 'Hi {claim.policyholder_name}, we need additional documents for your claim #{claim.claim_number}. Please reply or call us at your earliest convenience.', 'Requests', 'Request for additional documents'),
('Claim Update', 'Hi {claim.policyholder_name}, there has been an update on your claim #{claim.claim_number}. Please log into your portal or contact us for details.', 'Updates', 'General claim status update');