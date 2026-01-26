
# Clawdbot Integration for Freedom Claims

## Overview
Replace the current in-app Claims AI Assistant with **Clawdbot**, enabling you to manage claims via WhatsApp, Telegram, or any chat app you already use. Clawdbot will connect to your Freedom Claims database and handle claim lookups, task management, follow-up drafting, and proactive notifications.

## How Clawdbot Works

Clawdbot is a self-hosted AI agent that runs on your Mac Mini (or similar always-on computer). It connects to your messaging apps (WhatsApp/Telegram) and can perform actions on your behalf. For this integration:

1. **Clawdbot** receives your messages via WhatsApp/Telegram
2. Clawdbot calls a **webhook endpoint** in Freedom Claims to execute actions
3. Freedom Claims returns data/confirmations back through the same channel
4. For **notifications**, a scheduled function pushes alerts TO Clawdbot

```text
+-------------------+        +------------------+        +-------------------+
|   WhatsApp/       |  <-->  |    Clawdbot      |  <-->  |  Freedom Claims   |
|   Telegram        |        |  (Your Mac Mini) |        |  (Backend API)    |
+-------------------+        +------------------+        +-------------------+
                                     |
                                     v
                              Uses Claude API
                              for AI reasoning
```

## Implementation Plan

### Phase 1: Create Clawdbot Webhook Endpoint

Build a new edge function that Clawdbot will call to interact with Freedom Claims:

**New file: `supabase/functions/clawdbot-webhook/index.ts`**

This endpoint will handle:
- **Authentication**: Verify requests come from your Clawdbot instance using a shared secret
- **Action routing**: Parse natural language intents from Clawdbot and execute the appropriate action

**Supported Actions:**

| Action | Description | Example Message |
|--------|-------------|-----------------|
| `lookup_claim` | Get claim details by name/number | "What's the status of the Johnson claim?" |
| `list_claims` | List claims by status/date | "Show me overdue claims" |
| `create_task` | Create a task on a claim | "Add task to follow up with adjuster on Smith claim" |
| `complete_task` | Mark task as done | "Mark the inspection task done on claim 12345" |
| `list_tasks` | Get tasks (yours, due today, overdue) | "What tasks do I have today?" |
| `draft_email` | Draft follow-up email | "Draft a supplement request for the Williams claim" |
| `draft_sms` | Draft SMS message | "Write an inspection reminder for the Davis claim" |
| `send_email` | Actually send a drafted email | "Send that email" |
| `send_sms` | Actually send a drafted SMS | "Send that SMS" |
| `get_summary` | Daily/weekly claim summary | "Give me a summary of this week" |

### Phase 2: Proactive Notifications System

Create a scheduled function that sends alerts TO Clawdbot when events occur:

**New file: `supabase/functions/clawdbot-notifications/index.ts`**

This function runs on a schedule (every 15 minutes) and checks for:
- Tasks due today or overdue
- Claims with no activity in X days
- New documents uploaded
- Approaching deadlines (statutes of limitations, response deadlines)
- Check payments received

Notifications are pushed to Clawdbot via its API, which then forwards to your WhatsApp/Telegram.

### Phase 3: Database Changes

**New table: `clawdbot_config`**
- `id` (UUID)
- `user_id` (UUID, FK to profiles)
- `webhook_secret` (text, encrypted) - Shared secret for authenticating Clawdbot
- `clawdbot_endpoint` (text) - Your Clawdbot instance URL for push notifications
- `notification_preferences` (JSONB) - Which notifications to receive
- `active` (boolean)
- `created_at`, `updated_at`

**New table: `clawdbot_message_log`**
- `id` (UUID)
- `user_id` (UUID)
- `direction` (text: 'inbound' | 'outbound')
- `message_content` (text)
- `action_type` (text)
- `claim_id` (UUID, nullable)
- `created_at`

### Phase 4: Settings UI

