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
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const payload = await req.json();
    console.log('Telnyx webhook received:', JSON.stringify(payload));

    // Telnyx sends events in a data wrapper
    const eventType = payload.data?.event_type;
    const messagePayload = payload.data?.payload;
    
    // Handle status update events (sent, delivered, failed, etc.)
    if (eventType?.startsWith('message.') && eventType !== 'message.received') {
      const telnyxMessageId = messagePayload?.id;
      const status = messagePayload?.to?.[0]?.status || eventType?.replace('message.', '');
      
      if (!telnyxMessageId) {
        console.log('No message ID in status payload');
        return new Response(JSON.stringify({ success: true, ignored: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`Status update for message ${telnyxMessageId}: ${status}`);

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      // Map Telnyx status to our status
      let mappedStatus = status;
      if (status === 'delivered' || status === 'sent') {
        mappedStatus = status;
      } else if (status === 'sending' || status === 'queued') {
        mappedStatus = 'sending';
      } else if (status === 'delivery_failed' || status === 'sending_failed') {
        mappedStatus = 'failed';
      }

      // Update the SMS message status
      const { error } = await supabase
        .from('sms_messages')
        .update({ 
          status: mappedStatus,
          updated_at: new Date().toISOString()
        })
        .eq('telnyx_message_id', telnyxMessageId);

      if (error) {
        console.log('Could not update message status:', error.message);
      } else {
        console.log('Updated SMS status to:', mappedStatus);
      }

      return new Response(
        JSON.stringify({ success: true, status: mappedStatus }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (eventType !== 'message.received') {
      console.log('Ignoring non-message event:', eventType);
      return new Response(JSON.stringify({ success: true, ignored: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fromNumber = messagePayload?.from?.phone_number;
    const toNumber = messagePayload?.to?.[0]?.phone_number;
    const messageBody = messagePayload?.text;
    const messageId = messagePayload?.id;

    if (!fromNumber || !messageBody) {
      console.error('Missing required message fields');
      return new Response(
        JSON.stringify({ error: 'Missing required message fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Inbound SMS from ${fromNumber}: ${messageBody}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Try to find a claim associated with this phone number
    // Check policyholder_phone, adjuster_phone, or any claim_adjusters
    const { data: claims } = await supabase
      .from('claims')
      .select('id, policyholder_phone, adjuster_phone')
      .or(`policyholder_phone.ilike.%${fromNumber.slice(-10)}%,adjuster_phone.ilike.%${fromNumber.slice(-10)}%`);

    let claimId = claims?.[0]?.id;

    // If not found in main claims, check claim_adjusters
    if (!claimId) {
      const { data: adjusters } = await supabase
        .from('claim_adjusters')
        .select('claim_id, adjuster_phone')
        .ilike('adjuster_phone', `%${fromNumber.slice(-10)}%`);
      
      claimId = adjusters?.[0]?.claim_id;
    }

    if (!claimId) {
      console.log('No claim found for phone number:', fromNumber);
      // Store as orphan message - could create a queue for manual assignment
      return new Response(
        JSON.stringify({ 
          success: true, 
          warning: 'No matching claim found for this phone number',
          fromNumber 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Store the inbound SMS
    const { data: smsRecord, error: dbError } = await supabase
      .from('sms_messages')
      .insert({
        claim_id: claimId,
        from_number: fromNumber,
        to_number: toNumber || '',
        message_body: messageBody,
        status: 'received',
        direction: 'inbound',
        telnyx_message_id: messageId,
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      throw new Error(`Failed to store inbound SMS: ${dbError.message}`);
    }

    console.log('Inbound SMS stored for claim:', claimId);

    // Identify sender type for automation triggers
    let senderType: 'insurance' | 'client' | 'contractor' | 'unknown' = 'unknown';
    const matchedClaim = claims?.[0];
    const fromNumberLast10 = fromNumber.slice(-10);
    
    if (matchedClaim) {
      // Check if sender matches policyholder
      if (matchedClaim.policyholder_phone?.includes(fromNumberLast10)) {
        senderType = 'client';
      }
      // Check if sender matches adjuster
      else if (matchedClaim.adjuster_phone?.includes(fromNumberLast10)) {
        senderType = 'insurance';
      }
    }
    
    // Check claim_adjusters if not found
    if (senderType === 'unknown') {
      const { data: adjusters } = await supabase
        .from('claim_adjusters')
        .select('adjuster_phone')
        .eq('claim_id', claimId);
      
      if (adjusters?.some(a => a.adjuster_phone?.includes(fromNumberLast10))) {
        senderType = 'insurance';
      }
    }
    
    // Check contractors
    if (senderType === 'unknown') {
      const { data: contractors } = await supabase
        .from('claim_contractors')
        .select('contractor_id')
        .eq('claim_id', claimId);
      
      if (contractors && contractors.length > 0) {
        const contractorIds = contractors.map(c => c.contractor_id);
        const { data: clients } = await supabase
          .from('clients')
          .select('phone')
          .in('id', contractorIds);
        
        if (clients?.some(c => c.phone?.includes(fromNumberLast10))) {
          senderType = 'contractor';
        }
      }
    }
    
    console.log(`Identified SMS sender type: ${senderType}`);

    // Check for inbound_sms automations
    const { data: smsAutomations } = await supabase
      .from('automations')
      .select('*')
      .eq('trigger_type', 'inbound_sms')
      .eq('is_active', true);

    if (smsAutomations && smsAutomations.length > 0) {
      for (const automation of smsAutomations) {
        const config = automation.trigger_config as { sender_type?: string } || {};
        const configSenderType = config.sender_type || 'any';
        
        // Check if this automation should trigger
        if (configSenderType === 'any' || configSenderType === senderType) {
          console.log(`Queueing SMS automation "${automation.name}" for claim ${claimId}`);
          
          // Create execution record
          await supabase
            .from('automation_executions')
            .insert({
              automation_id: automation.id,
              claim_id: claimId,
              status: 'pending',
              trigger_data: {
                sms_id: smsRecord.id,
                from_number: fromNumber,
                sender_type: senderType,
                message_body: messageBody,
              },
            });
        }
      }
    }

    // Update claim's updated_at to bubble it up in the list
    await supabase
      .from('claims')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', claimId);

    // Add a claim update for visibility
    await supabase
      .from('claim_updates')
      .insert({
        claim_id: claimId,
        content: `Inbound SMS received from ${fromNumber}: "${messageBody.substring(0, 100)}${messageBody.length > 100 ? '...' : ''}"`,
        update_type: 'sms_received',
      });

    return new Response(
      JSON.stringify({ 
        success: true, 
        claimId,
        smsRecord 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error: any) {
    console.error('Error in telnyx-inbound-sms function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
