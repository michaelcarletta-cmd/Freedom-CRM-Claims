-- Drop the incorrect foreign key constraint that points to auth.users
ALTER TABLE claims DROP CONSTRAINT IF EXISTS claims_client_id_fkey;

-- Add the correct foreign key constraint that points to clients table
ALTER TABLE claims 
ADD CONSTRAINT claims_client_id_fkey 
FOREIGN KEY (client_id) 
REFERENCES public.clients(id) 
ON DELETE SET NULL;