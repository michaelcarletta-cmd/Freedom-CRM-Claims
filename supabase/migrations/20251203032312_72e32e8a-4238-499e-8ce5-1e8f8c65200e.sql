-- Update handle_new_user function to set pending status for staff signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_role text;
  approval_status_val text;
BEGIN
  -- Check if a role was specified in metadata
  user_role := NEW.raw_user_meta_data->>'role';
  
  -- Staff signups require approval, others are auto-approved
  IF user_role = 'staff' THEN
    approval_status_val := 'pending';
  ELSE
    approval_status_val := 'approved';
  END IF;
  
  -- Insert profile with approval status
  INSERT INTO public.profiles (id, email, full_name, approval_status)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', approval_status_val);
  
  -- Only assign role if one was specified
  IF user_role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, user_role::app_role);
  END IF;
  
  RETURN NEW;
END;
$function$;