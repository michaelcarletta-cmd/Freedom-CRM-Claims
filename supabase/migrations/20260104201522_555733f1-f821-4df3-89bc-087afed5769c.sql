-- Create table for assigning partner sales reps to specific claims
CREATE TABLE public.claim_partner_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  linked_workspace_id UUID NOT NULL REFERENCES public.linked_workspaces(id) ON DELETE CASCADE,
  sales_rep_id TEXT,
  sales_rep_name TEXT NOT NULL,
  sales_rep_email TEXT,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  assigned_by UUID REFERENCES auth.users(id),
  UNIQUE(claim_id, linked_workspace_id)
);

-- Enable RLS
ALTER TABLE public.claim_partner_assignments ENABLE ROW LEVEL SECURITY;

-- Policies for staff/admin access
CREATE POLICY "Staff can view claim partner assignments"
ON public.claim_partner_assignments
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff can insert claim partner assignments"
ON public.claim_partner_assignments
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff can update claim partner assignments"
ON public.claim_partner_assignments
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff can delete claim partner assignments"
ON public.claim_partner_assignments
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'));