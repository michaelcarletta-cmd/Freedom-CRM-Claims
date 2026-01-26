import { Hono } from "hono";
import { McpServer, StreamableHttpTransport } from "mcp-lite";
import { createClient } from "@supabase/supabase-js";

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

// Store context for the current request
let currentContext: { supabase: SupabaseClient; userId: string } | null = null;

async function verifySecret(secret: string | null, supabase: SupabaseClient): Promise<{ valid: boolean; userId?: string }> {
  if (!secret) {
    return { valid: false };
  }

  const { data: config, error } = await supabase
    .from("clawdbot_config")
    .select("user_id, active")
    .eq("webhook_secret", secret)
    .eq("active", true)
    .single();

  if (error || !config) {
    return { valid: false };
  }

  return { valid: true, userId: config.user_id };
}

async function logMessage(
  supabase: SupabaseClient,
  userId: string,
  direction: "inbound" | "outbound",
  content: string,
  actionType?: string,
  claimId?: string
) {
  await supabase.from("clawdbot_message_log").insert({
    user_id: userId,
    direction,
    message_content: content,
    action_type: actionType || null,
    claim_id: claimId || null,
    metadata: null,
  });
}

// Create MCP server instance
const mcpServer = new McpServer({
  name: "freedom-claims",
  version: "1.0.0",
});

// Tool: lookup_claim
mcpServer.tool(
  "lookup_claim",
  {
    description: "Find a claim by policyholder name or claim number. Returns claim details including status, amount, insurance company, and recent activity.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The policyholder name or claim number to search for"
        }
      },
      required: ["query"]
    },
    handler: async ({ query }: { query: string }) => {
      if (!currentContext) {
        return { content: [{ type: "text", text: "Not authenticated" }] };
      }
      const { supabase, userId } = currentContext;
      const searchTerm = `%${query}%`;
      
      const { data: claims, error } = await supabase
        .from("claims")
        .select(`
          id, claim_number, policyholder_name, policyholder_phone, policyholder_email,
          policyholder_address, status, claim_amount, insurance_company, loss_type,
          loss_date, created_at, updated_at, is_closed
        `)
        .or(`claim_number.ilike.${searchTerm},policyholder_name.ilike.${searchTerm}`)
        .eq("is_closed", false)
        .limit(5);

      if (error) {
        return { content: [{ type: "text", text: `Error searching claims: ${error.message}` }] };
      }

      if (!claims || claims.length === 0) {
        return { content: [{ type: "text", text: `No claims found matching "${query}"` }] };
      }

      await logMessage(supabase, userId, "inbound", `lookup_claim: ${query}`, "lookup_claim");

      if (claims.length === 1) {
        const claim = claims[0];
        const daysSinceUpdate = Math.floor((Date.now() - new Date(claim.updated_at).getTime()) / (1000 * 60 * 60 * 24));
        
        const result = `**${claim.policyholder_name}** (${claim.claim_number || "No claim #"})
Status: ${claim.status || "Open"}
Amount: ${claim.claim_amount ? `$${claim.claim_amount.toLocaleString()}` : "Not set"}
Insurance: ${claim.insurance_company || "Not set"}
Loss Date: ${claim.loss_date || "Not set"}
Phone: ${claim.policyholder_phone || "Not set"}
Email: ${claim.policyholder_email || "Not set"}
Address: ${claim.policyholder_address || "Not set"}
Last Activity: ${daysSinceUpdate} day(s) ago

Claim ID: ${claim.id}`;

        return { content: [{ type: "text", text: result }] };
      }

      // deno-lint-ignore no-explicit-any
      const claimList = claims.map((c: any) => `• ${c.policyholder_name} (${c.claim_number || "No #"}) - ${c.status}`).join("\n");
      return { content: [{ type: "text", text: `Found ${claims.length} claims:\n${claimList}\n\nPlease be more specific.` }] };
    }
  }
);

