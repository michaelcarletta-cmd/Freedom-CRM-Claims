-- Create claim_staff table to track staff assignments
CREATE TABLE public.claim_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(claim_id, staff_id)
);

-- Enable RLS
ALTER TABLE public.claim_staff ENABLE ROW LEVEL SECURITY;

-- Admins and staff can view all assignments
CREATE POLICY "Staff can view claim assignments"
ON public.claim_staff
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'staff')
);

-- Admins can manage staff assignments
CREATE POLICY "Admins can manage staff assignments"
ON public.claim_staff
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Update claims RLS to include staff assignments
DROP POLICY IF EXISTS "Admins and staff can view all claims" ON public.claims;

CREATE POLICY "Admins can view all claims"
ON public.claims
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff can view assigned claims"
ON public.claims
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'staff') AND (
    EXISTS (
      SELECT 1 FROM public.claim_staff
      WHERE claim_staff.claim_id = claims.id
      AND claim_staff.staff_id = auth.uid()
    )
  )
);

-- Update the insert/update/delete policies for claims
DROP POLICY IF EXISTS "Admins and staff can manage claims" ON public.claims;

CREATE POLICY "Admins can manage all claims"
ON public.claims
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff can manage assigned claims"
ON public.claims
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'staff') AND (
    EXISTS (
      SELECT 1 FROM public.claim_staff
      WHERE claim_staff.claim_id = claims.id
      AND claim_staff.staff_id = auth.uid()
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'staff') AND (
    EXISTS (
      SELECT 1 FROM public.claim_staff
      WHERE claim_staff.claim_id = claims.id
      AND claim_staff.staff_id = auth.uid()
    )
  )
);

CREATE POLICY "Staff can create claims"
ON public.claims
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'staff') OR has_role(auth.uid(), 'admin'));