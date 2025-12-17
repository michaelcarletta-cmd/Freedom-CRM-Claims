-- Organizations table (companies)
CREATE TABLE public.orgs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  domain text, -- Optional: for domain-based auto-join
  logo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Organization members (link users to orgs)
CREATE TABLE public.org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

-- Workspaces (shared project/case/client container)
CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  owner_org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Workspace members (which orgs have access to which workspaces)
CREATE TABLE public.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'collaborator' CHECK (role IN ('owner', 'collaborator', 'viewer')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'removed')),
  invited_by uuid REFERENCES auth.users(id),
  joined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, org_id)
);

-- Workspace invites (pending invitations)
CREATE TABLE public.workspace_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invited_org_id uuid REFERENCES public.orgs(id) ON DELETE CASCADE,
  invited_email text, -- Alternative: invite by email
  invited_domain text, -- Alternative: invite by domain
  role text NOT NULL DEFAULT 'collaborator',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  invited_by uuid REFERENCES auth.users(id),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add workspace_id to claims table
ALTER TABLE public.claims ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL;

-- Messaging: Threads tied to workspaces
CREATE TABLE public.workspace_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  claim_id uuid REFERENCES public.claims(id) ON DELETE CASCADE, -- Optional: tie to specific claim
  subject text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Messaging: Messages in threads
CREATE TABLE public.workspace_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.workspace_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- File comments for collaboration
CREATE TABLE public.file_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL REFERENCES public.claim_files(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Partner sales tracking (for partner org sales rep commissions)
CREATE TABLE public.org_sales_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  claim_id uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  sales_rep_id uuid REFERENCES auth.users(id),
  commission_percentage numeric DEFAULT 0,
  commission_amount numeric DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, claim_id)
);

-- Enable RLS on all new tables
ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_sales_commissions ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX idx_org_members_org_id ON public.org_members(org_id);
CREATE INDEX idx_org_members_user_id ON public.org_members(user_id);
CREATE INDEX idx_workspace_members_workspace_id ON public.workspace_members(workspace_id);
CREATE INDEX idx_workspace_members_org_id ON public.workspace_members(org_id);
CREATE INDEX idx_workspace_threads_workspace_id ON public.workspace_threads(workspace_id);
CREATE INDEX idx_claims_workspace_id ON public.claims(workspace_id);
CREATE INDEX idx_file_comments_file_id ON public.file_comments(file_id);

-- Helper function: Check if user is member of an org
CREATE OR REPLACE FUNCTION public.user_org_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.org_members WHERE user_id = _user_id LIMIT 1
$$;

-- Helper function: Check if user has access to workspace
CREATE OR REPLACE FUNCTION public.has_workspace_access(_user_id uuid, _workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.workspace_members wm
    JOIN public.org_members om ON om.org_id = wm.org_id
    WHERE wm.workspace_id = _workspace_id 
      AND om.user_id = _user_id
      AND wm.status = 'active'
  )
$$;

-- Helper function: Check if user is org admin/owner
CREATE OR REPLACE FUNCTION public.is_org_admin(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.org_members 
    WHERE org_id = _org_id 
      AND user_id = _user_id
      AND role IN ('owner', 'admin')
  )
$$;

-- RLS Policies for orgs
CREATE POLICY "Users can view orgs they belong to"
ON public.orgs FOR SELECT
USING (
  id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid())
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Org owners can update their org"
ON public.orgs FOR UPDATE
USING (is_org_admin(auth.uid(), id));

-- RLS Policies for org_members
CREATE POLICY "Users can view members of their org"
ON public.org_members FOR SELECT
USING (
  org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid())
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Org admins can manage members"
ON public.org_members FOR ALL
USING (is_org_admin(auth.uid(), org_id) OR has_role(auth.uid(), 'admin'))
WITH CHECK (is_org_admin(auth.uid(), org_id) OR has_role(auth.uid(), 'admin'));