// Tool: list_claims
mcpServer.tool(
  "list_claims",
  {
    description: "List claims optionally filtered by status. Returns up to 10 recent claims with basic info.",
    inputSchema: {
      type: "object",
      properties: {
        status_filter: {
          type: "string",
          description: "Optional filter: 'pending', 'supplement', 'open', or leave empty for all"
        }
      },
      required: []
    },
    handler: async ({ status_filter }: { status_filter?: string }) => {
      if (!currentContext) {
        return { content: [{ type: "text", text: "Not authenticated" }] };
      }
      const { supabase, userId } = currentContext;
      
      let queryBuilder = supabase
        .from("claims")
        .select("id, claim_number, policyholder_name, status, claim_amount, updated_at")
        .eq("is_closed", false)
        .order("updated_at", { ascending: false })
        .limit(10);

      if (status_filter) {
        const lowerFilter = status_filter.toLowerCase();
        if (lowerFilter.includes("pending")) {
          queryBuilder = queryBuilder.ilike("status", "%pending%");
        } else if (lowerFilter.includes("supplement")) {
          queryBuilder = queryBuilder.ilike("status", "%supplement%");
        } else if (lowerFilter.includes("open")) {
          queryBuilder = queryBuilder.eq("status", "open");
        }
      }

      const { data: claims, error } = await queryBuilder;

      if (error) {
        return { content: [{ type: "text", text: `Error listing claims: ${error.message}` }] };
      }

      await logMessage(supabase, userId, "inbound", `list_claims: ${status_filter || "all"}`, "list_claims");

      if (!claims || claims.length === 0) {
        return { content: [{ type: "text", text: "No claims found matching your criteria." }] };
      }

      // deno-lint-ignore no-explicit-any
      const claimList = claims.map((c: any) => {
        const amount = c.claim_amount ? `$${c.claim_amount.toLocaleString()}` : "TBD";
        return `• **${c.policyholder_name}** (${c.claim_number || "No #"}) - ${c.status} - ${amount}`;
      }).join("\n");

      return { content: [{ type: "text", text: `Found ${claims.length} claims:\n${claimList}` }] };
    }
  }
);

// Tool: list_tasks
mcpServer.tool(
  "list_tasks",
  {
    description: "Get pending tasks. Optionally filter by 'overdue' or 'today'.",
    inputSchema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          description: "Optional filter: 'overdue' for past due tasks, 'today' for tasks due today"
        }
      },
      required: []
    },
    handler: async ({ filter }: { filter?: string }) => {
      if (!currentContext) {
        return { content: [{ type: "text", text: "Not authenticated" }] };
      }
      const { supabase, userId } = currentContext;
      const today = new Date().toISOString().split("T")[0];
      
      let queryBuilder = supabase
        .from("tasks")
        .select(`
          id, title, description, due_date, priority, status,
          claims!inner(id, policyholder_name, claim_number)
        `)
        .neq("status", "completed")
        .order("due_date", { ascending: true })
        .limit(10);

      if (filter) {
        const lowerFilter = filter.toLowerCase();
        if (lowerFilter.includes("overdue")) {
          queryBuilder = queryBuilder.lt("due_date", today);
        } else if (lowerFilter.includes("today") || lowerFilter.includes("due")) {
          queryBuilder = queryBuilder.eq("due_date", today);
        }
      }

      const { data: tasks, error } = await queryBuilder;

      if (error) {
        return { content: [{ type: "text", text: `Error listing tasks: ${error.message}` }] };
      }

      await logMessage(supabase, userId, "inbound", `list_tasks: ${filter || "all"}`, "list_tasks");

      if (!tasks || tasks.length === 0) {
        return { content: [{ type: "text", text: "No tasks found. You're all caught up! 🎉" }] };
      }

      // deno-lint-ignore no-explicit-any
      const taskList = tasks.map((t: any) => {
        const claim = t.claims;
        const dueDate = t.due_date ? new Date(t.due_date).toLocaleDateString() : "No date";
        const isOverdue = t.due_date && new Date(t.due_date) < new Date();
        return `${isOverdue ? "⚠️" : "•"} **${t.title}** - ${claim.policyholder_name} (Due: ${dueDate}) [ID: ${t.id}]`;
      }).join("\n");

      return { content: [{ type: "text", text: `Found ${tasks.length} tasks:\n${taskList}` }] };
    }
  }
);

