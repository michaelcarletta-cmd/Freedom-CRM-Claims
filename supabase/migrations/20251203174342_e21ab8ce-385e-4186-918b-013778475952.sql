-- Create claim_photos table for photo management
CREATE TABLE public.claim_photos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  category TEXT DEFAULT 'General',
  description TEXT,
  annotations JSONB,
  annotated_file_path TEXT,
  before_after_type TEXT CHECK (before_after_type IN ('before', 'after', NULL)),
  before_after_pair_id UUID,
  taken_at TIMESTAMP WITH TIME ZONE,
  uploaded_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.claim_photos ENABLE ROW LEVEL SECURITY;

-- RLS policies for staff/admin
CREATE POLICY "Staff and admins can view photos on assigned claims"
ON public.claim_photos FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR
  (public.has_role(auth.uid(), 'staff') AND EXISTS (
    SELECT 1 FROM public.claim_staff WHERE claim_id = claim_photos.claim_id AND staff_id = auth.uid()
  ))
);

CREATE POLICY "Staff and admins can insert photos"
ON public.claim_photos FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR
  (public.has_role(auth.uid(), 'staff') AND EXISTS (
    SELECT 1 FROM public.claim_staff WHERE claim_id = claim_photos.claim_id AND staff_id = auth.uid()
  ))
);

CREATE POLICY "Staff and admins can update photos"
ON public.claim_photos FOR UPDATE
USING (
  public.has_role(auth.uid(), 'admin') OR
  (public.has_role(auth.uid(), 'staff') AND EXISTS (
    SELECT 1 FROM public.claim_staff WHERE claim_id = claim_photos.claim_id AND staff_id = auth.uid()
  ))
);

CREATE POLICY "Staff and admins can delete photos"
ON public.claim_photos FOR DELETE
USING (
  public.has_role(auth.uid(), 'admin') OR
  (public.has_role(auth.uid(), 'staff') AND EXISTS (
    SELECT 1 FROM public.claim_staff WHERE claim_id = claim_photos.claim_id AND staff_id = auth.uid()
  ))
);

-- Portal user access (view only)
CREATE POLICY "Clients can view photos on their claims"
ON public.claim_photos FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.clients c
    JOIN public.claims cl ON cl.client_id = c.id
    WHERE cl.id = claim_photos.claim_id AND c.user_id = auth.uid()
  )
);

CREATE POLICY "Referrers can view photos on their claims"
ON public.claim_photos FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.referrers r
    JOIN public.claims cl ON cl.referrer_id = r.id
    WHERE cl.id = claim_photos.claim_id AND r.user_id = auth.uid()
  )
);

-- Create trigger for updated_at
CREATE TRIGGER update_claim_photos_updated_at
BEFORE UPDATE ON public.claim_photos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for performance
CREATE INDEX idx_claim_photos_claim_id ON public.claim_photos(claim_id);
CREATE INDEX idx_claim_photos_category ON public.claim_photos(category);
CREATE INDEX idx_claim_photos_before_after_pair ON public.claim_photos(before_after_pair_id);