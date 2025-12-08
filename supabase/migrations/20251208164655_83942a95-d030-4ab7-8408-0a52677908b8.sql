-- Create adjusters table for centralized adjuster directory
CREATE TABLE public.adjusters (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  email text,
  phone text,
  company text,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.adjusters ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Staff and admins can manage adjusters"
ON public.adjusters
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

-- Add adjuster_id reference to claim_adjusters for linking to directory
ALTER TABLE public.claim_adjusters 
ADD COLUMN adjuster_id uuid REFERENCES public.adjusters(id);

-- Create index for faster lookups
CREATE INDEX idx_adjusters_company ON public.adjusters(company);
CREATE INDEX idx_adjusters_name ON public.adjusters(name);

-- Trigger for updated_at
CREATE TRIGGER update_adjusters_updated_at
BEFORE UPDATE ON public.adjusters
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();