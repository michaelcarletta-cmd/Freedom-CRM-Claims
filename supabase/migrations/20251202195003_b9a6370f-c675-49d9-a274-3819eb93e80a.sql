
-- Disable only user-defined triggers on claims
ALTER TABLE claims DISABLE TRIGGER USER;

-- Link claims to their newly created clients by matching policyholder_name
UPDATE claims c
SET client_id = cl.id
FROM clients cl
WHERE c.policyholder_name = cl.name
  AND c.client_id IS NULL;

-- Re-enable user triggers
ALTER TABLE claims ENABLE TRIGGER USER;
