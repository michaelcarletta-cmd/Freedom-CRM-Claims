-- Add "AI Assistant Reports" folder to existing claims
INSERT INTO public.claim_folders (claim_id, name, is_predefined, display_order)
SELECT id, 'AI Assistant Reports', true, 7
FROM public.claims
WHERE NOT EXISTS (
  SELECT 1 FROM public.claim_folders 
  WHERE claim_folders.claim_id = claims.id 
  AND claim_folders.name = 'AI Assistant Reports'
);

-- Update the function to include the new folder for new claims
CREATE OR REPLACE FUNCTION public.create_predefined_folders()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.claim_folders (claim_id, name, is_predefined, display_order)
  VALUES 
    (NEW.id, 'Carrier Documents', true, 1),
    (NEW.id, 'Freedom Adjustment Documents', true, 2),
    (NEW.id, 'Invoicing', true, 3),
    (NEW.id, 'Certificate of Completion', true, 4),
    (NEW.id, 'Supporting Evidence', true, 5),
    (NEW.id, 'Mortgage Documents', true, 6),
    (NEW.id, 'AI Assistant Reports', true, 7);
  RETURN NEW;
END;
$$;