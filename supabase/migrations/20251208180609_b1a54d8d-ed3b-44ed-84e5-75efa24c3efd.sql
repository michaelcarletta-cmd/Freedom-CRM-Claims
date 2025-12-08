-- Add Other Structures and PWI (Personal & Watercraft Items) columns to claim_settlements
ALTER TABLE public.claim_settlements
ADD COLUMN other_structures_rcv numeric DEFAULT 0,
ADD COLUMN other_structures_recoverable_depreciation numeric DEFAULT 0,
ADD COLUMN other_structures_non_recoverable_depreciation numeric DEFAULT 0,
ADD COLUMN other_structures_deductible numeric DEFAULT 0,
ADD COLUMN pwi_rcv numeric DEFAULT 0,
ADD COLUMN pwi_recoverable_depreciation numeric DEFAULT 0,
ADD COLUMN pwi_non_recoverable_depreciation numeric DEFAULT 0,
ADD COLUMN pwi_deductible numeric DEFAULT 0;