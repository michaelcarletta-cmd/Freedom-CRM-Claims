-- Fix the settlement calculation formula
-- ACV = RCV - Recoverable Depreciation - Non-Recoverable Depreciation - Deductible
ALTER TABLE public.claim_settlements 
  DROP COLUMN total_settlement;

ALTER TABLE public.claim_settlements 
  ADD COLUMN total_settlement DECIMAL(12,2) GENERATED ALWAYS AS (
    replacement_cost_value - recoverable_depreciation - non_recoverable_depreciation - deductible
  ) STORED;