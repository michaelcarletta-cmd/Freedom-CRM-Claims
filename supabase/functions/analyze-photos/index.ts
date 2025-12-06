import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Batch size for processing photos (OpenAI vision works best with ~20 images at a time)
const BATCH_SIZE = 20;

// Fetch historical weather data using Visual Crossing API
async function fetchWeatherData(address: string, lossDate: string): Promise<any> {
  try {
    const VISUAL_CROSSING_API_KEY = Deno.env.get("VISUAL_CROSSING_API_KEY");
    
    if (!VISUAL_CROSSING_API_KEY) {
      console.log("Visual Crossing API key not configured");
      return null;
    }
    
    const date = new Date(lossDate);
    const startDate = new Date(date);
    startDate.setDate(date.getDate() - 1);
    const endDate = new Date(date);
    endDate.setDate(date.getDate() + 1);
    
    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    
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
    
    const lossDateStr = formatDate(date);
    const dayIndex = weatherData.days.findIndex((d: any) => d.datetime === lossDateStr);
    
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

// Process a batch of photos with the AI
async function processBatch(
  imageContents: any[],
  photoDescriptions: string[],
  batchNumber: number,
  totalBatches: number,
  systemPrompt: string,
  basePrompt: string,
  OPENAI_API_KEY: string
): Promise<string> {
  const batchPrompt = totalBatches > 1 
    ? `${basePrompt}\n\n[BATCH ${batchNumber} of ${totalBatches}]\nThis batch contains photos ${photoDescriptions.map(d => d.split(':')[0]).join(', ')}.`
    : basePrompt;

  console.log(`Processing batch ${batchNumber}/${totalBatches} with ${imageContents.length} images...`);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: batchPrompt + "\n\nPhoto Information:\n" + photoDescriptions.join('\n') },
            ...imageContents
          ]
        }
      ],
      max_tokens: 8000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Batch ${batchNumber} failed:`, response.status, errorText);
    throw new Error(`AI API error: ${response.status}`);
  }

  const result = await response.json();
  return result.choices?.[0]?.message?.content || '';
}

// Combine batch results into a cohesive report
async function combineResults(
  batchResults: string[],
  reportType: string,
  claimContext: string,
  OPENAI_API_KEY: string
): Promise<string> {
  if (batchResults.length === 1) {
    return batchResults[0];
  }

  console.log(`Combining ${batchResults.length} batch results...`);

  const combinePrompt = `You are an expert forensic analyst. You have received analysis results from multiple batches of photos for the same insurance claim. 
Your task is to combine these into a single, cohesive ${reportType} report. 

IMPORTANT INSTRUCTIONS:
- Merge the analyses into one unified document
- Remove any duplicate information
- Maintain consistent photo numbering across all sections
- Ensure the final report flows naturally as if analyzing all photos together
- Keep all photo references and damage observations
- Combine similar findings into consolidated sections

${claimContext}

Here are the batch results to combine:

${batchResults.map((r, i) => `=== BATCH ${i + 1} ANALYSIS ===\n${r}\n`).join('\n')}

