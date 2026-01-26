import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationPayload {
  type: "notification";
  priority: "high" | "medium" | "low";
  category: string;
  message: string;
  claim_id?: string;
  claim_name?: string;
  action_buttons?: { label: string; action: string; data?: Record<string, unknown> }[];
}

async function sendNotification(endpoint: string, secret: string, payload: NotificationPayload) {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Clawdbot-Secret": secret,
      },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch (error) {
    console.error("Failed to send notification:", error);
    return false;
  }
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

    const { data: configs, error: configError } = await supabase
      .from("clawdbot_config")
      .select("*")
      .eq("active", true)
      .not("clawdbot_endpoint", "is", null);

    if (configError || !configs || configs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No active Clawdbot configurations" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const today = new Date().toISOString().split("T")[0];
    const notifications: { userId: string; payload: NotificationPayload }[] = [];

    // Check for overdue tasks
    const { data: overdueTasks } = await supabase
      .from("tasks")
      .select(`
        id, title, due_date, priority,
        claims!inner(id, policyholder_name, claim_number)
      `)
      .lt("due_date", today)
      .neq("status", "completed")
      .order("due_date", { ascending: true })
      .limit(10);

    if (overdueTasks && overdueTasks.length > 0) {
      // deno-lint-ignore no-explicit-any
      for (const task of overdueTasks as any[]) {
        const claim = task.claims;
        const daysOverdue = Math.floor((Date.now() - new Date(task.due_date).getTime()) / (1000 * 60 * 60 * 24));
        
        notifications.push({
          userId: "all",
          payload: {
            type: "notification",
            priority: daysOverdue > 3 ? "high" : "medium",
            category: "tasks_overdue",
            message: `⚠️ Task overdue (${daysOverdue} day${daysOverdue > 1 ? "s" : ""}): "${task.title}" on ${claim.policyholder_name} claim`,
            claim_id: claim.id,
            claim_name: claim.policyholder_name,
            action_buttons: [
              { label: "Mark Complete", action: "complete_task", data: { task_id: task.id } },
              { label: "View Claim", action: "lookup_claim", data: { claim_id: claim.id } },
            ],
          },
        });
      }
    }

    // Check for tasks due today
    const { data: tasksDueToday } = await supabase
      .from("tasks")
      .select(`
        id, title, priority,
        claims!inner(id, policyholder_name)
      `)
      .eq("due_date", today)
      .neq("status", "completed")
      .limit(10);

    if (tasksDueToday && tasksDueToday.length > 0) {
      // deno-lint-ignore no-explicit-any
      const firstTask = tasksDueToday[0] as any;
      const taskSummary = tasksDueToday.length === 1
        ? `"${firstTask.title}"`
        : `${tasksDueToday.length} tasks`;

      notifications.push({
        userId: "all",
        payload: {
          type: "notification",
          priority: "medium",
          category: "tasks_due_today",
          message: `📋 Due today: ${taskSummary}`,
          action_buttons: [
            { label: "View Tasks", action: "list_tasks", data: { filter: "today" } },
          ],
        },
      });
    }

    // Check for claims with approaching deadlines
    const { data: upcomingDeadlines } = await supabase
      .from("claim_deadlines")
      .select(`
        id, deadline_type, deadline_date, status,
        claims!inner(id, policyholder_name, claim_number)
      `)
      .eq("status", "pending")
      .gte("deadline_date", today)
      .lte("deadline_date", new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0])
      .limit(5);

    if (upcomingDeadlines && upcomingDeadlines.length > 0) {
      // deno-lint-ignore no-explicit-any
      for (const deadline of upcomingDeadlines as any[]) {
        const claim = deadline.claims;
        const daysUntil = Math.ceil((new Date(deadline.deadline_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        
        notifications.push({
          userId: "all",
          payload: {
            type: "notification",
            priority: daysUntil <= 3 ? "high" : "medium",
            category: "approaching_deadlines",
            message: `⏰ Deadline in ${daysUntil} day${daysUntil > 1 ? "s" : ""}: ${deadline.deadline_type} for ${claim.policyholder_name}`,
            claim_id: claim.id,
            claim_name: claim.policyholder_name,
            action_buttons: [
              { label: "View Claim", action: "lookup_claim", data: { claim_id: claim.id } },
            ],
          },
        });
      }
    }

    // Check for claims with no activity
    // deno-lint-ignore no-explicit-any
    for (const config of configs as any[]) {
      const prefs = config.notification_preferences || {};
      const inactiveDays = prefs.inactive_claims_days || 7;
      
      if (inactiveDays === 0) continue;
      
      const cutoffDate = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000).toISOString();
      
      const { data: inactiveClaims } = await supabase
        .from("claims")
        .select("id, policyholder_name, claim_number, status, updated_at")
        .eq("is_closed", false)
        .lt("updated_at", cutoffDate)
        .limit(5);

      if (inactiveClaims && inactiveClaims.length > 0) {
        notifications.push({
          userId: config.user_id,
          payload: {
            type: "notification",
            priority: "low",
            category: "inactive_claims",
            message: `💤 ${inactiveClaims.length} claim${inactiveClaims.length > 1 ? "s have" : " has"} no activity in ${inactiveDays}+ days`,
            action_buttons: [
              { label: "View Claims", action: "list_claims", data: { filter: "inactive" } },
            ],
          },
        });
      }
    }

    // Send notifications to each configured endpoint
    let sentCount = 0;
    
    // deno-lint-ignore no-explicit-any
    for (const config of configs as any[]) {
      if (!config.clawdbot_endpoint) continue;
      
      const prefs = config.notification_preferences || {};
      
      for (const notification of notifications) {
        if (notification.userId !== "all" && notification.userId !== config.user_id) continue;
        
        const category = notification.payload.category;
        if (prefs[category] === false) continue;
        
        const success = await sendNotification(
          config.clawdbot_endpoint,
          config.webhook_secret,
          notification.payload
        );
        
        if (success) sentCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        notifications_generated: notifications.length,
        notifications_sent: sentCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const error = err as Error;
    console.error("Clawdbot notifications error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
