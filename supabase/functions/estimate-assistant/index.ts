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
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { measurementPdf, measurementFileName, claimId, claimContext } = await req.json();
    console.log('Estimate assistant request:', { 
      hasPdf: !!measurementPdf, 
      fileName: measurementFileName,
      claimId 
    });

    if (!measurementPdf) {
      throw new Error('No measurement PDF provided');
    }

    // Fetch claim details if not provided
    let claimData = claimContext;
    if (!claimData && claimId) {
      const { data: claim, error: claimError } = await supabase
        .from('claims')
        .select('*')
        .eq('id', claimId)
        .single();

      if (!claimError && claim) {
        claimData = {
          lossType: claim.loss_type,
          lossDate: claim.loss_date,
          lossDescription: claim.loss_description,
          address: claim.policyholder_address
        };
      }
    }

    const systemPrompt = `You are an expert insurance claims estimator and Xactimate specialist. Your role is to analyze roof measurement reports and property information to suggest appropriate Xactimate line items for repair estimates WITH PRICING.

You will receive a PDF measurement report (typically from GAF QuickMeasure, EagleView, or similar services) containing detailed roof measurements including:
- Total roof area (squares)
- Individual facet/slope measurements
- Ridge, hip, valley, and rake lengths
- Pitch/slope information
- Eave lengths
- Waste factor calculations

For each repair area, provide:
1. Category (e.g., Roofing, Siding, Interior, Flooring, Drywall, Windows, Gutters, Fencing, etc.)
2. Xactimate Category Code (e.g., RFG for roofing, SDG for siding, DRY for drywall, etc.)
3. Line Item Description (use standard Xactimate terminology)
4. Unit of Measure (SF, LF, EA, SQ, etc.)
5. Estimated Quantity (use exact measurements from the report when available)
6. Unit Price (typical Xactimate pricing for the region, use realistic current market rates)
7. Total Price (quantity × unit price)
8. Damage Severity (Minor, Moderate, Severe) - assume full replacement for roofing
9. Notes/Justification for the line item

Common Xactimate categories and codes with typical pricing ranges:
- RFG: Roofing
  - Tear off shingles: $25-40/SQ
  - Composition shingles (3-tab): $180-250/SQ
  - Dimensional/architectural shingles: $250-350/SQ
  - Underlayment (synthetic): $35-55/SQ
  - Ice & water shield: $2.50-4.00/LF
  - Drip edge: $3-6/LF
  - Starter strip: $2-4/LF
  - Ridge cap: $6-12/LF
  - Step flashing: $8-15/LF
  - Pipe boot: $35-75/EA
  - Ridge vent: $8-15/LF
- SDG: Siding
- DRY: Drywall
- GTR: Gutters
- CLN: Cleaning/Debris removal: $15-30/SQ

IMPORTANT: 
- Use the exact measurements from the report
- Standard repair scope for roofing is FULL REPLACEMENT of each damaged slope/section
- Include tear-off, underlayment, shingles, and all related materials
- Include drip edge, starter strip, and ridge cap
- Account for waste factor (typically 10-15%)
- Use mid-range pricing typical for most US markets
- Provide realistic, defensible pricing that would be accepted by insurance carriers`;

    const userPrompt = `Analyze this roof measurement report and generate Xactimate line items for a full roof replacement estimate.

Claim Context:
- Loss Type: ${claimData?.lossType || 'Storm Damage'}
- Loss Date: ${claimData?.lossDate || 'Not specified'}
- Property Address: ${claimData?.address || 'Not specified'}
- Loss Description: ${claimData?.lossDescription || 'Roof damage requiring replacement'}

The measurement PDF file is: ${measurementFileName}

Please provide your response in the following JSON format:
{
  "summary": "Brief overview of the roof and recommended repairs",
  "totalLineItems": number,
  "estimatedTotal": number,
  "lineItems": [
    {
      "category": "Category name",
      "categoryCode": "XAC",
      "description": "Xactimate line item description",
      "unit": "Unit of measure",
      "quantity": number,
      "unitPrice": number,
      "totalPrice": number,
      "severity": "Minor|Moderate|Severe",
      "notes": "Justification and measurements used"
    }
  ],
  "additionalNotes": "Any other observations or recommendations"
}`;

    console.log('Calling Lovable AI for measurement analysis...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              {
                type: 'image_url',
                image_url: { 
                  url: `data:application/pdf;base64,${measurementPdf}`
                }
              }
            ]
          }
        ],
        max_tokens: 4000
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit exceeded. Please wait a moment and try again.',
          retryable: true 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'Payment required. Please add funds to your Lovable AI workspace.',
          retryable: false 
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No response from AI');
    }

    console.log('Successfully generated estimate suggestions');

    let parsedContent;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedContent = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch (e) {
      console.error('Failed to parse JSON response:', e);
      parsedContent = { 
        summary: content, 
        lineItems: [],
        totalLineItems: 0,
        additionalNotes: 'Response could not be parsed as structured data'
      };
    }

    return new Response(JSON.stringify({
      success: true,
      estimate: parsedContent
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in estimate-assistant:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate estimate suggestions';
    return new Response(JSON.stringify({ 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
