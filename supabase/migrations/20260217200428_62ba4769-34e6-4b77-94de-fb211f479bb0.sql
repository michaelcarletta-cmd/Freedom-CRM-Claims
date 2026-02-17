
-- Table to store user email connection credentials (IMAP)
CREATE TABLE public.email_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'outlook',
  email_address TEXT NOT NULL,
  imap_host TEXT NOT NULL DEFAULT 'outlook.office365.com',
  imap_port INTEGER NOT NULL DEFAULT 993,
  encrypted_password TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  last_sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, email_address)
);

-- Enable RLS
ALTER TABLE public.email_connections ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own connections
CREATE POLICY "Users can view their own connections"
  ON public.email_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own connections"
  ON public.email_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own connections"
  ON public.email_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own connections"
  ON public.email_connections FOR DELETE
  USING (auth.uid() = user_id);

-- Timestamp trigger
CREATE TRIGGER update_email_connections_updated_at
  BEFORE UPDATE ON public.email_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
