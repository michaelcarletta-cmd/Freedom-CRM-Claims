-- Drop the trigger first, then the function
DROP TRIGGER IF EXISTS auto_sync_on_contractor_assignment ON public.claim_contractors;
DROP FUNCTION IF EXISTS public.auto_sync_claim_to_contractor_instance() CASCADE;