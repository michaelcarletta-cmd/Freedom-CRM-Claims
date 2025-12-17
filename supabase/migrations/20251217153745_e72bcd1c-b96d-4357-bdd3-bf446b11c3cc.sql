-- Update storage policies for workspace-based access
-- Drop existing policies that might conflict
DROP POLICY IF EXISTS "Users can upload claim files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view claim files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete claim files" ON storage.objects;

-- Create new workspace-aware storage policies for claim-files bucket
CREATE POLICY "Workspace members can view claim files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'claim-files' AND (
    -- Admin access
    has_role(auth.uid(), 'admin') OR
    -- Staff access
    has_role(auth.uid(), 'staff') OR
    -- Workspace member access - check if user's org has access to the workspace
    EXISTS (
      SELECT 1 FROM public.claims c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      JOIN public.org_members om ON om.org_id = wm.org_id
      WHERE c.id::text = (storage.foldername(name))[1]
        AND om.user_id = auth.uid()
        AND wm.status = 'active'
    ) OR
    -- Client portal access (existing)
    EXISTS (
      SELECT 1 FROM public.claims c
      JOIN public.clients cl ON cl.id = c.client_id
      WHERE c.id::text = (storage.foldername(name))[1]
        AND cl.user_id = auth.uid()
    ) OR
    -- Contractor access (existing)
    EXISTS (
      SELECT 1 FROM public.claims c
      JOIN public.claim_contractors cc ON cc.claim_id = c.id
      WHERE c.id::text = (storage.foldername(name))[1]
        AND cc.contractor_id = auth.uid()
    )
  )
);

CREATE POLICY "Workspace members can upload claim files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'claim-files' AND (
    -- Admin access
    has_role(auth.uid(), 'admin') OR
    -- Staff access
    has_role(auth.uid(), 'staff') OR
    -- Workspace collaborator access (not viewers)
    EXISTS (
      SELECT 1 FROM public.claims c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      JOIN public.org_members om ON om.org_id = wm.org_id
      WHERE c.id::text = (storage.foldername(name))[1]
        AND om.user_id = auth.uid()
        AND wm.status = 'active'
        AND wm.role IN ('owner', 'collaborator')
    ) OR
    -- Client portal access (existing)
    EXISTS (
      SELECT 1 FROM public.claims c
      JOIN public.clients cl ON cl.id = c.client_id
      WHERE c.id::text = (storage.foldername(name))[1]
        AND cl.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Admins and workspace owners can delete claim files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'claim-files' AND (
    -- Admin access
    has_role(auth.uid(), 'admin') OR
    -- Staff access
    has_role(auth.uid(), 'staff') OR
    -- Workspace owner org can delete
    EXISTS (
      SELECT 1 FROM public.claims c
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.org_members om ON om.org_id = w.owner_org_id
      WHERE c.id::text = (storage.foldername(name))[1]
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  )
);