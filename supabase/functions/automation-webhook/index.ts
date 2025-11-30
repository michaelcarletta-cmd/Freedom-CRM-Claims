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

    const { automation_id, claim_id, trigger_data } = await req.json();

    if (!automation_id) {
      return new Response(
        JSON.stringify({ error: 'automation_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify automation exists and is active
    const { data: automation, error: automationError } = await supabase
      .from('automations')
      .select('*')
      .eq('id', automation_id)
      .eq('is_active', true)
      .eq('trigger_type', 'webhook')
      .single();

    if (automationError || !automation) {
      return new Response(
        JSON.stringify({ error: 'Automation not found or not active' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create execution record
    const { data: execution, error: executionError } = await supabase
      .from('automation_executions')
      .insert({
        automation_id,
        claim_id,
        trigger_data: trigger_data || {},
        status: 'pending'
      })
      .select()
      .single();

    if (executionError) throw executionError;

    // Trigger the execution function
    await supabase.functions.invoke('execute-automations');

    return new Response(
      JSON.stringify({ 
        success: true, 
        execution_id: execution.id,
        message: 'Automation triggered successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
