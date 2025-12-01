-- Create a helper function to create claims with proper role checks
create or replace function public.create_claim_for_staff(
  p_claim_number text,
  p_policy_number text,
  p_policyholder_name text,
  p_policyholder_phone text,
  p_policyholder_email text,
  p_policyholder_address text,
  p_insurance_company_id uuid,
  p_insurance_phone text,
  p_insurance_email text,
  p_loss_type_id uuid,
  p_loss_date date,
  p_loss_description text,
  p_referrer_id uuid,
  p_client_id uuid
)
returns public.claims
language plpgsql
security definer
set search_path = public
as $$
declare
  new_claim public.claims;
begin
  -- Only allow staff or admins to use this helper
  if not (public.has_role(auth.uid(), 'staff') or public.has_role(auth.uid(), 'admin')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  insert into public.claims (
    claim_number,
    policy_number,
    policyholder_name,
    policyholder_phone,
    policyholder_email,
    policyholder_address,
    insurance_company_id,
    insurance_phone,
    insurance_email,
    loss_type_id,
    loss_date,
    loss_description,
    referrer_id,
    client_id,
    status
  ) values (
    p_claim_number,
    p_policy_number,
    p_policyholder_name,
    p_policyholder_phone,
    p_policyholder_email,
    p_policyholder_address,
    p_insurance_company_id,
    p_insurance_phone,
    p_insurance_email,
    p_loss_type_id,
    p_loss_date,
    p_loss_description,
    p_referrer_id,
    p_client_id,
    'open'
  )
  returning * into new_claim;

  return new_claim;
end;
$$;

-- No extra RLS needed here; the function runs with definer privileges and enforces its own role check.
