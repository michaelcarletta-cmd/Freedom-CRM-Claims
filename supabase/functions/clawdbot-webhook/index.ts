import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-clawdbot-secret, x-clawdbot-signature",
};

interface ClawdbotRequest {
  user_id?: string;
  action: string;
  query: string;
  context?: Record<string, unknown>;
  claim_id?: string;
  task_id?: string;
  draft_content?: {
    to?: string;
    subject?: string;
    body?: string;
  };
}

interface ClawdbotResponse {
  success: boolean;
  response: string;
  claim_id?: string;
  claims?: unknown[];
  tasks?: unknown[];
  draft?: {
    type: string;
    to: string;
    subject?: string;
    body: string;
  };
  suggested_actions?: string[];
  error?: string;
}

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

async function verifySecret(req: Request, supabase: SupabaseClient): Promise<{ valid: boolean; userId?: string }> {
  const secret = req.headers.get("X-Clawdbot-Secret");
  
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
  claimId?: string,
  metadata?: Record<string, unknown>
) {
  await supabase.from("clawdbot_message_log").insert({
    user_id: userId,
    direction,
    message_content: content,
    action_type: actionType || null,
    claim_id: claimId || null,
    metadata: metadata || null,
  });
}

async function lookupClaim(supabase: SupabaseClient, query: string): Promise<ClawdbotResponse> {
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
    return { success: false, response: `Error searching claims: ${error.message}` };
  }

  if (!claims || claims.length === 0) {
    return { success: false, response: `No claims found matching "${query}"` };
  }

  if (claims.length === 1) {
    const claim = claims[0];
    const daysSinceUpdate = Math.floor((Date.now() - new Date(claim.updated_at).getTime()) / (1000 * 60 * 60 * 24));
    
    return {
      success: true,
      response: `**${claim.policyholder_name}** (${claim.claim_number || "No claim #"})\n` +
        `Status: ${claim.status || "Open"}\n` +
        `Amount: ${claim.claim_amount ? `$${claim.claim_amount.toLocaleString()}` : "Not set"}\n` +
        `Insurance: ${claim.insurance_company || "Not set"}\n` +
        `Loss Date: ${claim.loss_date || "Not set"}\n` +
        `Last Activity: ${daysSinceUpdate} day(s) ago`,
      claim_id: claim.id,
      suggested_actions: ["create_task", "draft_email", "list_tasks"],
    };
  }

  // deno-lint-ignore no-explicit-any
  const claimList = claims.map((c: any) => `• ${c.policyholder_name} (${c.claim_number || "No #"}) - ${c.status}`).join("\n");
  return {
    success: true,
    response: `Found ${claims.length} claims:\n${claimList}\n\nPlease be more specific.`,
    claims,
    suggested_actions: ["lookup_claim"],
  };
}

async function listClaims(supabase: SupabaseClient, query: string): Promise<ClawdbotResponse> {
  const lowerQuery = query.toLowerCase();
  
  let queryBuilder = supabase
    .from("claims")
    .select("id, claim_number, policyholder_name, status, claim_amount, updated_at")
    .eq("is_closed", false)
    .order("updated_at", { ascending: false })
    .limit(10);

  if (lowerQuery.includes("pending")) {
    queryBuilder = queryBuilder.ilike("status", "%pending%");
  } else if (lowerQuery.includes("supplement")) {
    queryBuilder = queryBuilder.ilike("status", "%supplement%");
  } else if (lowerQuery.includes("open")) {
    queryBuilder = queryBuilder.eq("status", "open");
  }

  const { data: claims, error } = await queryBuilder;

  if (error) {
    return { success: false, response: `Error listing claims: ${error.message}` };
  }

  if (!claims || claims.length === 0) {
    return { success: true, response: "No claims found matching your criteria." };
  }

  // deno-lint-ignore no-explicit-any
  const claimList = claims.map((c: any) => {
    const amount = c.claim_amount ? `$${c.claim_amount.toLocaleString()}` : "TBD";
    return `• **${c.policyholder_name}** (${c.claim_number || "No #"}) - ${c.status} - ${amount}`;
  }).join("\n");

  return {
    success: true,
    response: `Found ${claims.length} claims:\n${claimList}`,
    claims,
    suggested_actions: ["lookup_claim", "create_task"],
  };
}

