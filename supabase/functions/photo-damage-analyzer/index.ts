import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PASS1_SYSTEM_PROMPT = `You are a property damage photo inspector.

TASK: Create a PHOTO-BY-PHOTO damage inventory.
You MUST return one entry for EACH photo_id provided.

RULES:
- For each photo: list 2–8 distinct damaged items visible in that photo (unless unusable).
- Do NOT summarize across photos. Do NOT merge items across different photos.
- Use inferred_area (room/elevation) from caption or visual cues.
- For each item: include item, damage, action (replace/repair/clean_restore/investigate), why, severity, and trade_category_code (Xactimate category only).
- Only use investigate if the damage/material truly cannot be seen; if investigate, include a specific missing_photo_request.
- No pricing. No quantities. No Xactimate selector codes.

Return ONLY valid JSON matching the schema.`;

const PASS2_SYSTEM_PROMPT = `You are a property damage claim specialist producing a final scope summary.

You will receive a raw photo-by-photo damage inventory. Your job:
1. Group items by inferred_area.
2. Deduplicate: if the same item + action + damage appears in multiple photos in the same area, merge into one entry and collect all photo_ids as evidence.
3. For each unique item, produce:
   - item, material, damage, action, why, severity, trade_category_code, evidence_photo_ids[]
4. Produce an Xactimate add-item plan:
   - For each area, list category_code (CAT only) + selector_hint (search phrase, NOT full selector codes)
   - Link each to the damage item it covers
5. If water damage is present, include remediation + removal + rebuild recommendations.

RULES:
- No pricing. No quantities.
- Do NOT guess Xactimate selector codes.
- Return ONLY valid JSON matching the schema.`;

const pass1ToolSchema = {
  type: "function",
  function: {
    name: "report_photo_inventory",
    description: "Report per-photo damage inventory",
    parameters: {
      type: "object",
      properties: {
        photos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              photo_id: { type: "string" },
              inferred_area: { type: "string" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    item: { type: "string" },
                    material: { type: "string" },
                    damage: { type: "string" },
                    action: { type: "string", enum: ["replace", "repair", "clean_restore", "investigate"] },
                    why: { type: "string" },
                    severity: { type: "string", enum: ["minor", "moderate", "severe"] },
                    trade_category_code: { type: "string" },
                    confidence: { type: "number" },
                  },
                  required: ["item", "damage", "action", "why", "severity", "trade_category_code", "confidence"],
                },
              },
              missing_photo_request: { type: "string" },
            },
            required: ["photo_id", "inferred_area", "items"],
          },
        },
        notes: { type: "array", items: { type: "string" } },
      },
      required: ["photos"],
    },
  },
};

