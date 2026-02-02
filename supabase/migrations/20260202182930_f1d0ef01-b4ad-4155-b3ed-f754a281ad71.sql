-- Allow clients to view their own client record
CREATE POLICY "Clients can view own record"
  ON public.clients
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());