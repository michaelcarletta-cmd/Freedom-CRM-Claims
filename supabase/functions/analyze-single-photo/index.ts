import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// System prompt for Darwin's photo analysis
const ANALYSIS_SYSTEM_PROMPT = `You are Darwin, an expert AI forensic analyst specializing in property damage assessment for insurance claims. 

Your task is to analyze photos of property damage and provide detailed assessments including:
1. Material identification (e.g., "architectural shingles", "3-tab shingles", "vinyl siding", "wood siding", "drywall ceiling")
2. Overall condition rating (excellent, good, fair, poor, or failed)
3. Specific damage detection with severity levels
4. Professional observations that would support an insurance claim

DAMAGE TYPES TO LOOK FOR:
- Hail damage (bruising, dimples, granule loss, dents, craters)
- Wind damage (lifted shingles, missing shingles, creasing, torn materials)
- Water damage (staining, warping, swelling, mold growth, water lines)
- Storm damage (debris impact, tree damage, structural displacement)
- Age-related deterioration (curling, cracking, moss/algae growth, oxidation)
- Impact damage (punctures, tears, mechanical damage)
- Structural issues (sagging, buckling, improper installation)

CONDITION RATINGS:
- Excellent: New or like-new condition, no visible damage or wear
- Good: Minor wear consistent with age, no significant damage
- Fair: Moderate wear or minor damage, still functional
- Poor: Significant damage or deterioration, repairs needed
- Failed: Beyond repair, replacement required

Provide your analysis in a structured JSON format.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { photoId, claimId } = await req.json();

    if (!photoId) {
      return new Response(
        JSON.stringify({ error: "Photo ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Lovable API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch the photo record
    const { data: photo, error: photoError } = await supabase
      .from("claim_photos")
      .select("*")
      .eq("id", photoId)
      .single();

    if (photoError || !photo) {
      return new Response(
        JSON.stringify({ error: "Photo not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the signed URL for the photo
    const { data: signedUrlData } = await supabase.storage
      .from("claim-files")
      .createSignedUrl(photo.file_path, 3600);

    if (!signedUrlData?.signedUrl) {
      return new Response(
        JSON.stringify({ error: "Could not access photo file" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch claim context if available
    let claimContext = "";
    if (claimId) {
      const { data: claim } = await supabase
        .from("claims")
        .select("loss_type, loss_description, policyholder_address")
        .eq("id", claimId)
        .single();

      if (claim) {
        claimContext = `
Claim Context:
- Loss Type: ${claim.loss_type || 'Unknown'}
- Loss Description: ${claim.loss_description || 'Not provided'}
- Property Location: ${claim.policyholder_address || 'Unknown'}
`;
      }
    }

    // Build the analysis prompt
    const analysisPrompt = `Analyze this property photo and provide a detailed assessment.

${claimContext}

Photo Details:
- Filename: ${photo.file_name}
- Category: ${photo.category || 'Not categorized'}
- User Description: ${photo.description || 'None provided'}

Analyze the photo and respond with ONLY a valid JSON object in this exact format:
{
  "material_type": "string describing the material (e.g., 'architectural asphalt shingles', 'vinyl siding', 'painted drywall ceiling')",
  "condition_rating": "one of: excellent, good, fair, poor, failed",
  "condition_notes": "detailed explanation of the condition assessment",
  "detected_damages": [
    {
      "type": "damage type (e.g., 'hail damage', 'wind damage', 'water damage')",
      "severity": "one of: minor, moderate, severe",
      "location": "where on the material (e.g., 'center of shingle', 'along edge')",
      "notes": "specific observations about this damage"
    }
  ],
  "summary": "1-2 sentence summary suitable for claim documentation"
}

If no damage is visible, return an empty array for detected_damages.
Respond with ONLY the JSON object, no additional text.`;

    console.log(`Analyzing photo ${photoId}...`);

    // Call Lovable AI for analysis
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: analysisPrompt },
              { type: "image_url", image_url: { url: signedUrlData.signedUrl } }
            ]
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI analysis failed:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add funds to your Lovable AI workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "AI analysis failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || "";

    // Parse the JSON response
    let analysis;
    try {
      // Clean up the response (remove markdown code blocks if present)
      let jsonStr = content.trim();
      if (jsonStr.startsWith("```json")) {
        jsonStr = jsonStr.slice(7);
      }
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.slice(3);
      }
      if (jsonStr.endsWith("```")) {
        jsonStr = jsonStr.slice(0, -3);
      }
      jsonStr = jsonStr.trim();
      
      analysis = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      return new Response(
        JSON.stringify({ error: "Failed to parse AI analysis", rawResponse: content }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update the photo record with the analysis results
    const { error: updateError } = await supabase
      .from("claim_photos")
      .update({
        ai_material_type: analysis.material_type || null,
        ai_condition_rating: analysis.condition_rating || null,
        ai_condition_notes: analysis.condition_notes || null,
        ai_detected_damages: analysis.detected_damages || [],
        ai_analysis_summary: analysis.summary || null,
        ai_analyzed_at: new Date().toISOString(),
      })
      .eq("id", photoId);

    if (updateError) {
      console.error("Failed to update photo with analysis:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to save analysis results" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Photo ${photoId} analyzed successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        analysis: {
          material_type: analysis.material_type,
          condition_rating: analysis.condition_rating,
          condition_notes: analysis.condition_notes,
          detected_damages: analysis.detected_damages,
          summary: analysis.summary,
          analyzed_at: new Date().toISOString(),
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in analyze-single-photo:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
