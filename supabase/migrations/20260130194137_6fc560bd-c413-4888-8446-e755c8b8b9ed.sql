-- Create user_licenses table for tracking multiple licenses per user
CREATE TABLE public.user_licenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  license_type TEXT NOT NULL DEFAULT 'Public Adjuster',
  license_number TEXT NOT NULL,
  license_state TEXT NOT NULL,
  issue_date DATE,
  expiration_date DATE,
  ce_credits_required INTEGER,
  ce_credits_completed INTEGER DEFAULT 0,
  ce_renewal_date DATE,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_licenses ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own licenses" 
ON public.user_licenses 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own licenses" 
ON public.user_licenses 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own licenses" 
ON public.user_licenses 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own licenses" 
ON public.user_licenses 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_user_licenses_user_id ON public.user_licenses(user_id);
CREATE INDEX idx_user_licenses_expiration ON public.user_licenses(expiration_date);

-- Create function to check for expiring licenses (used for notifications)
CREATE OR REPLACE FUNCTION public.get_expiring_licenses(p_user_id UUID, p_days_ahead INTEGER DEFAULT 60)
RETURNS TABLE (
  id UUID,
  license_type TEXT,
  license_number TEXT,
  license_state TEXT,
  expiration_date DATE,
  days_until_expiration INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ul.id,
    ul.license_type,
    ul.license_number,
    ul.license_state,
    ul.expiration_date,
    (ul.expiration_date - CURRENT_DATE)::INTEGER as days_until_expiration
  FROM public.user_licenses ul
  WHERE ul.user_id = p_user_id
    AND ul.is_active = true
    AND ul.expiration_date IS NOT NULL
    AND ul.expiration_date <= (CURRENT_DATE + p_days_ahead)
  ORDER BY ul.expiration_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;