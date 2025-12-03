-- Create function to update claim's updated_at timestamp
CREATE OR REPLACE FUNCTION public.touch_claim_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  target_claim_id uuid;
BEGIN
  -- Get the claim_id from the record
  IF TG_OP = 'DELETE' THEN
    target_claim_id := OLD.claim_id;
  ELSE
    target_claim_id := NEW.claim_id;
  END IF;
  
  -- Update the claim's updated_at timestamp
  IF target_claim_id IS NOT NULL THEN
    UPDATE claims SET updated_at = NOW() WHERE id = target_claim_id;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Create triggers on all related tables

-- Emails
DROP TRIGGER IF EXISTS touch_claim_on_email ON emails;
CREATE TRIGGER touch_claim_on_email
AFTER INSERT OR UPDATE OR DELETE ON emails
FOR EACH ROW EXECUTE FUNCTION touch_claim_updated_at();

-- Claim files
DROP TRIGGER IF EXISTS touch_claim_on_file ON claim_files;
CREATE TRIGGER touch_claim_on_file
AFTER INSERT OR UPDATE OR DELETE ON claim_files
FOR EACH ROW EXECUTE FUNCTION touch_claim_updated_at();

-- Claim photos
DROP TRIGGER IF EXISTS touch_claim_on_photo ON claim_photos;
CREATE TRIGGER touch_claim_on_photo
AFTER INSERT OR UPDATE OR DELETE ON claim_photos
FOR EACH ROW EXECUTE FUNCTION touch_claim_updated_at();

-- Claim updates (notes/communications)
DROP TRIGGER IF EXISTS touch_claim_on_update ON claim_updates;
CREATE TRIGGER touch_claim_on_update
AFTER INSERT OR UPDATE OR DELETE ON claim_updates
FOR EACH ROW EXECUTE FUNCTION touch_claim_updated_at();

-- Claim checks (accounting)
DROP TRIGGER IF EXISTS touch_claim_on_check ON claim_checks;
CREATE TRIGGER touch_claim_on_check
AFTER INSERT OR UPDATE OR DELETE ON claim_checks
FOR EACH ROW EXECUTE FUNCTION touch_claim_updated_at();

-- Claim expenses
DROP TRIGGER IF EXISTS touch_claim_on_expense ON claim_expenses;
CREATE TRIGGER touch_claim_on_expense
AFTER INSERT OR UPDATE OR DELETE ON claim_expenses
FOR EACH ROW EXECUTE FUNCTION touch_claim_updated_at();

-- Claim settlements
DROP TRIGGER IF EXISTS touch_claim_on_settlement ON claim_settlements;
CREATE TRIGGER touch_claim_on_settlement
AFTER INSERT OR UPDATE OR DELETE ON claim_settlements
FOR EACH ROW EXECUTE FUNCTION touch_claim_updated_at();

-- Claim fees
DROP TRIGGER IF EXISTS touch_claim_on_fee ON claim_fees;
CREATE TRIGGER touch_claim_on_fee
AFTER INSERT OR UPDATE OR DELETE ON claim_fees
FOR EACH ROW EXECUTE FUNCTION touch_claim_updated_at();

-- Claim payments
DROP TRIGGER IF EXISTS touch_claim_on_payment ON claim_payments;
CREATE TRIGGER touch_claim_on_payment
AFTER INSERT OR UPDATE OR DELETE ON claim_payments
FOR EACH ROW EXECUTE FUNCTION touch_claim_updated_at();

-- Inspections
DROP TRIGGER IF EXISTS touch_claim_on_inspection ON inspections;
CREATE TRIGGER touch_claim_on_inspection
AFTER INSERT OR UPDATE OR DELETE ON inspections
FOR EACH ROW EXECUTE FUNCTION touch_claim_updated_at();

-- Tasks
DROP TRIGGER IF EXISTS touch_claim_on_task ON tasks;
CREATE TRIGGER touch_claim_on_task
AFTER INSERT OR UPDATE OR DELETE ON tasks
FOR EACH ROW EXECUTE FUNCTION touch_claim_updated_at();

-- Signature requests
DROP TRIGGER IF EXISTS touch_claim_on_signature ON signature_requests;
CREATE TRIGGER touch_claim_on_signature
AFTER INSERT OR UPDATE OR DELETE ON signature_requests
FOR EACH ROW EXECUTE FUNCTION touch_claim_updated_at();

-- SMS messages
DROP TRIGGER IF EXISTS touch_claim_on_sms ON sms_messages;
CREATE TRIGGER touch_claim_on_sms
AFTER INSERT OR UPDATE OR DELETE ON sms_messages
FOR EACH ROW EXECUTE FUNCTION touch_claim_updated_at();

-- Claim contractors (portal assignments)
DROP TRIGGER IF EXISTS touch_claim_on_contractor ON claim_contractors;
CREATE TRIGGER touch_claim_on_contractor
AFTER INSERT OR UPDATE OR DELETE ON claim_contractors
FOR EACH ROW EXECUTE FUNCTION touch_claim_updated_at();

-- Claim staff assignments
DROP TRIGGER IF EXISTS touch_claim_on_staff ON claim_staff;
CREATE TRIGGER touch_claim_on_staff
AFTER INSERT OR UPDATE OR DELETE ON claim_staff
FOR EACH ROW EXECUTE FUNCTION touch_claim_updated_at();

-- Claim adjusters
DROP TRIGGER IF EXISTS touch_claim_on_adjuster ON claim_adjusters;
CREATE TRIGGER touch_claim_on_adjuster
AFTER INSERT OR UPDATE OR DELETE ON claim_adjusters
FOR EACH ROW EXECUTE FUNCTION touch_claim_updated_at();

-- Claim custom field values
DROP TRIGGER IF EXISTS touch_claim_on_custom_field ON claim_custom_field_values;
CREATE TRIGGER touch_claim_on_custom_field
AFTER INSERT OR UPDATE OR DELETE ON claim_custom_field_values
FOR EACH ROW EXECUTE FUNCTION touch_claim_updated_at();