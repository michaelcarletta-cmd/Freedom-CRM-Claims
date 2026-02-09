

## Replace Coverage Triggers Prompt

Replace the existing coverage triggers prompt in the `darwin-strategic-intelligence` edge function with your new, more rigorous prompt that enforces proper evidential sequencing (covered peril first, then repairability, then O&L only when supported).

### What Changes

**File:** `supabase/functions/darwin-strategic-intelligence/index.ts` (lines 577-611)

Replace the current `userPrompt` assignment in the `coverage_triggers` branch with the full new prompt you provided. This includes:

- A structured 4-step analysis sequence (confirm peril, evaluate repairability, then code/O&L, then denial rebuttal)
- 7 core trigger patterns (A through G) checked in order
- Hard rules preventing O&L from appearing as a primary trigger
- Evidence-grounding requirements ("supports," "indicates," "consistent with")
- Updated JSON return format with the same field names (trigger, coverage_opportunity, reasoning, confidence, action_required, potential_value)

### Why This Matters

The current prompt jumps too quickly to Ordinance & Law and full replacement without first establishing repairability failure. The new prompt enforces a logical chain: damage confirmed, then repair feasibility evaluated, then replacement justified, and only then code compliance costs considered.

### Technical Details

- Single edit in the edge function, replacing lines 577-611
- The JSON output schema remains the same field names, so no frontend changes are needed
- The `responseFormat = 'coverage_triggers'` line stays unchanged
- The edge function will be redeployed automatically after the change

