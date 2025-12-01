-- Make claim_number optional since claims can be opened without all information
ALTER TABLE claims ALTER COLUMN claim_number DROP NOT NULL;