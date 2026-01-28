import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExtractedEstimate {
  estimate_type: string | null;
  dwelling: {
    rcv: number;
    recoverable_depreciation: number;
    non_recoverable_depreciation: number;
    deductible: number;
  };
  other_structures: {
    rcv: number;
    recoverable_depreciation: number;
    non_recoverable_depreciation: number;
    deductible: number;
  };
  contents: {
    rcv: number;
    recoverable_depreciation: number;
    non_recoverable_depreciation: number;
  };
  pwi: {
    rcv: number;
    recoverable_depreciation: number;
    non_recoverable_depreciation: number;
    deductible: number;
  };
  line_items: Array<{
    description: string;
    quantity: number;
    unit: string;
    unit_cost: number;
    total: number;
    category: string;
  }>;
  totals: {
    gross_total: number;
    total_depreciation: number;
    net_total: number;
  };
  raw_text?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const claimId = formData.get("claimId") as string;

    if (!file) {
      throw new Error("No file provided");
    }

    console.log(`Processing estimate file: ${file.name}, type: ${file.type}, size: ${file.size}`);

    // Convert file to base64 for AI processing
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const mimeType = file.type || "application/pdf";

    // Use Lovable AI to extract data from the estimate
    const systemPrompt = `You are an expert insurance estimate parser. Your job is to extract financial data from insurance estimates (Xactimate, Symbility, contractor estimates, etc.).

Extract the following information and return it as a JSON object:

{
  "estimate_type": "xactimate" | "symbility" | "contractor" | "unknown",
  "dwelling": {
    "rcv": <number - Replacement Cost Value for dwelling/structure>,
    "recoverable_depreciation": <number - Recoverable depreciation amount>,
    "non_recoverable_depreciation": <number - Non-recoverable depreciation amount>,
    "deductible": <number - Deductible amount if shown>
  },
  "other_structures": {
    "rcv": <number>,
    "recoverable_depreciation": <number>,
    "non_recoverable_depreciation": <number>,
    "deductible": <number>
  },
  "contents": {
    "rcv": <number - Personal property/contents RCV>,
    "recoverable_depreciation": <number>,
    "non_recoverable_depreciation": <number>
  },
  "pwi": {
    "rcv": <number - Paid When Incurred RCV - items that are paid when work is completed>,
    "recoverable_depreciation": <number>,
    "non_recoverable_depreciation": <number>,
    "deductible": <number>
  },
  "line_items": [
    {
      "description": "<string>",
      "quantity": <number>,
      "unit": "<string - SF, LF, EA, etc>",
      "unit_cost": <number>,
      "total": <number>,
      "category": "<string - Roofing, Siding, Interior, etc>"
    }
  ],
  "totals": {
    "gross_total": <number - Total RCV before deductions>,
    "total_depreciation": <number - All depreciation combined>,
    "net_total": <number - Net claim value>
  }
}

Important guidelines:
- All monetary values should be numbers (not strings)
- If a value is not found in the document, use 0
- Look for common estimate sections: Summary, Line Items, Depreciation Schedule
- For Xactimate estimates, look for "Replacement Cost Value", "Less Depreciation", "Actual Cash Value"
- PWI (Paid When Incurred) items are costs that are paid when the work is actually completed - look for this section separately
- Extract as many line items as possible with their categories
- The deductible is usually shown separately from depreciation
- Return ONLY the JSON object, no other text`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Please extract all financial data from this insurance estimate document. Focus on finding RCV, depreciation amounts, deductibles, and line items.`
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64}`
                }
              }
            ]
          }
        ],
        max_tokens: 8000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      throw new Error(`AI processing failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    
    console.log("AI response received, parsing JSON...");

    // Parse the JSON from the AI response
    let extractedData: ExtractedEstimate;
    try {
      // Try to find JSON in the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("JSON parse error:", parseError, "Content:", content);
      throw new Error("Failed to parse estimate data from AI response");
    }

    console.log("Extracted estimate data:", JSON.stringify(extractedData, null, 2));

    // If claimId provided, update the settlement record
    if (claimId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Check if settlement exists
      const { data: existingSettlement } = await supabase
        .from("claim_settlements")
        .select("id")
        .eq("claim_id", claimId)
        .maybeSingle();

      const settlementData = {
        replacement_cost_value: extractedData.dwelling?.rcv || 0,
        recoverable_depreciation: extractedData.dwelling?.recoverable_depreciation || 0,
        non_recoverable_depreciation: extractedData.dwelling?.non_recoverable_depreciation || 0,
        deductible: extractedData.dwelling?.deductible || 0,
        estimate_amount: extractedData.totals?.gross_total || 0,
        other_structures_rcv: extractedData.other_structures?.rcv || 0,
        other_structures_recoverable_depreciation: extractedData.other_structures?.recoverable_depreciation || 0,
        other_structures_non_recoverable_depreciation: extractedData.other_structures?.non_recoverable_depreciation || 0,
        other_structures_deductible: extractedData.other_structures?.deductible || 0,
        personal_property_rcv: extractedData.contents?.rcv || 0,
        personal_property_recoverable_depreciation: extractedData.contents?.recoverable_depreciation || 0,
        personal_property_non_recoverable_depreciation: extractedData.contents?.non_recoverable_depreciation || 0,
        pwi_rcv: extractedData.pwi?.rcv || 0,
        pwi_recoverable_depreciation: extractedData.pwi?.recoverable_depreciation || 0,
        pwi_non_recoverable_depreciation: extractedData.pwi?.non_recoverable_depreciation || 0,
        pwi_deductible: extractedData.pwi?.deductible || 0,
      };

      if (existingSettlement) {
        const { error: updateError } = await supabase
          .from("claim_settlements")
          .update(settlementData)
          .eq("id", existingSettlement.id);

        if (updateError) {
          console.error("Settlement update error:", updateError);
          throw updateError;
        }
        console.log("Settlement updated successfully");
      } else {
        const { error: insertError } = await supabase
          .from("claim_settlements")
          .insert({
            ...settlementData,
            claim_id: claimId,
          });

        if (insertError) {
          console.error("Settlement insert error:", insertError);
          throw insertError;
        }
        console.log("Settlement created successfully");
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: extractedData,
        message: claimId ? "Estimate extracted and accounting updated" : "Estimate extracted successfully",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Extract estimate error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
