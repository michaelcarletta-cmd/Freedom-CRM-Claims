-- 1. Create audit_logs table (append-only)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  record_type text NOT NULL,
  record_id text,
  old_values jsonb,
  new_values jsonb,
  ip_address text,
  user_agent text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record_type ON public.audit_logs(record_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);

-- Enable RLS on audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only allow INSERT (append-only) - no UPDATE or DELETE
CREATE POLICY "audit_logs_insert_only" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Only admins can read audit logs
CREATE POLICY "audit_logs_admin_read" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. Create security definer function for audit logging
CREATE OR REPLACE FUNCTION public.log_audit(
  p_action text,
  p_record_type text,
  p_record_id text DEFAULT NULL,
  p_old_values jsonb DEFAULT NULL,
  p_new_values jsonb DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  log_id uuid;
BEGIN
  INSERT INTO public.audit_logs (
    user_id,
    action,
    record_type,
    record_id,
    old_values,
    new_values,
    metadata
  ) VALUES (
    auth.uid(),
    p_action,
    p_record_type,
    p_record_id,
    p_old_values,
    p_new_values,
    p_metadata
  )
  RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$;

-- 3. Create function to check if user is read_only
CREATE OR REPLACE FUNCTION public.is_read_only(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'read_only'::app_role
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'staff')
  )
$$;

-- 4. Create permissions check function
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role app_role;
BEGIN
  -- Get highest role (admin > staff > read_only)
  SELECT role INTO user_role
  FROM public.user_roles
  WHERE user_id = _user_id
  ORDER BY 
    CASE role 
      WHEN 'admin' THEN 1 
      WHEN 'staff' THEN 2 
      WHEN 'read_only' THEN 3 
    END
  LIMIT 1;
  
  IF user_role IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Permission matrix
  CASE _permission
    WHEN 'read' THEN
      RETURN user_role IN ('admin', 'staff', 'read_only');
    WHEN 'create' THEN
      RETURN user_role IN ('admin', 'staff');
    WHEN 'update' THEN
      RETURN user_role IN ('admin', 'staff');
    WHEN 'delete' THEN
      RETURN user_role IN ('admin', 'staff');
    WHEN 'export' THEN
      RETURN user_role IN ('admin', 'staff');
    WHEN 'reveal_pii' THEN
      RETURN user_role IN ('admin', 'staff', 'read_only');
    WHEN 'manage_users' THEN
      RETURN user_role = 'admin';
    WHEN 'view_audit_logs' THEN
      RETURN user_role = 'admin';
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$;

-- 5. Create pii_reveal_logs table for tracking when users reveal masked data
CREATE TABLE IF NOT EXISTS public.pii_reveal_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL,
  field_name text NOT NULL,
  record_type text NOT NULL,
  record_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pii_reveal_logs_user_id ON public.pii_reveal_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_pii_reveal_logs_created_at ON public.pii_reveal_logs(created_at DESC);

ALTER TABLE public.pii_reveal_logs ENABLE ROW LEVEL SECURITY;

-- Allow inserts for logging
CREATE POLICY "pii_reveal_logs_insert" ON public.pii_reveal_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Only admins can read reveal logs
CREATE POLICY "pii_reveal_logs_admin_read" ON public.pii_reveal_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));