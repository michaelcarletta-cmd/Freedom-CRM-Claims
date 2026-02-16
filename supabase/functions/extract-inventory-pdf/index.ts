import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

    const { fileBase64, mimeType, fileName } = await req.json();

    if (!fileBase64) {
      return new Response(JSON.stringify({ error: 'No file data provided' }), { status: 400, headers: corsHeaders });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI API key not configured' }), { status: 500, headers: corsHeaders });
    }

    const prompt = `You are a personal property / contents inventory extraction expert for insurance claims. 
You are given a document (PDF or image) that contains a list of personal property items, such as a contents claim list, 
personal property inventory, or carrier's contents settlement sheet.

CRITICAL INSTRUCTIONS:
1. Extract EVERY SINGLE LINE ITEM. Do NOT skip, merge, or combine items. Each row in the document = one JSON object.
2. Count every item row carefully. If the document has 175 rows, you must return exactly 175 objects.
3. Go page by page, top to bottom, left to right. Do not stop early.
4. After your first pass, do a SECOND PASS to verify you haven't missed any items, especially on page boundaries.

For each item, extract as much of the following as possible:

- item_name: The name/description of the item (required)
- room_name: The room it belongs to (if listed), otherwise "Unassigned"
- quantity: Number of items (default 1)
- manufacturer: Brand or manufacturer name (if listed)
- model_number: Model number (if listed)
- original_purchase_price: Original purchase price (if listed), as a number
- replacement_cost: Replacement cost / RCV (if listed), as a number. If the document only has one price column, use it here AND in original_purchase_price.
- actual_cash_value: ACV (if listed), as a number
- condition_before_loss: Condition (new, good, fair, poor) if listed
- category: One of: Electronics, Furniture, Appliances, Clothing, Kitchenware, Decor, Bedding, Tools, Sports, Toys, Other
- age_years: Age in years if listed
- depreciation_rate: Depreciation rate as a decimal (e.g. 0.10 for 10%) if listed
- notes: Any additional notes about the item

IMPORTANT RULES:
- Extract ALL items, even if there are hundreds
- If the document has columns like "Description", "Qty", "RCV", "ACV", "Age", etc., map them to the fields above
- Convert all monetary values to plain numbers (no $ signs, no commas)
- If a room/location column exists, use it for room_name
- If there is only one price column (e.g. "Price" or "Cost"), put the value in BOTH replacement_cost and original_purchase_price
- Be thorough — do not skip items
- Do NOT merge multiple items into one entry

Return ONLY a JSON array of objects. No markdown fences, no extra text, no commentary.`;

    const contentParts: any[] = [{ type: 'text', text: prompt }];

    // Determine if it's a PDF or image
    const effectiveMime = mimeType || 'application/pdf';
    if (effectiveMime.startsWith('image/')) {
      contentParts.push({
        type: 'image_url',
        image_url: { url: `data:${effectiveMime};base64,${fileBase64}` },
      });
    } else {
      // PDF — send as inline data for Gemini
      contentParts.push({
        type: 'image_url',
        image_url: { url: `data:application/pdf;base64,${fileBase64}` },
      });
    }

    console.log(`Processing inventory PDF: ${fileName}, size: ${Math.round(fileBase64.length / 1024)}KB base64`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 min timeout

    let response;
    try {
      response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [{ role: 'user', content: contentParts }],
          temperature: 0.1,
          max_tokens: 65536,
        }),
        signal: controller.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      console.error('Fetch error (likely timeout):', fetchErr.message);
      return new Response(JSON.stringify({ error: 'AI request timed out. Try a smaller file or fewer pages.' }), { status: 504, headers: corsHeaders });
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }), { status: 429, headers: corsHeaders });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add funds.' }), { status: 402, headers: corsHeaders });
      }
      return new Response(JSON.stringify({ error: 'AI analysis failed', details: errorText }), { status: 500, headers: corsHeaders });
    }

    let aiResult;
    try {
      const rawText = await response.text();
      console.log(`AI response length: ${rawText.length} chars`);
      if (!rawText || rawText.trim().length === 0) {
        return new Response(JSON.stringify({ error: 'AI returned an empty response. The file may be too large or complex.' }), { status: 500, headers: corsHeaders });
      }
      aiResult = JSON.parse(rawText);
    } catch (jsonErr: any) {
      console.error('Failed to parse AI response JSON:', jsonErr.message);
      return new Response(JSON.stringify({ error: 'AI returned an invalid response. Try a smaller or clearer document.' }), { status: 500, headers: corsHeaders });
    }

    let content = aiResult.choices?.[0]?.message?.content || '';
    
    // Strip markdown fences if present
    content = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    let items;
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        items = JSON.parse(jsonMatch[0]);
      } else {
        items = JSON.parse(content);
      }
      if (!Array.isArray(items)) {
        throw new Error('Parsed result is not an array');
      }
    } catch (parseError) {
      // Attempt to repair truncated JSON array
      console.log('Initial parse failed, attempting truncated JSON repair...');
      const lastBrace = content.lastIndexOf("}");
      if (lastBrace > 0) {
        // Find the start of the array
        const arrayStart = content.indexOf("[");
        if (arrayStart >= 0) {
          const repaired = content.substring(arrayStart, lastBrace + 1) + "]";
          try {
            items = JSON.parse(repaired);
            if (!Array.isArray(items)) throw new Error('Not an array');
            console.log(`Recovered ${items.length} items from truncated response`);
          } catch (repairError) {
            console.error('Repair also failed:', content.substring(0, 500));
            return new Response(JSON.stringify({ error: 'Failed to parse extracted items', raw: content.substring(0, 1000) }), { status: 500, headers: corsHeaders });
          }
        } else {
          console.error('No array start found:', content.substring(0, 500));
          return new Response(JSON.stringify({ error: 'Failed to parse extracted items', raw: content.substring(0, 1000) }), { status: 500, headers: corsHeaders });
        }
      } else {
        console.error('No JSON object found:', content.substring(0, 500));
        return new Response(JSON.stringify({ error: 'Failed to parse extracted items', raw: content.substring(0, 1000) }), { status: 500, headers: corsHeaders });
      }
    }

    console.log(`Extracted ${items.length} items from PDF`);

    return new Response(JSON.stringify({ success: true, items }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
