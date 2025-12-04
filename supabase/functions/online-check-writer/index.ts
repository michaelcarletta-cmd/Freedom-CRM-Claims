import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const API_KEY = Deno.env.get('ONLINE_CHECK_WRITER_API_KEY');
const API_BASE_URL = 'https://apiv3.onlinecheckwriter.com';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, checkData, payeeData } = await req.json();
    console.log('Online Check Writer action:', action);

    if (!API_KEY) {
      throw new Error('Online Check Writer API key not configured');
    }

    const headers = {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (action === 'get-bank-accounts') {
      // Get list of bank accounts configured in Online Check Writer
      const response = await fetch(`${API_BASE_URL}/bank-accounts`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Get bank accounts error:', errorText);
        throw new Error(`Failed to get bank accounts: ${errorText}`);
      }

      const result = await response.json();
      console.log('Bank accounts fetched:', result);

      return new Response(JSON.stringify({ 
        success: true, 
        accounts: result.data || result 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'create-payee') {
      // Create a payee in Online Check Writer
      const response = await fetch(`${API_BASE_URL}/payees`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: payeeData.name,
          email: payeeData.email || null,
          phone: payeeData.phone || null,
          address: payeeData.address || null,
          city: payeeData.city || null,
          state: payeeData.state || null,
          zip: payeeData.zip || null,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Create payee error:', errorText);
        throw new Error(`Failed to create payee: ${errorText}`);
      }

      const result = await response.json();
      console.log('Payee created:', result);

      return new Response(JSON.stringify({ 
        success: true, 
        payee: result.data || result 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'search-payee') {
      // Search for existing payee
      const response = await fetch(`${API_BASE_URL}/payees?search=${encodeURIComponent(payeeData.name)}`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Search payee error:', errorText);
        throw new Error(`Failed to search payee: ${errorText}`);
      }

      const result = await response.json();
      console.log('Payee search results:', result);

      return new Response(JSON.stringify({ 
        success: true, 
        payees: result.data || result 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'create-check') {
      // Create a check that can be printed, mailed, or emailed
      const response = await fetch(`${API_BASE_URL}/checks`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          bank_account_id: checkData.bankAccountId,
          payee_id: checkData.payeeId,
          payee_name: checkData.payeeName,
          amount: checkData.amount,
          memo: checkData.memo || '',
          date: checkData.date || new Date().toISOString().split('T')[0],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Create check error:', errorText);
        throw new Error(`Failed to create check: ${errorText}`);
      }

      const result = await response.json();
      console.log('Check created:', result);

      return new Response(JSON.stringify({ 
        success: true, 
        check: result.data || result 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'print-check') {
      // Generate printable PDF of check
      const response = await fetch(`${API_BASE_URL}/checks/${checkData.checkId}/print`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Print check error:', errorText);
        throw new Error(`Failed to get printable check: ${errorText}`);
      }

      const result = await response.json();
      console.log('Print check URL:', result);

      return new Response(JSON.stringify({ 
        success: true, 
        printUrl: result.url || result.data?.url 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'mail-check') {
      // Mail a physical check via USPS/FedEx
      const response = await fetch(`${API_BASE_URL}/checks/${checkData.checkId}/mail`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          shipping_method: checkData.shippingMethod || 'usps_first_class',
          address: {
            name: checkData.recipientName,
            address1: checkData.address1,
            address2: checkData.address2 || '',
            city: checkData.city,
            state: checkData.state,
            zip: checkData.zip,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Mail check error:', errorText);
        throw new Error(`Failed to mail check: ${errorText}`);
      }

      const result = await response.json();
      console.log('Check mailed:', result);

      return new Response(JSON.stringify({ 
        success: true, 
        mailResult: result.data || result 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'email-check') {
      // Email a digital check (eCheck)
      const response = await fetch(`${API_BASE_URL}/checks/${checkData.checkId}/email`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email: checkData.email,
          message: checkData.message || 'Please find your check attached.',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Email check error:', errorText);
        throw new Error(`Failed to email check: ${errorText}`);
      }

      const result = await response.json();
      console.log('Check emailed:', result);

      return new Response(JSON.stringify({ 
        success: true, 
        emailResult: result.data || result 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error('Invalid action');
  } catch (error: unknown) {
    console.error('Online Check Writer error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
