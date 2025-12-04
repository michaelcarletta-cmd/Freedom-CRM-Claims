-- Create table for AI conversation messages
CREATE TABLE public.claim_ai_conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.claim_ai_conversations ENABLE ROW LEVEL SECURITY;

-- Staff and admins can manage AI conversations
CREATE POLICY "Staff can manage AI conversations"
ON public.claim_ai_conversations
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('admin', 'staff')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('admin', 'staff')
  )
);

-- Create index for faster lookups
CREATE INDEX idx_claim_ai_conversations_claim_id ON public.claim_ai_conversations(claim_id);
CREATE INDEX idx_claim_ai_conversations_created_at ON public.claim_ai_conversations(created_at);