const pass2ToolSchema = {
  type: "function",
  function: {
    name: "report_grouped_analysis",
    description: "Report deduplicated grouped damage analysis and Xactimate plan",
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
                    material: { type: "string" },
                    damage: { type: "string" },
                    action: { type: "string", enum: ["replace", "repair", "clean_restore", "investigate"] },
                    why: { type: "string" },
                    severity: { type: "string", enum: ["minor", "moderate", "severe"] },
                    trade_category_code: { type: "string" },
                    confidence: { type: "number" },
                    evidence_photo_ids: { type: "array", items: { type: "string" } },
                  },
                  required: ["item", "damage", "action", "why", "evidence_photo_ids"],
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

async function callAI(apiKey: string, body: any, timeoutMs = 90000): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      if (response.status === 429 || response.status === 402) {
        throw { status: response.status, message: response.status === 429 ? "Rate limit exceeded. Please try again shortly." : "AI credits exhausted. Please add funds." };
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const text = await response.text();
    if (!text || text.trim().length === 0) {
      throw new Error("AI gateway returned empty response");
    }

    return JSON.parse(text);
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

function extractToolResult(aiData: any): any {
  const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    return JSON.parse(toolCall.function.arguments);
  }
  const content = aiData.choices?.[0]?.message?.content || "";
  if (content) {
    const jsonStart = content.indexOf("{");
    const jsonEnd = content.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      return JSON.parse(content.slice(jsonStart, jsonEnd + 1));
    }
  }
  throw new Error("No parseable result in AI response");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { claimId, mode = "batch", photoIds, pass1Data, claimDescription } = body;

    if (!claimId) throw new Error("claimId is required");

    // =================== MODE: BATCH (Pass 1 - one batch of photos) ===================
    if (mode === "batch") {
      if (!photoIds || !Array.isArray(photoIds) || photoIds.length === 0) {
        throw new Error("photoIds array is required for batch mode");
      }

      // Get claim info if not provided
      let desc = claimDescription;
      if (!desc) {
        const { data: claim } = await supabase
          .from("claims")
          .select("loss_description, loss_type, policyholder_address")
          .eq("id", claimId)
          .maybeSingle();
        desc = [
          claim?.loss_description || "No description",
          claim?.loss_type ? `Loss type: ${claim.loss_type}` : null,
          claim?.policyholder_address ? `Property: ${claim.policyholder_address}` : null,
        ].filter(Boolean).join("\n");
      }

      // Fetch photo records for this batch
      const { data: photos, error: photosError } = await supabase
        .from("claim_photos")
        .select("id, file_path, file_name, category, description, ai_analysis_summary, ai_material_type, ai_condition_rating")
        .in("id", photoIds);

      if (photosError) throw new Error("Failed to fetch photos");

      const batchContent: any[] = [];
      const batchCaptions: string[] = [];
      const batchPhotoIds: string[] = [];

      for (const photo of (photos || [])) {
        const caption = [
          photo.description || photo.category || "(no caption)",
          photo.ai_material_type ? `Material: ${photo.ai_material_type}` : null,
          photo.ai_condition_rating ? `Condition: ${photo.ai_condition_rating}` : null,
          photo.ai_analysis_summary ? `AI: ${photo.ai_analysis_summary}` : null,
        ].filter(Boolean).join(" | ");

        batchCaptions.push(`photo_id="${photo.id}": ${caption}`);
        batchPhotoIds.push(photo.id);

        try {
          const { data: signedData, error: signError } = await supabase.storage
            .from("claim-files")
            .createSignedUrl(photo.file_path, 600);

          if (!signError && signedData?.signedUrl) {
            batchContent.push({
              type: "image_url",
              image_url: { url: signedData.signedUrl },
            });
          }
        } catch (e) {
          console.error("Failed to create signed URL:", photo.id, e);
        }
      }

      // Also add placeholder for any photoIds not found in DB
      for (const pid of photoIds) {
        if (!batchPhotoIds.includes(pid)) {
          batchPhotoIds.push(pid);
          batchCaptions.push(`photo_id="${pid}": (photo not found in database)`);
        }
      }

      if (batchContent.length === 0) {
        // No images could be loaded, return placeholder entries
        const placeholderPhotos = batchPhotoIds.map(pid => ({
          photo_id: pid,
          inferred_area: "Unknown",
          items: [{ item: "Unable to access photo", damage: "N/A", action: "investigate", why: "Photo could not be loaded for analysis", severity: "minor", trade_category_code: "GEN", confidence: 0 }],
          missing_photo_request: "Re-upload or re-run analysis",
        }));
        return new Response(JSON.stringify({ photos: placeholderPhotos, notes: ["No images could be loaded for this batch"] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const aiData = await callAI(LOVABLE_API_KEY, {
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: PASS1_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: `CLAIM: ${desc}\n\nPHOTO CAPTIONS (use photo_id in your response):\n${batchCaptions.join("\n")}\n\nYou MUST return one entry for each of these photo_ids: ${batchPhotoIds.join(", ")}` },
              ...batchContent,
            ],
          },
        ],
        tools: [pass1ToolSchema],
        tool_choice: { type: "function", function: { name: "report_photo_inventory" } },
      });

      const result = extractToolResult(aiData);

      // Fill in missing photo_ids
      const returnedIds = new Set((result.photos || []).map((p: any) => p.photo_id));
      for (const pid of batchPhotoIds) {
        if (!returnedIds.has(pid)) {
          if (!result.photos) result.photos = [];
          result.photos.push({
            photo_id: pid,
            inferred_area: "Unknown",
            items: [{ item: "Missing from batch output", damage: "N/A", action: "investigate", why: "Missing from batch output; rerun", severity: "minor", trade_category_code: "GEN", confidence: 0 }],
            missing_photo_request: "Rerun analysis",
          });
        }
      }

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =================== MODE: DEDUPLICATE (Pass 2 - text only) ===================
    if (mode === "deduplicate") {
      if (!pass1Data) throw new Error("pass1Data is required for deduplicate mode");

      let desc = claimDescription;
      if (!desc) {
        const { data: claim } = await supabase
          .from("claims")
          .select("loss_description, loss_type, policyholder_address")
          .eq("id", claimId)
          .maybeSingle();
        desc = [
          claim?.loss_description || "No description",
          claim?.loss_type ? `Loss type: ${claim.loss_type}` : null,
          claim?.policyholder_address ? `Property: ${claim.policyholder_address}` : null,
        ].filter(Boolean).join("\n");
      }

      const pass1Summary = JSON.stringify(pass1Data, null, 1);
      const totalItems = (pass1Data.photos || []).reduce((s: number, p: any) => s + (p.items?.length || 0), 0);

      const aiData = await callAI(LOVABLE_API_KEY, {
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: PASS2_SYSTEM_PROMPT },
          {
            role: "user",
            content: `CLAIM: ${desc}\n\nRAW PHOTO-BY-PHOTO INVENTORY (${(pass1Data.photos || []).length} photos, ${totalItems} items):\n\n${pass1Summary}`,
          },
        ],
        tools: [pass2ToolSchema],
        tool_choice: { type: "function", function: { name: "report_grouped_analysis" } },
      }, 120000);

      const result = extractToolResult(aiData);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =================== MODE: LIST (get photo IDs for a claim) ===================
    if (mode === "list") {
      const { data: photos, error: photosError } = await supabase
        .from("claim_photos")
        .select("id")
        .eq("claim_id", claimId)
        .order("created_at", { ascending: false });

      if (photosError) throw new Error("Failed to fetch photos");

      const { data: claim } = await supabase
        .from("claims")
        .select("loss_description, loss_type, policyholder_address")
        .eq("id", claimId)
        .maybeSingle();

      const desc = [
        claim?.loss_description || "No description",
        claim?.loss_type ? `Loss type: ${claim.loss_type}` : null,
        claim?.policyholder_address ? `Property: ${claim.policyholder_address}` : null,
      ].filter(Boolean).join("\n");

      return new Response(JSON.stringify({
        photoIds: (photos || []).map(p => p.id),
        claimDescription: desc,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown mode: ${mode}`);
  } catch (error: any) {
    console.error("photo-damage-analyzer error:", error);
    const status = error.status || 500;
    return new Response(
      JSON.stringify({ error: error.message || error instanceof Error ? error.message : "Unknown error" }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
