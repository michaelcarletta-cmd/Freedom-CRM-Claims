import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { photoIds, claimId, reportType } = await req.json();
    
    if (!photoIds || !Array.isArray(photoIds) || photoIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "No photos provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch claim details
    let claimContext = "";
    if (claimId) {
      const { data: claim } = await supabase
        .from("claims")
        .select("*")
        .eq("id", claimId)
        .single();
      
      if (claim) {
        claimContext = `
Claim Information:
- Claim Number: ${claim.claim_number || 'N/A'}
- Policyholder: ${claim.policyholder_name || 'N/A'}
- Property Address: ${claim.policyholder_address || 'N/A'}
- Loss Date: ${claim.loss_date || 'N/A'}
- Loss Type: ${claim.loss_type || 'N/A'}
- Loss Description: ${claim.loss_description || 'N/A'}
- Insurance Company: ${claim.insurance_company || 'N/A'}
`;
      }
    }

    // Fetch photos with signed URLs
    const { data: photos, error: photosError } = await supabase
      .from("claim_photos")
      .select("*")
      .in("id", photoIds);

    if (photosError || !photos || photos.length === 0) {
      return new Response(
        JSON.stringify({ error: "Photos not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Analyzing ${photos.length} photos for claim ${claimId}`);

    // Get signed URLs and build image content for AI
    const imageContents: any[] = [];
    const photoDescriptions: string[] = [];
    
    for (const photo of photos) {
      const path = photo.annotated_file_path || photo.file_path;
      const { data: signedUrl } = await supabase.storage
        .from("claim-files")
        .createSignedUrl(path, 3600);
      
      if (signedUrl?.signedUrl) {
        imageContents.push({
          type: "image_url",
          image_url: { url: signedUrl.signedUrl }
        });
        photoDescriptions.push(`Photo: ${photo.file_name} | Category: ${photo.category} | Description: ${photo.description || 'No description'}`);
      }
    }

    if (imageContents.length === 0) {
      return new Response(
        JSON.stringify({ error: "Could not load any photos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build prompt based on report type
    let systemPrompt = `You are an expert insurance claims adjuster and damage assessment specialist. You analyze property damage photos to help maximize claim settlements for policyholders.`;
    
    let userPrompt = "";
    
    switch (reportType) {
      case "damage-assessment":
        userPrompt = `Analyze these ${photos.length} photos and create a comprehensive Damage Assessment Report.

${claimContext}

Photo Information:
${photoDescriptions.join('\n')}

Please provide:
1. **Executive Summary** - Brief overview of all damage observed
2. **Detailed Damage Analysis** - For each photo/area:
   - Type of damage visible
   - Severity assessment (minor/moderate/severe)
   - Likely cause based on the loss type
   - Estimated scope of repairs needed
3. **Hidden Damage Concerns** - Potential secondary or hidden damage to investigate
4. **Documentation Recommendations** - Additional photos or evidence needed
5. **Repair Recommendations** - Suggested repairs and materials
6. **Insurance Claim Notes** - Key points to emphasize when presenting to the carrier

Format this as a professional report that can be shared with the insurance adjuster.`;
        break;
        
      case "before-after":
        userPrompt = `Analyze these before/after comparison photos and create a detailed Progress Report.

${claimContext}

Photo Information:
${photoDescriptions.join('\n')}

Please provide:
1. **Condition Summary** - Overview of before vs after conditions
2. **Damage Documentation** - What damage is visible in the "before" photos
3. **Repair Documentation** - What repairs are visible in the "after" photos
4. **Quality Assessment** - Evaluation of repair quality and completeness
5. **Outstanding Items** - Any remaining work or concerns visible
6. **Recommendations** - Next steps or additional documentation needed

Format this as a professional comparison report.`;
        break;
        
      case "quick-analysis":
        userPrompt = `Quickly analyze these ${photos.length} photos and provide a concise summary.

${claimContext}

Photo Information:
${photoDescriptions.join('\n')}

Please provide a brief but comprehensive analysis including:
- Main types of damage visible
- Severity assessment
- Key areas of concern
- Immediate recommendations

Keep the response concise but actionable.`;
        break;
        
      default: // full-report
        userPrompt = `Create a comprehensive Photo Documentation Report analyzing all ${photos.length} provided photos.

${claimContext}

Photo Information:
${photoDescriptions.join('\n')}

Please provide a detailed professional report including:

## 1. Property Overview
- General condition of the property
- Areas documented in the photos

## 2. Damage Assessment by Area
For each distinct area shown in the photos:
- Location/area name
- Type of damage observed
- Severity (minor/moderate/severe/critical)
- Visible evidence and indicators
- Estimated extent of damage

## 3. Cause Analysis
- How the damage relates to the reported loss type
- Evidence supporting the cause of loss
- Any pre-existing vs. new damage observations

## 4. Repair Scope
- Recommended repairs for each damaged area
- Materials likely needed
- Priority of repairs (safety, structural, cosmetic)

## 5. Additional Documentation Needs
- Areas that need more photos
- Types of documentation to gather
- Specialist inspections recommended

## 6. Insurance Considerations
- Key evidence for the claim
- Points to emphasize with the adjuster
- Potential coverage concerns
- Documentation that strengthens the claim

## 7. Summary & Next Steps
- Overall damage assessment
- Immediate actions recommended
- Timeline considerations

Format this as a professional report suitable for insurance documentation.`;
    }

    // Limit photos to prevent timeout (AI can handle ~10-15 images reliably)
    const maxPhotos = 15;
    const limitedImageContents = imageContents.slice(0, maxPhotos);
    const limitedDescriptions = photoDescriptions.slice(0, maxPhotos);
    
    if (imageContents.length > maxPhotos) {
      console.log(`Limiting analysis to ${maxPhotos} photos (${imageContents.length} provided)`);
      userPrompt = userPrompt.replace(
        `${photos.length} photos`,
        `${maxPhotos} photos (limited from ${photos.length} for optimal analysis)`
      );
    }

    console.log(`Calling Lovable AI for photo analysis with ${limitedImageContents.length} images...`);

    // Call Lovable AI with images
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              ...limitedImageContents
            ]
          }
        ],
        max_tokens: 4000,
      }),
    });

    // Get raw response text first for better error handling
    const responseText = await response.text();
    console.log(`AI response status: ${response.status}, length: ${responseText.length}`);

    if (!response.ok) {
      console.error("AI API error:", response.status, responseText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "AI analysis failed: " + responseText.substring(0, 200) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse JSON safely
    let aiResponse;
    try {
      if (!responseText || responseText.trim() === "") {
        throw new Error("Empty response from AI");
      }
      aiResponse = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError, "Response:", responseText.substring(0, 500));
      return new Response(
        JSON.stringify({ error: "AI returned invalid response. Please try with fewer photos." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const reportContent = aiResponse.choices?.[0]?.message?.content || "Analysis could not be completed.";

    console.log("Photo analysis complete");

    return new Response(
      JSON.stringify({ 
        report: reportContent,
        photoCount: photos.length,
        reportType 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in analyze-photos:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
