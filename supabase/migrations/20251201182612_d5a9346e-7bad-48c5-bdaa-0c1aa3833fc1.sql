-- Add user_id column to clients table to link clients to their auth accounts
ALTER TABLE public.clients
ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Update RLS policy for claims so clients can view their claims through the clients table link
DROP POLICY IF EXISTS "Clients can view their claims" ON public.claims;

CREATE POLICY "Clients can view their claims"
ON public.claims
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = claims.client_id
    AND clients.user_id = auth.uid()
  )
);

-- Update RLS for claim_files so clients can access files through clients table
DROP POLICY IF EXISTS "Users can view files for accessible claims" ON public.claim_files;

CREATE POLICY "Users can view files for accessible claims"
ON public.claim_files
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.claims
    WHERE claims.id = claim_files.claim_id
    AND (
      has_role(auth.uid(), 'admin'::app_role) 
      OR has_role(auth.uid(), 'staff'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.clients
        WHERE clients.id = claims.client_id
        AND clients.user_id = auth.uid()
      )
      OR claims.referrer_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.claim_contractors
        WHERE claim_contractors.claim_id = claims.id
        AND claim_contractors.contractor_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.claim_staff
        WHERE claim_staff.claim_id = claims.id
        AND claim_staff.staff_id = auth.uid()
      )
    )
  )
);

-- Update other related policies
DROP POLICY IF EXISTS "Users can view tasks for accessible claims" ON public.tasks;

CREATE POLICY "Users can view tasks for accessible claims"
ON public.tasks
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.claims
    WHERE claims.id = tasks.claim_id
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'staff'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.clients
        WHERE clients.id = claims.client_id
        AND clients.user_id = auth.uid()
      )
      OR claims.referrer_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.claim_contractors
        WHERE claim_contractors.claim_id = claims.id
        AND claim_contractors.contractor_id = auth.uid()
      )
      OR tasks.assigned_to = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Users can view updates for accessible claims" ON public.claim_updates;

CREATE POLICY "Users can view updates for accessible claims"
ON public.claim_updates
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.claims
    WHERE claims.id = claim_updates.claim_id
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'staff'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.clients
        WHERE clients.id = claims.client_id
        AND clients.user_id = auth.uid()
      )
      OR claims.referrer_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.claim_contractors
        WHERE claim_contractors.claim_id = claims.id
        AND claim_contractors.contractor_id = auth.uid()
      )
    )
  )
);