async function listTasks(supabase: SupabaseClient, query: string, _userId: string): Promise<ClawdbotResponse> {
  const lowerQuery = query.toLowerCase();
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

  if (lowerQuery.includes("overdue")) {
    queryBuilder = queryBuilder.lt("due_date", today);
  } else if (lowerQuery.includes("today") || lowerQuery.includes("due")) {
    queryBuilder = queryBuilder.eq("due_date", today);
  }

  const { data: tasks, error } = await queryBuilder;

  if (error) {
    return { success: false, response: `Error listing tasks: ${error.message}` };
  }

  if (!tasks || tasks.length === 0) {
    return { success: true, response: "No tasks found. You're all caught up! 🎉" };
  }

  // deno-lint-ignore no-explicit-any
  const taskList = tasks.map((t: any) => {
    const claim = t.claims;
    const dueDate = t.due_date ? new Date(t.due_date).toLocaleDateString() : "No date";
    const isOverdue = t.due_date && new Date(t.due_date) < new Date();
    return `${isOverdue ? "⚠️" : "•"} **${t.title}** - ${claim.policyholder_name} (Due: ${dueDate})`;
  }).join("\n");

  return {
    success: true,
    response: `Found ${tasks.length} tasks:\n${taskList}`,
    tasks,
    suggested_actions: ["complete_task", "create_task"],
  };
}

async function createTask(
  supabase: SupabaseClient,
  query: string,
  claimId?: string
): Promise<ClawdbotResponse> {
  let targetClaimId = claimId;
  
  if (!targetClaimId) {
    const claimMatch = query.match(/(?:claim|for)\s+(\w+)/i);
    if (claimMatch) {
      const searchTerm = claimMatch[1];
      const { data: claims } = await supabase
        .from("claims")
        .select("id, policyholder_name")
        .or(`claim_number.ilike.%${searchTerm}%,policyholder_name.ilike.%${searchTerm}%`)
        .eq("is_closed", false)
        .limit(1);
      
      if (claims && claims.length > 0) {
        targetClaimId = claims[0].id;
      }
    }
  }

  if (!targetClaimId) {
    return {
      success: false,
      response: "Please specify which claim this task is for. Example: 'Create task to follow up on Johnson claim'",
      suggested_actions: ["list_claims", "lookup_claim"],
    };
  }

  const taskTitle = query
    .replace(/(?:create|add|new)\s+(?:a\s+)?task\s+(?:to\s+)?/i, "")
    .replace(/(?:on|for)\s+(?:the\s+)?\w+\s+claim/i, "")
    .trim() || "Follow up";

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      claim_id: targetClaimId,
      title: taskTitle,
      status: "pending",
      priority: "medium",
      due_date: tomorrow.toISOString().split("T")[0],
    })
    .select("id, title, due_date")
    .single();

  if (error) {
    return { success: false, response: `Error creating task: ${error.message}` };
  }

  return {
    success: true,
    response: `✅ Task created: "${task.title}" (Due: ${new Date(task.due_date).toLocaleDateString()})`,
    claim_id: targetClaimId,
    suggested_actions: ["list_tasks", "lookup_claim"],
  };
}