**New file: `src/components/settings/ClawdbotSettings.tsx`**

A settings page where you can:
- Enter your Clawdbot webhook URL
- Generate/regenerate the shared secret
- Configure which notifications to receive
- Test the connection
- View message history/logs

### Phase 5: Remove In-App Assistant (Optional)

Once Clawdbot is fully operational, you can optionally:
- Remove the floating assistant button from the Claims page
- Keep Darwin AI tools in the claim detail page (they serve a different purpose)
- Or keep both as backup

---

## Clawdbot Setup Instructions

After implementation, you'll need to configure Clawdbot on your end:

### Step 1: Install Clawdbot
Follow instructions at https://clawd.bot/ to set up Clawdbot on your Mac Mini

### Step 2: Configure Freedom Claims Integration
Add this to your Clawdbot configuration:

```text
Tool: Freedom Claims
Description: Manage insurance claims, tasks, and communications
Endpoint: https://tnnzihuszaosnyeyceed.supabase.co/functions/v1/clawdbot-webhook
Headers:
  - X-Clawdbot-Secret: [your-secret-from-settings]
```

### Step 3: Test Commands
- "What claims are in pending status?"
- "Create a task to follow up with the adjuster on the Johnson claim"
- "Draft a supplement request email for claim 2024-001"

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `supabase/functions/clawdbot-webhook/index.ts` | Create | Main webhook for Clawdbot requests |
| `supabase/functions/clawdbot-notifications/index.ts` | Create | Push notifications to Clawdbot |
| `src/components/settings/ClawdbotSettings.tsx` | Create | Settings UI for Clawdbot config |
| `src/pages/Settings.tsx` | Modify | Add Clawdbot settings section |
| `supabase/config.toml` | Modify | Register new functions |
| Database migration | Create | Add config and log tables |

---

## Technical Details

### Webhook Authentication
```typescript
// Verify Clawdbot requests using HMAC signature
const signature = req.headers.get("X-Clawdbot-Signature");
const secret = Deno.env.get("CLAWDBOT_WEBHOOK_SECRET");
const payload = await req.text();
const expected = await hmacSha256(secret, payload);
if (signature !== expected) {
  return new Response("Unauthorized", { status: 401 });
}
```

### Example Webhook Request/Response
```typescript
// Incoming from Clawdbot
{
  "user_id": "your-user-id",
  "action": "lookup_claim",
  "query": "What's the status of the Johnson claim?",
  "context": {} // Previous conversation context
}

// Response to Clawdbot
{
  "success": true,
  "response": "The Johnson claim (2024-0123) is currently in 'Supplement Requested' status. Last activity was 3 days ago when the estimate was uploaded. The claim value is $45,230. Would you like me to draft a follow-up email to the adjuster?",
  "claim_id": "uuid-here",
  "suggested_actions": ["draft_follow_up", "view_estimate", "create_task"]
}
```

### Notification Push Example
```typescript
// Push to Clawdbot
await fetch(clawdbotEndpoint, {
  method: "POST",
  headers: {
    "X-Clawdbot-Secret": secret,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    type: "notification",
    priority: "high",
    message: "⚠️ Task overdue: Follow up with adjuster on Smith claim (due yesterday)",
    claim_id: "uuid",
    action_buttons: [
      { label: "Mark Complete", action: "complete_task" },
      { label: "Snooze 1 day", action: "snooze_task" }
    ]
  })
});
```

---

## Summary

This integration will give you:
- Manage claims from WhatsApp/Telegram instead of logging into the web app
- Quick claim lookups with voice messages or text
- Create and complete tasks on the go
- Draft and send follow-up communications
- Proactive notifications pushed to your phone
- Full conversation context so Clawdbot remembers what you were discussing

Darwin AI tools in the claim detail page will remain unchanged - they serve a different purpose (deep analysis, rebuttals, etc.) vs. Clawdbot (quick actions and daily management).
