import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate CRON_SECRET for security
  const cronSecret = Deno.env.get('CRON_SECRET');
  const providedSecret = req.headers.get('x-cron-secret');
  
  if (cronSecret && providedSecret !== cronSecret) {
    console.error('Invalid or missing cron secret');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Checking scheduled automations...');

    // Get all active automations with scheduled or inactivity triggers
    const { data: automations, error: automationsError } = await supabase
      .from('automations')
      .select('*')
      .eq('is_active', true)
      .in('trigger_type', ['scheduled', 'inactivity']);

    if (automationsError) throw automationsError;

    console.log(`Found ${automations?.length || 0} scheduled/inactivity automations`);

    const results = [];

    for (const automation of automations || []) {
      try {
        if (automation.trigger_type === 'scheduled') {
          const scheduled = await processScheduledAutomation(supabase, automation);
          results.push({ automation_id: automation.id, type: 'scheduled', ...scheduled });
        } else if (automation.trigger_type === 'inactivity') {
          const inactivity = await processInactivityAutomation(supabase, automation);
          results.push({ automation_id: automation.id, type: 'inactivity', ...inactivity });
        }
      } catch (error: any) {
        console.error(`Error processing automation ${automation.id}:`, error);
        results.push({ automation_id: automation.id, error: error.message });
      }
    }

    // Now execute any pending automations (pass the cron secret)
    const { data: executeResult, error: executeError } = await supabase.functions.invoke('execute-automations', {
      headers: { 'x-cron-secret': cronSecret || '' }
    });
    
    if (executeError) {
      console.error('Error executing automations:', executeError);
    }

    return new Response(
      JSON.stringify({ 
        checked: results.length, 
        results,
        executed: executeResult 
      }),
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

async function processScheduledAutomation(supabase: any, automation: any) {
  const config = automation.trigger_config || {};
  const createdExecutions = [];

  if (config.schedule_type === 'days_after') {
    // Find claims created X days ago that haven't had this automation run
    const daysAgo = config.days_after_creation || 7;
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - daysAgo);
    const targetDateStr = targetDate.toISOString().split('T')[0];

    // Get claims created on the target date
    const { data: claims, error: claimsError } = await supabase
      .from('claims')
      .select('id, claim_number, created_at')
      .eq('is_closed', false)
      .gte('created_at', targetDateStr + 'T00:00:00')
      .lt('created_at', targetDateStr + 'T23:59:59');

    if (claimsError) throw claimsError;

    for (const claim of claims || []) {
      // Check if this automation already ran for this claim
      const { data: existing } = await supabase
        .from('automation_executions')
        .select('id')
        .eq('automation_id', automation.id)
        .eq('claim_id', claim.id)
        .single();

      if (!existing) {
        // Create execution
        const { data: execution, error: execError } = await supabase
          .from('automation_executions')
          .insert({
            automation_id: automation.id,
            claim_id: claim.id,
            trigger_data: { 
              triggered_by: 'scheduled',
              days_after_creation: daysAgo,
              claim_number: claim.claim_number 
            },
            status: 'pending'
          })
          .select()
          .single();

        if (execError) throw execError;
        createdExecutions.push(execution.id);
        console.log(`Created scheduled execution for claim ${claim.id}`);
      }
    }
  }

  return { created: createdExecutions.length, execution_ids: createdExecutions };
}

async function processInactivityAutomation(supabase: any, automation: any) {
  const config = automation.trigger_config || {};
  const inactivityDays = config.inactivity_days || 14;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - inactivityDays);
  const cutoffDateStr = cutoffDate.toISOString();

  const createdExecutions = [];

  // Get all open claims
  const { data: claims, error: claimsError } = await supabase
    .from('claims')
    .select('id, claim_number, updated_at')
    .eq('is_closed', false);

  if (claimsError) throw claimsError;

  for (const claim of claims || []) {
    // Check the most recent activity for this claim
    const [updatesResult, filesResult, tasksResult] = await Promise.all([
      supabase
        .from('claim_updates')
        .select('created_at')
        .eq('claim_id', claim.id)
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('claim_files')
        .select('uploaded_at')
        .eq('claim_id', claim.id)
        .order('uploaded_at', { ascending: false })
        .limit(1),
      supabase
        .from('tasks')
        .select('updated_at')
        .eq('claim_id', claim.id)
        .order('updated_at', { ascending: false })
        .limit(1),
    ]);

    // Find the most recent activity date
    const activityDates = [
      claim.updated_at,
      updatesResult.data?.[0]?.created_at,
      filesResult.data?.[0]?.uploaded_at,
      tasksResult.data?.[0]?.updated_at,
    ].filter(Boolean).map(d => new Date(d));

    const lastActivity = activityDates.length > 0 
      ? new Date(Math.max(...activityDates.map(d => d.getTime())))
      : new Date(claim.updated_at);

    // Check if claim is inactive
    if (lastActivity < cutoffDate) {
      // Check if we already created an execution for this period
      const periodStart = new Date(cutoffDate);
      periodStart.setDate(periodStart.getDate() - 1);

      const { data: existingExec } = await supabase
        .from('automation_executions')
        .select('id')
        .eq('automation_id', automation.id)
        .eq('claim_id', claim.id)
        .gte('created_at', periodStart.toISOString())
        .single();

      if (!existingExec) {
        // Create execution
        const { data: execution, error: execError } = await supabase
          .from('automation_executions')
          .insert({
            automation_id: automation.id,
            claim_id: claim.id,
            trigger_data: { 
              triggered_by: 'inactivity',
              inactivity_days: inactivityDays,
              last_activity: lastActivity.toISOString(),
              claim_number: claim.claim_number 
            },
            status: 'pending'
          })
          .select()
          .single();

        if (execError) throw execError;
        createdExecutions.push(execution.id);
        console.log(`Created inactivity execution for claim ${claim.id} (last activity: ${lastActivity.toISOString()})`);
      }
    }
  }

  return { created: createdExecutions.length, execution_ids: createdExecutions };
}
