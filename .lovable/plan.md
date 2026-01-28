
# Strategic Darwin Enhancement Plan
## Building the Claims Strategist System (All 4 Capabilities)

---

## Executive Summary

This plan transforms Darwin from an administrative tool into a **Claims Strategist** that forms opinions, learns from outcomes, and provides context-aware guidance. We'll build four integrated capabilities:

1. **Enhanced Second Brain Mode** - Deep policy contradiction detection and proactive interrupts
2. **Claim War Room** - Unified strategic command center view
3. **Learning System Loop** - Automated feedback capturing what wins claims
4. **Carrier Behavior Modeling** - Predictive carrier analysis with playbooks

---

## Current State Analysis

### What's Already Built
- `DarwinInsightsPanel.tsx` - Strategic insights display with health scores
- `DarwinInlineNudges.tsx` - Basic contextual warnings from `claim_warnings_log`
- `darwin-strategic-intelligence` edge function - AI analysis engine
- Database tables: `claim_outcomes`, `carrier_behavior_profiles`, `evidence_effectiveness`, `claim_strategic_insights`, `claim_warnings_log`
- `VisualClaimTimeline.tsx` - Event timeline (tasks, inspections, emails, payments)

### What's Missing
- **Second Brain**: No policy analysis, no deep contradiction detection
- **War Room**: No unified strategic view combining timeline + docs + leverage
- **Learning Loop**: Tables exist but no automated feedback capture
- **Carrier Modeling**: Table exists but no UI, no playbooks, no predictions

---

## Phase 1: Enhanced Second Brain Mode

### Concept
Darwin watches everything and interrupts **only when it matters** - like having a senior PA in your head.

### New Components

#### 1. `DarwinSecondBrain.tsx`
A floating overlay that monitors user actions and provides contextual interventions:
- Watches document uploads for missing attachments
- Monitors email composition for risky phrasing
- Detects when users are about to submit incomplete packages
- Flags contradictions between claim data and carrier documents

#### 2. Policy Contradiction Detection
Enhance `darwin-strategic-intelligence` to:
- Parse uploaded policy documents for coverage limits and exclusions
- Compare denial letters against actual policy language
- Flag when carrier cites inapplicable exclusions
- Output: "This denial contradicts page 14 of the policy - exclusion X doesn't apply because..."

#### 3. Context-Aware Nudge System
Upgrade `DarwinInlineNudges.tsx`:
- Track user's current action context (composing email, building package, etc.)
- Show relevant warnings based on what they're doing
- Provide "You've won similar claims by..." suggestions

