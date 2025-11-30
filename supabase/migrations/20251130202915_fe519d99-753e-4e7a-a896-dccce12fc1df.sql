-- Create tasks table
CREATE TABLE public.tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  assigned_to UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT DEFAULT 'medium',
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- RLS policies for tasks
CREATE POLICY "Admins and staff can view all tasks"
ON public.tasks
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

CREATE POLICY "Users can view tasks assigned to them"
ON public.tasks
FOR SELECT
USING (assigned_to = auth.uid());

CREATE POLICY "Users can view tasks for their claims"
ON public.tasks
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.claims
    WHERE claims.id = tasks.claim_id
    AND claims.client_id = auth.uid()
  )
);

CREATE POLICY "Contractors can view tasks for assigned claims"
ON public.tasks
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.claim_contractors
    WHERE claim_contractors.claim_id = tasks.claim_id
    AND claim_contractors.contractor_id = auth.uid()
  )
);

CREATE POLICY "Admins and staff can manage tasks"
ON public.tasks
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_tasks_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_tasks_claim_id ON public.tasks(claim_id);
CREATE INDEX idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX idx_tasks_due_date ON public.tasks(due_date);
CREATE INDEX idx_tasks_status ON public.tasks(status);