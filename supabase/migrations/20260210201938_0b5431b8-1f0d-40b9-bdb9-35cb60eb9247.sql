
-- Add AI pipeline columns to claim_home_inventory
ALTER TABLE public.claim_home_inventory
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS ai_confidence numeric,
  ADD COLUMN IF NOT EXISTS brand_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS model_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pricing_source text,
  ADD COLUMN IF NOT EXISTS pricing_rationale text,
  ADD COLUMN IF NOT EXISTS comparable_url text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS attributes jsonb,
  ADD COLUMN IF NOT EXISTS source_photo_id uuid REFERENCES public.claim_photos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS depreciation_rate numeric,
  ADD COLUMN IF NOT EXISTS age_years numeric;

-- Create inventory_scan_runs table
CREATE TABLE public.inventory_scan_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  photo_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  detected_count integer NOT NULL DEFAULT 0,
  confirmed_count integer NOT NULL DEFAULT 0,
  error_message text,
  results jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.inventory_scan_runs ENABLE ROW LEVEL SECURITY;

-- RLS policies for inventory_scan_runs (same pattern as other claim tables)
CREATE POLICY "Users can view scan runs" ON public.inventory_scan_runs
  FOR SELECT USING (true);

CREATE POLICY "Users can create scan runs" ON public.inventory_scan_runs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update scan runs" ON public.inventory_scan_runs
  FOR UPDATE USING (true);

CREATE POLICY "Users can delete scan runs" ON public.inventory_scan_runs
  FOR DELETE USING (true);
