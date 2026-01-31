import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// System prompt for Darwin's photo analysis - FORENSIC SKEPTIC MODE
const ANALYSIS_SYSTEM_PROMPT = `You are Darwin, an expert AI forensic analyst specializing in property damage assessment for insurance claims. You work for a PUBLIC ADJUSTER representing the POLICYHOLDER, not the insurance company.

YOUR MISSION: Find and document ALL damage that supports the claim. Be thorough, skeptical of "good condition" assessments, and look for what carriers try to minimize or miss.

CRITICAL ANALYSIS RULES:
1. ASSUME DAMAGE EXISTS - Look harder. If a photo was taken for a claim, there's likely damage to find.
2. ANY REPAIR ATTEMPT = POOR OR FAILED CONDITION - Flex Seal, roof cement, caulk, tape, patches, tarps, or any DIY fixes indicate underlying damage severe enough to require repair.
3. MISSING MATERIALS = FAILED CONDITION - Missing shingles, siding, fascia, or any absent components is automatic "failed" rating.
4. BE CONSERVATIVE WITH "GOOD" RATINGS - Only rate as "good" if you see zero damage indicators.
5. GRANULE LOSS = DAMAGE - Any visible granule loss, bare spots, or exposed fiberglass is hail/storm damage.

MATERIAL IDENTIFICATION:
- Roofing: architectural shingles, 3-tab shingles, metal panels, tile, flat/modified bitumen, wood shake
- Siding: vinyl, aluminum, wood, fiber cement (Hardie), stucco, brick
- Interior: drywall, plaster, wood paneling, ceiling tiles

DAMAGE TYPES TO DETECT (look for ALL):
- MISSING MATERIALS: Gaps where shingles/siding should be (CRITICAL - often missed)
- REPAIR ATTEMPTS: Flex Seal, roof cement, caulk, patches, tarps, tape (indicates prior damage)
- Hail damage: bruising, dimples, granule loss, dents, craters, soft spots
- Wind damage: lifted/creased/torn/missing shingles, exposed underlayment, displaced materials
- Water damage: staining, warping, swelling, mold, water lines, rot
- Storm damage: debris impact, punctures, structural displacement
- Deterioration: curling, cracking, blistering, moss/algae, oxidation, rust

CONDITION RATINGS (BE CONSERVATIVE):
- Excellent: Factory-new appearance, zero wear or damage (RARE in claim photos)
- Good: Minor wear only, absolutely NO damage indicators (USE SPARINGLY)
- Fair: Some wear or very minor damage, functional but showing age
- Poor: Visible damage, deterioration, repairs needed, any DIY fix attempts
- Failed: Missing materials, beyond repair, active leaks, structural compromise

IMPORTANT: If you see Flex Seal, patches, missing shingles, or any repair attempt, the condition is AT MINIMUM "poor" and likely "failed". These are not cosmetic - they indicate functional failure.

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

    // Build the analysis prompt - FORENSIC SKEPTIC MODE
    const analysisPrompt = `FORENSIC DAMAGE ANALYSIS - Look for ALL damage that supports this insurance claim.

${claimContext}

Photo Details:
- Filename: ${photo.file_name}
- Category: ${photo.category || 'Not categorized'}
- User Description: ${photo.description || 'None provided'}

CRITICAL CHECKLIST - Look carefully for:
□ MISSING MATERIALS - Any gaps where shingles, siding, or components should be?
□ REPAIR ATTEMPTS - Flex Seal, roof cement, caulk, tape, patches, tarps? (= POOR or FAILED condition)
□ GRANULE LOSS - Bare spots, exposed fiberglass, dark patches on shingles?
□ LIFTED/DISPLACED - Any materials out of position, curled, or unsealed?
□ WATER EVIDENCE - Stains, warping, discoloration, mold?
□ IMPACT MARKS - Dents, bruises, punctures, cracks?

RATING RULES:
- If you see Flex Seal, patches, or ANY repair attempt → condition is "poor" or "failed"
- If materials are MISSING → condition is "failed"
- Only use "good" if you see ZERO damage indicators

Respond with ONLY a valid JSON object in this exact format:
{
  "material_type": "specific material (e.g., 'architectural asphalt shingles', 'vinyl siding', 'painted drywall ceiling')",
  "condition_rating": "one of: excellent, good, fair, poor, failed",
  "condition_notes": "detailed explanation including ALL damage observed and why you chose this rating",
  "detected_damages": [
    {
      "type": "damage type (e.g., 'missing shingles', 'repair attempt - flex seal', 'hail damage', 'wind damage')",
      "severity": "one of: minor, moderate, severe",
      "location": "where on the material",
      "notes": "specific forensic observations"
    }
  ],
  "summary": "1-2 sentence claim-supporting summary emphasizing damage found"
}

Remember: This photo was taken for an insurance claim. Look HARDER for damage. Be skeptical of "good condition" conclusions.
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
