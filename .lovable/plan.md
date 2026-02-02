

# Fix Darwin Autonomous Agent Scheduling and Email Drafting

## Problem Summary

Based on my investigation, I found **two critical issues**:

1. **The `darwin-autonomous-agent` function has no cron job** - It's never being triggered to process pending emails
2. **Client notification emails are not being drafted** - The `email_drafted` action is not appearing in logs

The good news: **Status updates ARE working** - the claim correctly shows "Estimate Received from Carrier" in the database.

---

## Implementation Plan

### Step 1: Create Cron Job for Darwin Autonomous Agent

Add a scheduled job to run the darwin-autonomous-agent every minute (like execute-automations):

```sql
SELECT cron.schedule(
  'darwin-autonomous-agent-minutely',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://tnnzihuszaosnyeyceed.supabase.co/functions/v1/darwin-autonomous-agent',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### Step 2: Re-deploy darwin-process-document Function

The email drafting code exists in the function but may not have been deployed. We'll trigger a redeployment to ensure the latest version with `draftClientUpdateEmail` is live.

### Step 3: Add Error Logging to Email Draft Function

Add explicit try/catch and logging around the `draftClientUpdateEmail` call to diagnose any silent failures:

```typescript
// In darwin-process-document/index.ts, around line 590
if (claim?.policyholder_email) {
  try {
    await draftClientUpdateEmail(...);
    console.log(`Successfully drafted email for claim ${claimId}`);
  } catch (emailError) {
    console.error(`Failed to draft client email:`, emailError);
    // Log the failure but don't block status update
    await supabase.from('darwin_action_log').insert({
      claim_id: claimId,
      action_type: 'error',
      action_details: { error: emailError.message, context: 'draftClientUpdateEmail' },
      was_auto_executed: true,
      result: `Failed to draft client email: ${emailError.message}`,
      trigger_source: 'darwin_process_document',
    });
  }
}
```

### Step 4: Test the Full Flow

After deployment:
1. Upload a new estimate document to the test claim
2. Verify the `email_drafted` action appears in `darwin_action_log`
3. Verify a pending action is created in `claim_ai_pending_actions`
4. Wait for the autonomous agent to run and check if email is sent

---

## Technical Details

### Files to Modify

| File | Change |
|------|--------|
| Database (cron.job) | Add scheduled job for darwin-autonomous-agent |
| `supabase/functions/darwin-process-document/index.ts` | Add error handling/logging around email drafting |

### Current State vs Expected

| Component | Current | Expected |
|-----------|---------|----------|
| Status Update | Working | Working |
| Email Draft Creation | NOT working (no logs) | Should create pending action |
| Autonomous Agent | NOT scheduled | Should run every minute |
| Email Sending | Cannot run (no agent) | Should auto-send to clients |

---

## Expected Outcome

After these changes:
1. When Darwin classifies an estimate, it will update the claim status AND draft a client notification email
2. The autonomous agent will run every minute and process any pending client emails
3. Client emails will be automatically sent (for semi-autonomous claims)
4. All actions will be logged for audit purposes

