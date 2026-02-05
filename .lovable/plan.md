
# Multi-File Selection for Systematic Carrier Dismantler

## Overview
Upgrade the Systematic Carrier Dismantler to support selecting **multiple claim files** simultaneously, enabling Darwin to cross-reference carrier documents, detect contradictions, identify moving goalposts, and build a more comprehensive dismantling analysis.

---

## What Changes

### 1. Replace Single File Selector with Multi-File Selector
- Swap `ClaimFileSelector` for the existing `MultiClaimFileSelector` component
- Add checkboxes for selecting multiple carrier documents
- Include "Select All" and "Clear" actions for convenience

### 2. Update Analysis Logic
- Modify the component to track a `Set<string>` of selected file IDs instead of a single ID
- Download and concatenate all selected PDFs before sending to Darwin
- Pass combined content with clear document separation markers

### 3. Enhanced Edge Function Processing
- Update the `systematic_dismantling` prompt to expect multiple documents
- Instruct Darwin to cross-reference documents for:
  - Contradictions between carrier positions
  - Moving goalposts (new grounds introduced later)
  - Inconsistencies between engineer reports and adjuster determinations
  - Timeline violations

### 4. UI Improvements
- Show count of selected files
- Display selected file names in a summary before analysis
- Add guidance text suggesting which document types to combine

---

## User Experience

**Before:** Select one denial letter → Get analysis

**After:** 
1. Check multiple boxes: Denial Letter + Engineer Report + Adjuster Notes + Carrier Estimate
2. Click "Dismantle Carrier Position"
3. Darwin cross-references all documents to find contradictions, moving goalposts, and logical failures across the carrier's entire communication history

---

## Recommended File Combinations

| Scenario | Files to Select |
|----------|-----------------|
| **Initial Denial Rebuttal** | Denial letter + Policy dec page |
| **Engineer Report Challenge** | Engineer report + Original denial + Your contractor estimate |
| **Escalation Prep** | All carrier correspondence in chronological order |
| **Supplement Dispute** | Carrier estimate + Your supplement + Denial of supplement |

---

## Technical Details

### Files to Modify
1. **`src/components/claim-detail/DarwinSystematicDismantler.tsx`**
   - Replace `ClaimFileSelector` with `MultiClaimFileSelector`
   - Update state from `selectedClaimFileId: string | null` to `selectedClaimFileIds: Set<string>`
   - Modify `handleAnalyze` to download and combine multiple PDFs
   - Add file count display and summary

2. **`supabase/functions/darwin-ai-analysis/index.ts`**
   - Update `systematic_dismantling` case to handle multiple documents
   - Enhance prompt with cross-referencing instructions
   - Add document separation markers for clarity
