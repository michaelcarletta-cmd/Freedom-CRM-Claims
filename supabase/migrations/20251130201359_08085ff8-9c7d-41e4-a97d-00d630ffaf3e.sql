-- Create insurance_companies table
CREATE TABLE public.insurance_companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create loss_types table
CREATE TABLE public.loss_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create referrers table
CREATE TABLE public.referrers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  email TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add new fields to claims table
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS policy_number TEXT;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS referrer_id UUID REFERENCES public.referrers(id);
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS insurance_company_id UUID REFERENCES public.insurance_companies(id);
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS loss_type_id UUID REFERENCES public.loss_types(id);

-- Enable RLS on new tables
ALTER TABLE public.insurance_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loss_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrers ENABLE ROW LEVEL SECURITY;

-- RLS policies for insurance_companies
CREATE POLICY "Anyone can view active insurance companies"
ON public.insurance_companies
FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage insurance companies"
ON public.insurance_companies
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for loss_types
CREATE POLICY "Anyone can view active loss types"
ON public.loss_types
FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage loss types"
ON public.loss_types
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for referrers
CREATE POLICY "Staff can view active referrers"
ON public.referrers
FOR SELECT
USING (is_active = true AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role)));

CREATE POLICY "Admins can manage referrers"
ON public.referrers
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add triggers for updated_at
CREATE TRIGGER update_insurance_companies_updated_at
BEFORE UPDATE ON public.insurance_companies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_loss_types_updated_at
BEFORE UPDATE ON public.loss_types
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_referrers_updated_at
BEFORE UPDATE ON public.referrers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert some default insurance companies
INSERT INTO public.insurance_companies (name) VALUES
  ('State Farm'),
  ('Allstate'),
  ('Progressive'),
  ('GEICO'),
  ('Farmers Insurance'),
  ('Liberty Mutual'),
  ('USAA'),
  ('Nationwide')
ON CONFLICT (name) DO NOTHING;

-- Insert some default loss types
INSERT INTO public.loss_types (name) VALUES
  ('Fire'),
  ('Water Damage'),
  ('Storm Damage'),
  ('Theft'),
  ('Vandalism'),
  ('Vehicle Collision'),
  ('Hail Damage'),
  ('Wind Damage'),
  ('Flood'),
  ('Other')
ON CONFLICT (name) DO NOTHING;