// Tool: create_task
mcpServer.tool(
  "create_task",
  {
    description: "Create a new task on a claim. Requires a claim_id and task title.",
    inputSchema: {
      type: "object",
      properties: {
        claim_id: {
          type: "string",
          description: "The UUID of the claim to add the task to"
        },
        title: {
          type: "string",
          description: "The task title/description"
        },
        priority: {
          type: "string",
          description: "Priority level: 'low', 'medium', or 'high'. Defaults to 'medium'"
        },
        due_days: {
          type: "number",
          description: "Number of days from today until due. Defaults to 1"
        }
      },
      required: ["claim_id", "title"]
    },
    handler: async ({ claim_id, title, priority, due_days }: { claim_id: string; title: string; priority?: string; due_days?: number }) => {
      if (!currentContext) {
        return { content: [{ type: "text", text: "Not authenticated" }] };
      }
      const { supabase, userId } = currentContext;
      
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (due_days || 1));

      const { data: task, error } = await supabase
        .from("tasks")
        .insert({
          claim_id,
          title,
          status: "pending",
          priority: priority || "medium",
          due_date: dueDate.toISOString().split("T")[0],
        })
        .select("id, title, due_date")
        .single();

      if (error) {
        return { content: [{ type: "text", text: `Error creating task: ${error.message}` }] };
      }

      await logMessage(supabase, userId, "inbound", `create_task: ${title}`, "create_task", claim_id);

      return { content: [{ type: "text", text: `✅ Task created: "${task.title}" (Due: ${new Date(task.due_date).toLocaleDateString()})` }] };
    }
  }
);

// Tool: complete_task
mcpServer.tool(
  "complete_task",
  {
    description: "Mark a task as completed by its ID.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: {
          type: "string",
          description: "The UUID of the task to complete"
        }
      },
      required: ["task_id"]
    },
    handler: async ({ task_id }: { task_id: string }) => {
      if (!currentContext) {
        return { content: [{ type: "text", text: "Not authenticated" }] };
      }
      const { supabase, userId } = currentContext;

      const { error } = await supabase
        .from("tasks")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", task_id);

      if (error) {
        return { content: [{ type: "text", text: `Error completing task: ${error.message}` }] };
      }

      await logMessage(supabase, userId, "inbound", `complete_task: ${task_id}`, "complete_task");

      return { content: [{ type: "text", text: "✅ Task marked as complete!" }] };
    }
  }
);

// Tool: draft_email
mcpServer.tool(
  "draft_email",
  {
    description: "Draft a follow-up email for a claim. Supports types: 'supplement', 'follow_up', or 'general'.",
    inputSchema: {
      type: "object",
      properties: {
        claim_id: {
          type: "string",
          description: "The UUID of the claim"
        },
        email_type: {
          type: "string",
          description: "Type of email: 'supplement', 'follow_up', or 'general'"
        }
      },
      required: ["claim_id"]
    },
    handler: async ({ claim_id, email_type }: { claim_id: string; email_type?: string }) => {
      if (!currentContext) {
        return { content: [{ type: "text", text: "Not authenticated" }] };
      }
      const { supabase, userId } = currentContext;

      const { data: claim, error } = await supabase
        .from("claims")
        .select("*")
        .eq("id", claim_id)
        .single();

      if (error || !claim) {
        return { content: [{ type: "text", text: "Claim not found." }] };
      }

      await logMessage(supabase, userId, "inbound", `draft_email: ${email_type || "general"}`, "draft_email", claim_id);

      const type = (email_type || "general").toLowerCase();
      let subject = "";
      let body = "";

      if (type.includes("supplement")) {
        subject = `Supplement Request - ${claim.claim_number || claim.policyholder_name}`;
        body = `Dear Claims Department,

I am writing to request a supplement review for the above-referenced claim.

Upon further inspection of the property at ${claim.policyholder_address || "[address]"}, additional damages have been identified that were not included in the original estimate.

Please let me know when we can schedule a re-inspection or if you require any additional documentation.

Thank you for your attention to this matter.

Best regards`;
      } else if (type.includes("follow")) {
        subject = `Status Update Request - ${claim.claim_number || claim.policyholder_name}`;
        body = `Dear Claims Department,

I am following up on the status of the above-referenced claim.

Could you please provide an update on the current status and expected timeline for resolution?

Thank you for your assistance.

Best regards`;
      } else {
        subject = `Regarding Claim - ${claim.claim_number || claim.policyholder_name}`;
        body = `Dear Claims Department,

[Your message here]

Best regards`;
      }

      const result = `📧 **Draft Email**

**To:** ${claim.adjuster_email || claim.insurance_email || "[adjuster email]"}
**Subject:** ${subject}

${body}`;

      return { content: [{ type: "text", text: result }] };
    }
  }
);

