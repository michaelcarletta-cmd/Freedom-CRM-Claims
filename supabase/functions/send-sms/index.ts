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
    const TELNYX_API_KEY = Deno.env.get('TELNYX_API_KEY');
    const TELNYX_PHONE_NUMBER = Deno.env.get('TELNYX_PHONE_NUMBER');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!TELNYX_API_KEY || !TELNYX_PHONE_NUMBER) {
      throw new Error('Missing Telnyx credentials');
    }

    const { claimId, toNumber, messageBody } = await req.json();

    if (!claimId || !toNumber || !messageBody) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: claimId, toNumber, messageBody' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user ID from auth header
    const authHeader = req.headers.get('Authorization');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader || '' } }
    });
    
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Sending SMS to ${toNumber} for claim ${claimId}`);

    // Send SMS via Telnyx
    const telnyxResponse = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: TELNYX_PHONE_NUMBER,
        to: toNumber,
        text: messageBody,
      }),
    });

    const telnyxData = await telnyxResponse.json();

    if (!telnyxResponse.ok) {
      console.error('Telnyx error:', telnyxData);
      throw new Error(`Telnyx API error: ${telnyxData.errors?.[0]?.detail || 'Unknown error'}`);
    }

    const messageId = telnyxData.data?.id;
    console.log('SMS sent successfully:', messageId);

    // Store SMS in database using service role client
    const serviceSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const { data: smsRecord, error: dbError } = await serviceSupabase
      .from('sms_messages')
      .insert({
        claim_id: claimId,
        from_number: TELNYX_PHONE_NUMBER,
        to_number: toNumber,
        message_body: messageBody,
        status: telnyxData.data?.to?.[0]?.status || 'queued',
        direction: 'outbound',
        telnyx_message_id: messageId,
        user_id: user.id,
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      throw new Error(`Failed to store SMS: ${dbError.message}`);
    }

    console.log('SMS stored in database:', smsRecord.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: messageId,
        smsRecord 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error: any) {
    console.error('Error in send-sms function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
