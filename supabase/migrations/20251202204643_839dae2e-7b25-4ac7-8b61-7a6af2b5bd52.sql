-- Fix queue_jobnimbus_sync function to handle tables without claim_id column
CREATE OR REPLACE FUNCTION public.queue_jobnimbus_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  contractor_record RECORD;
  target_claim_id uuid;
BEGIN
  -- Determine the claim_id based on the table being modified
  -- For claims table, use NEW.id; for other tables, use NEW.claim_id
  IF TG_TABLE_NAME = 'claims' THEN
    target_claim_id := COALESCE(NEW.id, OLD.id);
  ELSE
    target_claim_id := COALESCE(NEW.claim_id, OLD.claim_id);
  END IF;
  
  -- Skip if no claim_id found
  IF target_claim_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Find contractors assigned to this claim that have JobNimbus enabled
  FOR contractor_record IN 
    SELECT cc.contractor_id, p.jobnimbus_api_key
    FROM claim_contractors cc
    JOIN profiles p ON p.id = cc.contractor_id
    WHERE cc.claim_id = target_claim_id
    AND p.jobnimbus_enabled = true
    AND p.jobnimbus_api_key IS NOT NULL
  LOOP
    INSERT INTO jobnimbus_sync_queue (claim_id, contractor_id, sync_type, payload)
    VALUES (
      target_claim_id,
      contractor_record.contractor_id,
      TG_ARGV[0],
      jsonb_build_object('operation', TG_OP, 'data', row_to_json(NEW))
    );
  END LOOP;
  
  RETURN NEW;
END;
$function$;