-- Create claim statuses table for customizable workflow stages
CREATE TABLE public.claim_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color text DEFAULT '#3B82F6',
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.claim_statuses ENABLE ROW LEVEL SECURITY;

-- Anyone can view statuses
CREATE POLICY "Anyone can view claim statuses"
ON public.claim_statuses FOR SELECT
USING (is_active = true);

-- Only admins can manage statuses
CREATE POLICY "Admins can manage claim statuses"
ON public.claim_statuses FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Insert default statuses
INSERT INTO public.claim_statuses (name, color, display_order) VALUES
  ('Open', '#3B82F6', 1),
  ('In Progress', '#F59E0B', 2),
  ('Pending', '#8B5CF6', 3),
  ('Approved', '#10B981', 4),
  ('Closed', '#6B7280', 5);

-- Add trigger for updated_at
CREATE TRIGGER update_claim_statuses_updated_at
BEFORE UPDATE ON public.claim_statuses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();