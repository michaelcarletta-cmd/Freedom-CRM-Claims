-- Create company_branding table for letterhead and company info
CREATE TABLE public.company_branding (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT,
  company_address TEXT,
  company_phone TEXT,
  company_email TEXT,
  letterhead_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.company_branding ENABLE ROW LEVEL SECURITY;

-- Allow staff and admin to read branding
CREATE POLICY "Staff and admin can read company branding" 
ON public.company_branding 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'staff')
  )
);

-- Only admin can modify branding
CREATE POLICY "Admin can insert company branding" 
ON public.company_branding 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

CREATE POLICY "Admin can update company branding" 
ON public.company_branding 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

-- Create storage bucket for company branding assets
INSERT INTO storage.buckets (id, name, public) VALUES ('company-branding', 'company-branding', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to read branding files
CREATE POLICY "Anyone can read company branding files" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'company-branding');

-- Allow admin to upload branding files
CREATE POLICY "Admin can upload company branding files" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'company-branding' 
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

CREATE POLICY "Admin can update company branding files" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'company-branding' 
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

CREATE POLICY "Admin can delete company branding files" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'company-branding' 
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);