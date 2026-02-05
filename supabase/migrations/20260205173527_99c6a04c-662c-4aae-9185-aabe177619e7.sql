CREATE OR REPLACE FUNCTION public.search_claims_by_proximity(target_lat double precision, target_lng double precision, radius_miles double precision DEFAULT 5, target_insurance_company text DEFAULT NULL::text, exclude_claim_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(claim_id uuid, claim_number text, policyholder_name text, policyholder_address text, insurance_company text, loss_type text, loss_date date, status text, is_closed boolean, distance_miles double precision, claim_amount numeric, settlement_notes text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    c.id as claim_id,
    c.claim_number,
    c.policyholder_name,
    c.policyholder_address,
    c.insurance_company,
    c.loss_type,
    c.loss_date,
    c.status,
    c.is_closed,
    -- Haversine formula for distance in miles
    (3959 * acos(
      cos(radians(target_lat)) * cos(radians(c.latitude)) * 
      cos(radians(c.longitude) - radians(target_lng)) + 
      sin(radians(target_lat)) * sin(radians(c.latitude))
    )) as distance_miles,
    c.claim_amount,
    c.loss_description as settlement_notes
  FROM claims c
  WHERE c.latitude IS NOT NULL 
    AND c.longitude IS NOT NULL
    AND (exclude_claim_id IS NULL OR c.id != exclude_claim_id)
    AND (target_insurance_company IS NULL OR lower(c.insurance_company) LIKE '%' || lower(target_insurance_company) || '%')
    AND (3959 * acos(
      cos(radians(target_lat)) * cos(radians(c.latitude)) * 
      cos(radians(c.longitude) - radians(target_lng)) + 
      sin(radians(target_lat)) * sin(radians(c.latitude))
    )) <= radius_miles
  ORDER BY distance_miles ASC
  LIMIT 20;
END;
$function$;