Create a single, unified report that incorporates all the above analyses.`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an expert at combining forensic analysis reports into cohesive documents." },
        { role: "user", content: combinePrompt }
      ],
      max_tokens: 12000,
    }),
  });

  if (!response.ok) {
    console.error("Combine request failed, returning concatenated results");
    return batchResults.join('\n\n---\n\n');
  }

  const result = await response.json();
  return result.choices?.[0]?.message?.content || batchResults.join('\n\n---\n\n');
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

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
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
- Max Wind Speed: ${weatherData.daily.maxWindSpeed?.[0]} mph
- Max Wind Gusts: ${weatherData.daily.maxWindGusts?.[0]} mph
- Precipitation: ${weatherData.daily.precipitation?.[0]} inches

Day After (${weatherData.daily.dates?.[2]}):
- Conditions: ${weatherData.daily.weatherDescription?.[2] || 'N/A'}
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

    console.log(`Analyzing ${photos.length} photos for claim ${claimId} (batch size: ${BATCH_SIZE})`);

    // Get signed URLs and build image content for AI
    const allImageContents: any[] = [];
    const allPhotoDescriptions: string[] = [];
    const photoUrls: { url: string; fileName: string; category: string; description: string; photoNumber: number }[] = [];
    
    let photoNumber = 1;
    for (const photo of photos) {
      const path = photo.annotated_file_path || photo.file_path;
      const { data: signedUrl } = await supabase.storage
        .from("claim-files")
        .createSignedUrl(path, 3600);
      
      if (signedUrl?.signedUrl) {
        allImageContents.push({
          type: "image_url",
          image_url: { url: signedUrl.signedUrl }
        });
        allPhotoDescriptions.push(`Photo ${photoNumber}: ${photo.file_name} | Category: ${photo.category} | Description: ${photo.description || 'No description'}`);
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

    if (allImageContents.length === 0) {
      return new Response(
        JSON.stringify({ error: "Could not load any photos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build system prompt
    const systemPrompt = `You are an expert forensic property damage analyst and licensed public adjuster preparing detailed forensic analyses for insurance claims. Your reports must be thorough, persuasive, and provide strong supporting arguments for the claim.

CRITICAL INSTRUCTIONS:
- Reference photos by their number (Photo 1, Photo 2, etc.) throughout your analysis
- For EACH photo, provide DETAILED forensic analysis including:
  * Specific damage indicators visible (cracks, displacement, missing materials, staining, etc.)
  * Measurements or size estimates when visible
  * Damage severity assessment with justification
  * How the visible damage connects to the reported loss event
  * What this specific damage means for the integrity/function of the affected component
- Reference applicable manufacturer specifications, building codes (IRC, IBC), and industry standards (ASTM, ARMA, NRCA)
- For roofing damage: restoration requires FULL REPLACEMENT of each damaged slope/section per manufacturer warranty requirements
- Provide SPECIFIC arguments for why the damage requires replacement vs repair
- Do NOT include: action items, document gathering suggestions, coverage advice, or specialist inspection recommendations
- IMPORTANT: When referencing weather data, ALWAYS attribute it to "Visual Crossing Weather Services"

WRITING STYLE:
- Write in a professional, authoritative tone suitable for insurance claim documentation
- Use technical terminology but explain implications
- Be specific and detailed - avoid vague statements
- Build a compelling narrative connecting the loss event to the observed damage`;
    
    // Build user prompt based on report type
    let userPrompt = "";
    
    switch (reportType) {
      case "damage-assessment":
        userPrompt = `Analyze these photos and create a Forensic Damage Assessment Report.

${claimContext}

Please provide:
1. **Executive Summary** - Brief overview of all damage observed and restoration requirements
2. **Forensic Damage Analysis** - For each photo/area:
   - Type and extent of damage visible
   - Severity assessment (minor/moderate/severe/critical)
   - Cause of damage based on the loss type
   - Evidence of how the damage occurred
3. **Restoration Requirements** - To return the property to pre-loss condition:
   - Applicable manufacturer specifications
   - Relevant building codes and standards
   - Materials and components needed
4. **Hidden/Secondary Damage** - Potential underlying damage based on visible indicators`;
        break;
        
      case "before-after":
        userPrompt = `Analyze these before/after comparison photos and create a Forensic Progress Report.

${claimContext}

Please provide:
1. **Condition Comparison** - Overview of pre-loss vs current conditions
2. **Damage Documentation** - What damage is visible in the "before" photos
3. **Repair Analysis** - What repairs are visible in the "after" photos
4. **Code Compliance** - Whether visible repairs meet building codes
5. **Outstanding Restoration** - Any remaining work needed`;
        break;
        
      case "quick-analysis":
        userPrompt = `Quickly analyze these photos and provide a forensic summary.

${claimContext}

Please provide a brief forensic analysis including:
- Main types of damage visible and their severity
- Key restoration requirements
- Applicable building codes or manufacturer specs`;
        break;

      case "proof-of-loss":
        userPrompt = `Create a detailed Proof of Loss / Valuation Report based on these photos.

