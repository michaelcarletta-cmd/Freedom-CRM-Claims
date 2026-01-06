-- Update RLS policies on claims to respect read_only role
DROP POLICY IF EXISTS "Staff and admins can view claims" ON public.claims;
DROP POLICY IF EXISTS "Authenticated users with roles can view claims" ON public.claims;
CREATE POLICY "Authenticated users with roles can view claims" ON public.claims
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'staff') OR 
    public.has_role(auth.uid(), 'read_only')
  );

-- Read-only users cannot insert
DROP POLICY IF EXISTS "Staff and admins can insert claims" ON public.claims;
CREATE POLICY "Staff and admins can insert claims" ON public.claims
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'staff')
  );

-- Read-only users cannot update
DROP POLICY IF EXISTS "Staff and admins can update claims" ON public.claims;
CREATE POLICY "Staff and admins can update claims" ON public.claims
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'staff')
  );

-- Read-only users cannot delete
DROP POLICY IF EXISTS "Staff and admins can delete claims" ON public.claims;
CREATE POLICY "Staff and admins can delete claims" ON public.claims
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'staff')
  );

-- Update RLS policies on clients table
DROP POLICY IF EXISTS "Staff and admins can view clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users with roles can view clients" ON public.clients;
CREATE POLICY "Authenticated users with roles can view clients" ON public.clients
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'staff') OR 
    public.has_role(auth.uid(), 'read_only')
  );

DROP POLICY IF EXISTS "Staff and admins can insert clients" ON public.clients;
CREATE POLICY "Staff and admins can insert clients" ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'staff')
  );

DROP POLICY IF EXISTS "Staff and admins can update clients" ON public.clients;
CREATE POLICY "Staff and admins can update clients" ON public.clients
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'staff')
  );

DROP POLICY IF EXISTS "Staff and admins can delete clients" ON public.clients;
CREATE POLICY "Staff and admins can delete clients" ON public.clients
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'staff')
  );