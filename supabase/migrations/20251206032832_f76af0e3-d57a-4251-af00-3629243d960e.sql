-- Create notification preferences table
CREATE TABLE public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  in_app_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT true,
  sms_enabled boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can view and manage their own preferences
CREATE POLICY "Users can view own preferences"
ON public.notification_preferences
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
ON public.notification_preferences
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
ON public.notification_preferences
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_notification_preferences_updated_at
BEFORE UPDATE ON public.notification_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to get or create preferences for a user
CREATE OR REPLACE FUNCTION public.get_or_create_notification_preferences(p_user_id uuid)
RETURNS public.notification_preferences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefs public.notification_preferences;
BEGIN
  SELECT * INTO prefs FROM public.notification_preferences WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    INSERT INTO public.notification_preferences (user_id)
    VALUES (p_user_id)
    RETURNING * INTO prefs;
  END IF;
  
  RETURN prefs;
END;
$$;