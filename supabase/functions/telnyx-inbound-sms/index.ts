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
    
    if (eventType !== 'message.received') {
      console.log('Ignoring non-message event:', eventType);
      return new Response(JSON.stringify({ success: true, ignored: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const messagePayload = payload.data?.payload;
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
        twilio_sid: messageId, // Reusing field for Telnyx message ID
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      throw new Error(`Failed to store inbound SMS: ${dbError.message}`);
    }

    console.log('Inbound SMS stored for claim:', claimId);

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
