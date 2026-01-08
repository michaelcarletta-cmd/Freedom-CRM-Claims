-- Add RLS policies for contractors to manage photos on claims they're assigned to

-- Contractors can view photos on their assigned claims
CREATE POLICY "Contractors can view photos on assigned claims"
ON public.claim_photos
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM claim_contractors cc
    WHERE cc.claim_id = claim_photos.claim_id
    AND cc.contractor_id = auth.uid()
  )
);

-- Contractors can insert photos on their assigned claims
CREATE POLICY "Contractors can insert photos on assigned claims"
ON public.claim_photos
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM claim_contractors cc
    WHERE cc.claim_id = claim_photos.claim_id
    AND cc.contractor_id = auth.uid()
  )
);

-- Contractors can update photos they uploaded on their assigned claims
CREATE POLICY "Contractors can update photos on assigned claims"
ON public.claim_photos
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM claim_contractors cc
    WHERE cc.claim_id = claim_photos.claim_id
    AND cc.contractor_id = auth.uid()
  )
  AND uploaded_by = auth.uid()
);