-- Create table for storing Darwin AI analysis results
CREATE TABLE public.darwin_analysis_results (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  analysis_type text NOT NULL,
  input_summary text,
  result text NOT NULL,
  pdf_file_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.darwin_analysis_results ENABLE ROW LEVEL SECURITY;

-- Staff and admins can manage Darwin results
CREATE POLICY "Staff and admins can manage Darwin results"
ON public.darwin_analysis_results
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('admin', 'staff')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('admin', 'staff')
  )
);

-- Create index for faster lookups
CREATE INDEX idx_darwin_analysis_claim_type ON public.darwin_analysis_results(claim_id, analysis_type);