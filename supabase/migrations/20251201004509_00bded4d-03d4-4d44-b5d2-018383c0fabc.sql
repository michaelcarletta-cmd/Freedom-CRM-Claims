-- Add recipients column to claim_updates to track who should be notified
ALTER TABLE public.claim_updates 
ADD COLUMN recipients jsonb DEFAULT '[]'::jsonb;

-- Create notifications table to track notification status per user
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  claim_id uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  update_id uuid NOT NULL REFERENCES public.claim_updates(id) ON DELETE CASCADE,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, update_id)
);

-- Enable RLS on notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view their own notifications"
ON public.notifications
FOR SELECT
USING (user_id = auth.uid());

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update their own notifications"
ON public.notifications
FOR UPDATE
USING (user_id = auth.uid());

-- Staff can create notifications
CREATE POLICY "Staff can create notifications"
ON public.notifications
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

-- Add index for performance
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_claim_id ON public.notifications(claim_id);
CREATE INDEX idx_notifications_is_read ON public.notifications(is_read);

-- Update RLS policy for claim_updates to allow portal users to create replies
DROP POLICY IF EXISTS "Authenticated users can create updates" ON public.claim_updates;

CREATE POLICY "Authenticated users can create updates"
ON public.claim_updates
FOR INSERT
WITH CHECK (
  user_id = auth.uid() AND (
    EXISTS (
      SELECT 1 FROM claims
      WHERE claims.id = claim_updates.claim_id
      AND (
        has_role(auth.uid(), 'admin'::app_role) OR
        has_role(auth.uid(), 'staff'::app_role) OR
        claims.client_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM claim_contractors
          WHERE claim_contractors.claim_id = claims.id
          AND claim_contractors.contractor_id = auth.uid()
        ) OR
        EXISTS (
          SELECT 1 FROM claims c
          WHERE c.id = claims.id
          AND c.referrer_id = auth.uid()
        )
      )
    )
  )
);