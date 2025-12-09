-- Enable pg_net extension for making HTTP requests from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Update the trigger function to call the sync endpoint
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
  new_link_id uuid;
  supabase_url text;
  service_key text;
BEGIN
  -- Get Supabase URL for calling edge function
  supabase_url := current_setting('app.settings.supabase_url', true);
  IF supabase_url IS NULL THEN
    supabase_url := 'https://tnnzihuszaosnyeyceed.supabase.co';
  END IF;
  
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
        'syncing'
      )
      RETURNING id INTO new_link_id;
      
      -- Trigger async sync via pg_net
      PERFORM extensions.http_post(
        url := supabase_url || '/functions/v1/sync-claim-to-external',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRubnppaHVzemFvc255ZXljZWVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MjY5MzcsImV4cCI6MjA4MDEwMjkzN30.nRKFbwq274l-Hodd5drZoveyXImdg7HYQwFiuijaI6I'
        ),
        body := jsonb_build_object(
          'claim_id', NEW.claim_id,
          'target_instance_url', contractor_instance_url,
          'instance_name', contractor_instance_name,
          'include_accounting', true
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;