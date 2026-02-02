
# Semi-Autonomous Mode Enhancement

## Overview

This change redefines autonomy levels so that **semi-autonomous** does everything automatically except send emails to insurance companies/adjusters. Client communications (emails, SMS) will be sent automatically, and all status updates, task completions, and accounting updates will happen without requiring human review.

---

## Autonomy Level Definitions After Implementation

| Action | Supervised | Semi-Autonomous | Fully Autonomous |
|--------|------------|-----------------|------------------|
| Status updates (Estimate Received, Denied, Approved) | Manual | Auto | Auto |
| Task creation | Auto | Auto | Auto |
| Task completion | Manual | Auto | Auto |
| Accounting updates (RCV extraction) | Auto | Auto | Auto |
| Emails to **clients/policyholders** | Queue for review | Auto | Auto |
| SMS to clients | Queue for review | Auto | Auto |
| Emails to **contractors** | Queue for review | Auto | Auto |
| Emails to **insurance companies/adjusters** | Queue for review | Queue for review | Auto |
| Deep analysis (rebuttals, gap analysis) | Auto | Auto | Auto |

---

## Technical Changes

### 1. `darwin-process-document/index.ts` - Status Updates

**Current behavior**: Status only updates when `isFullyAutonomous === true`

**New behavior**: Status updates when claim is either `semi_autonomous` OR `fully_autonomous`

```typescript
// BEFORE (line 460)
const isFullyAutonomous = automation.autonomy_level === 'fully_autonomous';

// AFTER - Add a check that includes semi-autonomous for most actions
const isFullyAutonomous = automation.autonomy_level === 'fully_autonomous';
const isAutonomous = ['semi_autonomous', 'fully_autonomous'].includes(automation.autonomy_level);

// Use isAutonomous for status updates (lines 490, 530, 547):
if (isAutonomous) {
  await supabase.from('claims').update({ status: 'Denied' }).eq('id', claimId);
}
```

### 2. `darwin-autonomous-agent/index.ts` - Email Auto-Send Logic

**Current behavior**: Only processes auto-send emails when `auto_respond_without_approval === true` (fully autonomous setting)

**New behavior**: Process emails based on autonomy level AND recipient type

```typescript
// BEFORE (line 96-98)
if (automation.auto_respond_without_approval) {
  await processAutoSendEmails(supabase, claim.id, automation, results);
}

// AFTER
// For semi-autonomous: auto-send to clients, queue insurance emails
// For fully-autonomous: auto-send everything
if (automation.autonomy_level === 'fully_autonomous' || automation.autonomy_level === 'semi_autonomous') {
  await processAutoSendEmails(supabase, claim.id, automation, results);
}
```

**Updated `processAutoSendEmails` function**:

```typescript
async function processAutoSendEmails(
  supabase: any,
  claimId: string,
  automation: any,
  results: any
) {
  const isFullyAutonomous = automation.autonomy_level === 'fully_autonomous';
  
  // Insurance-related recipient types that require human review for semi-autonomous
  const INSURANCE_RECIPIENT_TYPES = [
    'adjuster', 
    'insurance company', 
    'primary adjuster',
    'carrier'
  ];

  const { data: pendingActions } = await supabase
    .from('claim_ai_pending_actions')
    .select('*')
    .eq('claim_id', claimId)
    .eq('status', 'pending')
    .eq('action_type', 'email_response');

  for (const action of pendingActions || []) {
    const draft = action.draft_content as any;
    const recipientType = draft.recipient_type?.toLowerCase() || '';
    
    // Check if this is an insurance email
    const isInsuranceEmail = INSURANCE_RECIPIENT_TYPES.some(type => 
      recipientType.includes(type.toLowerCase())
    );
    
    // For semi-autonomous: skip insurance emails (require human review)
    if (!isFullyAutonomous && isInsuranceEmail) {
      console.log(`Skipping insurance email for semi-autonomous: ${draft.to_email}`);
      
      // Log that this requires human review
      await supabase.from('darwin_action_log').insert({
        claim_id: claimId,
        action_type: 'pending_review',
        action_details: { 
          pending_action_id: action.id,
          reason: 'insurance_email_requires_review',
          recipient_type: recipientType,
          to_email: draft.to_email
        },
        was_auto_executed: false,
        result: `Email to insurance (${draft.to_email}) queued for human review`,
        trigger_source: 'darwin_autonomous_agent',
      });
      
      results.escalations++;
      continue;
    }

    // Check for keyword blockers (existing logic)
    // ... rest of existing email sending logic
  }
}
```

### 3. Add `recipient_type` to Pending Actions

Ensure email drafts include recipient type for proper filtering:

**In `inbound-email/index.ts`** when creating pending actions, include recipient_type:

```typescript
draft_content: {
  to_email: senderEmail,
  to_name: senderName,
  recipient_type: detectedRecipientType, // 'policyholder', 'adjuster', etc.
  subject: draftSubject,
  body: draftBody
}
```

### 4. SMS Auto-Send for Semi-Autonomous

Similar logic for SMS - clients get auto-sent, insurance does not (though SMS to insurance is rare):

```typescript
// In darwin-autonomous-agent or process-claim-ai-action
// SMS to policyholders/clients: auto-send for semi-autonomous
// SMS to adjusters: queue for review
```

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/darwin-process-document/index.ts` | Add `isAutonomous` check, use for status updates |
| `supabase/functions/darwin-autonomous-agent/index.ts` | Update email auto-send logic to filter by recipient type |
| `supabase/functions/process-claim-ai-action/index.ts` | Include recipient_type in draft_content |
| `supabase/functions/inbound-email/index.ts` | Add recipient_type detection to pending actions |

---

## Summary

After this change:

**Semi-Autonomous claims will automatically**:
- Update status when estimates, denials, or approvals arrive
- Complete tasks when responses are received
- Send emails/SMS to clients and contractors
- Run deep analysis on documents
- Create escalations for urgent items

**Semi-Autonomous claims will still require human review for**:
- Emails to adjusters
- Emails to insurance companies
- Any communication containing escalation keywords (lawsuit, attorney, etc.)

**Fully Autonomous** remains unchanged - everything auto-executes (with keyword blockers still applying).