${claimContext}

Please provide a comprehensive Proof of Loss document including:

## SWORN STATEMENT IN PROOF OF LOSS

### I. PROPERTY DESCRIPTION
- Property location and type
- Age and construction type (if visible)
- Areas affected by the loss

### II. DAMAGE DOCUMENTATION
For each damaged area:
- Photo reference numbers
- Detailed description of damage observed
- Forensic indicators of cause

### III. SCOPE OF WORK REQUIRED
- Full replacement requirements per manufacturer warranty
- Building code compliance requirements
- Materials & specifications needed

### IV. VALUATION SUMMARY
- Summary of all work required`;
        break;

      case "final-demand":
        userPrompt = `Create a Final Demand Letter based on these photos documenting property damage.

${claimContext}

Please create a professional Final Demand Letter including:

## NOTICE OF FINAL DEMAND

### I. FACTUAL BACKGROUND
### II. DAMAGE ANALYSIS
### III. RESTORATION REQUIREMENTS
### IV. PROSPECTIVE LIABILITY (NJ/PA Insurance Codes)
### V. DEMAND FOR PAYMENT
### VI. CONCLUSION`;
        break;

      case "demand-package":
        userPrompt = `Create a COMPLETE DEMAND PACKAGE based on these photos documenting property damage.

${claimContext}
${weatherContext}

Create a comprehensive demand package structured as follows:

## I. FINAL DEMAND LETTER
## II. DAMAGE ANALYSIS
## III. PROOF OF LOSS / VALUATION
## IV. RESTORATION REQUIREMENTS
## V. PROSPECTIVE LIABILITY (NJ/PA Insurance Codes)
## VI. DEMAND FOR PAYMENT

${weatherData ? 'Include weather data in the analysis sections.' : ''}`;
        break;
        
      default: // full-report
        userPrompt = `Create a comprehensive Forensic Photo Documentation Report with detailed analysis of each photo.

${claimContext}

## I. EXECUTIVE SUMMARY
## II. DETAILED PHOTO-BY-PHOTO FORENSIC ANALYSIS
## III. CAUSE OF LOSS CORRELATION
## IV. RESTORATION REQUIREMENTS
## V. CONSEQUENCES OF INADEQUATE RESTORATION
## VI. CONCLUSION`;
    }

    // Process photos in batches
    const totalBatches = Math.ceil(allImageContents.length / BATCH_SIZE);
    const batchResults: string[] = [];

    console.log(`Processing ${allImageContents.length} photos in ${totalBatches} batch(es)...`);

    for (let i = 0; i < totalBatches; i++) {
      const startIdx = i * BATCH_SIZE;
      const endIdx = Math.min(startIdx + BATCH_SIZE, allImageContents.length);
      
      const batchImages = allImageContents.slice(startIdx, endIdx);
      const batchDescriptions = allPhotoDescriptions.slice(startIdx, endIdx);
      
      try {
        const batchResult = await processBatch(
          batchImages,
          batchDescriptions,
          i + 1,
          totalBatches,
          systemPrompt,
          userPrompt,
          OPENAI_API_KEY
        );
        batchResults.push(batchResult);
        console.log(`Batch ${i + 1}/${totalBatches} complete, result length: ${batchResult.length}`);
      } catch (error) {
        console.error(`Batch ${i + 1} failed:`, error);
        // Continue with other batches
      }
    }

    if (batchResults.length === 0) {
      return new Response(
        JSON.stringify({ error: "All batches failed. Please try again with fewer photos." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Combine batch results
    let reportContent: string;
    if (batchResults.length > 1) {
      reportContent = await combineResults(batchResults, reportType, claimContext, OPENAI_API_KEY);
    } else {
      reportContent = batchResults[0];
    }

    console.log("Photo analysis complete, final report length:", reportContent.length);

    return new Response(
      JSON.stringify({ 
        report: reportContent,
        photoCount: photos.length,
        reportType,
        photoUrls: photoUrls,
        weatherData: weatherData,
        batchesProcessed: batchResults.length,
        totalBatches
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
