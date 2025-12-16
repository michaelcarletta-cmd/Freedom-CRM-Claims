import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper function to search web using Perplexity
async function searchWeb(query: string): Promise<string> {
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
  if (!PERPLEXITY_API_KEY) {
    return "Web search unavailable: API key not configured";
  }

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-large-128k-online',
        messages: [
          {
            role: 'system',
            content: 'Be precise and concise. Focus on insurance claim regulations, best practices, and current guidelines.'
          },
          {
            role: 'user',
            content: query
          }
        ],
        temperature: 0.2,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      console.error("Perplexity API error:", response.status);
      return "Web search temporarily unavailable";
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error("Error in web search:", error);
    return "Web search failed";
  }
}

// Helper function to find leads based on recent storm activity and property records
async function findLeads(location: string, damageType?: string): Promise<string> {
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
  if (!PERPLEXITY_API_KEY) {
    return "Lead search unavailable: Perplexity API key not configured";
  }

  try {
    // First search for recent storm events in the area
    const stormSearchQuery = `Recent severe weather events storms hail tornado hurricane wind damage in ${location} in the last 30 days. Include specific dates, areas affected, and severity of damage. Include news reports and weather service data.`;
    
    const stormResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: 'You are a research assistant helping find recent storm damage events for insurance claim lead generation. Focus on factual weather reports, news articles about property damage, and affected neighborhoods. Be specific about dates, locations, and damage types.'
          },
          {
            role: 'user',
            content: stormSearchQuery
          }
        ],
        temperature: 0.2,
        max_tokens: 2000,
      }),
    });

    if (!stormResponse.ok) {
      console.error("Perplexity storm search error:", stormResponse.status);
      return "Storm search temporarily unavailable";
    }

    const stormData = await stormResponse.json();
    const stormInfo = stormData.choices[0].message.content;
    const citations = stormData.citations || [];

    // Second search for property owner information resources
    const propertySearchQuery = `How to find property owner contact information in ${location}. Include county assessor websites, public property records databases, and resources for finding homeowner information in this area.`;
    
    const propertyResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: 'You are a research assistant helping find public property records and homeowner contact information. Focus on legitimate public records, county assessor websites, and legal methods of finding property owner information.'
          },
          {
            role: 'user',
            content: propertySearchQuery
          }
        ],
        temperature: 0.2,
        max_tokens: 1500,
      }),
    });

    let propertyInfo = "";
    if (propertyResponse.ok) {
      const propertyData = await propertyResponse.json();
      propertyInfo = propertyData.choices[0].message.content;
    }

    let result = `
LEAD RESEARCH RESULTS FOR: ${location}
${damageType ? `Damage Type Focus: ${damageType}` : ''}

=== RECENT STORM ACTIVITY ===
${stormInfo}

=== SOURCES ===
${citations.length > 0 ? citations.map((c: string, i: number) => `${i + 1}. ${c}`).join('\n') : 'See embedded links in report above'}

=== PUBLIC PROPERTY RECORDS RESOURCES ===
${propertyInfo || 'Property record search resources not available for this area.'}

=== RECOMMENDED NEXT STEPS ===
1. Review the storm events above to identify affected neighborhoods
2. Use the property records resources to find homeowner contact information
3. Target your marketing/outreach to areas with confirmed damage
4. Consider door-to-door canvassing in heavily affected areas
5. Check local news for additional damage reports and affected communities
`;

    return result;
  } catch (error) {
    console.error("Error in lead search:", error);
    return "Lead search failed. Please try again.";
  }
}

// Helper function to get weather for a specific date and location
async function getWeatherReport(location: string, date: string): Promise<string> {
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
  if (!PERPLEXITY_API_KEY) {
    return "Weather search unavailable: API key not configured";
  }

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-large-128k-online',
        messages: [
          {
            role: 'system',
            content: 'You are a weather research assistant. Provide detailed historical weather information including temperature, precipitation, wind speeds, and any severe weather events. Focus on facts from official weather records.'
          },
          {
            role: 'user',
            content: `What was the weather like in ${location} on ${date}? Include temperature, precipitation, wind conditions, and any severe weather events or storms that occurred. Search for historical weather data and news reports.`
          }
        ],
        temperature: 0.2,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      console.error("Weather search error:", response.status);
      return "Weather data temporarily unavailable";
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error("Error in weather search:", error);
    return "Weather search failed";
  }
}

// Helper function to analyze document content
async function analyzeDocument(fileUrl: string, fileName: string): Promise<string> {
  try {
    return `Document: ${fileName} (${fileUrl})`;
  } catch (error) {
    console.error("Error analyzing document:", error);
    return `Document: ${fileName} (unable to analyze content)`;
  }
}

