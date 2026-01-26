
# Convert Freedom Claims to MCP Server for Clawdbot

## Overview

The current `clawdbot-webhook` uses a custom HTTP webhook format, but Clawdbot connects via **MCP (Model Context Protocol)** through its "mcporter" feature. We need to convert the webhook into an MCP server that exposes Freedom Claims tools.

## What is MCP?

MCP (Model Context Protocol) is a standard way for AI assistants to connect to external tools. Instead of a custom webhook, Freedom Claims will expose its functionality as MCP "tools" that Clawdbot can discover and use automatically.

## Implementation Plan

### Step 1: Create MCP Server Edge Function

Create a new edge function that implements the MCP protocol using the `mcp-lite` library.

**New file:** `supabase/functions/clawdbot-mcp/index.ts`

This will expose the following tools to Clawdbot:

| Tool Name | Description |
|-----------|-------------|
| `lookup_claim` | Find a claim by name or number |
| `list_claims` | List claims filtered by status |
| `list_tasks` | Get pending/overdue tasks |
| `create_task` | Create a new task on a claim |
| `complete_task` | Mark a task as done |
| `draft_email` | Draft a follow-up email |
| `draft_sms` | Draft an SMS message |
| `get_summary` | Get daily claims summary |

### Step 2: Add MCP Dependencies

Create a `deno.json` file for the edge function with the required MCP library:

```text
supabase/functions/clawdbot-mcp/deno.json
```

### Step 3: Update Clawdbot Settings UI

Modify the settings page to show the new MCP endpoint URL instead of the webhook URL:

**File:** `src/components/settings/ClawdbotSettings.tsx`

Changes:
- Update the displayed endpoint URL to the MCP server
- Add instructions for configuring mcporter in Clawdbot
- Show the MCP transport type (HTTP)

### Step 4: Keep Existing Webhook (Backward Compatibility)

The existing `clawdbot-webhook` will remain functional for any future integrations that prefer webhooks.

---

## How to Connect in Clawdbot

After implementation, you'll configure mcporter in Clawdbot with:

| Setting | Value |
|---------|-------|
| **Name** | Freedom Claims |
| **URL** | `https://tnnzihuszaosnyeyceed.supabase.co/functions/v1/clawdbot-mcp` |
| **Transport** | HTTP (Streamable) |
| **Auth Header** | `X-Clawdbot-Secret: [your-secret]` |

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `supabase/functions/clawdbot-mcp/index.ts` | Create | MCP server implementation |
| `supabase/functions/clawdbot-mcp/deno.json` | Create | Dependencies for mcp-lite |
| `src/components/settings/ClawdbotSettings.tsx` | Modify | Update UI with MCP instructions |

---

## Technical Details

### MCP Server Structure

```text
┌─────────────────────────────────────────────────────────┐
│                    Clawdbot (mcporter)                  │
│                           │                             │
│                     MCP Protocol                        │
│                           ▼                             │
├─────────────────────────────────────────────────────────┤
│              clawdbot-mcp Edge Function                 │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Tool: lookup_claim                             │   │
│  │  Tool: list_claims                              │   │
│  │  Tool: list_tasks                               │   │
│  │  Tool: create_task                              │   │
│  │  Tool: complete_task                            │   │
│  │  Tool: draft_email                              │   │
│  │  Tool: draft_sms                                │   │
│  │  Tool: get_summary                              │   │
│  └─────────────────────────────────────────────────┘   │
│                           │                             │
│                    Supabase Client                      │
│                           ▼                             │
│                    Claims Database                      │
└─────────────────────────────────────────────────────────┘
```

### Example Tool Definition

Each Freedom Claims action becomes an MCP tool:

```typescript
mcpServer.tool({
  name: "lookup_claim",
  description: "Find a claim by policyholder name or claim number",
  inputSchema: {
    type: "object",
    properties: {
      query: { 
        type: "string", 
        description: "Name or claim number to search for" 
      }
    },
    required: ["query"]
  },
  handler: async ({ query }) => {
    // Existing lookupClaim logic
    return { content: [{ type: "text", text: result }] };
  }
});
```

### Authentication

The MCP server will verify requests using the same `X-Clawdbot-Secret` header, checking against the `clawdbot_config` table.

