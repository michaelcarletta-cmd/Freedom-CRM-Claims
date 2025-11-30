-- Update the handle_new_user function to also assign a default role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Insert profile
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  
  -- Assign default role as 'staff'
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'staff'::app_role);
  
  RETURN NEW;
END;
$$;