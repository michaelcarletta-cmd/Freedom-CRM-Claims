-- Add stripe_account_id columns to store Stripe Connect account IDs

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS stripe_account_id text;

ALTER TABLE public.referrers 
ADD COLUMN IF NOT EXISTS stripe_account_id text;

ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS stripe_account_id text;

-- Add comments for clarity
COMMENT ON COLUMN public.profiles.stripe_account_id IS 'Stripe Connect account ID for contractors receiving payments';
COMMENT ON COLUMN public.referrers.stripe_account_id IS 'Stripe Connect account ID for referrers receiving payments';
COMMENT ON COLUMN public.clients.stripe_account_id IS 'Stripe Connect account ID for clients/homeowners receiving payments';