-- Create automations table to store automation rules
CREATE TABLE public.automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL, -- 'status_change', 'scheduled', 'manual', 'webhook'
  trigger_config JSONB NOT NULL DEFAULT '{}', -- Configuration for the trigger
  actions JSONB NOT NULL DEFAULT '[]', -- Array of actions to perform
  conditions JSONB DEFAULT '{}', -- Optional conditions to check
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create automation_executions table to track automation runs
CREATE TABLE public.automation_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  claim_id UUID REFERENCES public.claims(id) ON DELETE SET NULL,
  trigger_data JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'success', 'failed'
  result JSONB DEFAULT '{}',
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;

-- RLS policies for automations
CREATE POLICY "Admins and staff can manage automations"
  ON public.automations
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'));

-- RLS policies for automation executions
CREATE POLICY "Admins and staff can view execution history"
  ON public.automation_executions
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'));

-- Create indexes for performance
CREATE INDEX idx_automations_trigger_type ON public.automations(trigger_type) WHERE is_active = true;
CREATE INDEX idx_automations_active ON public.automations(is_active);
CREATE INDEX idx_automation_executions_automation_id ON public.automation_executions(automation_id);
CREATE INDEX idx_automation_executions_claim_id ON public.automation_executions(claim_id);
CREATE INDEX idx_automation_executions_status ON public.automation_executions(status);

-- Create trigger to update updated_at
CREATE TRIGGER update_automations_updated_at
  BEFORE UPDATE ON public.automations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to trigger automations on claim status change
CREATE OR REPLACE FUNCTION public.trigger_status_change_automations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only proceed if status actually changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Insert execution records for all active status_change automations
    INSERT INTO public.automation_executions (automation_id, claim_id, trigger_data, status)
    SELECT 
      a.id,
      NEW.id,
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'claim_number', NEW.claim_number
      ),
      'pending'
    FROM public.automations a
    WHERE a.is_active = true
      AND a.trigger_type = 'status_change'
      AND (
        a.trigger_config->>'status' IS NULL 
        OR a.trigger_config->>'status' = NEW.status
      );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on claims table
CREATE TRIGGER trigger_automations_on_status_change
  AFTER UPDATE ON public.claims
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_status_change_automations();