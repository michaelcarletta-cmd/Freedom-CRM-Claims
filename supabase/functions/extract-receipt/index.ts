import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { imageBase64, mimeType } = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: 'No image data provided' }), { status: 400, headers: corsHeaders });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI API key not configured' }), { status: 500, headers: corsHeaders });
    }

    const prompt = `You are a receipt/invoice data extraction expert. Analyze this receipt image and extract ALL line items with their amounts.

Return a JSON object with this exact structure:
{
  "vendor_name": "Store/restaurant name",
  "date": "YYYY-MM-DD format if visible, otherwise null",
  "line_items": [
    {
      "description": "Item description",
      "amount": 12.99,
      "category": "meals|lodging|storage|transportation|laundry|pet_boarding|other"
    }
  ],
  "subtotal": 45.99,
  "tax": 3.50,
  "total": 49.49
}

Category mapping guide:
- Food, drinks, restaurant items → "meals"
- Hotel, Airbnb, rental → "lodging"
- Storage unit fees → "storage"
- Gas, uber, parking, tolls → "transportation"
- Laundromat, dry cleaning → "laundry"
- Pet kennel, vet boarding → "pet_boarding"
- Everything else → "other"

If you cannot read the receipt clearly, still extract what you can. Always return valid JSON.`;

    const response = await fetch('https://api.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', errorText);
      return new Response(JSON.stringify({ error: 'AI analysis failed' }), { status: 500, headers: corsHeaders });
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || '';

    // Extract JSON from the response
    let extracted;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extracted = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      return new Response(JSON.stringify({ error: 'Failed to parse receipt data', raw: content }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ success: true, data: extracted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
