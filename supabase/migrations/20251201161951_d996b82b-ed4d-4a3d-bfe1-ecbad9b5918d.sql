-- Add phone and email columns to insurance_companies table
ALTER TABLE insurance_companies
ADD COLUMN phone text,
ADD COLUMN email text;