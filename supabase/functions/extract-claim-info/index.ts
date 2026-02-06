import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple PDF text extraction without external dependencies
async function extractTextFromPDF(fileData: Blob): Promise<string> {
  const arrayBuffer = await fileData.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const rawText = new TextDecoder("latin1").decode(bytes);
  
  const textParts: string[] = [];
  
  // Extract text between BT/ET blocks (PDF text objects)
  const btEtRegex = /BT\s([\s\S]*?)ET/g;
  let match;
  while ((match = btEtRegex.exec(rawText)) !== null) {
    const block = match[1];
    const strRegex = /\(([^)]*)\)/g;
    let strMatch;
    while ((strMatch = strRegex.exec(block)) !== null) {
      const decoded = strMatch[1]
        .replace(/\\n/g, '\n').replace(/\\r/g, '\r')
        .replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\');
      if (decoded.trim()) textParts.push(decoded);
    }
    const hexRegex = /<([0-9A-Fa-f\s]+)>/g;
    let hexMatch;
    while ((hexMatch = hexRegex.exec(block)) !== null) {
      const hex = hexMatch[1].replace(/\s/g, '');
      if (hex.length >= 4) {
        let decoded = '';
        for (let i = 0; i < hex.length; i += 2) {
          const charCode = parseInt(hex.substring(i, i + 2), 16);
          if (charCode >= 32 && charCode < 127) decoded += String.fromCharCode(charCode);
        }
        if (decoded.trim()) textParts.push(decoded);
      }
    }
  }
  
  // Fallback: grab readable ASCII sequences
  if (textParts.length < 5) {
    const asciiRegex = /[A-Za-z0-9][A-Za-z0-9 ,.\-\/#:@$%&()]{4,}/g;
    let asciiMatch;
    while ((asciiMatch = asciiRegex.exec(rawText)) !== null) {
      textParts.push(asciiMatch[0].trim());
    }
  }
  
  return textParts.join(' ');
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract text from the file
    let extractedText = "";
    const lowerName = file.name.toLowerCase();

    if (lowerName.endsWith(".pdf")) {
      const blob = new Blob([await file.arrayBuffer()], { type: file.type });
      extractedText = await extractTextFromPDF(blob);
    } else if (lowerName.endsWith(".txt") || lowerName.endsWith(".csv")) {
      extractedText = await file.text();
    } else if (lowerName.endsWith(".doc") || lowerName.endsWith(".docx")) {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const textDecoder = new TextDecoder("utf-8", { fatal: false });
      const rawText = textDecoder.decode(bytes);
      const xmlTextMatches = rawText.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
      if (xmlTextMatches) {
        extractedText = xmlTextMatches.map(m => m.replace(/<[^>]+>/g, "")).join(" ");
      } else {
        extractedText = rawText.replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s{3,}/g, " ").trim();
      }
    } else {
      extractedText = await file.text();
    }

    if (!extractedText || extractedText.trim().length < 20) {
      return new Response(JSON.stringify({ 
        error: "Could not extract text from document. It may be scanned or image-based.",
        extracted: {} 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Truncate to avoid token limits
    extractedText = extractedText.substring(0, 30000);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Use tool calling to extract structured data
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a document data extractor for insurance claims. Extract key claim information from the provided document text. Be precise and extract only what is explicitly stated in the document. Do not guess or infer values that aren't clearly present.`
          },
          {
            role: "user",
            content: `Extract claim information from this document:\n\n${extractedText}`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_claim_info",
              description: "Extract structured claim information from a document",
              parameters: {
                type: "object",
                properties: {
                  policyholder_name: {
                    type: "string",
                    description: "Full name of the policyholder/insured/claimant. Look for labels like 'Insured:', 'Policyholder:', 'Name:', 'Claimant:'"
                  },
                  property_address: {
                    type: "string",
                    description: "Full property/loss address including street, city, state, zip. Look for 'Property Address:', 'Loss Location:', 'Risk Address:'"
                  },
                  claim_number: {
                    type: "string",
                    description: "The insurance claim number. Look for 'Claim #:', 'Claim Number:', 'File Number:'"
                  },
                  policy_number: {
                    type: "string",
                    description: "The insurance policy number. Look for 'Policy #:', 'Policy Number:'"
                  },
                  loss_type: {
                    type: "string",
                    description: "Type of loss/peril (e.g., wind, hail, water, fire, theft, vehicle impact, hurricane, tornado, plumbing, smoke, lightning). Look for 'Type of Loss:', 'Cause of Loss:', 'Peril:'"
                  },
                  loss_date: {
                    type: "string",
                    description: "Date of loss in YYYY-MM-DD format. Look for 'Date of Loss:', 'Loss Date:', 'Date of Occurrence:'"
                  },
                  insurance_company: {
                    type: "string",
                    description: "Name of the insurance company/carrier. Look for company name in header, 'Carrier:', 'Insurance Company:'"
                  },
                  loss_description: {
                    type: "string",
                    description: "Brief description of the loss or damage. Keep under 200 characters."
                  }
                },
                required: [],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_claim_info" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
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
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error("AI extraction failed");
    }

    const aiResult = await response.json();
    
    let extracted: any = {};
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        extracted = JSON.parse(toolCall.function.arguments);
      } catch {
        console.error("Failed to parse tool call arguments");
      }
    }

    // Clean up empty strings
    for (const key of Object.keys(extracted)) {
      if (!extracted[key] || extracted[key].trim() === "") {
        delete extracted[key];
      }
    }

    console.log("Extracted claim info:", JSON.stringify(extracted));

    return new Response(JSON.stringify({ extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("extract-claim-info error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
