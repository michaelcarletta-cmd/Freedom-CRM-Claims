import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TELNYX_API_KEY = Deno.env.get('TELNYX_API_KEY');
    const TELNYX_PHONE_NUMBER = Deno.env.get('TELNYX_PHONE_NUMBER');
    const TELNYX_MESSAGING_PROFILE_ID = Deno.env.get('TELNYX_MESSAGING_PROFILE_ID');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    if (!TELNYX_API_KEY || !TELNYX_PHONE_NUMBER) {
      throw new Error('Missing Telnyx credentials');
    }

    // Validate auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { claimId, toNumber, messageBody } = await req.json();

    if (!claimId || !toNumber || !messageBody) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: claimId, toNumber, messageBody' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize phone number to E.164 format
    const normalizePhone = (phone: string): string => {
      const digits = phone.replace(/\D/g, '');
      if (digits.length === 10) return `+1${digits}`;
      if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
      return phone.startsWith('+') ? phone : `+${digits}`;
    };

    const normalizedToNumber = normalizePhone(toNumber);

    console.log(`Sending SMS to ${normalizedToNumber} for claim ${claimId}`);

    // Send SMS via Telnyx
    const telnyxResponse = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: TELNYX_PHONE_NUMBER,
        to: normalizedToNumber,
        text: messageBody,
        messaging_profile_id: TELNYX_MESSAGING_PROFILE_ID,
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
        to_number: normalizedToNumber,
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