### Database Changes
```sql
-- Track user action context for smarter nudges
ALTER TABLE claim_warnings_log 
  ADD COLUMN trigger_context TEXT,
  ADD COLUMN action_recommendation TEXT,
  ADD COLUMN precedent_claim_ids UUID[];

-- Store policy analysis results
CREATE TABLE claim_policy_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID REFERENCES claims(id) ON DELETE CASCADE,
  policy_file_id UUID REFERENCES claim_files(id),
  coverage_limits JSONB,
  exclusions JSONB,
  special_conditions JSONB,
  contradictions_found JSONB,
  analyzed_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Phase 2: Claim War Room

### Concept
A single strategic command center showing the complete claim battlefield: timeline, documents, leverage, and position.

### New Component: `ClaimWarRoom.tsx`

A full-screen or modal view with 4 quadrants:

```text
┌────────────────────────────────┬────────────────────────────────┐
│      CAUSALITY TIMELINE        │       STRATEGIC POSITION       │
│  (What happened → What they    │   - Health Score Dashboard     │
│   did → What that violates)    │   - Leverage Points            │
│                                │   - Risk Indicators            │
├────────────────────────────────┼────────────────────────────────┤
│      EVIDENCE ARSENAL          │       BATTLE PLAYBOOK          │
│  - Documents by strength       │   - Recommended moves          │
│  - Missing items flagged       │   - Carrier-specific tactics   │
│  - Photo evidence matrix       │   - Deadline weapons           │
└────────────────────────────────┴────────────────────────────────┘
```

### Features
1. **Causality Timeline** - Not just events, but cause-and-effect chains:
   - "Storm (7/15) → Roof damage → Carrier delay 21 days → Prompt pay violation"
   
2. **Evidence Scoring** - Visual strength indicators:
   - Strong evidence (green)
   - Weak evidence (yellow) 
   - Missing critical evidence (red)
   
3. **Leverage Dashboard**:
   - Deadline violations tracker
   - Bad faith risk indicators
   - Settlement gap analysis

4. **One-Click Actions**:
   - "Generate demand based on this leverage"
   - "Draft escalation letter"
   - "Build supplement package"

---

## Phase 3: Learning System Loop

### Concept
When claims close, capture what worked and feed it back into future recommendations.

### Automated Outcome Capture

#### 1. Claim Closure Workflow Enhancement
When a claim is marked "Settled" or "Closed":
- Prompt for outcome data (settlement vs. estimate, days to resolution)
- Auto-detect key events (supplements submitted, arguments made)
- Store in `claim_outcomes` table

#### 2. New Component: `ClaimOutcomeCapture.tsx`
Modal that appears on claim closure:
- Final settlement amount
- Which arguments moved the carrier?
- Which evidence was most effective?
- What would you do differently?
- Tags for searchability

#### 3. Database Trigger for Auto-Capture
```sql
CREATE OR REPLACE FUNCTION capture_claim_outcome()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'Claim Settled' AND OLD.status != 'Claim Settled' THEN
    INSERT INTO claim_outcomes (
      claim_id,
      final_settlement,
      days_to_final_settlement,
      initial_estimate
    )
    SELECT 
      NEW.id,
      cs.total_settlement,
      EXTRACT(DAY FROM NOW() - NEW.created_at)::INTEGER,
      cs.estimate_amount
    FROM claim_settlements cs
    WHERE cs.claim_id = NEW.id
    ORDER BY cs.created_at DESC
    LIMIT 1
    ON CONFLICT (claim_id) DO UPDATE SET
      final_settlement = EXCLUDED.final_settlement,
      days_to_final_settlement = EXCLUDED.days_to_final_settlement,
      updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

#### 4. Feed Learning Into Recommendations
Enhance `darwin-strategic-intelligence` to:
- Query similar past claims by carrier + loss type + state
- Weight recommendations by historical success rate
- Include "Based on X similar claims, this approach succeeded Y% of the time"

---

## Phase 4: Carrier Behavior Modeling

### Concept
Build carrier profiles that predict behavior and recommend counter-sequences.

### New Components

#### 1. `CarrierBehaviorProfile.tsx`
Dashboard showing carrier-specific intelligence:
- Average response times
- Typical denial language patterns
- Supplement approval rates
- First offer vs. final settlement ratios
- Recommended approach playbook

#### 2. `CarrierPlaybookDialog.tsx`
When viewing a claim, show carrier-specific playbook:
- "State Farm typically moves after formal supplement + photo matrix"
- "Allstate delays average 21 days - consider escalation at day 14"
- "This carrier's denial language matches pattern: [template rebuttal]"

### Edge Function: `darwin-carrier-intelligence`
Aggregates data across claims to build carrier profiles:
```typescript
// Analyze all claims for this carrier
const carrierMetrics = {
  avgInitialResponseDays: calculateAverage(claims, 'first_response'),
  avgSupplementResponseDays: calculateAverage(claims, 'supplement_response'),
  supplementApprovalRate: calculateRate(supplements, 'approved'),
  firstOfferVsFinalRatio: calculateRatio(settlements),
  typicalDenialPatterns: extractPatterns(denials),
  effectiveCounterStrategies: rankStrategies(outcomes)
};
```