// Search knowledge base for relevant chunks
async function searchKnowledgeBase(supabase: any, question: string, category?: string): Promise<string> {
  try {
    // Fetch more chunks to improve matching
    let query = supabase
      .from("ai_knowledge_chunks")
      .select(`
        content,
        metadata,
        ai_knowledge_documents!inner(category, file_name, status)
      `)
      .eq("ai_knowledge_documents.status", "completed");

    if (category) {
      query = query.eq("ai_knowledge_documents.category", category);
    }

    const { data: chunks, error } = await query.limit(100);

    if (error || !chunks || chunks.length === 0) {
      console.log("No knowledge base chunks found");
      return "";
    }

    console.log(`Found ${chunks.length} knowledge base chunks to search`);

    // Extract all meaningful words from the question (including short ones like ACV, RCV, O&L)
    const questionLower = question.toLowerCase();
    // Include words 2+ characters, and also important insurance abbreviations
    const questionWords = questionLower
      .split(/\s+/)
      .filter(w => w.length >= 2)
      .map(w => w.replace(/[^a-z0-9]/g, ''))
      .filter(w => w.length >= 2);
    
    // Also extract multi-word phrases for better matching
    const importantTerms = [
      'depreciation', 'acv', 'rcv', 'actual cash value', 'replacement cost',
      'ordinance', 'law', 'code', 'compliance', 'deductible', 'coverage',
      'policy', 'claim', 'adjuster', 'supplement', 'denial', 'settlement',
      'recoverable', 'non-recoverable', 'dwelling', 'roofing', 'damage',
      'wind', 'hail', 'storm', 'inspection', 'estimate', 'xactimate'
    ];
    
    const matchedTerms = importantTerms.filter(term => questionLower.includes(term));
    const isAcvQuestion = /\bacv\b|actual cash value|code upgrade|ordinance and law|ordinance & law/i.test(questionLower);
    
    const scoredChunks = chunks.map((chunk: any) => {
      const contentLower = chunk.content.toLowerCase();
      const sourceName = (chunk.ai_knowledge_documents?.file_name || '').toLowerCase();
      const category = (chunk.ai_knowledge_documents?.category || '').toLowerCase();
      // Detect the specific ACV training audio file and similar ACV/code training docs
      const isFromAcvAudio = sourceName.includes('acv and code upgrade');
      const isFromAudioRecording = isFromAcvAudio || (category === 'building-codes' && sourceName.includes('acv'));
      
      // Score based on word matches
      let score = 0;
      
      // Match individual words
      questionWords.forEach(word => {
        if (contentLower.includes(word)) {
          score += 1;
          // Bonus for important insurance terms
          if (importantTerms.includes(word)) {
            score += 2;
          }
        }
      });
      
      // Match important phrases
      matchedTerms.forEach(term => {
        if (contentLower.includes(term)) {
          score += 3;
        }
      });
      
      // Bonus for exact phrase matches
      const phrases = questionLower.match(/["']([^"']+)["']/g);
      if (phrases) {
        phrases.forEach(phrase => {
          const cleanPhrase = phrase.replace(/["']/g, '');
          if (contentLower.includes(cleanPhrase)) {
            score += 5;
          }
        });
      }
      
      // Strongly boost chunks from the ACV/code-upgrade audio recording when the question is about ACV/code
      if (isAcvQuestion && isFromAudioRecording) {
        score += 30; // make this overwhelmingly preferred
      }
      
      return { ...chunk, score, sourceName, category, isFromAudioRecording };
    }).filter((c: any) => c.score > 0);
    
    // For ACV/code-upgrade questions, if we have any chunks from the audio recording,
    // restrict the context to ONLY those chunks so answers are based on that training.
    let finalChunks: any[] = scoredChunks;
    if (isAcvQuestion) {
      const audioChunks = scoredChunks.filter((c: any) => c.isFromAudioRecording);
      if (audioChunks.length > 0) {
        finalChunks = audioChunks;
      }
    }
    
    finalChunks = finalChunks
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 8); // Get more relevant chunks

    console.log(`Found ${finalChunks.length} matching chunks with scores: ${finalChunks.map((c: any) => c.score).join(', ')}`);
    if (isAcvQuestion) {
      console.log("ACV question sources:", finalChunks.map((c: any) => c.sourceName));
    }

    if (finalChunks.length === 0) {
      console.log("No matching chunks found for question:", question);
      return "";
    }

    let knowledgeContext = "\n\n=== CRITICAL: KNOWLEDGE BASE CONTENT (from your uploaded training materials) ===\n";
    knowledgeContext += "YOU MUST prioritize and directly reference this information in your response.\n";
    knowledgeContext += "When answering, explicitly mention that this comes from the user's uploaded training materials.\n\n";
    
    finalChunks.forEach((chunk: any, i: number) => {
      const source = chunk.ai_knowledge_documents?.file_name || "Unknown source";
      const docCategory = chunk.ai_knowledge_documents?.category || "General";
      knowledgeContext += `--- Source ${i + 1}: ${source} (${docCategory}) ---\n${chunk.content}\n\n`;
    });
    
    knowledgeContext += "=== END KNOWLEDGE BASE CONTENT ===\n";

    return knowledgeContext;
  } catch (error) {
    console.error("Error searching knowledge base:", error);
    return "";
  }
}

// Report generation prompts
const reportPrompts: Record<string, string> = {
  weather: `Generate a comprehensive Weather Report for this insurance claim. Include:
1. Historical weather conditions on the date of loss
2. Any severe weather events (storms, hail, wind, flooding)
3. Official weather records and measurements
4. Comparison to typical weather patterns for the area
5. How the weather conditions relate to the reported damage
6. Citations or sources for the weather data

Format this as a professional report that can be included in claim documentation.`,

  damage: `Generate a detailed Damage Explanation Report for this insurance claim. Include:
1. Summary of all reported damages
2. Explanation of how each type of damage likely occurred based on the loss type
3. Connection between the cause of loss and the resulting damage
4. Industry standards for this type of damage assessment
5. Potential hidden or secondary damages to look for
6. Recommendations for proper documentation of damages

Format this as a professional report suitable for presenting to the insurance carrier.`,

  estimate: `Generate an Estimate Discussion Report for this insurance claim. Include:
1. Overview of the claim valuation approach
2. Explanation of replacement cost value vs actual cash value
3. Discussion of depreciation factors
4. Line items that may need additional justification
5. Common carrier objections and how to address them
6. Recommendations for maximizing the settlement
7. Items that may be supplementable

Format this as a professional analysis that helps understand and negotiate the estimate.`,

  photos: `Generate a Photo Documentation Report for this insurance claim. Include:
1. Recommended photos to capture for this type of loss
2. Photo checklist organized by area/damage type
3. Tips for capturing effective claim photos
4. Metadata and documentation requirements
5. Best practices for photo organization
6. How to document before/after conditions

Format this as a professional guide for photo documentation.`,
};

// Helper function to create a Word document (simplified DOCX format)
function createWordDocument(title: string, content: string, claim: any): Uint8Array {
  const claimInfo = claim ? `
Claim Number: ${claim.claim_number || 'N/A'}
Policyholder: ${claim.policyholder_name || 'N/A'}
Property Address: ${claim.policyholder_address || 'N/A'}
Loss Date: ${claim.loss_date || 'N/A'}
Loss Type: ${claim.loss_type || 'N/A'}
` : '';

  // Convert markdown to simple text for Word
  const plainContent = content
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/`/g, '');

  // Create document.xml content
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Title"/></w:pPr>
      <w:r><w:t>${escapeXml(title)}</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Generated: ${new Date().toLocaleDateString()}</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    ${claimInfo ? `<w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>Claim Information</w:t></w:r>
    </w:p>
    ${claimInfo.split('\n').filter(l => l.trim()).map(line => `<w:p><w:r><w:t>${escapeXml(line)}</w:t></w:r></w:p>`).join('\n')}
    <w:p><w:r><w:t></w:t></w:r></w:p>` : ''}
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>Report</w:t></w:r>
    </w:p>
    ${plainContent.split('\n').map(line => `<w:p><w:r><w:t>${escapeXml(line)}</w:t></w:r></w:p>`).join('\n')}
  </w:body>
</w:document>`;

  // Create content types
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  // Create relationships
  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  // Build a minimal ZIP file manually (simplified approach)
  const encoder = new TextEncoder();
  const files: { name: string; content: Uint8Array }[] = [
    { name: '[Content_Types].xml', content: encoder.encode(contentTypesXml) },
    { name: '_rels/.rels', content: encoder.encode(relsXml) },
    { name: 'word/document.xml', content: encoder.encode(documentXml) },
  ];

  return createZip(files);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Simple ZIP file creator
function createZip(files: { name: string; content: Uint8Array }[]): Uint8Array {
  const chunks: number[] = [];
  const centralDirectory: number[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.name);
    
    // Local file header
    const localHeader = [
      0x50, 0x4b, 0x03, 0x04, // signature
      0x14, 0x00, // version needed
      0x00, 0x00, // flags
      0x00, 0x00, // compression (store)
      0x00, 0x00, // mod time
      0x00, 0x00, // mod date
      0x00, 0x00, 0x00, 0x00, // crc32 (will be calculated)
      ...numberToBytes(file.content.length, 4), // compressed size
      ...numberToBytes(file.content.length, 4), // uncompressed size
      ...numberToBytes(nameBytes.length, 2), // name length
      0x00, 0x00, // extra field length
    ];

    // Calculate CRC32
    const crc = crc32(file.content);
    localHeader[14] = crc & 0xff;
    localHeader[15] = (crc >> 8) & 0xff;
    localHeader[16] = (crc >> 16) & 0xff;
    localHeader[17] = (crc >> 24) & 0xff;

    chunks.push(...localHeader, ...nameBytes, ...file.content);

    // Central directory entry
    const cdEntry = [
      0x50, 0x4b, 0x01, 0x02, // signature
      0x14, 0x00, // version made by
      0x14, 0x00, // version needed
      0x00, 0x00, // flags
      0x00, 0x00, // compression
      0x00, 0x00, // mod time
      0x00, 0x00, // mod date
      ...numberToBytes(crc, 4), // crc32
      ...numberToBytes(file.content.length, 4), // compressed size
      ...numberToBytes(file.content.length, 4), // uncompressed size
      ...numberToBytes(nameBytes.length, 2), // name length
      0x00, 0x00, // extra field length
      0x00, 0x00, // comment length
      0x00, 0x00, // disk start
      0x00, 0x00, // internal attrs
      0x00, 0x00, 0x00, 0x00, // external attrs
      ...numberToBytes(offset, 4), // local header offset
      ...nameBytes,
    ];

    centralDirectory.push(...cdEntry);
    offset += localHeader.length + nameBytes.length + file.content.length;
  }

  const cdOffset = offset;
  const cdSize = centralDirectory.length;

  // End of central directory
  const eocd = [
    0x50, 0x4b, 0x05, 0x06, // signature
    0x00, 0x00, // disk number
    0x00, 0x00, // disk with cd
    ...numberToBytes(files.length, 2), // entries on disk
    ...numberToBytes(files.length, 2), // total entries
    ...numberToBytes(cdSize, 4), // cd size
    ...numberToBytes(cdOffset, 4), // cd offset
    0x00, 0x00, // comment length
  ];

  return new Uint8Array([...chunks, ...centralDirectory, ...eocd]);
}

function numberToBytes(n: number, bytes: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < bytes; i++) {
    result.push((n >> (8 * i)) & 0xff);
  }
  return result;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  const table = getCrc32Table();
  for (const byte of data) {
    crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getCrc32Table(): number[] {
  const table: number[] = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table.push(c >>> 0);
  }
  return table;
}

// Helper function to find claim by client/policyholder name or claim number
async function findClaimByClientName(supabase: any, searchTerm: string): Promise<{ id: string; claim_number: string; policyholder_name: string } | null> {
  try {
    console.log("Searching for claim with term:", searchTerm);
    
    // First try exact match on policyholder_name
    let { data: claims, error } = await supabase
      .from("claims")
      .select("id, claim_number, policyholder_name")
      .ilike("policyholder_name", `%${searchTerm}%`)
      .eq("is_closed", false)
      .limit(1);

    if (!error && claims && claims.length > 0) {
      console.log("Found claim by policyholder name:", claims[0]);
      return claims[0];
    }

    // If not found, try searching by claim number
    const { data: claimsByNumber, error: numError } = await supabase
      .from("claims")
      .select("id, claim_number, policyholder_name")
      .ilike("claim_number", `%${searchTerm}%`)
      .eq("is_closed", false)
      .limit(1);

    if (!numError && claimsByNumber && claimsByNumber.length > 0) {
      console.log("Found claim by claim number:", claimsByNumber[0]);
      return claimsByNumber[0];
    }

    // Try a more flexible search - split search term and try first/last name
    const nameParts = searchTerm.trim().split(/\s+/);
    if (nameParts.length > 0) {
      for (const part of nameParts) {
        if (part.length < 2) continue;
        const { data: partialMatch, error: partialError } = await supabase
          .from("claims")
          .select("id, claim_number, policyholder_name")
          .ilike("policyholder_name", `%${part}%`)
          .eq("is_closed", false)
          .limit(1);

        if (!partialError && partialMatch && partialMatch.length > 0) {
          console.log("Found claim by partial name match:", partialMatch[0]);
          return partialMatch[0];
        }
      }
    }

    console.log("No claim found for search term:", searchTerm);
    return null;
  } catch (err) {
    console.error("Error finding claim by client name:", err);
    return null;
  }
}

// Tool definitions for AI assistant
const tools = [
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a new task for a claim. When the user mentions a client/policyholder name (like 'James Hanlon' or 'Smith'), use the client_name parameter - DO NOT put names in claim_id.",
      parameters: {
        type: "object",
        properties: {
          client_name: {
            type: "string",
            description: "REQUIRED when user refers to a claim by person's name. Put the client/policyholder name here (e.g., 'James Hanlon', 'Smith'). The system will look up the claim."
          },
          claim_id: {
            type: "string",
            description: "Only use this if you have an actual UUID from the context. Never put names or placeholders here."
          },
          title: {
            type: "string",
            description: "The title/name of the task"
          },
          description: {
            type: "string",
            description: "Optional detailed description of the task"
          },
          due_date: {
            type: "string",
            description: "Due date in YYYY-MM-DD format"
          },
          priority: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "Priority level of the task"
          },
          assigned_to: {
            type: "string",
            description: "UUID of the staff member to assign the task to"
          }
        },
        required: ["title"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "find_leads",
      description: "Search for potential insurance claim leads in a specific location by finding recent storm activity, property damage events, and public property records. Use this when the user asks about finding leads, prospecting, or identifying potential clients in a specific city, county, or state.",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "The city, county, and/or state to search for leads (e.g., 'Dallas, Texas', 'Atlantic County, New Jersey', 'Philadelphia, PA')"
          },
          damage_type: {
            type: "string",
            description: "Optional: specific type of damage to focus on (e.g., 'hail', 'wind', 'hurricane', 'tornado', 'roof')"
          }
        },
        required: ["location"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "bulk_update_status",
      description: "Update the status of multiple claims at once. Use when user wants to change status for several claims.",
      parameters: {
        type: "object",
        properties: {
          claim_ids: {
            type: "array",
            items: { type: "string" },
            description: "Array of claim IDs (UUIDs) to update"
          },
          client_names: {
            type: "array",
            items: { type: "string" },
            description: "Array of client/policyholder names to look up claims"
          },
          new_status: {
            type: "string",
            description: "The new status to set for all selected claims"
          }
        },
        required: ["new_status"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "bulk_close_claims",
      description: "Close multiple claims at once. Use when user wants to close several claims.",
      parameters: {
        type: "object",
        properties: {
          claim_ids: {
            type: "array",
            items: { type: "string" },
            description: "Array of claim IDs (UUIDs) to close"
          },
          client_names: {
            type: "array",
            items: { type: "string" },
            description: "Array of client/policyholder names to look up claims"
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "bulk_reopen_claims",
      description: "Reopen multiple closed claims at once. Use when user wants to reopen several claims.",
      parameters: {
        type: "object",
        properties: {
          claim_ids: {
            type: "array",
            items: { type: "string" },
            description: "Array of claim IDs (UUIDs) to reopen"
          },
          client_names: {
            type: "array",
            items: { type: "string" },
            description: "Array of client/policyholder names to look up claims"
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "bulk_assign_staff",
      description: "Assign a staff member to multiple claims at once.",
      parameters: {
        type: "object",
        properties: {
          claim_ids: {
            type: "array",
            items: { type: "string" },
            description: "Array of claim IDs (UUIDs)"
          },
          client_names: {
            type: "array",
            items: { type: "string" },
            description: "Array of client/policyholder names to look up claims"
          },
          staff_id: {
            type: "string",
            description: "UUID of the staff member to assign"
          },
          staff_name: {
            type: "string",
            description: "Name of the staff member to assign (will look up ID)"
          }
        }
      }
    }
  }
];

// Helper function to create a task
async function createTask(supabase: any, params: {
  claim_id: string;
  title: string;
  description?: string;
  due_date?: string;
  priority?: string;
  assigned_to?: string;
}): Promise<{ success: boolean; task?: any; error?: string }> {
  try {
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        claim_id: params.claim_id,
        title: params.title,
        description: params.description || null,
        due_date: params.due_date || null,
        priority: params.priority || "medium",
        assigned_to: params.assigned_to || null,
        status: "pending"
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating task:", error);
      return { success: false, error: error.message };
    }

    return { success: true, task: data };
  } catch (err) {
    console.error("Exception creating task:", err);
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// Helper function to resolve multiple claims from names
async function resolveClaimIds(supabase: any, claimIds?: string[], clientNames?: string[]): Promise<{ id: string; name: string }[]> {
  const resolved: { id: string; name: string }[] = [];
  
  if (claimIds && claimIds.length > 0) {
    for (const id of claimIds) {
      const { data } = await supabase
        .from("claims")
        .select("id, policyholder_name")
        .eq("id", id)
        .single();
      if (data) resolved.push({ id: data.id, name: data.policyholder_name });
    }
  }
  
  if (clientNames && clientNames.length > 0) {
    for (const name of clientNames) {
      const claim = await findClaimByClientName(supabase, name);
      if (claim) resolved.push({ id: claim.id, name: claim.policyholder_name });
    }
  }
  
  return resolved;
}

// Helper function for bulk status update
async function bulkUpdateStatus(supabase: any, claimIds: string[], newStatus: string): Promise<{ success: number; failed: number }> {
  const { error } = await supabase
    .from("claims")
    .update({ status: newStatus })
    .in("id", claimIds);
  
  if (error) {
    console.error("Error bulk updating status:", error);
    return { success: 0, failed: claimIds.length };
  }
  return { success: claimIds.length, failed: 0 };
}

// Helper function for bulk close claims
async function bulkCloseClaims(supabase: any, claimIds: string[]): Promise<{ success: number; failed: number }> {
  const { error } = await supabase
    .from("claims")
    .update({ is_closed: true })
    .in("id", claimIds);
  
  if (error) {
    console.error("Error bulk closing claims:", error);
    return { success: 0, failed: claimIds.length };
  }
  return { success: claimIds.length, failed: 0 };
}

// Helper function for bulk reopen claims
async function bulkReopenClaims(supabase: any, claimIds: string[]): Promise<{ success: number; failed: number }> {
  const { error } = await supabase
    .from("claims")
    .update({ is_closed: false })
    .in("id", claimIds);
  
  if (error) {
    console.error("Error bulk reopening claims:", error);
    return { success: 0, failed: claimIds.length };
  }
  return { success: claimIds.length, failed: 0 };
}

// Helper function for bulk staff assignment
async function bulkAssignStaff(supabase: any, claimIds: string[], staffId: string): Promise<{ success: number; failed: number; skipped: number }> {
  // Get existing assignments
  const { data: existing } = await supabase
    .from("claim_staff")
    .select("claim_id")
    .eq("staff_id", staffId)
    .in("claim_id", claimIds);
  
  const existingIds = new Set(existing?.map((e: any) => e.claim_id) || []);
  const newClaimIds = claimIds.filter(id => !existingIds.has(id));
  
  if (newClaimIds.length === 0) {
    return { success: 0, failed: 0, skipped: claimIds.length };
  }
  
  const { error } = await supabase
    .from("claim_staff")
    .insert(newClaimIds.map(claimId => ({ claim_id: claimId, staff_id: staffId })));
  
  if (error) {
    console.error("Error bulk assigning staff:", error);
    return { success: 0, failed: newClaimIds.length, skipped: existingIds.size };
  }
  return { success: newClaimIds.length, failed: 0, skipped: existingIds.size };
}

// Helper function to find staff by name
async function findStaffByName(supabase: any, staffName: string): Promise<{ id: string; name: string } | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .or(`full_name.ilike.%${staffName}%,email.ilike.%${staffName}%`)
    .limit(1);
  
  if (data && data.length > 0) {
    return { id: data[0].id, name: data[0].full_name || data[0].email };
  }
  return null;
}

// Helper function to get staff members for assignment
async function getStaffMembers(supabase: any): Promise<{ id: string; name: string; email: string }[]> {
  try {
    const { data: staffRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["staff", "admin"]);

    if (!staffRoles || staffRoles.length === 0) return [];

    const staffIds = staffRoles.map((r: any) => r.user_id);

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", staffIds)
      .eq("approval_status", "approved");

    return (profiles || []).map((p: any) => ({
      id: p.id,
      name: p.full_name || p.email,
      email: p.email
    }));
  } catch (err) {
    console.error("Error fetching staff:", err);
    return [];
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { claimId, question, messages, mode, reportType } = await req.json();
    
    if (!question && !reportType) {
      return new Response(
        JSON.stringify({ error: "Missing question or reportType" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let claim = null;
    let claimsOverview = "";
    let knowledgeBaseContext = "";
    let staffMembers: { id: string; name: string; email: string }[] = [];

    // Get staff members for task assignment
    staffMembers = await getStaffMembers(supabase);

    if (mode === "general" || !claimId) {
      const { data: allClaims } = await supabase
        .from("claims")
        .select(`
          id,
          claim_number,
          policyholder_name,
          status,
          loss_type,
          loss_date,
          claim_amount,
          insurance_company,
          created_at
        `)
        .eq("is_closed", false)
        .order("created_at", { ascending: false })
        .limit(20);

      if (allClaims && allClaims.length > 0) {
        claimsOverview = `\n\nRecent Active Claims (${allClaims.length}):\n`;
        allClaims.forEach((c, i) => {
          claimsOverview += `${i + 1}. ${c.claim_number || 'No #'} - ${c.policyholder_name} (ID: ${c.id}) | ${c.status || 'Unknown'} | ${c.loss_type || 'Unknown loss'} | ${c.insurance_company || 'Unknown carrier'}\n`;
        });
      }

      const { data: pendingTasks } = await supabase
        .from("tasks")
        .select(`
          id,
          title,
          due_date,
          priority,
          claims!inner(claim_number, policyholder_name)
        `)
        .eq("status", "pending")
        .order("due_date", { ascending: true })
        .limit(10);

      if (pendingTasks && pendingTasks.length > 0) {
        claimsOverview += `\n\nPending Tasks (${pendingTasks.length}):\n`;
        pendingTasks.forEach((t: any, i) => {
          const dueDate = t.due_date ? new Date(t.due_date).toLocaleDateString() : 'No due date';
          claimsOverview += `${i + 1}. ${t.title} | ${t.claims?.claim_number || 'No claim #'} - ${t.claims?.policyholder_name} | Due: ${dueDate} | Priority: ${t.priority || 'Normal'}\n`;
        });
      }
    } else if (claimId) {
      const { data: claimData, error: claimError } = await supabase
        .from("claims")
        .select(`
          *,
          claim_settlements(*),
          claim_checks(*),
          claim_expenses(*),
          claim_fees(*),
          tasks(*),
          claim_files(*)
        `)
        .eq("id", claimId)
        .single();

      if (claimError || !claimData) {
        return new Response(
          JSON.stringify({ error: "Claim not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      claim = claimData;
    }

    // Analyze uploaded files/estimates
    let filesContext = "";
    if (claim && claim.claim_files && claim.claim_files.length > 0) {
      filesContext = "\n\nUploaded Files:\n";
      for (const file of claim.claim_files) {
        const { data: signedUrl } = await supabase
          .storage
          .from('claim-files')
          .createSignedUrl(file.file_path, 60);
        
        if (signedUrl?.signedUrl) {
          const analysis = await analyzeDocument(signedUrl.signedUrl, file.file_name);
          filesContext += `- ${analysis}\n`;
        } else {
          filesContext += `- ${file.file_name} (${file.file_type || 'unknown type'})\n`;
        }
      }
    }

    // Build context based on mode
    let contextContent = "";
    
    if (claim) {
      contextContent = `
Claim Details:
- Claim Number: ${claim.claim_number}
- Policyholder: ${claim.policyholder_name}
- Property Address: ${claim.policyholder_address || "Not provided"}
- Loss Type: ${claim.loss_type || "Not specified"}
- Loss Date: ${claim.loss_date || "Not specified"}
- Loss Description: ${claim.loss_description || "Not provided"}
- Status: ${claim.status || "Unknown"}
- Claim Amount: ${claim.claim_amount ? `$${claim.claim_amount.toLocaleString()}` : "Not specified"}
- Policy Number: ${claim.policy_number || "Not provided"}
- Insurance Company: ${claim.insurance_company || "Not specified"}
- Adjuster: ${claim.adjuster_name || "Not assigned"}

${claim.claim_settlements && claim.claim_settlements.length > 0 ? `
Settlement Information:
- RCV: $${claim.claim_settlements[0].replacement_cost_value.toLocaleString()}
- Recoverable Depreciation: $${claim.claim_settlements[0].recoverable_depreciation.toLocaleString()}
- Non-Recoverable Depreciation: $${claim.claim_settlements[0].non_recoverable_depreciation.toLocaleString()}
- Deductible: $${claim.claim_settlements[0].deductible.toLocaleString()}
` : ""}

${claim.claim_checks && claim.claim_checks.length > 0 ? `
Checks Received: ${claim.claim_checks.length} check(s) totaling $${claim.claim_checks.reduce((sum: number, check: any) => sum + Number(check.amount), 0).toLocaleString()}
` : ""}

${claim.tasks && claim.tasks.length > 0 ? `
Active Tasks: ${claim.tasks.filter((t: any) => t.status === "pending").length} pending, ${claim.tasks.filter((t: any) => t.status === "completed").length} completed
` : ""}${filesContext}
      `.trim();
    } else {
      contextContent = `You are helping a public adjuster manage their claims workload.${claimsOverview}`;
    }

    // Handle report generation
    let reportQuestion = question;
    let additionalContext = "";
    
    if (reportType && claim) {
      console.log(`Generating ${reportType} report for claim ${claimId}`);
      
      // Get weather data for weather reports
      if (reportType === "weather" && claim.policyholder_address && claim.loss_date) {
        const weatherData = await getWeatherReport(claim.policyholder_address, claim.loss_date);
        additionalContext = `\n\nHistorical Weather Data:\n${weatherData}`;
      }
      
      reportQuestion = reportPrompts[reportType] || question;
    }

    // Search the knowledge base for relevant information
    knowledgeBaseContext = await searchKnowledgeBase(supabase, reportQuestion || question);
    
    // Determine if web search is needed
    let webSearchResults = "";
    const isAcvQuestion = /\bacv\b|actual cash value|code upgrade|ordinance and law|ordinance & law/i.test(question || "");
    const needsWebSearch = !reportType && !isAcvQuestion && /regulation|law|legal|code|requirement|guideline|best practice|industry standard/i.test(question);
    
    if (needsWebSearch) {
      console.log("Performing web search for:", question);
      const lossType = claim?.loss_type || "property damage";
      const searchQuery = `${lossType} insurance claim ${question}`;
      webSearchResults = await searchWeb(searchQuery);
      if (webSearchResults && webSearchResults !== "Web search unavailable: API key not configured") {
        webSearchResults = `\n\nRelevant Industry Information:\n${webSearchResults}`;
      }
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build staff list context
    let staffListContext = "";
    if (staffMembers.length > 0) {
      staffListContext = `\n\nAvailable Staff Members for Task Assignment:\n${staffMembers.map(s => `- ${s.name} (ID: ${s.id})`).join("\n")}`;
    }

    // Get current date for AI context
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    const toolInstructions = `

CURRENT DATE: ${currentDate}
Use this date as reference when calculating due dates. For example:
- "tomorrow" means add 1 day to ${currentDate}
- "next week" means add 7 days to ${currentDate}
- "in 3 days" means add 3 days to ${currentDate}

IMPORTANT: You have the ability to CREATE TASKS. When the user asks you to create a task, reminder, follow-up, or to-do item:
1. Use the create_task function
2. CRITICAL - To identify the claim:
   - If user mentions a person's name (e.g., "James Hanlon", "Smith claim"), use client_name parameter with that name
   - NEVER put names or placeholders like "[CLAIM ID]" in claim_id - that field only accepts UUIDs
   - Only use claim_id if you have an actual UUID from the claims list context
3. Always include a clear title
4. Set a due date if the user specifies one (use YYYY-MM-DD format with actual future dates based on CURRENT DATE above)
5. Set priority based on urgency (low, medium, high)
6. Assign to a staff member if requested (use their ID from the staff list)

LEAD FINDER: You can FIND LEADS for potential clients! When the user asks about finding leads, prospecting, or identifying potential clients in a specific area:
1. Use the find_leads function with the location (city, county, state)
2. Optionally specify a damage type (hail, wind, hurricane, tornado, roof, etc.)
3. The tool will search for recent storm events and provide public property records resources
4. This helps identify areas with recent damage where homeowners may need public adjuster services

BULK CLAIM MANAGEMENT: You can help clean up and manage multiple claims at once!
- bulk_update_status: Change the status of multiple claims. User can specify by name (e.g., "change Smith, Jones, and Williams claims to 'In Review'")
- bulk_close_claims: Close multiple claims at once (e.g., "close the Smith and Jones claims")
- bulk_reopen_claims: Reopen multiple closed claims (e.g., "reopen the Williams and Brown claims")
- bulk_assign_staff: Assign a staff member to multiple claims (e.g., "assign John to all the hurricane claims")

When user asks to update, close, reopen, or assign staff to multiple claims:
1. Use client_names array with the policyholder names mentioned
2. For status updates, specify the new_status
3. For staff assignment, use staff_name with the staff member's name`;

    const systemPrompt = reportType
      ? `You are an expert insurance claims report writer. Generate professional, detailed reports for property insurance claims. Your reports should be:
- Well-structured with clear sections and headings
- Factual and based on the claim information provided
- Professional enough to be included in claim documentation
- Actionable with specific recommendations
- Written to support the policyholder's claim

FORMATTING REQUIREMENT: Write in plain text only. Do NOT use markdown formatting such as ** for bold, # for headers, or * for italics. Use normal capitalization and line breaks for emphasis instead.`
      : mode === "general" 
      ? `You are an expert AI assistant for public adjusters managing property insurance claims. You help with:
- Drafting follow-up emails and communications
- Summarizing claim statuses and next steps
- Prioritizing tasks and workload management
- Creating tasks and reminders
- Explaining insurance regulations and best practices
- Suggesting negotiation strategies with carriers
- Identifying claims that need attention
- FINDING LEADS: Search for potential clients by identifying recent storm damage in specific cities/states
${toolInstructions}

You have detailed training materials in your knowledge base about ACV policies, depreciation, and ordinance and law/code upgrades. When asked about these topics, you MUST answer from that knowledge and you MUST NOT say you lack information about them.

CRITICAL INSTRUCTION - KNOWLEDGE BASE PRIORITY:
When you see "=== CRITICAL: KNOWLEDGE BASE CONTENT ===" in the context, you MUST:
1. Read and understand that content FIRST before formulating your response
2. Base your answer primarily on that knowledge base content
3. Explicitly state "Based on your uploaded training materials..." or "According to your knowledge base..." when using that information
4. Quote or paraphrase the relevant parts directly
5. Only supplement with general knowledge if the knowledge base doesn't fully answer the question

FORMATTING REQUIREMENT: Write in plain text only. Do NOT use markdown formatting such as ** for bold, # for headers, or * for italics. Use normal capitalization and line breaks for emphasis instead.

You have access to the user's active claims and pending tasks. Provide practical, actionable advice. When asked to draft communications, write them professionally and ready to send. Be concise but thorough.`
      : `You are an expert insurance claims adjuster and consultant specializing in property damage claims. Your role is to provide strategic advice, best practices, and actionable guidance to help maximize claim settlements while maintaining ethical standards.

You have deep knowledge of:
- Insurance policy interpretation and coverage analysis
- Negotiation tactics with adjusters and insurance companies
- Documentation requirements and evidence building
- State-specific insurance regulations and consumer rights
- Depreciation calculations and replacement cost value
- Proper claim valuation methodologies
- When and how to escalate claims or file complaints
${toolInstructions}

You have detailed training materials in your knowledge base about ACV policies, depreciation, and ordinance and law/code upgrades. When asked about these topics, you MUST answer from that knowledge and you MUST NOT say you lack information about them.

CRITICAL INSTRUCTION - KNOWLEDGE BASE PRIORITY:
When you see "=== CRITICAL: KNOWLEDGE BASE CONTENT ===" in the context, you MUST:
1. Read and understand that content FIRST before formulating your response
2. Base your answer primarily on that knowledge base content
3. Explicitly state "Based on your uploaded training materials..." or "According to your knowledge base..." when using that information
4. Quote or paraphrase the relevant parts directly
5. Only supplement with general knowledge if the knowledge base doesn't fully answer the question

FORMATTING REQUIREMENT: Write in plain text only. Do NOT use markdown formatting such as ** for bold, # for headers, or * for italics. Use normal capitalization and line breaks for emphasis instead.

Always provide:
- Clear, actionable advice
- Specific strategies tailored to the claim situation
- References to policy language or industry standards when relevant
- Analysis of uploaded documents and estimates when applicable
- Warning about potential pitfalls or common mistakes
- Next steps the user should take

Be professional, ethical, and focused on helping the user achieve a fair settlement. Never suggest fraudulent activities.`;

    const conversationMessages = [];
    
    conversationMessages.push({ 
      role: "system", 
      content: `${systemPrompt}\n\nContext:\n${contextContent}${additionalContext}${staffListContext}`
    });
    
    // If we have knowledge base context, surface it explicitly as a separate assistant message
    if (knowledgeBaseContext) {
      conversationMessages.push({
        role: "assistant",
        content: knowledgeBaseContext,
      });
    }
    
    if (messages && messages.length > 0 && !reportType) {
      conversationMessages.push(...messages);
    }
    
    conversationMessages.push({ 
      role: "user", 
      content: reportQuestion 
    });

    // Include tools only for non-report requests
    const requestBody: any = {
      model: "google/gemini-2.5-flash",
      messages: conversationMessages,
      max_tokens: reportType ? 3000 : 1500,
    };

    if (!reportType) {
      requestBody.tools = tools;
      requestBody.tool_choice = "auto";
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI Gateway error:", aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to your workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      throw new Error(`AI Gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const firstChoice = aiData.choices[0];
    let answer = firstChoice.message.content || "";
    let tasksCreated: any[] = [];

    // Handle tool calls if present
    if (firstChoice.message.tool_calls && firstChoice.message.tool_calls.length > 0) {
      console.log("Processing tool calls:", firstChoice.message.tool_calls.length);
      
      for (const toolCall of firstChoice.message.tool_calls) {
        if (toolCall.function.name === "create_task") {
          try {
            const params = JSON.parse(toolCall.function.arguments);
            console.log("Creating task with params:", params);
            
            // Resolve claim_id from client_name if needed
            let resolvedClaimId = params.claim_id;
            let resolvedClientName = "";
            
            if (!resolvedClaimId && params.client_name) {
              console.log("Looking up claim by client name:", params.client_name);
              const foundClaim = await findClaimByClientName(supabase, params.client_name);
              if (foundClaim) {
                resolvedClaimId = foundClaim.id;
                resolvedClientName = foundClaim.policyholder_name;
                console.log("Found claim:", foundClaim.claim_number, "for client:", foundClaim.policyholder_name);
              } else {
                answer += `\n\n❌ **Could not find a claim for client "${params.client_name}".** Please check the name and try again.`;
                continue;
              }
            }
            
            if (!resolvedClaimId) {
              answer += `\n\n❌ **No claim specified.** Please provide either a claim ID or client name.`;
              continue;
            }
            
            const result = await createTask(supabase, {
              ...params,
              claim_id: resolvedClaimId
            });
            
            if (result.success && result.task) {
              tasksCreated.push({
                id: result.task.id,
                title: result.task.title,
                due_date: result.task.due_date,
                priority: result.task.priority,
                claim_id: result.task.claim_id
              });
              
              // Add confirmation to the answer
              const dueInfo = result.task.due_date ? ` due on ${result.task.due_date}` : "";
              const priorityInfo = result.task.priority ? ` (${result.task.priority} priority)` : "";
              const clientInfo = resolvedClientName ? ` for ${resolvedClientName}` : "";
              answer += `\n\n✅ **Task Created:** "${result.task.title}"${clientInfo}${dueInfo}${priorityInfo}`;
            } else {
              answer += `\n\n❌ **Failed to create task:** ${result.error}`;
            }
          } catch (parseErr) {
            console.error("Error parsing tool call arguments:", parseErr);
            answer += `\n\n❌ **Error creating task:** Invalid parameters`;
          }
        } else if (toolCall.function.name === "find_leads") {
          try {
            const params = JSON.parse(toolCall.function.arguments);
            console.log("Finding leads for location:", params.location);
            
            const leadResults = await findLeads(params.location, params.damage_type);
            answer = leadResults;
          } catch (parseErr) {
            console.error("Error parsing find_leads arguments:", parseErr);
            answer += `\n\n❌ **Error finding leads:** Invalid parameters`;
          }
        } else if (toolCall.function.name === "bulk_update_status") {
          try {
            const params = JSON.parse(toolCall.function.arguments);
            console.log("Bulk updating status:", params);
            
            const resolved = await resolveClaimIds(supabase, params.claim_ids, params.client_names);
            if (resolved.length === 0) {
              answer += `\n\n❌ **No claims found** to update status.`;
              continue;
            }
            
            const claimIds = resolved.map(c => c.id);
            const result = await bulkUpdateStatus(supabase, claimIds, params.new_status);
            
            const names = resolved.map(c => c.name).join(", ");
            answer += `\n\n✅ **Bulk Status Update:** Changed ${result.success} claim(s) to "${params.new_status}"\nClaims: ${names}`;
          } catch (parseErr) {
            console.error("Error in bulk_update_status:", parseErr);
            answer += `\n\n❌ **Error updating statuses:** Invalid parameters`;
          }
        } else if (toolCall.function.name === "bulk_close_claims") {
          try {
            const params = JSON.parse(toolCall.function.arguments);
            console.log("Bulk closing claims:", params);
            
            const resolved = await resolveClaimIds(supabase, params.claim_ids, params.client_names);
            if (resolved.length === 0) {
              answer += `\n\n❌ **No claims found** to close.`;
              continue;
            }
            
            const claimIds = resolved.map(c => c.id);
            const result = await bulkCloseClaims(supabase, claimIds);
            
            const names = resolved.map(c => c.name).join(", ");
            answer += `\n\n✅ **Claims Closed:** ${result.success} claim(s) closed successfully\nClaims: ${names}`;
          } catch (parseErr) {
            console.error("Error in bulk_close_claims:", parseErr);
            answer += `\n\n❌ **Error closing claims:** Invalid parameters`;
          }
        } else if (toolCall.function.name === "bulk_reopen_claims") {
          try {
            const params = JSON.parse(toolCall.function.arguments);
            console.log("Bulk reopening claims:", params);
            
            const resolved = await resolveClaimIds(supabase, params.claim_ids, params.client_names);
            if (resolved.length === 0) {
              answer += `\n\n❌ **No claims found** to reopen.`;
              continue;
            }
            
            const claimIds = resolved.map(c => c.id);
            const result = await bulkReopenClaims(supabase, claimIds);
            
            const names = resolved.map(c => c.name).join(", ");
            answer += `\n\n✅ **Claims Reopened:** ${result.success} claim(s) reopened successfully\nClaims: ${names}`;
          } catch (parseErr) {
            console.error("Error in bulk_reopen_claims:", parseErr);
            answer += `\n\n❌ **Error reopening claims:** Invalid parameters`;
          }
        } else if (toolCall.function.name === "bulk_assign_staff") {
          try {
            const params = JSON.parse(toolCall.function.arguments);
            console.log("Bulk assigning staff:", params);
            
            // Resolve staff ID
            let staffId = params.staff_id;
            let staffName = "";
            
            if (!staffId && params.staff_name) {
              const staff = await findStaffByName(supabase, params.staff_name);
              if (staff) {
                staffId = staff.id;
                staffName = staff.name;
              } else {
                answer += `\n\n❌ **Staff member "${params.staff_name}" not found.**`;
                continue;
              }
            }
            
            if (!staffId) {
              answer += `\n\n❌ **No staff member specified.** Please provide a staff name or ID.`;
              continue;
            }
            
            const resolved = await resolveClaimIds(supabase, params.claim_ids, params.client_names);
            if (resolved.length === 0) {
              answer += `\n\n❌ **No claims found** to assign staff.`;
              continue;
            }
            
            const claimIds = resolved.map(c => c.id);
            const result = await bulkAssignStaff(supabase, claimIds, staffId);
            
            const claimNames = resolved.map(c => c.name).join(", ");
            answer += `\n\n✅ **Staff Assigned:** ${staffName || "Staff member"} assigned to ${result.success} claim(s)${result.skipped > 0 ? ` (${result.skipped} already assigned)` : ""}\nClaims: ${claimNames}`;
          } catch (parseErr) {
            console.error("Error in bulk_assign_staff:", parseErr);
            answer += `\n\n❌ **Error assigning staff:** Invalid parameters`;
          }
        }
      }
    }

    // If this is a report, save it as a Word document
    let savedFile = null;
    if (reportType && claimId) {
      try {
        // Get the AI Assistant Reports folder
        const { data: folder } = await supabase
          .from("claim_folders")
          .select("id")
          .eq("claim_id", claimId)
          .eq("name", "AI Assistant Reports")
          .single();

        if (folder) {
          const reportNames: Record<string, string> = {
            weather: "Weather Report",
            damage: "Damage Explanation",
            estimate: "Estimate Discussion",
            photos: "Photo Documentation Guide",
          };

          const timestamp = new Date().toISOString().split("T")[0];
          const fileName = `${reportNames[reportType] || "AI Report"} - ${timestamp}.docx`;
          const filePath = `${claimId}/${folder.id}/${crypto.randomUUID()}.docx`;

          // Create a simple Word document (using Office Open XML format)
          const docContent = createWordDocument(reportNames[reportType] || "AI Report", answer, claim);
          
          // Upload to storage
          const { data: uploadData, error: uploadError } = await supabase
            .storage
            .from("claim-files")
            .upload(filePath, docContent, {
              contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              upsert: false,
            });

          if (uploadError) {
            console.error("Error uploading report:", uploadError);
          } else {
            // Create file record
            const { data: fileRecord, error: fileError } = await supabase
              .from("claim_files")
              .insert({
                claim_id: claimId,
                folder_id: folder.id,
                file_name: fileName,
                file_path: filePath,
                file_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              })
              .select()
              .single();

            if (fileError) {
              console.error("Error creating file record:", fileError);
            } else {
              savedFile = {
                id: fileRecord.id,
                fileName: fileName,
                folderId: folder.id,
              };
              console.log(`Saved report: ${fileName}`);
            }
          }
        }
      } catch (saveError) {
        console.error("Error saving report:", saveError);
      }
    }

    return new Response(
      JSON.stringify({ answer, reportType, savedFile, tasksCreated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in claims-ai-assistant:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