// Tool: draft_sms
mcpServer.tool(
  "draft_sms",
  {
    description: "Draft an SMS message to the policyholder. Supports types: 'inspection', 'update', or 'general'.",
    inputSchema: {
      type: "object",
      properties: {
        claim_id: {
          type: "string",
          description: "The UUID of the claim"
        },
        sms_type: {
          type: "string",
          description: "Type of SMS: 'inspection', 'update', or 'general'"
        }
      },
      required: ["claim_id"]
    },
    handler: async ({ claim_id, sms_type }: { claim_id: string; sms_type?: string }) => {
      if (!currentContext) {
        return { content: [{ type: "text", text: "Not authenticated" }] };
      }
      const { supabase, userId } = currentContext;

      const { data: claim, error } = await supabase
        .from("claims")
        .select("*")
        .eq("id", claim_id)
        .single();

      if (error || !claim) {
        return { content: [{ type: "text", text: "Claim not found." }] };
      }

      await logMessage(supabase, userId, "inbound", `draft_sms: ${sms_type || "general"}`, "draft_sms", claim_id);

      const type = (sms_type || "general").toLowerCase();
      const firstName = claim.policyholder_name?.split(" ")[0] || "there";
      let body = "";

      if (type.includes("inspection")) {
        body = `Hi ${firstName}, this is a reminder about your upcoming property inspection. Please let us know if you have any questions.`;
      } else if (type.includes("update") || type.includes("status")) {
        body = `Hi ${firstName}, we have an update on your claim. Please call us at your convenience or check your email for details.`;
      } else {
        body = `Hi ${firstName}, [your message here]`;
      }

      const result = `📱 **Draft SMS**

**To:** ${claim.policyholder_phone || "[phone]"}

${body}`;

      return { content: [{ type: "text", text: result }] };
    }
  }
);

// Tool: get_summary
mcpServer.tool(
  "get_summary",
  {
    description: "Get a daily summary of your claims workload including active claims, tasks due today, and overdue tasks.",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    },
    handler: async () => {
      if (!currentContext) {
        return { content: [{ type: "text", text: "Not authenticated" }] };
      }
      const { supabase, userId } = currentContext;
      const today = new Date().toISOString().split("T")[0];
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [claimsResult, tasksResult, overdueResult] = await Promise.all([
        supabase.from("claims").select("id", { count: "exact" }).eq("is_closed", false),
        supabase.from("tasks").select("id", { count: "exact" }).eq("due_date", today).neq("status", "completed"),
        supabase.from("tasks").select("id", { count: "exact" }).lt("due_date", today).neq("status", "completed"),
      ]);

      const activeClaims = claimsResult.count || 0;
      const tasksDueToday = tasksResult.count || 0;
      const overdueTasks = overdueResult.count || 0;

      const { data: recentClaims } = await supabase
        .from("claims")
        .select("policyholder_name, status, updated_at")
        .gte("updated_at", weekAgo)
        .order("updated_at", { ascending: false })
        .limit(5);

      await logMessage(supabase, userId, "inbound", "get_summary", "get_summary");

      let summary = `📊 **Your Claims Summary**

• Active Claims: **${activeClaims}**
• Tasks Due Today: **${tasksDueToday}**
• Overdue Tasks: **${overdueTasks}**`;

      if (recentClaims && recentClaims.length > 0) {
        summary += `\n\n📋 **Recent Activity:**`;
        // deno-lint-ignore no-explicit-any
        recentClaims.forEach((c: any) => {
          summary += `\n• ${c.policyholder_name} - ${c.status}`;
        });
      }

      return { content: [{ type: "text", text: summary }] };
    }
  }
);

// Create transport and bind to server
const transport = new StreamableHttpTransport();
const httpHandler = transport.bind(mcpServer);

const app = new Hono();

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-clawdbot-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

app.options("/*", (c) => {
  return c.newResponse(null, { headers: corsHeaders });
});

app.all("/*", async (c) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Verify the secret from headers
  const secret = c.req.header("X-Clawdbot-Secret") ?? null;
  const verification = await verifySecret(secret, supabase);

  if (!verification.valid) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Set context for tools to access
  currentContext = { supabase, userId: verification.userId! };

  try {
    // Call the bound handler with the raw request
    const response = await httpHandler(c.req.raw);
    
    // Add CORS headers to response
    const newHeaders = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      newHeaders.set(key, value);
    });
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  } finally {
    currentContext = null;
  }
});

Deno.serve(app.fetch);