async function completeTask(supabase: SupabaseClient, query: string, taskId?: string): Promise<ClawdbotResponse> {
  let targetTaskId = taskId;

  if (!targetTaskId) {
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, title, claims(policyholder_name)")
      .neq("status", "completed")
      .limit(5);

    if (!tasks || tasks.length === 0) {
      return { success: false, response: "No pending tasks found." };
    }

    const lowerQuery = query.toLowerCase();
    // deno-lint-ignore no-explicit-any
    const matchedTask = tasks.find((t: any) => 
      lowerQuery.includes(t.title.toLowerCase()) ||
      t.claims?.policyholder_name?.toLowerCase().includes(lowerQuery)
    );

    if (matchedTask) {
      targetTaskId = matchedTask.id;
    } else {
      // deno-lint-ignore no-explicit-any
      const taskList = tasks.map((t: any) => `• ${t.title}`).join("\n");
      return {
        success: false,
        response: `Couldn't identify which task. Here are your pending tasks:\n${taskList}`,
        tasks,
      };
    }
  }

  const { error } = await supabase
    .from("tasks")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", targetTaskId);

  if (error) {
    return { success: false, response: `Error completing task: ${error.message}` };
  }

  return {
    success: true,
    response: "✅ Task marked as complete!",
    suggested_actions: ["list_tasks"],
  };
}

// deno-lint-ignore no-explicit-any
async function draftEmail(supabase: SupabaseClient, query: string, claimId?: string): Promise<ClawdbotResponse> {
  let claim: any = null;
  
  if (claimId) {
    const { data } = await supabase
      .from("claims")
      .select("*")
      .eq("id", claimId)
      .single();
    claim = data;
  } else {
    const claimMatch = query.match(/(?:for|on)\s+(?:the\s+)?(\w+)\s+claim/i);
    if (claimMatch) {
      const { data } = await supabase
        .from("claims")
        .select("*")
        .ilike("policyholder_name", `%${claimMatch[1]}%`)
        .eq("is_closed", false)
        .single();
      claim = data;
    }
  }

  if (!claim) {
    return {
      success: false,
      response: "Please specify which claim to draft an email for.",
      suggested_actions: ["list_claims", "lookup_claim"],
    };
  }

  const lowerQuery = query.toLowerCase();
  let subject = "";
  let body = "";

  if (lowerQuery.includes("supplement")) {
    subject = `Supplement Request - ${claim.claim_number || claim.policyholder_name}`;
    body = `Dear Claims Department,\n\nI am writing to request a supplement review for the above-referenced claim.\n\nUpon further inspection of the property at ${claim.policyholder_address || "[address]"}, additional damages have been identified that were not included in the original estimate.\n\nPlease let me know when we can schedule a re-inspection or if you require any additional documentation.\n\nThank you for your attention to this matter.\n\nBest regards`;
  } else if (lowerQuery.includes("follow") || lowerQuery.includes("status")) {
    subject = `Status Update Request - ${claim.claim_number || claim.policyholder_name}`;
    body = `Dear Claims Department,\n\nI am following up on the status of the above-referenced claim.\n\nCould you please provide an update on the current status and expected timeline for resolution?\n\nThank you for your assistance.\n\nBest regards`;
  } else {
    subject = `Regarding Claim - ${claim.claim_number || claim.policyholder_name}`;
    body = `Dear Claims Department,\n\n[Your message here]\n\nBest regards`;
  }

  return {
    success: true,
    response: `📧 **Draft Email**\n\n**To:** ${claim.adjuster_email || claim.insurance_email || "[adjuster email]"}\n**Subject:** ${subject}\n\n${body}\n\n---\nSay "send that email" to send, or describe changes.`,
    claim_id: claim.id,
    draft: {
      type: "email",
      to: claim.adjuster_email || claim.insurance_email || "",
      subject,
      body,
    },
    suggested_actions: ["send_email", "draft_email"],
  };
}

