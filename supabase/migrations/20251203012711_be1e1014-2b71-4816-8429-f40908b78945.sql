-- Create trigger function to handle task completion automations
CREATE OR REPLACE FUNCTION public.trigger_task_completed_automations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only proceed if task was just marked as completed
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Insert execution records for all active task_completed automations
    INSERT INTO public.automation_executions (automation_id, claim_id, trigger_data, status)
    SELECT 
      a.id,
      NEW.claim_id,
      jsonb_build_object(
        'task_id', NEW.id,
        'task_title', NEW.title,
        'task_description', NEW.description,
        'completed_at', NEW.completed_at
      ),
      'pending'
    FROM public.automations a
    WHERE a.is_active = true
      AND a.trigger_type = 'task_completed'
      AND (
        a.trigger_config->>'task_title_pattern' IS NULL 
        OR a.trigger_config->>'task_title_pattern' = ''
        OR NEW.title ILIKE '%' || (a.trigger_config->>'task_title_pattern') || '%'
      );
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger on tasks table
DROP TRIGGER IF EXISTS on_task_completed ON public.tasks;
CREATE TRIGGER on_task_completed
  AFTER UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_task_completed_automations();