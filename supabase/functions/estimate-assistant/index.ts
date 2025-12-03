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
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { photoIds, claimId } = await req.json();
    console.log('Estimate assistant request:', { photoIds, claimId });

    if (!photoIds || photoIds.length === 0) {
      throw new Error('No photos provided for analysis');
    }

    // Fetch claim details for context
    const { data: claim, error: claimError } = await supabase
      .from('claims')
      .select('*')
      .eq('id', claimId)
      .single();

    if (claimError) {
      console.error('Error fetching claim:', claimError);
      throw new Error('Failed to fetch claim details');
    }

    // Fetch photo metadata
    const { data: photos, error: photosError } = await supabase
      .from('claim_photos')
      .select('*')
      .in('id', photoIds);

    if (photosError || !photos || photos.length === 0) {
      console.error('Error fetching photos:', photosError);
      throw new Error('Failed to fetch photos');
    }

    console.log(`Processing ${photos.length} photos for estimate suggestions`);

    // Generate signed URLs for photos
    const photoUrls: string[] = [];
    for (const photo of photos) {
      const { data: signedUrlData, error: signedUrlError } = await supabase
        .storage
        .from('claim-files')
        .createSignedUrl(photo.file_path, 3600);

      if (signedUrlError || !signedUrlData?.signedUrl) {
        console.error('Error generating signed URL:', signedUrlError);
        continue;
      }
      photoUrls.push(signedUrlData.signedUrl);
    }

    if (photoUrls.length === 0) {
      throw new Error('Could not generate URLs for any photos');
    }

    const systemPrompt = `You are an expert insurance claims estimator and Xactimate specialist. Your role is to analyze property damage photos and suggest appropriate Xactimate line items for the repair estimate.

For each area of damage you identify, provide:
1. Category (e.g., Roofing, Siding, Interior, Flooring, Drywall, Windows, Gutters, Fencing, etc.)
2. Xactimate Category Code (e.g., RFG for roofing, SDG for siding, DRY for drywall, etc.)
3. Line Item Description (use standard Xactimate terminology)
4. Unit of Measure (SF, LF, EA, SQ, etc.)
5. Estimated Quantity Range (provide a range if exact measurement isn't visible)
6. Damage Severity (Minor, Moderate, Severe)
7. Notes/Justification for the line item

Common Xactimate categories and codes:
- RFG: Roofing (shingles, underlayment, flashing, vents)
- SDG: Siding (vinyl, wood, fiber cement)
- DRY: Drywall (repair, replacement, texture)
- PNT: Painting
- FLR: Flooring
- PLM: Plumbing
- ELE: Electrical
- WIN: Windows
- GTR: Gutters
- FNC: Fencing
- CLN: Cleaning
- CON: Contents
- DEM: Demolition

Be thorough but realistic. Only suggest line items for damage that is clearly visible in the photos.`;

    const userPrompt = `Analyze these property damage photos and suggest Xactimate line items for the repair estimate.

Claim Context:
- Loss Type: ${claim.loss_type || 'Not specified'}
- Loss Date: ${claim.loss_date || 'Not specified'}
- Property Address: ${claim.policyholder_address || 'Not specified'}
- Loss Description: ${claim.loss_description || 'Not provided'}

Please provide your response in the following JSON format:
{
  "summary": "Brief overview of damage observed",
  "totalLineItems": number,
  "lineItems": [
    {
      "category": "Category name",
      "categoryCode": "XAC",
      "description": "Xactimate line item description",
      "unit": "Unit of measure",
      "quantityMin": number,
      "quantityMax": number,
      "severity": "Minor|Moderate|Severe",
      "notes": "Justification and observations",
      "photoReference": "Which photo shows this damage"
    }
  ],
  "additionalNotes": "Any other observations or recommendations"
}`;

    const imageContent = photoUrls.map((url, index) => ({
      type: "image_url" as const,
      image_url: { url, detail: "high" as const }
    }));

    console.log('Calling OpenAI API for estimate analysis...');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              ...imageContent
            ]
          }
        ],
        max_tokens: 4000,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit exceeded. Please wait a moment and try again.',
          retryable: true 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No response from AI');
    }

    console.log('Successfully generated estimate suggestions');

    let parsedContent;
    try {
      parsedContent = JSON.parse(content);
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
      estimate: parsedContent,
      photosAnalyzed: photoUrls.length
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
