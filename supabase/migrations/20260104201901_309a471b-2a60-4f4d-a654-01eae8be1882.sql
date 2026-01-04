-- Add columns to claims table for partner-assigned user (from synced claims)
ALTER TABLE public.claims 
ADD COLUMN IF NOT EXISTS partner_assigned_user_id uuid,
ADD COLUMN IF NOT EXISTS partner_assigned_user_email text,
ADD COLUMN IF NOT EXISTS partner_assigned_user_name text;

-- Add index for faster lookups when filtering by partner-assigned user
CREATE INDEX IF NOT EXISTS idx_claims_partner_assigned_user_id ON public.claims(partner_assigned_user_id);

-- Comment on columns for documentation
COMMENT ON COLUMN public.claims.partner_assigned_user_id IS 'User ID of the sales rep assigned from a partner instance';
COMMENT ON COLUMN public.claims.partner_assigned_user_email IS 'Email of the sales rep assigned from a partner instance';
COMMENT ON COLUMN public.claims.partner_assigned_user_name IS 'Name of the sales rep assigned from a partner instance';