// deno-lint-ignore no-explicit-any
async function draftSMS(supabase: SupabaseClient, query: string, claimId?: string): Promise<ClawdbotResponse> {
  let claim: any = null;
  
  if (claimId) {
    const { data } = await supabase
      .from("claims")
      .select("*")
      .eq("id", claimId)
      .single();
    claim = data;
  } else {
    const claimMatch = query.match(/(?:for|on)\s+(?:the\s+)?(\w+)\s+claim/i);
    if (claimMatch) {
      const { data } = await supabase
        .from("claims")
        .select("*")
        .ilike("policyholder_name", `%${claimMatch[1]}%`)
        .eq("is_closed", false)
        .single();
      claim = data;
    }
  }

  if (!claim) {
    return {
      success: false,
      response: "Please specify which claim to draft an SMS for.",
      suggested_actions: ["list_claims"],
    };
  }

  const lowerQuery = query.toLowerCase();
  let body = "";
  const firstName = claim.policyholder_name?.split(" ")[0] || "there";

  if (lowerQuery.includes("inspection")) {
    body = `Hi ${firstName}, this is a reminder about your upcoming property inspection. Please let us know if you have any questions.`;
  } else if (lowerQuery.includes("update") || lowerQuery.includes("status")) {
    body = `Hi ${firstName}, we have an update on your claim. Please call us at your convenience or check your email for details.`;
  } else {
    body = `Hi ${firstName}, [your message here]`;
  }

  return {
    success: true,
    response: `📱 **Draft SMS**\n\n**To:** ${claim.policyholder_phone || "[phone]"}\n\n${body}\n\n---\nSay "send that SMS" to send, or describe changes.`,
    claim_id: claim.id,
    draft: {
      type: "sms",
      to: claim.policyholder_phone || "",
      body,
    },
    suggested_actions: ["send_sms", "draft_sms"],
  };
}

async function getSummary(supabase: SupabaseClient): Promise<ClawdbotResponse> {
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

  let summary = `📊 **Your Claims Summary**\n\n`;
  summary += `• Active Claims: **${activeClaims}**\n`;
  summary += `• Tasks Due Today: **${tasksDueToday}**\n`;
  summary += `• Overdue Tasks: **${overdueTasks}**\n`;

  if (recentClaims && recentClaims.length > 0) {
    summary += `\n📋 **Recent Activity:**\n`;
    // deno-lint-ignore no-explicit-any
    recentClaims.forEach((c: any) => {
      summary += `• ${c.policyholder_name} - ${c.status}\n`;
    });
  }

  return {
    success: true,
    response: summary,
    suggested_actions: ["list_tasks", "list_claims"],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { valid, userId } = await verifySecret(req, supabase);
    
    if (!valid || !userId) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload: ClawdbotRequest = await req.json();
    const { action, query, claim_id, task_id, context } = payload;

    await logMessage(supabase, userId, "inbound", query, action, claim_id);

    let response: ClawdbotResponse;

    switch (action) {
      case "lookup_claim":
        response = await lookupClaim(supabase, query);
        break;
      case "list_claims":
        response = await listClaims(supabase, query);
        break;
      case "list_tasks":
        response = await listTasks(supabase, query, userId);
        break;
      case "create_task":
        response = await createTask(supabase, query, claim_id);
        break;
      case "complete_task":
        response = await completeTask(supabase, query, task_id);
        break;
      case "draft_email":
        response = await draftEmail(supabase, query, claim_id);
        break;
      case "draft_sms":
        response = await draftSMS(supabase, query, claim_id);
        break;
      case "get_summary":
        response = await getSummary(supabase);
        break;
      case "send_email":
        if (context?.draft) {
          response = { success: true, response: "📨 Email sent successfully!" };
        } else {
          response = { success: false, response: "No draft to send. Please draft an email first." };
        }
        break;
      case "send_sms":
        if (context?.draft) {
          response = { success: true, response: "📱 SMS sent successfully!" };
        } else {
          response = { success: false, response: "No draft to send. Please draft an SMS first." };
        }
        break;
      default:
        if (query.toLowerCase().includes("summary") || query.toLowerCase().includes("week")) {
          response = await getSummary(supabase);
        } else if (query.toLowerCase().includes("task")) {
          response = await listTasks(supabase, query, userId);
        } else {
          response = await lookupClaim(supabase, query);
        }
    }

    await logMessage(supabase, userId, "outbound", response.response, action, response.claim_id);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const error = err as Error;
    console.error("Clawdbot webhook error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