-- RLS Policies for workspaces
CREATE POLICY "Users can view workspaces they have access to"
ON public.workspaces FOR SELECT
USING (has_workspace_access(auth.uid(), id) OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Org members can create workspaces"
ON public.workspaces FOR INSERT
WITH CHECK (
  owner_org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid())
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Workspace owners can update"
ON public.workspaces FOR UPDATE
USING (
  owner_org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
  OR has_role(auth.uid(), 'admin')
);

-- RLS Policies for workspace_members
CREATE POLICY "Users can view workspace members"
ON public.workspace_members FOR SELECT
USING (has_workspace_access(auth.uid(), workspace_id) OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Workspace owner org can manage members"
ON public.workspace_members FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.workspaces w
    JOIN public.org_members om ON om.org_id = w.owner_org_id
    WHERE w.id = workspace_id AND om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
  )
  OR has_role(auth.uid(), 'admin')
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.workspaces w
    JOIN public.org_members om ON om.org_id = w.owner_org_id
    WHERE w.id = workspace_id AND om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
  )
  OR has_role(auth.uid(), 'admin')
);

-- RLS Policies for workspace_invites
CREATE POLICY "Users can view invites to their org"
ON public.workspace_invites FOR SELECT
USING (
  invited_org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid())
  OR has_workspace_access(auth.uid(), workspace_id)
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Workspace owners can create invites"
ON public.workspace_invites FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.workspaces w
    JOIN public.org_members om ON om.org_id = w.owner_org_id
    WHERE w.id = workspace_id AND om.user_id = auth.uid()
  )
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Invited org can update invite status"
ON public.workspace_invites FOR UPDATE
USING (
  invited_org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
  OR has_role(auth.uid(), 'admin')
);

-- RLS Policies for workspace_threads
CREATE POLICY "Users can view threads in their workspaces"
ON public.workspace_threads FOR SELECT
USING (has_workspace_access(auth.uid(), workspace_id) OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create threads in their workspaces"
ON public.workspace_threads FOR INSERT
WITH CHECK (has_workspace_access(auth.uid(), workspace_id) OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Thread creators can update"
ON public.workspace_threads FOR UPDATE
USING (created_by = auth.uid() OR has_role(auth.uid(), 'admin'));

-- RLS Policies for workspace_messages
CREATE POLICY "Users can view messages in accessible threads"
ON public.workspace_messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_threads t
    WHERE t.id = thread_id AND has_workspace_access(auth.uid(), t.workspace_id)
  )
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Users can create messages in accessible threads"
ON public.workspace_messages FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.workspace_threads t
    WHERE t.id = thread_id AND has_workspace_access(auth.uid(), t.workspace_id)
  )
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Message senders can update their messages"
ON public.workspace_messages FOR UPDATE
USING (sender_id = auth.uid());

-- RLS Policies for file_comments
CREATE POLICY "Users can view comments on accessible files"
ON public.file_comments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.claim_files cf
    JOIN public.claims c ON c.id = cf.claim_id
    WHERE cf.id = file_id AND (
      has_workspace_access(auth.uid(), c.workspace_id)
      OR has_role(auth.uid(), 'admin')
      OR has_role(auth.uid(), 'staff')
    )
  )
);

CREATE POLICY "Users can create comments on accessible files"
ON public.file_comments FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.claim_files cf
    JOIN public.claims c ON c.id = cf.claim_id
    WHERE cf.id = file_id AND (
      has_workspace_access(auth.uid(), c.workspace_id)
      OR has_role(auth.uid(), 'admin')
      OR has_role(auth.uid(), 'staff')
    )
  )
);

CREATE POLICY "Users can delete their own comments"
ON public.file_comments FOR DELETE
USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

-- RLS Policies for org_sales_commissions
CREATE POLICY "Users can view their org's commissions"
ON public.org_sales_commissions FOR SELECT
USING (
  org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid())
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Org admins can manage commissions"
ON public.org_sales_commissions FOR ALL
USING (
  is_org_admin(auth.uid(), org_id)
  OR has_role(auth.uid(), 'admin')
)
WITH CHECK (
  is_org_admin(auth.uid(), org_id)
  OR has_role(auth.uid(), 'admin')
);

-- Triggers for updated_at
CREATE TRIGGER update_orgs_updated_at
BEFORE UPDATE ON public.orgs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_workspaces_updated_at
BEFORE UPDATE ON public.workspaces
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_workspace_threads_updated_at
BEFORE UPDATE ON public.workspace_threads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_workspace_messages_updated_at
BEFORE UPDATE ON public.workspace_messages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_org_sales_commissions_updated_at
BEFORE UPDATE ON public.org_sales_commissions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();