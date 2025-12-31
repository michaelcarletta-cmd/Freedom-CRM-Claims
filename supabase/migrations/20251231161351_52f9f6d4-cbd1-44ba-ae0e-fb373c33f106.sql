-- Add target_sales_rep_id column to linked_workspaces table
-- This allows assigning a sales rep from the partner organization when syncing

ALTER TABLE public.linked_workspaces 
ADD COLUMN target_sales_rep_id uuid DEFAULT NULL;

-- Add target_sales_rep_name to store the name for display purposes
ALTER TABLE public.linked_workspaces 
ADD COLUMN target_sales_rep_name text DEFAULT NULL;

COMMENT ON COLUMN public.linked_workspaces.target_sales_rep_id IS 'The sales rep ID from the target/partner organization to assign synced claims to';
COMMENT ON COLUMN public.linked_workspaces.target_sales_rep_name IS 'Display name of the target sales rep for UI purposes';