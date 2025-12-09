-- Add external_instance_url to track which contractors belong to which external instance
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS external_instance_url text,
ADD COLUMN IF NOT EXISTS external_instance_name text;

-- Create a trigger function to auto-sync claims when contractors are assigned
CREATE OR REPLACE FUNCTION public.auto_sync_claim_to_contractor_instance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  contractor_instance_url text;
  contractor_instance_name text;
  existing_link uuid;
BEGIN
  -- Get the contractor's external instance URL
  SELECT external_instance_url, external_instance_name 
  INTO contractor_instance_url, contractor_instance_name
  FROM public.profiles 
  WHERE id = NEW.contractor_id;
  
  -- If contractor has an external instance configured
  IF contractor_instance_url IS NOT NULL THEN
    -- Check if link already exists
    SELECT id INTO existing_link
    FROM public.linked_claims
    WHERE claim_id = NEW.claim_id 
    AND external_instance_url = contractor_instance_url;
    
    -- Create link if it doesn't exist
    IF existing_link IS NULL THEN
      INSERT INTO public.linked_claims (
        claim_id,
        external_instance_url,
        instance_name,
        sync_status
      ) VALUES (
        NEW.claim_id,
        contractor_instance_url,
        contractor_instance_name,
        'pending'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS auto_sync_on_contractor_assignment ON public.claim_contractors;
CREATE TRIGGER auto_sync_on_contractor_assignment
  AFTER INSERT ON public.claim_contractors
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_sync_claim_to_contractor_instance();