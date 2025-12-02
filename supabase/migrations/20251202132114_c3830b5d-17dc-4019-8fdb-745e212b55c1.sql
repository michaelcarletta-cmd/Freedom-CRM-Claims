-- Allow referrers to view their own record
CREATE POLICY "Referrers can view their own record"
ON public.referrers
FOR SELECT
USING (user_id = auth.uid());