### Playbook Rules Engine
Store and apply playbook rules:
```sql
CREATE TABLE carrier_playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_name TEXT NOT NULL,
  state_code TEXT,
  trigger_condition JSONB NOT NULL,
  recommended_action TEXT NOT NULL,
  success_rate NUMERIC,
  sample_size INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Example: If carrier delayed 14+ days, escalation path
INSERT INTO carrier_playbooks (carrier_name, trigger_condition, recommended_action) VALUES
('State Farm', '{"delay_days": {"gte": 14}}', 'Send formal escalation letter citing prompt pay statute'),
('Allstate', '{"lowball_estimate": true}', 'Counter with line-item breakdown + manufacturer specs'),
('Nationwide', '{"engineer_report_received": true}', 'Immediately request scope meeting + submit photo matrix');
```

---

## Technical Implementation

### New Files to Create
```
src/components/claim-detail/
├── ClaimWarRoom.tsx              # Strategic command center
├── DarwinSecondBrain.tsx         # Proactive monitoring overlay
├── ClaimOutcomeCapture.tsx       # Settlement feedback modal
├── CarrierBehaviorProfile.tsx    # Carrier intelligence panel
├── CarrierPlaybookDialog.tsx     # Carrier-specific tactics
├── CausalityTimeline.tsx         # Cause-effect chain view
└── EvidenceArsenal.tsx           # Scored evidence display

supabase/functions/
├── darwin-carrier-intelligence/  # Carrier analysis engine
└── capture-claim-outcome/        # Auto-outcome tracking
```

### Files to Modify
```
src/components/claim-detail/DarwinTab.tsx
  - Add War Room button
  - Integrate Carrier Profile section
  - Connect Second Brain monitoring

src/components/claim-detail/DarwinInsightsPanel.tsx
  - Add carrier-specific insights
  - Show learning-based recommendations
  - Link to historical precedents

src/components/claim-detail/DarwinInlineNudges.tsx
  - Enhance with carrier playbook triggers
  - Add "You've won this way before" context

supabase/functions/darwin-strategic-intelligence/index.ts
  - Query carrier behavior profiles
  - Include outcome-based recommendations
  - Generate playbook-driven suggestions
```

### Database Migrations
1. Add `claim_policy_analysis` table
2. Add `carrier_playbooks` table
3. Add columns to `claim_warnings_log` for enhanced context
4. Create trigger for auto-capturing claim outcomes
5. Add index on `claim_outcomes` for carrier + state + loss_type queries

---

## User Experience Flow

### When Opening a Claim
1. Darwin automatically runs quick analysis
2. War Room button appears if strategic complexity detected
3. Carrier profile badge shows carrier's typical behavior

### While Working on Claim
1. Second Brain monitors actions
2. Nudges appear contextually:
   - "You're drafting to Allstate - their adjusters respond faster to formal tone"
   - "Missing moisture report - this hurt settlement in 3 similar claims"

### When Closing a Claim
1. Outcome capture modal appears
2. User confirms settlement details
3. System auto-tags winning arguments
4. Data feeds into future recommendations

---

## Success Metrics

After implementation, Darwin should be able to say:
- "This carrier usually moves after a formal supplement + photo matrix" ✓
- "These 3 delays weaken the carrier's position" ✓
- "You now have leverage to demand X" ✓
- "Based on 47 similar claims, this approach works 78% of the time" ✓

---

## Implementation Order

1. **Week 1**: Enhanced Second Brain + Policy Analysis
2. **Week 2**: Claim War Room UI
3. **Week 3**: Learning System Loop + Outcome Capture
4. **Week 4**: Carrier Behavior Modeling + Playbooks

---

## Technical Notes

- All AI analysis uses `google/gemini-2.5-pro` via Lovable AI Gateway
- RLS policies required for new tables (staff/admin access only)
- Carrier profiles aggregate anonymized data across all claims
- Learning system respects data privacy (no PII in recommendations)
