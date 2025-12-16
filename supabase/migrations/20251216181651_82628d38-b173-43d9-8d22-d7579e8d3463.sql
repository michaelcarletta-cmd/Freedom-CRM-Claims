-- Create function to complete tasks when claim status is 'Claim Settled'
CREATE OR REPLACE FUNCTION public.complete_tasks_on_claim_settled()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only proceed if status changed to 'Claim Settled'
  IF NEW.status = 'Claim Settled' AND (OLD.status IS NULL OR OLD.status != 'Claim Settled') THEN
    -- Mark all pending/incomplete tasks for this claim as completed
    UPDATE public.tasks
    SET 
      status = 'completed',
      completed_at = NOW(),
      updated_at = NOW()
    WHERE claim_id = NEW.id
      AND status != 'completed';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to fire on claim status updates
CREATE TRIGGER complete_tasks_on_claim_settled_trigger
AFTER UPDATE OF status ON public.claims
FOR EACH ROW
EXECUTE FUNCTION public.complete_tasks_on_claim_settled();