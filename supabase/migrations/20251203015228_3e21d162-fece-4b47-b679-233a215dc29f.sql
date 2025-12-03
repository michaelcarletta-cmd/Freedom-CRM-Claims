-- Add inspection_time column to inspections table
ALTER TABLE public.inspections ADD COLUMN inspection_time TIME;

-- Create trigger function for inspection scheduled automations
CREATE OR REPLACE FUNCTION public.trigger_inspection_scheduled_automations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only trigger on INSERT (new inspection scheduled)
  IF TG_OP = 'INSERT' THEN
    -- Insert execution records for all active inspection_scheduled automations
    INSERT INTO public.automation_executions (automation_id, claim_id, trigger_data, status)
    SELECT 
      a.id,
      NEW.claim_id,
      jsonb_build_object(
        'inspection_id', NEW.id,
        'inspection_date', NEW.inspection_date,
        'inspection_time', NEW.inspection_time,
        'inspection_type', NEW.inspection_type,
        'inspector_name', NEW.inspector_name,
        'notes', NEW.notes
      ),
      'pending'
    FROM public.automations a
    WHERE a.is_active = true
      AND a.trigger_type = 'inspection_scheduled';
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger on inspections table
CREATE TRIGGER trigger_inspection_scheduled
AFTER INSERT ON public.inspections
FOR EACH ROW
EXECUTE FUNCTION public.trigger_inspection_scheduled_automations();