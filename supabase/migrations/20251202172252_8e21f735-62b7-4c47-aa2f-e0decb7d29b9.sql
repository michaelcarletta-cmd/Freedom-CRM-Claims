-- Add JobNimbus integration fields to contractors/profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS jobnimbus_api_key text,
ADD COLUMN IF NOT EXISTS jobnimbus_enabled boolean DEFAULT false;

-- Add JobNimbus job tracking to claims
ALTER TABLE public.claims 
ADD COLUMN IF NOT EXISTS jobnimbus_job_id text;

-- Create sync queue for automatic syncing
CREATE TABLE IF NOT EXISTS public.jobnimbus_sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid REFERENCES public.claims(id) ON DELETE CASCADE,
  contractor_id uuid NOT NULL,
  sync_type text NOT NULL, -- 'claim', 'file', 'note', 'task', 'status'
  payload jsonb,
  status text DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  error_message text,
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz
);

-- Enable RLS
ALTER TABLE public.jobnimbus_sync_queue ENABLE ROW LEVEL SECURITY;

-- Only admins and staff can view sync queue
CREATE POLICY "Admins and staff can view sync queue"
ON public.jobnimbus_sync_queue FOR SELECT
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'));

-- Only system can manage sync queue (via service role)
CREATE POLICY "Service role can manage sync queue"
ON public.jobnimbus_sync_queue FOR ALL
USING (auth.uid() IS NULL);

-- Function to queue JobNimbus sync
CREATE OR REPLACE FUNCTION public.queue_jobnimbus_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  contractor_record RECORD;
BEGIN
  -- Find contractors assigned to this claim that have JobNimbus enabled
  FOR contractor_record IN 
    SELECT cc.contractor_id, p.jobnimbus_api_key
    FROM claim_contractors cc
    JOIN profiles p ON p.id = cc.contractor_id
    WHERE cc.claim_id = COALESCE(NEW.id, NEW.claim_id, OLD.claim_id)
    AND p.jobnimbus_enabled = true
    AND p.jobnimbus_api_key IS NOT NULL
  LOOP
    INSERT INTO jobnimbus_sync_queue (claim_id, contractor_id, sync_type, payload)
    VALUES (
      COALESCE(NEW.id, NEW.claim_id, OLD.claim_id),
      contractor_record.contractor_id,
      TG_ARGV[0],
      jsonb_build_object('operation', TG_OP, 'data', row_to_json(NEW))
    );
  END LOOP;
  
  RETURN NEW;
END;
$$;

-- Triggers for automatic sync
CREATE TRIGGER queue_jobnimbus_claim_sync
AFTER INSERT OR UPDATE ON public.claims
FOR EACH ROW
EXECUTE FUNCTION queue_jobnimbus_sync('claim');

CREATE TRIGGER queue_jobnimbus_task_sync
AFTER INSERT OR UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION queue_jobnimbus_sync('task');

CREATE TRIGGER queue_jobnimbus_note_sync
AFTER INSERT ON public.claim_updates
FOR EACH ROW
EXECUTE FUNCTION queue_jobnimbus_sync('note');

CREATE TRIGGER queue_jobnimbus_file_sync
AFTER INSERT ON public.claim_files
FOR EACH ROW
EXECUTE FUNCTION queue_jobnimbus_sync('file');