import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a property damage inspector and Xactimate workflow assistant.

Your job is NOT to create a priced estimate.

Your job is to:
1) Identify what materials or items are damaged in the provided photos.
2) Determine whether each item should be:
   - replace
   - repair
   - clean_restore
   - investigate
3) Explain WHY the action is required using visible evidence only.
4) Convert those findings into an Xactimate add-item plan using:
   - category_code (CAT only)
   - selector_hint (search phrase, not full CAT/SEL codes)

CRITICAL RULES:
- Do NOT create pricing.
- Do NOT guess Xactimate selector codes.
- Use ONLY visible evidence from photos and captions.
- If evidence is unclear, choose "investigate".
- Include remediation (WTR/CLN), removal, and replacement when applicable.
- Group output by area/room if captions provide location.

Return ONLY valid JSON that matches the schema.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { claimId } = await req.json();
    if (!claimId) throw new Error("claimId is required");

    // Get claim description
    const { data: claim, error: claimError } = await supabase
      .from("claims")
      .select("description, loss_type, property_address")
      .eq("id", claimId)
      .single();

    if (claimError || !claim) throw new Error("Claim not found");

    // Get photos with signed URLs
    const { data: photos, error: photosError } = await supabase
      .from("claim_photos")
      .select("id, file_path, file_name, category, description, ai_analysis_summary, ai_detected_damages, ai_material_type, ai_condition_rating")
      .eq("claim_id", claimId)
      .order("created_at", { ascending: false });

    if (photosError) throw new Error("Failed to fetch photos");
    if (!photos || photos.length === 0) throw new Error("No photos found for this claim");

    // Generate signed URLs for photos
    const photoContent: any[] = [];
    const captionLines: string[] = [];

    for (const photo of photos.slice(0, 20)) {
      const { data: urlData } = await supabase.storage
        .from("claim-files")
        .createSignedUrl(photo.file_path, 3600);

      if (urlData?.signedUrl) {
        photoContent.push({
          type: "image_url",
          image_url: { url: urlData.signedUrl },
        });
      }

      const caption = [
        photo.description || photo.category || "(no caption)",
        photo.ai_material_type ? `Material: ${photo.ai_material_type}` : null,
        photo.ai_condition_rating ? `Condition: ${photo.ai_condition_rating}` : null,
        photo.ai_analysis_summary ? `AI: ${photo.ai_analysis_summary}` : null,
      ].filter(Boolean).join(" | ");

      captionLines.push(`- ${photo.id}: ${caption}`);
    }

    const claimDescription = [
      claim.description || "No description",
      claim.loss_type ? `Loss type: ${claim.loss_type}` : null,
      claim.property_address ? `Property: ${claim.property_address}` : null,
    ].filter(Boolean).join("\n");

    const toolSchema = {
      type: "function",
      function: {
        name: "report_damage_analysis",
        description: "Report the damage analysis findings and Xactimate plan",
        parameters: {
          type: "object",
          properties: {
            damage_findings: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  area: { type: "string" },
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        item: { type: "string" },
                        action: { type: "string", enum: ["replace", "repair", "clean_restore", "investigate"] },
                        why: { type: "string" },
                        evidence: { type: "array", items: { type: "string" } },
                        confidence: { type: "number" },
                      },
                      required: ["item", "action", "why", "confidence"],
                    },
                  },
                },
                required: ["area", "items"],
              },
            },
            xactimate_plan: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  area: { type: "string" },
                  trade_groups: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        category_code: { type: "string" },
                        items: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              selector_hint: { type: "string" },
                              reason: { type: "string" },
                              linked_replace_item: { type: "string" },
                            },
                            required: ["selector_hint", "reason", "linked_replace_item"],
                          },
                        },
                      },
                      required: ["category_code", "items"],
                    },
                  },
                },
                required: ["area", "trade_groups"],
              },
            },
            notes: { type: "array", items: { type: "string" } },
            questions: { type: "array", items: { type: "string" } },
          },
          required: ["damage_findings", "xactimate_plan"],
        },
      },
    };

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: `CLAIM DESCRIPTION:\n${claimDescription}` },
              { type: "text", text: `PHOTO CAPTIONS:\n${captionLines.join("\n")}` },
              ...photoContent,
            ],
          },
        ],
        tools: [toolSchema],
        tool_choice: { type: "function", function: { name: "report_damage_analysis" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    let result;
    if (toolCall?.function?.arguments) {
      result = JSON.parse(toolCall.function.arguments);
    } else {
      // Fallback: try parsing content as JSON
      const content = aiData.choices?.[0]?.message?.content || "";
      const jsonStart = content.indexOf("{");
      const jsonEnd = content.lastIndexOf("}");
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        result = JSON.parse(content.slice(jsonStart, jsonEnd + 1));
      } else {
        throw new Error("Could not parse AI response");
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("photo-damage-analyzer error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
