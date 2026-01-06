-- Enable pgsodium extension for encryption (Supabase Vault uses this)
CREATE EXTENSION IF NOT EXISTS pgsodium;

-- Create user_sessions table for session management
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_token TEXT NOT NULL UNIQUE,
  device_info TEXT,
  ip_address TEXT,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  role_version INTEGER NOT NULL DEFAULT 1
);

-- Create index for faster lookups
CREATE INDEX idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX idx_user_sessions_token ON public.user_sessions(session_token);
CREATE INDEX idx_user_sessions_active ON public.user_sessions(user_id, is_active) WHERE is_active = true;

-- Enable RLS on user_sessions
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own sessions
CREATE POLICY "Users can view own sessions" ON public.user_sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users can update their own sessions (for activity tracking)
CREATE POLICY "Users can update own sessions" ON public.user_sessions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- Users can insert their own sessions
CREATE POLICY "Users can create own sessions" ON public.user_sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own sessions (logout)
CREATE POLICY "Users can delete own sessions" ON public.user_sessions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Create role_version_tracker table to track role changes
CREATE TABLE IF NOT EXISTS public.role_version_tracker (
  user_id UUID PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.role_version_tracker ENABLE ROW LEVEL SECURITY;

-- Only admins can modify, users can read their own
CREATE POLICY "Users can view own role version" ON public.role_version_tracker
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage role versions" ON public.role_version_tracker
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Function to increment role version when roles change
CREATE OR REPLACE FUNCTION public.increment_role_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.role_version_tracker (user_id, version, updated_at)
  VALUES (
    COALESCE(NEW.user_id, OLD.user_id),
    1,
    now()
  )
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    version = role_version_tracker.version + 1,
    updated_at = now();
  
  -- Invalidate all active sessions for this user
  UPDATE public.user_sessions 
  SET is_active = false 
  WHERE user_id = COALESCE(NEW.user_id, OLD.user_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger to track role changes
DROP TRIGGER IF EXISTS on_role_change ON public.user_roles;
CREATE TRIGGER on_role_change
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_role_version();

-- Function to register a new session (enforces single session)
CREATE OR REPLACE FUNCTION public.register_session(
  p_session_token TEXT,
  p_device_info TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id UUID;
  v_role_version INTEGER;
BEGIN
  -- Get current role version
  SELECT version INTO v_role_version
  FROM public.role_version_tracker
  WHERE user_id = auth.uid();
  
  IF v_role_version IS NULL THEN
    v_role_version := 1;
  END IF;
  
  -- Deactivate all existing sessions for this user (single session enforcement)
  UPDATE public.user_sessions 
  SET is_active = false 
  WHERE user_id = auth.uid() AND is_active = true;
  
  -- Create new session
  INSERT INTO public.user_sessions (
    user_id, 
    session_token, 
    device_info, 
    ip_address,
    role_version
  )
  VALUES (
    auth.uid(),
    p_session_token,
    p_device_info,
    p_ip_address,
    v_role_version
  )
  RETURNING id INTO v_session_id;
  
  RETURN v_session_id;
END;
$$;

-- Function to validate and refresh session
CREATE OR REPLACE FUNCTION public.validate_session(p_session_token TEXT)
RETURNS TABLE (
  is_valid BOOLEAN,
  reason TEXT,
  user_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_current_role_version INTEGER;
BEGIN
  -- Get session
  SELECT * INTO v_session
  FROM public.user_sessions s
  WHERE s.session_token = p_session_token
  AND s.is_active = true;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Session not found or inactive'::TEXT, NULL::UUID;
    RETURN;
  END IF;
  
  -- Check if session expired (24 hour timeout)
  IF v_session.expires_at < now() THEN
    UPDATE public.user_sessions SET is_active = false WHERE id = v_session.id;
    RETURN QUERY SELECT false, 'Session expired'::TEXT, v_session.user_id;
    RETURN;
  END IF;
  
  -- Check inactivity timeout (30 minutes)
  IF v_session.last_activity_at < (now() - interval '30 minutes') THEN
    UPDATE public.user_sessions SET is_active = false WHERE id = v_session.id;
    RETURN QUERY SELECT false, 'Session timed out due to inactivity'::TEXT, v_session.user_id;
    RETURN;
  END IF;
  
  -- Check if role changed
  SELECT version INTO v_current_role_version
  FROM public.role_version_tracker
  WHERE role_version_tracker.user_id = v_session.user_id;
  
  IF v_current_role_version IS NOT NULL AND v_current_role_version > v_session.role_version THEN
    UPDATE public.user_sessions SET is_active = false WHERE id = v_session.id;
    RETURN QUERY SELECT false, 'Role changed, please re-login'::TEXT, v_session.user_id;
    RETURN;
  END IF;
  
  -- Update last activity
  UPDATE public.user_sessions 
  SET last_activity_at = now()
  WHERE id = v_session.id;
  
  RETURN QUERY SELECT true, 'Valid'::TEXT, v_session.user_id;
END;
$$;

-- Function to logout (invalidate session)
CREATE OR REPLACE FUNCTION public.invalidate_session(p_session_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_sessions 
  SET is_active = false 
  WHERE session_token = p_session_token AND user_id = auth.uid();
  
  RETURN FOUND;
END;
$$;

-- Function to logout all sessions for a user (useful for password reset)
CREATE OR REPLACE FUNCTION public.invalidate_all_sessions(p_user_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_target_user_id UUID;
BEGIN
  -- If no user_id provided, use current user
  v_target_user_id := COALESCE(p_user_id, auth.uid());
  
  -- Only admins can invalidate other users' sessions
  IF p_user_id IS NOT NULL AND p_user_id != auth.uid() THEN
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Only admins can invalidate other users sessions';
    END IF;
  END IF;
  
  UPDATE public.user_sessions 
  SET is_active = false 
  WHERE user_id = v_target_user_id AND is_active = true;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Create encryption key storage table (for field-level encryption keys)
CREATE TABLE IF NOT EXISTS public.encryption_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_name TEXT NOT NULL UNIQUE,
  key_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Only admins can access encryption keys metadata
ALTER TABLE public.encryption_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view encryption keys" ON public.encryption_keys
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Function to encrypt sensitive data using pgsodium
CREATE OR REPLACE FUNCTION public.encrypt_pii(p_plaintext TEXT, p_key_name TEXT DEFAULT 'pii_key')
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key_id UUID;
  v_encrypted BYTEA;
  v_nonce BYTEA;
BEGIN
  IF p_plaintext IS NULL OR p_plaintext = '' THEN
    RETURN p_plaintext;
  END IF;
  
  -- Get the encryption key ID
  SELECT key_id INTO v_key_id
  FROM public.encryption_keys
  WHERE key_name = p_key_name AND is_active = true
  LIMIT 1;
  
  -- If no key exists, create one
  IF v_key_id IS NULL THEN
    v_key_id := pgsodium.create_key(name := p_key_name);
    INSERT INTO public.encryption_keys (key_name, key_id)
    VALUES (p_key_name, v_key_id);
  END IF;
  
  -- Generate a random nonce
  v_nonce := pgsodium.crypto_aead_det_noncegen();
  
  -- Encrypt the data
  v_encrypted := pgsodium.crypto_aead_det_encrypt(
    convert_to(p_plaintext, 'UTF8'),
    convert_to('', 'UTF8'),
    v_key_id,
    v_nonce
  );
  
  -- Return base64 encoded: nonce + ciphertext
  RETURN encode(v_nonce || v_encrypted, 'base64');
END;
$$;

-- Function to decrypt sensitive data
CREATE OR REPLACE FUNCTION public.decrypt_pii(p_ciphertext TEXT, p_key_name TEXT DEFAULT 'pii_key')
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key_id UUID;
  v_raw BYTEA;
  v_nonce BYTEA;
  v_encrypted BYTEA;
  v_decrypted BYTEA;
BEGIN
  IF p_ciphertext IS NULL OR p_ciphertext = '' THEN
    RETURN p_ciphertext;
  END IF;
  
  -- Get the encryption key ID
  SELECT key_id INTO v_key_id
  FROM public.encryption_keys
  WHERE key_name = p_key_name AND is_active = true
  LIMIT 1;
  
  IF v_key_id IS NULL THEN
    RAISE EXCEPTION 'Encryption key not found';
  END IF;
  
  -- Decode the base64
  v_raw := decode(p_ciphertext, 'base64');
  
  -- Extract nonce (first 24 bytes for XChaCha20-Poly1305)
  v_nonce := substring(v_raw from 1 for 24);
  v_encrypted := substring(v_raw from 25);
  
  -- Decrypt
  v_decrypted := pgsodium.crypto_aead_det_decrypt(
    v_encrypted,
    convert_to('', 'UTF8'),
    v_key_id,
    v_nonce
  );
  
  RETURN convert_from(v_decrypted, 'UTF8');
EXCEPTION
  WHEN OTHERS THEN
    -- Return masked value if decryption fails (data might be plaintext from before encryption)
    RETURN p_ciphertext;
END;
$$;