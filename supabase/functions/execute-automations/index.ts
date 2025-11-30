import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get pending executions
    const { data: executions, error: fetchError } = await supabase
      .from('automation_executions')
      .select(`
        *,
        automation:automations(*)
      `)
      .eq('status', 'pending')
      .limit(10);

    if (fetchError) throw fetchError;

    console.log(`Processing ${executions?.length || 0} pending automations`);

    const results = [];
    for (const execution of executions || []) {
      try {
        // Update status to running
        await supabase
          .from('automation_executions')
          .update({ status: 'running' })
          .eq('id', execution.id);

        const automation = execution.automation;
        const actions = automation.actions as any[];
        const actionResults = [];

        // Execute each action
        for (const action of actions) {
          try {
            const result = await executeAction(supabase, action, execution);
            actionResults.push({ action: action.type, success: true, result });
          } catch (actionError: any) {
            console.error('Action error:', actionError);
            actionResults.push({ 
              action: action.type, 
              success: false, 
              error: actionError.message 
            });
          }
        }

        // Update execution as success
        await supabase
          .from('automation_executions')
          .update({
            status: 'success',
            result: { actions: actionResults },
            completed_at: new Date().toISOString()
          })
          .eq('id', execution.id);

        results.push({ id: execution.id, status: 'success' });
      } catch (error: any) {
        console.error('Execution error:', error);
        
        // Update execution as failed
        await supabase
          .from('automation_executions')
          .update({
            status: 'failed',
            error_message: error.message,
            completed_at: new Date().toISOString()
          })
          .eq('id', execution.id);

        results.push({ id: execution.id, status: 'failed', error: error.message });
      }
    }

    return new Response(
      JSON.stringify({ processed: results.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Function error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function executeAction(supabase: any, action: any, execution: any) {
  const { type, config } = action;

  switch (type) {
    case 'create_task':
      return await createTask(supabase, config, execution);
    
    case 'send_notification':
      return await sendNotification(supabase, config, execution);
    
    case 'update_claim':
      return await updateClaim(supabase, config, execution);
    
    case 'webhook':
      return await callWebhook(config, execution);
    
    default:
      throw new Error(`Unknown action type: ${type}`);
  }
}

async function createTask(supabase: any, config: any, execution: any) {
  const { data: claim } = await supabase
    .from('claims')
    .select('*')
    .eq('id', execution.claim_id)
    .single();

  const taskData = {
    claim_id: execution.claim_id,
    title: replaceVariables(config.title, claim, execution.trigger_data),
    description: config.description ? replaceVariables(config.description, claim, execution.trigger_data) : null,
    priority: config.priority || 'medium',
    status: 'pending',
    due_date: config.due_date,
    assigned_to: config.assigned_to,
  };

  const { data, error } = await supabase
    .from('tasks')
    .insert(taskData)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function sendNotification(supabase: any, config: any, execution: any) {
  const { data: claim } = await supabase
    .from('claims')
    .select('*')
    .eq('id', execution.claim_id)
    .single();

  // For now, just create a claim update as notification
  const message = replaceVariables(config.message, claim, execution.trigger_data);
  
  const { data, error } = await supabase
    .from('claim_updates')
    .insert({
      claim_id: execution.claim_id,
      content: message,
      update_type: 'automation'
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updateClaim(supabase: any, config: any, execution: any) {
  const updates: any = {};
  
  for (const [field, value] of Object.entries(config.updates || {})) {
    updates[field] = value;
  }

  const { data, error } = await supabase
    .from('claims')
    .update(updates)
    .eq('id', execution.claim_id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function callWebhook(config: any, execution: any) {
  const response = await fetch(config.url, {
    method: config.method || 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.headers || {})
    },
    body: JSON.stringify({
      execution_id: execution.id,
      claim_id: execution.claim_id,
      trigger_data: execution.trigger_data,
      automation_id: execution.automation_id
    })
  });

  if (!response.ok) {
    throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
  }

  return { status: response.status, statusText: response.statusText };
}

function replaceVariables(template: string, claim: any, triggerData: any): string {
  let result = template;
  
  // Replace claim variables
  if (claim) {
    result = result.replace(/\{claim\.(\w+)\}/g, (_, field) => claim[field] || '');
  }
  
  // Replace trigger variables
  if (triggerData) {
    result = result.replace(/\{trigger\.(\w+)\}/g, (_, field) => triggerData[field] || '');
  }
  
  return result;
}
