-- Create mortgage companies table
CREATE TABLE public.mortgage_companies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mortgage_companies ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage mortgage companies"
ON public.mortgage_companies
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can view active mortgage companies"
ON public.mortgage_companies
FOR SELECT
USING (is_active = true AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role)));

-- Add mortgage company to claims
ALTER TABLE public.claims
ADD COLUMN mortgage_company_id uuid REFERENCES public.mortgage_companies(id);

-- Create trigger for updated_at
CREATE TRIGGER update_mortgage_companies_updated_at
  BEFORE UPDATE ON public.mortgage_companies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();