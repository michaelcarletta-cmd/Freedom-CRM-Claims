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
    const photoUrls: { url: string; fileName: string; category: string; description: string; photoNumber: number }[] = [];
    
    let photoNumber = 1;
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
        photoDescriptions.push(`Photo ${photoNumber}: ${photo.file_name} | Category: ${photo.category} | Description: ${photo.description || 'No description'}`);
        photoUrls.push({
          url: signedUrl.signedUrl,
          fileName: photo.file_name,
          category: photo.category || 'Uncategorized',
          description: photo.description || '',
          photoNumber: photoNumber
        });
        photoNumber++;
      }
    }

    if (imageContents.length === 0) {
      return new Response(
        JSON.stringify({ error: "Could not load any photos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build prompt based on report type
    let systemPrompt = `You are an expert forensic property damage analyst working for a public adjusting firm. Your role is to prepare detailed forensic analyses documenting damages and what is required to restore the property to pre-loss conditions. 

CRITICAL INSTRUCTIONS:
- Reference photos by their number (Photo 1, Photo 2, etc.) so the reader can follow along with the photo documentation
- Reference applicable manufacturer specifications, building codes, and industry-standard repair methods
- For roofing damage: restoration requires FULL REPLACEMENT of each damaged slope/section - never recommend shingle repairs, only full slope replacement per manufacturer warranty requirements
- Focus on factual observations from the photos
- Do not include action items, document gathering suggestions, coverage advice, or specialist inspection recommendations`;
    
    let userPrompt = "";
    
    switch (reportType) {
      case "damage-assessment":
        userPrompt = `Analyze these ${photos.length} photos and create a Forensic Damage Assessment Report.

${claimContext}

Photo Information:
${photoDescriptions.join('\n')}

Please provide:
1. **Executive Summary** - Brief overview of all damage observed and restoration requirements
2. **Forensic Damage Analysis** - For each photo/area:
   - Type and extent of damage visible
   - Severity assessment (minor/moderate/severe/critical)
   - Cause of damage based on the loss type
   - Evidence of how the damage occurred
3. **Restoration Requirements** - To return the property to pre-loss condition:
   - Applicable manufacturer specifications for materials/products
   - Relevant building codes and standards (IRC, IBC, local codes)
   - Industry-standard repair methods required
   - Materials and components needed per manufacturer specs
4. **Hidden/Secondary Damage** - Potential underlying damage based on visible indicators that would need to be addressed

Base all observations on what's visible in the photos.`;
        break;
        
      case "before-after":
        userPrompt = `Analyze these before/after comparison photos and create a Forensic Progress Report.

${claimContext}

Photo Information:
${photoDescriptions.join('\n')}

Please provide:
1. **Condition Comparison** - Overview of pre-loss vs current conditions
2. **Damage Documentation** - What damage is visible in the "before" photos
3. **Repair Analysis** - What repairs are visible in the "after" photos
4. **Code Compliance** - Whether visible repairs meet building codes and manufacturer specifications
5. **Outstanding Restoration** - Any remaining work needed to achieve pre-loss condition

Format this as a professional forensic comparison report.`;
        break;
        
      case "quick-analysis":
        userPrompt = `Quickly analyze these ${photos.length} photos and provide a forensic summary.

${claimContext}

Photo Information:
${photoDescriptions.join('\n')}

Please provide a brief forensic analysis including:
- Main types of damage visible and their severity
- Key restoration requirements to return to pre-loss condition
- Applicable building codes or manufacturer specs that apply

Keep the response concise and factual.`;
        break;
        
      default: // full-report
        userPrompt = `Create a Forensic Photo Documentation Report analyzing all ${photos.length} provided photos.

${claimContext}

Photo Information:
${photoDescriptions.join('\n')}

IMPORTANT: Reference each photo by its number (Photo 1, Photo 2, etc.) throughout your analysis so the reader can follow along with the attached photo documentation.

Please provide a detailed forensic report including:

## 1. Property Overview
- General condition of the property
- Areas documented in the photos (reference photo numbers)
- Overall scope of damage

## 2. Forensic Damage Assessment by Area
For each distinct area shown in the photos:
- Photo reference numbers showing this area
- Location/area name
- Type of damage observed
- Severity (minor/moderate/severe/critical)
- Forensic evidence and indicators of cause
- Extent and measurements where estimable

## 3. Cause of Loss Analysis
- How the damage relates to the reported loss event
- Physical evidence supporting the cause of loss (reference specific photos)
- Timeline indicators if visible

## 4. Restoration Requirements
To return the property to pre-loss condition:
- **Scope of Work** - For roofing: full replacement of each damaged slope (not repairs) per manufacturer warranty requirements; for other areas: specify replacement vs repair
- **Manufacturer Specifications** - Applicable product/material specs for replacement items
- **Building Code Requirements** - Relevant IRC, IBC, or local building codes that apply
- **Materials & Components** - Specific materials needed per manufacturer installation requirements
- **Sequence of Repairs** - Proper order of restoration work

## 5. Summary
- Overall forensic damage assessment
- Key restoration requirements to achieve pre-loss condition

Base all observations on visible evidence in the photos.`;
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
        reportType,
        photoUrls: photoUrls.slice(0, 15) // Include photo URLs for report
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
