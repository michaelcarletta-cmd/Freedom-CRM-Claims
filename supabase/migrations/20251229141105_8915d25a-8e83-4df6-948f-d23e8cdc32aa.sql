-- Add automation settings to company_branding table
ALTER TABLE public.company_branding
ADD COLUMN IF NOT EXISTS automation_exclude_statuses text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS automation_exclude_claims_older_than_days integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS automations_enabled boolean DEFAULT true;