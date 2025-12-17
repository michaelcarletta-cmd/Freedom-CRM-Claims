-- Add target_workspace_id column to linked_workspaces
ALTER TABLE public.linked_workspaces
ADD COLUMN target_workspace_id uuid;