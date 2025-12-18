-- Create function to delete incomplete tasks and related notifications when claim is closed
CREATE OR REPLACE FUNCTION public.delete_tasks_on_claim_closed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only proceed if claim is being closed (is_closed changed to true OR status is Claim Settled/Dead File)
  IF (NEW.is_closed = true AND (OLD.is_closed IS NULL OR OLD.is_closed = false))
     OR (NEW.status IN ('Claim Settled', 'Dead File') AND (OLD.status IS NULL OR OLD.status NOT IN ('Claim Settled', 'Dead File'))) THEN
    
    -- Delete notifications linked to task_reminder updates for this claim
    DELETE FROM public.notifications
    WHERE update_id IN (
      SELECT id FROM public.claim_updates 
      WHERE claim_id = NEW.id 
      AND update_type = 'task_reminder'
    );
    
    -- Delete claim_updates with type task_reminder for this claim
    DELETE FROM public.claim_updates
    WHERE claim_id = NEW.id
    AND update_type = 'task_reminder';
    
    -- Delete all incomplete tasks for this claim
    DELETE FROM public.tasks
    WHERE claim_id = NEW.id
    AND status != 'completed';
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on claims table
DROP TRIGGER IF EXISTS trigger_delete_tasks_on_claim_closed ON public.claims;
CREATE TRIGGER trigger_delete_tasks_on_claim_closed
AFTER UPDATE ON public.claims
FOR EACH ROW
EXECUTE FUNCTION public.delete_tasks_on_claim_closed();

-- One-time cleanup: Delete incomplete tasks and notifications for already-closed claims
DELETE FROM public.notifications
WHERE update_id IN (
  SELECT cu.id FROM public.claim_updates cu
  JOIN public.claims c ON c.id = cu.claim_id
  WHERE cu.update_type = 'task_reminder'
  AND (c.is_closed = true OR c.status IN ('Claim Settled', 'Dead File'))
);

DELETE FROM public.claim_updates
WHERE update_type = 'task_reminder'
AND claim_id IN (
  SELECT id FROM public.claims
  WHERE is_closed = true OR status IN ('Claim Settled', 'Dead File')
);

DELETE FROM public.tasks
WHERE status != 'completed'
AND claim_id IN (
  SELECT id FROM public.claims
  WHERE is_closed = true OR status IN ('Claim Settled', 'Dead File')
);