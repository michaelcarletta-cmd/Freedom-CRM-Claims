import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Fetch historical weather data using Visual Crossing API
async function fetchWeatherData(address: string, lossDate: string): Promise<any> {
  try {
    const VISUAL_CROSSING_API_KEY = Deno.env.get("VISUAL_CROSSING_API_KEY");
    
    if (!VISUAL_CROSSING_API_KEY) {
      console.log("Visual Crossing API key not configured");
      return null;
    }
    
    // Parse the loss date and get date range
    const date = new Date(lossDate);
    const startDate = new Date(date);
    startDate.setDate(date.getDate() - 1); // Day before
    const endDate = new Date(date);
    endDate.setDate(date.getDate() + 1); // Day after
    
    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    
    // Visual Crossing Timeline API - supports address directly (no need for separate geocoding)
    const weatherUrl = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${encodeURIComponent(address)}/${formatDate(startDate)}/${formatDate(endDate)}?unitGroup=us&include=days,hours,alerts&key=${VISUAL_CROSSING_API_KEY}&contentType=json`;
    
    console.log("Fetching weather from Visual Crossing for:", address);
    const weatherResponse = await fetch(weatherUrl);
    
    if (!weatherResponse.ok) {
      const errorText = await weatherResponse.text();
      console.log("Visual Crossing API error:", weatherResponse.status, errorText);
      return null;
    }
    
    const weatherData = await weatherResponse.json();
    
    if (!weatherData || !weatherData.days) {
      console.log("No weather data returned from Visual Crossing");
      return null;
    }
    
    // Find the loss date index in the daily data
    const lossDateStr = formatDate(date);
    const dayIndex = weatherData.days.findIndex((d: any) => d.datetime === lossDateStr);
    
    // Process daily data
    const daily = {
      dates: weatherData.days.map((d: any) => d.datetime),
      maxTemp: weatherData.days.map((d: any) => d.tempmax),
      minTemp: weatherData.days.map((d: any) => d.tempmin),
      precipitation: weatherData.days.map((d: any) => d.precip || 0),
      rain: weatherData.days.map((d: any) => d.precip || 0),
      maxWindSpeed: weatherData.days.map((d: any) => d.windspeed || 0),
      maxWindGusts: weatherData.days.map((d: any) => d.windgust || 0),
      weatherDescription: weatherData.days.map((d: any) => d.conditions || 'Unknown'),
      humidity: weatherData.days.map((d: any) => d.humidity || 0),
      uvIndex: weatherData.days.map((d: any) => d.uvindex || 0),
      visibility: weatherData.days.map((d: any) => d.visibility || 0),
      pressure: weatherData.days.map((d: any) => d.pressure || 0),
      cloudcover: weatherData.days.map((d: any) => d.cloudcover || 0),
      severerisk: weatherData.days.map((d: any) => d.severerisk || 0),
      description: weatherData.days.map((d: any) => d.description || ''),
      icon: weatherData.days.map((d: any) => d.icon || ''),
      source: weatherData.days.map((d: any) => d.source || 'Visual Crossing')
    };
    
    // Process hourly data if available
    const hourly: any = {
      time: [],
      temperature: [],
      precipitation: [],
      windSpeed: [],
      windGusts: [],
      conditions: [],
      humidity: [],
      cloudcover: []
    };
    
    weatherData.days.forEach((day: any) => {
      if (day.hours) {
        day.hours.forEach((hour: any) => {
          hourly.time.push(`${day.datetime}T${hour.datetime}`);
          hourly.temperature.push(hour.temp);
          hourly.precipitation.push(hour.precip || 0);
          hourly.windSpeed.push(hour.windspeed || 0);
          hourly.windGusts.push(hour.windgust || 0);
          hourly.conditions.push(hour.conditions || '');
          hourly.humidity.push(hour.humidity || 0);
          hourly.cloudcover.push(hour.cloudcover || 0);
        });
      }
    });
    
    // Include alerts if any
    const alerts = weatherData.alerts || [];
    
    return {
      location: weatherData.resolvedAddress || address,
      latitude: weatherData.latitude,
      longitude: weatherData.longitude,
      timezone: weatherData.timezone,
      lossDate: lossDateStr,
      daily,
      hourly,
      alerts,
      dayIndex: dayIndex >= 0 ? dayIndex : 1,
      source: 'Visual Crossing'
    };
  } catch (error) {
    console.error("Error fetching weather data:", error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { photoIds, claimId, reportType, weatherOnly } = await req.json();
    
    // Handle weather-only preview requests
    if (weatherOnly && claimId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const { data: claim } = await supabase
        .from("claims")
        .select("policyholder_address, loss_date")
        .eq("id", claimId)
        .single();
      
      if (!claim || !claim.policyholder_address || !claim.loss_date) {
        return new Response(
          JSON.stringify({ error: "Claim missing address or loss date for weather lookup" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      const weatherData = await fetchWeatherData(claim.policyholder_address, claim.loss_date);
      
      return new Response(
        JSON.stringify({ weatherData }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
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
    let weatherData: any = null;
    let weatherContext = "";
    let claimData: any = null;
    
    if (claimId) {
      const { data: claim } = await supabase
        .from("claims")
        .select("*")
        .eq("id", claimId)
        .single();
      
      if (claim) {
        claimData = claim;
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

        // Fetch weather data for demand packages
        if (reportType === 'demand-package' && claim.policyholder_address && claim.loss_date) {
          console.log("Fetching weather data for demand package...");
          weatherData = await fetchWeatherData(claim.policyholder_address, claim.loss_date);
          
          if (weatherData && weatherData.daily) {
            const idx = weatherData.dayIndex >= 0 ? weatherData.dayIndex : 1;
            
            // Build alerts context if any severe weather alerts exist
            let alertsContext = "";
            if (weatherData.alerts && weatherData.alerts.length > 0) {
              alertsContext = `
Weather Alerts Active During Loss Period:
${weatherData.alerts.map((a: any) => `- ${a.event || 'Alert'}: ${a.headline || a.description || 'Weather alert issued'}`).join('\n')}
`;
            }
            
            weatherContext = `

HISTORICAL WEATHER DATA (Loss Date: ${weatherData.lossDate}):
Data Source: Visual Crossing Weather Services
Location: ${weatherData.location}
Coordinates: ${weatherData.latitude}, ${weatherData.longitude}
Timezone: ${weatherData.timezone || 'N/A'}
${alertsContext}
Weather on Loss Date (${weatherData.daily.dates?.[idx]}):
- Conditions: ${weatherData.daily.weatherDescription?.[idx] || 'N/A'}
- Description: ${weatherData.daily.description?.[idx] || 'N/A'}
- High Temperature: ${weatherData.daily.maxTemp?.[idx]}°F
- Low Temperature: ${weatherData.daily.minTemp?.[idx]}°F
- Precipitation: ${weatherData.daily.precipitation?.[idx]} inches
- Max Wind Speed: ${weatherData.daily.maxWindSpeed?.[idx]} mph
- Max Wind Gusts: ${weatherData.daily.maxWindGusts?.[idx]} mph
- Humidity: ${weatherData.daily.humidity?.[idx]}%
- Cloud Cover: ${weatherData.daily.cloudcover?.[idx]}%
- UV Index: ${weatherData.daily.uvIndex?.[idx]}
- Visibility: ${weatherData.daily.visibility?.[idx]} miles
- Severe Risk: ${weatherData.daily.severerisk?.[idx]}%

Day Before (${weatherData.daily.dates?.[0]}):
- Conditions: ${weatherData.daily.weatherDescription?.[0] || 'N/A'}
- Description: ${weatherData.daily.description?.[0] || 'N/A'}
- Max Wind Speed: ${weatherData.daily.maxWindSpeed?.[0]} mph
- Max Wind Gusts: ${weatherData.daily.maxWindGusts?.[0]} mph
- Precipitation: ${weatherData.daily.precipitation?.[0]} inches
- Severe Risk: ${weatherData.daily.severerisk?.[0]}%

Day After (${weatherData.daily.dates?.[2]}):
- Conditions: ${weatherData.daily.weatherDescription?.[2] || 'N/A'}
- Description: ${weatherData.daily.description?.[2] || 'N/A'}
- Max Wind Speed: ${weatherData.daily.maxWindSpeed?.[2]} mph
- Max Wind Gusts: ${weatherData.daily.maxWindGusts?.[2]} mph
- Precipitation: ${weatherData.daily.precipitation?.[2]} inches
`;
            console.log("Weather data fetched successfully from Visual Crossing");
          }
        }
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

      case "proof-of-loss":
        userPrompt = `Create a detailed Proof of Loss / Valuation Report based on these ${photos.length} photos.

${claimContext}

Photo Information:
${photoDescriptions.join('\n')}

IMPORTANT: Reference each photo by its number (Photo 1, Photo 2, etc.) throughout your analysis.

Please provide a comprehensive Proof of Loss document including:

## SWORN STATEMENT IN PROOF OF LOSS

### I. PROPERTY DESCRIPTION
- Property location and type
- Age and construction type (if visible)
- Areas affected by the loss (with photo references)

### II. DAMAGE DOCUMENTATION
For each damaged area documented in the photos:
- Photo reference numbers
- Detailed description of damage observed
- Forensic indicators of cause
- Measurements/extent where estimable

### III. SCOPE OF WORK REQUIRED
To restore the property to pre-loss condition:
- **Roof System** (if applicable): Full replacement of each damaged slope per manufacturer warranty requirements (not repairs)
- **Exterior Components**: Siding, gutters, windows, etc.
- **Interior Components**: Drywall, flooring, etc.
- Include applicable IRC/IBC code requirements
- Reference manufacturer installation specifications

### IV. MATERIALS & SPECIFICATIONS
- Specific materials required per manufacturer specs
- Building code compliance requirements
- Industry standard repair methods

### V. VALUATION SUMMARY
- Summary of all required work to achieve pre-loss condition
- Note: Actual dollar amounts to be determined by estimate

Base all observations on visible evidence in the photos. This document supports the insured's claim for damages.`;
        break;

      case "final-demand":
        userPrompt = `Create a Final Demand Letter based on these ${photos.length} photos documenting property damage.

${claimContext}

Photo Information:
${photoDescriptions.join('\n')}

IMPORTANT: Reference each photo by its number (Photo 1, Photo 2, etc.) throughout.

Please create a professional Final Demand Letter including:

## NOTICE OF FINAL DEMAND

### I. FACTUAL BACKGROUND
- Property description and loss date
- Summary of the loss event
- Timeline of the claim (inspection dates, correspondence)
- Documentation submitted (with photo references)

### II. DAMAGE ANALYSIS
Based on the photo documentation:
- Summary of all damage observed (reference specific photos)
- Forensic evidence supporting the cause of loss
- Severity and extent of damage by area

### III. RESTORATION REQUIREMENTS
To return the property to pre-loss condition:
- **Scope of Work**: Full replacement of damaged roofing slopes (not repairs), per manufacturer warranty requirements
- **Building Code Compliance**: IRC, IBC, and local code requirements
- **Manufacturer Specifications**: Required installation methods and materials
- **Industry Standards**: ASTM, ARMA, and other applicable standards

### IV. PROSPECTIVE LIABILITY

**New Jersey Insurance Code References** (N.J.S.A. Title 17):
- N.J.S.A. 17:29B-4: Unfair Claims Settlement Practices - prohibits misrepresenting pertinent facts or policy provisions
- N.J.A.C. 11:2-17.6: Requires insurers to acknowledge claims within 10 working days
- N.J.A.C. 11:2-17.7: Requires insurers to affirm or deny coverage within reasonable time
- N.J.A.C. 11:2-17.8: Payment of claims must occur within 30 days of proof of loss

**Pennsylvania Insurance Code References** (40 P.S.):
- 40 P.S. § 1171.5: Unfair insurance practices - prohibits misrepresentation and unfair settlement practices
- 31 Pa. Code § 146.5: Requires acknowledgment of claims within 10 working days
- 31 Pa. Code § 146.6: Requires written denial with specific reasons if claim is denied
- 31 Pa. Code § 146.7: Payment required within 15 days of settlement agreement

### V. DEMAND FOR PAYMENT
Based on the documented damage and required restoration work:
- Summary of all repairs needed to achieve pre-loss condition
- Statement that failure to properly adjust this claim may result in additional remedies

### VI. CONCLUSION
- Demand for full and fair settlement
- Timeline for response
- Notice that this documentation supports the claim

This letter is prepared based on visible evidence in the photo documentation.`;
        break;

      case "demand-package":
        userPrompt = `Create a COMPLETE DEMAND PACKAGE based on these ${photos.length} photos documenting property damage.

${claimContext}
${weatherContext}

Photo Information:
${photoDescriptions.join('\n')}

IMPORTANT: Reference each photo by its number (Photo 1, Photo 2, etc.) throughout all sections.
${weatherData ? 'Include the weather data provided above in the Weather Report exhibit section.' : ''}

Create a comprehensive demand package that combines all elements into one cohesive document. Structure it as follows:

## I. FINAL DEMAND LETTER

To the Claims Department:

This Notice of Final Demand is submitted on behalf of [Policyholder] regarding the above-referenced claim. This demand is accompanied by complete documentation supporting our position that the carrier has failed to properly adjust this claim.

### A. Introduction
- Brief statement of the demand
- Reference to attached documentation and exhibits

### B. Factual Background
- Property description and loss date
- Summary of the loss event  
- Timeline of claim handling
- Documentation submitted with photo references

---

## II. DAMAGE ANALYSIS

### A. Property Overview
- General condition documented in the photos
- Areas affected by the loss

### B. Detailed Damage Assessment
For each area documented (reference specific photo numbers):
- Location and component affected
- Type of damage observed
- Severity rating
- Forensic indicators supporting cause of loss

### C. Cause of Loss
- Physical evidence connecting damage to the reported loss event
- Weather data or event documentation (if referenced)

---

## III. PROOF OF LOSS / VALUATION

### A. Scope of Work Required
To restore the property to pre-loss condition:

**Roofing System** (if applicable):
- Full replacement of each damaged slope per manufacturer warranty requirements
- Applicable manufacturer specifications
- Building code requirements (IRC, IBC)

**Exterior Components**:
- Siding, gutters, windows as damaged
- Applicable specifications

**Interior Components** (if visible):
- Drywall, flooring, etc. as applicable

### B. Materials & Specifications
- Specific materials required per manufacturer specs
- Installation requirements
- Code compliance standards

### C. Valuation Summary
- Summary of all work required
- Note that specific dollar amounts are per the attached estimate

---

## IV. RESTORATION REQUIREMENTS

### A. Building Code Compliance
- International Residential Code (IRC) requirements
- International Building Code (IBC) requirements
- Local code amendments (NJ/PA specific)

### B. Manufacturer Specifications
- Product-specific installation requirements
- Warranty requirements that mandate full replacement

### C. Industry Standards
- ASTM standards applicable
- ARMA guidelines
- NRCA best practices

---

## V. PROSPECTIVE LIABILITY

### A. New Jersey Insurance Code (N.J.S.A. Title 17)
- **N.J.S.A. 17:29B-4**: Unfair Claims Settlement Practices Act - prohibits misrepresenting pertinent facts or policy provisions relating to coverages at issue
- **N.J.A.C. 11:2-17.6**: Requires insurers to acknowledge receipt of claims within 10 working days
- **N.J.A.C. 11:2-17.7**: Requires insurers to affirm or deny coverage within a reasonable time
- **N.J.A.C. 11:2-17.8**: Payment of claims must occur within 30 days after proof of loss is received
- **N.J.S.A. 17:29B-4(9)**: Prohibits failure to affirm or deny coverage within reasonable time after proof of loss

### B. Pennsylvania Insurance Code (40 P.S.)
- **40 P.S. § 1171.5**: Unfair Insurance Practices Act - prohibits misrepresentation and unfair settlement practices
- **31 Pa. Code § 146.5**: Requires acknowledgment of claims within 10 working days
- **31 Pa. Code § 146.6**: Requires written denial stating specific reasons if claim is denied
- **31 Pa. Code § 146.7**: Payment required within 15 days after agreement on settlement amount
- **42 Pa.C.S. § 8371**: Bad Faith statute - allows recovery of interest, punitive damages, court costs and attorney fees

### C. Potential Exposure
Failure to properly adjust this claim may result in:
- Statutory penalties under state unfair claims practices acts
- Bad faith claims with potential for punitive damages
- Attorney fees and costs
- Interest on unpaid amounts

---

## VI. DEMAND FOR PAYMENT

Based on the foregoing documentation and analysis:

1. The loss event caused the documented damage to the insured property
2. The damage requires full restoration as detailed in the scope of work
3. The insured is entitled to full replacement cost value under the policy terms
4. The carrier's failure to properly pay this claim violates state insurance regulations

**THEREFORE, WE DEMAND:**
- Full payment of the claim within 30 days
- Payment of all supplements as documented
- Response to this demand in writing

Failure to respond appropriately will result in pursuit of all available legal remedies.

---

## CONCLUSION

This Complete Demand Package provides comprehensive documentation of the loss, damage assessment, valuation support, and legal basis for this claim. The attached exhibits provide supporting evidence:
- **Exhibit A**: Photo Documentation
- **Exhibit B**: Weather Report (Historical weather data for loss date)

We request immediate attention to this matter and resolution within the timeframes required by state law.`;
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

    // Limit photos to prevent timeout (AI handles ~8-10 images most reliably)
    const maxPhotos = 10;
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

    // Helper function to call AI with retry logic
    const callAIWithRetry = async (maxRetries = 3): Promise<{ response: Response; responseText: string }> => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        console.log(`AI call attempt ${attempt}/${maxRetries}`);
        
        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-pro", // Use pro model for better reliability with images
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

        const responseText = await response.text();
        console.log(`AI response status: ${response.status}, length: ${responseText.length}`);
        
        // Check if response is valid (not just whitespace)
        const trimmedResponse = responseText.trim();
        if (response.ok && trimmedResponse && trimmedResponse.length > 100) {
          // Try to parse to verify it's valid JSON
          try {
            const parsed = JSON.parse(trimmedResponse);
            if (parsed.choices?.[0]?.message?.content) {
              return { response, responseText: trimmedResponse };
            }
            console.log(`Attempt ${attempt}: Valid JSON but no content, retrying...`);
          } catch {
            console.log(`Attempt ${attempt}: Invalid JSON response, retrying...`);
          }
        } else if (!response.ok) {
          // Don't retry on rate limits or payment issues
          if (response.status === 429 || response.status === 402) {
            return { response, responseText };
          }
          console.log(`Attempt ${attempt}: Non-OK status ${response.status}, retrying...`);
        } else {
          console.log(`Attempt ${attempt}: Empty/whitespace response, retrying...`);
        }
        
        // Wait before retry (exponential backoff)
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
      
      // Return last attempt result
      const finalResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
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
      return { response: finalResponse, responseText: await finalResponse.text() };
    };

    const { response, responseText } = await callAIWithRetry();

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
        throw new Error("Empty response text from AI");
      }
      aiResponse = JSON.parse(responseText);
      console.log("Parsed AI response structure:", Object.keys(aiResponse));
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      console.error("Raw response (first 1000 chars):", responseText.substring(0, 1000));
      return new Response(
        JSON.stringify({ error: "AI returned invalid response format. Please try again with fewer photos." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if the response has an error field
    if (aiResponse.error) {
      console.error("AI returned error:", aiResponse.error);
      return new Response(
        JSON.stringify({ error: aiResponse.error.message || "AI service error. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const reportContent = aiResponse.choices?.[0]?.message?.content;
    
    if (!reportContent) {
      console.error("No content in AI response. Full response:", JSON.stringify(aiResponse).substring(0, 1000));
      return new Response(
        JSON.stringify({ error: "AI did not generate content. Please try with fewer photos or a different report type." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Photo analysis complete, report length:", reportContent.length);

    return new Response(
      JSON.stringify({ 
        report: reportContent,
        photoCount: photos.length,
        reportType,
        photoUrls: photoUrls.slice(0, 15),
        weatherData: weatherData // Include weather data for PDF generation
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
