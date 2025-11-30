-- Fix function search_path security issue
CREATE OR REPLACE FUNCTION create_predefined_folders()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.claim_folders (claim_id, name, is_predefined, display_order)
  VALUES 
    (NEW.id, 'Carrier Documents', true, 1),
    (NEW.id, 'Freedom Adjustment Documents', true, 2),
    (NEW.id, 'Invoicing', true, 3),
    (NEW.id, 'Certificate of Completion', true, 4),
    (NEW.id, 'Supporting Evidence', true, 5),
    (NEW.id, 'Mortgage Documents', true, 6);
  RETURN NEW;
END;
$$;