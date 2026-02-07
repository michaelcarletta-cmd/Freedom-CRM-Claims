

# Darwin Declared Position Protocol

## Overview
This plan adds a mandatory reasoning discipline layer to Darwin's output pipeline. Before any carrier-facing content is generated, Darwin must lock a **Declared Position** consisting of three fields and a carrier dependency statement. This enforces structured thinking, prevents hedging on strong evidence, and ensures outputs follow a strict coverage-before-scope order.

## What Changes

### 1. Database: New `darwin_declared_positions` Table
A new table to store the locked position for each claim, acting as the single source of truth for all subsequent outputs.

**Columns:**
- `id` (uuid, primary key)
- `claim_id` (text, references claims)
- `primary_cause_of_loss` (text) -- e.g., "Wind-driven rain intrusion"
- `primary_coverage_theory` (text) -- e.g., "Direct physical loss from covered peril per Section I"
- `primary_carrier_error` (text) -- e.g., "Carrier misapplied maintenance exclusion to storm damage"
- `carrier_dependency_statement` (text) -- "For the carrier's conclusion to be correct, the damage would need to result from ___ rather than ___"
- `confidence_level` (text) -- "high", "medium", "low"
- `reasoning_complete` (boolean, default false)
- `position_locked` (boolean, default false)
- `risk_flags` (text array) -- populated when provisional
- `missing_inputs` (text array) -- what's needed to lock
- `created_by` (uuid)
- `created_at`, `updated_at` (timestamps)

### 2. Frontend: Declared Position Card (New Component)
A new `DarwinDeclaredPosition.tsx` component placed at the top of the Darwin Copilot hub, above all rebuttal tools.

**Behavior:**
- Shows current position status (Locked / Provisional / Not Set)
- Displays the three required fields + carrier dependency
- If position is not locked, shows a yellow warning banner: "Position must be declared before generating carrier-facing outputs"
- Provides a form to manually set or edit the position fields
- "Auto-Detect Position" button that invokes Darwin AI to infer the position from claim context, returning structured JSON
- Visual indicator: green lock icon when locked, yellow warning when provisional, red alert when missing

### 3. Frontend: Gate on Rebuttal Tools
The following components will check for a locked position before allowing generation:
- `DarwinDenialAnalyzer` (denial_rebuttal)
- `DarwinAutoDraftRebuttal` (auto_draft_rebuttal)
- `DarwinSystematicDismantler` (systematic_dismantling)
- `DarwinCarrierEmailDrafter` (carrier_email_draft)
- `DarwinEngineerReportAnalyzer` (engineer_report_rebuttal)

**Gate logic:**
- If no position exists or `position_locked = false`: show warning banner with link to set position. Allow generation only with an explicit "Proceed Without Position (Provisional)" override that adds risk flags to the output.
- If position exists and locked: inject the position fields into the AI request as `additionalContext.declaredPosition`.

### 4. Edge Function: Prompt Enforcement Rules
Update the `darwin-ai-analysis` edge function for all carrier-facing analysis types to inject new prompt sections:

**a) Declared Position Injection:**
When `additionalContext.declaredPosition` is present, prepend to user prompt:
```
=== DECLARED POSITION (LOCKED) ===
Primary Cause of Loss: [value]
Primary Coverage Theory: [value]  
Primary Carrier Error: [value]
Carrier Dependency: [value]

ALL output must align with this declared position. Do not contradict or deviate.
```

**b) Output Order Enforcement (added to system prompts):**
```
=== MANDATORY OUTPUT ORDER ===
1. Cause of Loss
2. Coverage Grant / Exclusion Analysis  
3. Carrier Error
4. THEN scope, quantities, pricing, O&P, code upgrades

If you reference scope or cost before establishing coverage, the output is INVALID.
```

**c) Qualifying Language Rules (added to system prompts):**
```
=== LANGUAGE CONFIDENCE RULES ===
- For law/rights/bad faith/statute statements: Cautious, qualifying language is acceptable
- For cause of loss/material behavior/observed damage/weather: Use CONFIDENT, DECLARATIVE language when evidence exists
- WRONG: "It appears the damage may be consistent with wind"
- RIGHT: "The damage pattern is consistent with wind uplift based on observed creasing and directional displacement"
- If confidence is HIGH and evidence supports the conclusion: DO NOT HEDGE. Commit to the position.
```

**d) Carrier Dependency Requirement (added to system prompts):**
```
=== CARRIER DEPENDENCY ANALYSIS (MANDATORY) ===
Every rebuttal MUST include a section that states:
"For the carrier's conclusion to be correct, [carrier dependency statement]"
Then systematically attack each dependency with evidence.
If you cannot articulate the carrier's dependency, flag the output as INCOMPLETE.
```

**e) Single Thesis Rule (added to system prompts):**
```
=== SINGLE THESIS RULE ===
Your output must have exactly ONE primary thesis stated in one clear sentence.
All "alternatively" or "even if" arguments must come AFTER the primary argument is fully presented.
```

**f) Reasoning Completeness Check (added to system prompts):**
```
=== REASONING COMPLETENESS CHECK ===
Before finalizing output, verify:
- Declared Position is referenced
- Carrier Dependency is identified and attacked
- Primary argument is fully presented
- At least one anticipated carrier pushback is addressed
If any are missing, append a "COMPLETENESS WARNING" section listing what's missing.
```

### 5. New Analysis Type: `position_detection`
Add a new analysis type to auto-detect the declared position from claim context (files, photos, description). Returns structured JSON with the three fields + confidence levels + any missing inputs.

## Technical Details

### Files to Create
- `src/components/claim-detail/DarwinDeclaredPosition.tsx` -- Position management UI

### Files to Modify
- `supabase/functions/darwin-ai-analysis/index.ts` -- Add position_detection type, inject position into all carrier-facing prompts, add enforcement rules to system prompts
- `src/components/claim-detail/DarwinDenialAnalyzer.tsx` -- Add position gate
- `src/components/claim-detail/DarwinAutoDraftRebuttal.tsx` -- Add position gate
- `src/components/claim-detail/DarwinSystematicDismantler.tsx` -- Add position gate
- `src/components/claim-detail/DarwinCarrierEmailDrafter.tsx` -- Add position gate
- `src/components/claim-detail/DarwinEngineerReportAnalyzer.tsx` -- Add position gate
- `src/components/claim-detail/DarwinTab.tsx` -- Add DarwinDeclaredPosition at top of Rebuttals section

### Database Migration
One new table `darwin_declared_positions` with RLS policies restricting to authenticated users who own the claim.

