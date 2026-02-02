
# Darwin Autonomous Operations Mode

## Overview

You want Darwin to run your claims operation on autopilot - handling emails, completing tasks, sending follow-ups, and managing the entire workflow with minimal human intervention. Currently, the system has the foundation for this but requires several enhancements to achieve true autonomous operation.

## Current State Analysis

Your system already has:
- **Inbound Email Processing**: Automatically receives emails and routes them to claims
- **AI Draft Responses**: Darwin drafts email replies (requires manual approval)
- **Follow-up Automation**: Scheduled follow-ups for claims and tasks
- **Workflow Automations**: Trigger-based automations (status changes, task completion, etc.)
- **Task Reminders**: Automated notifications for due/overdue tasks
- **Smart Follow-Up Recommendations**: AI-generated follow-up suggestions
- **Pending Approvals Queue**: Human-in-the-loop review system

**Gap**: Everything currently routes through manual approval or requires you to click buttons. There's no true autonomous execution mode.

---

## Implementation Plan

### Phase 1: Autonomous Mode Toggle & Trust Levels

**What we'll build:**
Add a new "Autonomous Mode" setting per claim that allows Darwin to execute actions directly without approval, with configurable trust levels:

- **Level 1 - Supervised** (current): All actions require approval
- **Level 2 - Semi-Autonomous**: Low-risk actions auto-execute (follow-ups, reminders, status updates); high-risk actions need approval
- **Level 3 - Fully Autonomous**: Darwin executes all actions automatically with logging

**Database changes:**
```sql
-- Add autonomous settings to claim_automations
ALTER TABLE claim_automations ADD COLUMN autonomy_level TEXT DEFAULT 'supervised';
ALTER TABLE claim_automations ADD COLUMN auto_respond_without_approval BOOLEAN DEFAULT FALSE;
ALTER TABLE claim_automations ADD COLUMN auto_complete_tasks BOOLEAN DEFAULT FALSE;
ALTER TABLE claim_automations ADD COLUMN auto_escalate_urgency BOOLEAN DEFAULT FALSE;
```

---

### Phase 2: Auto-Execute Email Responses

**What we'll build:**
Modify the inbound email handler and AI action processor to automatically send responses when autonomy is enabled:

1. Update `inbound-email` edge function to check autonomy level
2. If autonomy is "semi" or "full", skip the pending actions queue and send directly
3. Log all auto-sent communications to claim activity
4. Add a "Darwin Action Log" showing everything Darwin did automatically

**Technical approach:**
- New column: `auto_executed` on `claim_ai_pending_actions` to track which went through auto-approval
- Modify `process-claim-ai-action` to check claim's autonomy level before queuing

---

### Phase 3: Proactive Task Completion

**What we'll build:**
Enable Darwin to automatically complete certain task types:

1. **Auto-close follow-up tasks** when a response is received
2. **Auto-mark document tasks** as complete when files are uploaded
3. **Auto-complete reminder tasks** after the reminder is sent
4. **Create AI-suggested next steps** and auto-add them as tasks

**New edge function:** `darwin-autonomous-agent`
- Runs on a schedule (every 15 minutes via cron)
- Scans claims with autonomy enabled
- Evaluates what actions should be taken
- Executes actions and logs everything

---

### Phase 4: Intelligent Escalation

**What we'll build:**
Darwin monitors claims and escalates when human intervention is truly needed:

1. **Unusual response detection**: If carrier response seems hostile or contains denial language, flag for review
2. **Deadline proximity alerts**: Auto-escalate claims approaching statutory deadlines
3. **Stalled claim detection**: Claims with no activity for X days get bumped to your attention
4. **Financial threshold alerts**: Large settlements or disputes get flagged

**UI Changes:**
- Add "Needs Your Attention" section to dashboard showing only escalated items
- Filter the noise so you only see what truly requires human judgment

---

### Phase 5: Operations Dashboard

**What we'll build:**
A new "Darwin Operations Center" view showing:

- **Active Claims Being Managed**: List of claims in autonomous mode
- **Actions Taken Today**: Log of emails sent, tasks completed, follow-ups scheduled
- **Pending Escalations**: Items Darwin flagged for your review
- **Performance Metrics**: Response times, follow-up compliance, settlement velocity
- **Quick Override Controls**: Pause automation, take manual control of a claim

---

## Technical Implementation Details

### New Edge Functions

1. **`darwin-autonomous-agent`**: Scheduled job that processes autonomous actions
2. **Update `process-claim-ai-action`**: Add auto-execute path for autonomous claims

### Database Schema Changes

```sql
-- Extend claim_automations
ALTER TABLE claim_automations ADD COLUMN autonomy_level TEXT DEFAULT 'supervised';
ALTER TABLE claim_automations ADD COLUMN auto_respond_without_approval BOOLEAN DEFAULT FALSE;
ALTER TABLE claim_automations ADD COLUMN auto_complete_tasks BOOLEAN DEFAULT FALSE;

-- New table for tracking autonomous actions
CREATE TABLE darwin_action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID REFERENCES claims(id),
  action_type TEXT NOT NULL,
  action_details JSONB,
  was_auto_executed BOOLEAN DEFAULT FALSE,
  executed_at TIMESTAMPTZ DEFAULT now(),
  result TEXT
);
```

### Cron Schedule

- Task follow-ups: Every 6 hours
- Autonomous agent scan: Every 15 minutes
- Escalation check: Every hour

---

## UI Components

### 1. Claim Automation Settings Enhancement
Expand the existing `ClaimAutomationSettings.tsx` to include:
- Autonomy level selector
- Granular toggle for each action type
- View Darwin's action history for this claim

### 2. New Operations Dashboard Component
Create `DarwinOperationsCenter.tsx` with:
- Claims grid showing automation status
- Action log timeline
- Escalation queue
- Quick enable/disable bulk controls

### 3. Dashboard Integration
Add "Darwin Summary" widget to main dashboard showing:
- X claims on autopilot
- X actions taken today
- X items need attention

---

## Safety & Control Mechanisms

1. **Daily Summary Email**: Darwin sends you a daily digest of all actions taken
2. **Spending Limits**: Cap on number of auto-sends per day per claim
3. **Keyword Blockers**: Auto-pause autonomy if certain keywords detected (lawsuit, attorney, bad faith)
4. **Easy Override**: One-click to pause all autonomous actions globally
5. **Audit Trail**: Complete log of every action with reasoning

---

## Files to Create/Modify

### New Files
- `src/components/claim-detail/ClaimAutonomySettings.tsx`
- `src/components/dashboard/DarwinOperationsCenter.tsx`
- `src/pages/DarwinOperations.tsx`
- `supabase/functions/darwin-autonomous-agent/index.ts`

### Files to Modify
- `src/components/claim-detail/ClaimAutomationSettings.tsx` - Add autonomy controls
- `supabase/functions/inbound-email/index.ts` - Check autonomy level before queuing
- `supabase/functions/process-claim-ai-action/index.ts` - Auto-execute path
- `src/components/AppSidebar.tsx` - Add Darwin Operations link
- `src/App.tsx` - Add route for Operations page

### Database Migration
- Add autonomy columns to `claim_automations`
- Create `darwin_action_log` table
- Enable realtime for action log

---

## Rollout Strategy

1. **Phase 1**: Add autonomy toggle (default OFF)
2. **Phase 2**: Enable auto-responses for claims you manually enable
3. **Phase 3**: Add task auto-completion
4. **Phase 4**: Build escalation logic
5. **Phase 5**: Operations dashboard for monitoring

This gives you granular control - start with one claim in autonomous mode, verify it works well, then expand.
