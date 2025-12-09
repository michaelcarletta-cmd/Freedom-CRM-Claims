import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-secret',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const syncSecret = Deno.env.get('CLAIM_SYNC_SECRET');
    const requestSecret = req.headers.get('x-sync-secret');

    console.log(`Webhook received - has env secret: ${!!syncSecret}, has request secret: ${!!requestSecret}`);
    console.log(`Env secret length: ${syncSecret?.length}, Request secret length: ${requestSecret?.length}`);
    
    // Validate sync secret
    if (!syncSecret || requestSecret !== syncSecret) {
      console.error(`Secret mismatch - env first 4: ${syncSecret?.substring(0, 4)}, request first 4: ${requestSecret?.substring(0, 4)}`);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, claim_data, external_claim_id, source_instance_url, files_data, accounting_data } = await req.json();

    console.log(`Received sync request: action=${action}, external_claim_id=${external_claim_id}, source=${source_instance_url}`);

    if (action === 'create_or_update') {
      // Check if we already have this linked claim
      const { data: existingLink } = await supabase
        .from('linked_claims')
        .select('claim_id')
        .eq('external_instance_url', source_instance_url)
        .eq('external_claim_id', external_claim_id)
        .single();

      let claimId: string;

      if (existingLink) {
        // Update existing claim
        claimId = existingLink.claim_id;
        console.log(`Updating existing linked claim: ${claimId}`);
        
        const { error: updateError } = await supabase
          .from('claims')
          .update({
            claim_number: claim_data.claim_number,
            policyholder_name: claim_data.policyholder_name,
            policyholder_email: claim_data.policyholder_email,
            policyholder_phone: claim_data.policyholder_phone,
            policyholder_address: claim_data.policyholder_address,
            insurance_company: claim_data.insurance_company,
            insurance_phone: claim_data.insurance_phone,
            insurance_email: claim_data.insurance_email,
            loss_type: claim_data.loss_type,
            loss_date: claim_data.loss_date,
            loss_description: claim_data.loss_description,
            policy_number: claim_data.policy_number,
            status: claim_data.status,
            claim_amount: claim_data.claim_amount,
            updated_at: new Date().toISOString(),
          })
          .eq('id', claimId);

        if (updateError) {
          console.error('Error updating claim:', updateError);
          throw updateError;
        }
      } else {
        // Create new claim
        console.log('Creating new claim from external sync');
        
        const { data: newClaim, error: createError } = await supabase
          .from('claims')
          .insert({
            claim_number: claim_data.claim_number,
            policyholder_name: claim_data.policyholder_name,
            policyholder_email: claim_data.policyholder_email,
            policyholder_phone: claim_data.policyholder_phone,
            policyholder_address: claim_data.policyholder_address,
            insurance_company: claim_data.insurance_company,
            insurance_phone: claim_data.insurance_phone,
            insurance_email: claim_data.insurance_email,
            loss_type: claim_data.loss_type,
            loss_date: claim_data.loss_date,
            loss_description: claim_data.loss_description,
            policy_number: claim_data.policy_number,
            status: claim_data.status || 'open',
            claim_amount: claim_data.claim_amount,
          })
          .select()
          .single();

        if (createError) {
          console.error('Error creating claim:', createError);
          throw createError;
        }

        claimId = newClaim.id;

        // Create the linked_claims record
        const { error: linkError } = await supabase
          .from('linked_claims')
          .insert({
            claim_id: claimId,
            external_instance_url: source_instance_url,
            external_claim_id: external_claim_id,
            instance_name: claim_data.instance_name || 'External Instance',
            sync_status: 'synced',
            last_synced_at: new Date().toISOString(),
          });

        if (linkError) {
          console.error('Error creating link:', linkError);
          throw linkError;
        }
      }

      // Update sync status
      await supabase
        .from('linked_claims')
        .update({ 
          sync_status: 'synced', 
          last_synced_at: new Date().toISOString() 
        })
        .eq('external_instance_url', source_instance_url)
        .eq('external_claim_id', external_claim_id);

      // Sync accounting data if provided
      if (accounting_data) {
        console.log('Syncing accounting data');
        
        // Sync settlements
        if (accounting_data.settlements) {
          for (const settlement of accounting_data.settlements) {
            await supabase
              .from('claim_settlements')
              .upsert({
                claim_id: claimId,
                replacement_cost_value: settlement.replacement_cost_value,
                recoverable_depreciation: settlement.recoverable_depreciation,
                non_recoverable_depreciation: settlement.non_recoverable_depreciation,
                deductible: settlement.deductible,
                estimate_amount: settlement.estimate_amount,
                total_settlement: settlement.total_settlement,
                notes: settlement.notes,
              }, { onConflict: 'claim_id' });
          }
        }

        // Sync checks
        if (accounting_data.checks) {
          for (const check of accounting_data.checks) {
            const { data: existingCheck } = await supabase
              .from('claim_checks')
              .select('id')
              .eq('claim_id', claimId)
              .eq('check_number', check.check_number)
              .single();

            if (!existingCheck) {
              await supabase
                .from('claim_checks')
                .insert({
                  claim_id: claimId,
                  check_number: check.check_number,
                  check_type: check.check_type,
                  amount: check.amount,
                  check_date: check.check_date,
                  received_date: check.received_date,
                  notes: check.notes,
                });
            }
          }
        }
      }

      // Log activity
      await supabase
        .from('claim_updates')
        .insert({
          claim_id: claimId,
          content: `Claim synced from ${claim_data.instance_name || source_instance_url}`,
          update_type: 'sync',
        });

      console.log(`Successfully synced claim ${claimId}`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          claim_id: claimId,
          message: existingLink ? 'Claim updated' : 'Claim created'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Unknown action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Sync webhook error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
