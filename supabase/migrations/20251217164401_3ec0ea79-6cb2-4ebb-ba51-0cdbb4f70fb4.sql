-- Create linked_workspaces table for cross-instance workspace sharing
CREATE TABLE public.linked_workspaces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  external_instance_url TEXT NOT NULL,
  instance_name TEXT NOT NULL,
  sync_secret TEXT NOT NULL,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  sync_status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(workspace_id, external_instance_url)
);

-- Enable RLS
ALTER TABLE public.linked_workspaces ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Workspace owners can manage linked workspaces"
ON public.linked_workspaces
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM workspaces w
    JOIN org_members om ON om.org_id = w.owner_org_id
    WHERE w.id = linked_workspaces.workspace_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM workspaces w
    JOIN org_members om ON om.org_id = w.owner_org_id
    WHERE w.id = linked_workspaces.workspace_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin')
  )
);

CREATE POLICY "Workspace members can view linked workspaces"
ON public.linked_workspaces
FOR SELECT
USING (
  public.has_workspace_access(auth.uid(), workspace_id)
);