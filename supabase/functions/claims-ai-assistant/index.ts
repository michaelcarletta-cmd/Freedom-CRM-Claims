import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper function to search web using Perplexity
async function searchWeb(query: string): Promise<string> {
  // Try both possible API key names from connector
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY") || Deno.env.get("PERPLEXITY_API_KEY_1");
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
        model: 'sonar',
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
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY") || Deno.env.get("PERPLEXITY_API_KEY_1");
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
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY") || Deno.env.get("PERPLEXITY_API_KEY_1");
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
      description: "Update the status of multiple claims at once. Can filter by current status (e.g., 'change all claims with status X to status Y') or specify claims by name/ID.",
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
          filter_by_status: {
            type: "string",
            description: "Filter claims by their current status (e.g., 'Claim Settled', 'Open', 'In Review'). All claims with this status will be updated."
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
      description: "Close multiple claims at once. Can filter by current status (e.g., 'close all claims with status Claim Settled') or specify claims by name/ID.",
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
          },
          filter_by_status: {
            type: "string",
            description: "Filter claims by their current status. All claims with this status will be closed."
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "bulk_reopen_claims",
      description: "Reopen multiple closed claims at once. Can filter by current status or specify claims by name/ID.",
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
          },
          filter_by_status: {
            type: "string",
            description: "Filter claims by their current status. All claims with this status will be reopened."
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "bulk_assign_staff",
      description: "Assign a staff member to multiple claims at once. Can filter by current status or specify claims by name/ID.",
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
          filter_by_status: {
            type: "string",
            description: "Filter claims by their current status. All claims with this status will be assigned."
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
  },
  {
    type: "function",
    function: {
      name: "bulk_share_to_workspace",
      description: "Share multiple claims to a workspace for collaboration with partner organizations. Can filter by contractor name, status, or specify claims directly.",
      parameters: {
        type: "object",
        properties: {
          claim_ids: {
            type: "array",
            items: { type: "string" },
            description: "Array of claim IDs (UUIDs) to share"
          },
          client_names: {
            type: "array",
            items: { type: "string" },
            description: "Array of client/policyholder names to look up claims"
          },
          filter_by_contractor: {
            type: "string",
            description: "Filter claims by assigned contractor name (e.g., 'Condition One')"
          },
          filter_by_status: {
            type: "string",
            description: "Filter claims by their current status"
          },
          workspace_name: {
            type: "string",
            description: "Name of the workspace to share claims to"
          },
          workspace_id: {
            type: "string",
            description: "UUID of the workspace to share claims to"
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "add_notepad_item",
      description: "Add an item to the user's personal notepad/quick notes on the dashboard. Use this when the user asks you to remind them of something, jot something down, add to their notes, or save a quick note for later.",
      parameters: {
        type: "object",
        properties: {
          item: {
            type: "string",
            description: "The note/item to add to the notepad"
          }
        },
        required: ["item"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_full_claim_context",
      description: "ALWAYS call this function FIRST when the user asks about a specific claim by name, claim number, or reference. This retrieves the complete claim context including loss type, settlement data, emails, inspections, tasks, files, adjuster info, and Darwin notes. Use the returned context to give accurate, detailed responses about the claim.",
      parameters: {
        type: "object",
        properties: {
          client_name: {
            type: "string",
            description: "The client/policyholder name or claim number to look up"
          }
        },
        required: ["client_name"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for information about insurance companies, building codes, manufacturer specifications, regulations, or any other publicly available information. Use this when the user asks you to find, look up, or research information from the internet.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query to look up on the web"
          },
          context: {
            type: "string",
            description: "Additional context about what the user is looking for"
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_insurance_company",
      description: "Update an insurance company's contact information in the database. Use this after performing a web search to get updated contact info for an insurance company.",
      parameters: {
        type: "object",
        properties: {
          company_name: {
            type: "string",
            description: "The name of the insurance company to update"
          },
          phone: {
            type: "string",
            description: "The new phone number"
          },
          email: {
            type: "string",
            description: "The new email address"
          },
          claims_phone: {
            type: "string",
            description: "Claims department phone number"
          },
          claims_email: {
            type: "string",
            description: "Claims department email"
          }
        },
        required: ["company_name"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "lookup_building_code",
      description: "Search for building codes, manufacturer specifications, installation requirements, or industry standards. Use this when the user asks about code requirements, proper installation methods, or manufacturer guidelines.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The building code, product, or specification to look up (e.g., 'IRC roofing requirements', 'GAF shingle installation specs', 'Florida Building Code wind resistance')"
          },
          state: {
            type: "string",
            description: "Optional state for state-specific codes"
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "bulk_update_insurance_companies",
      description: "Search the web and update contact information (phone numbers, email addresses) for ALL insurance companies in the Networking tab. Use this when the user asks to update contact info for all or multiple insurance companies.",
      parameters: {
        type: "object",
        properties: {
          company_names: {
            type: "array",
            items: { type: "string" },
            description: "Optional: specific company names to update. If empty, updates ALL companies."
          }
        }
      }
    }
  }
];
// Helper function to get full Darwin-level claim context
async function getFullClaimContext(supabase: any, searchTerm: string): Promise<{ success: boolean; context?: string; claim?: any; error?: string }> {
  try {
    // First find the claim
    const foundClaim = await findClaimByClientName(supabase, searchTerm);
    if (!foundClaim) {
      return { success: false, error: `Could not find claim for "${searchTerm}"` };
    }

    const claimId = foundClaim.id;

    // Fetch claim with all related data
    const { data: claim, error: claimError } = await supabase
      .from("claims")
      .select("*")
      .eq("id", claimId)
      .single();

    if (claimError || !claim) {
      return { success: false, error: "Failed to fetch claim details" };
    }

    // Fetch related data in parallel
    const [
      { data: settlements },
      { data: checks },
      { data: tasks },
      { data: inspections },
      { data: emails },
      { data: files },
      { data: adjusters },
      { data: updates },
      { data: photos },
      { data: darwinNotes }
    ] = await Promise.all([
      supabase.from("claim_settlements").select("*").eq("claim_id", claimId),
      supabase.from("claim_checks").select("*").eq("claim_id", claimId),
      supabase.from("tasks").select("*").eq("claim_id", claimId).order("created_at", { ascending: false }).limit(10),
      supabase.from("inspections").select("*").eq("claim_id", claimId),
      supabase.from("emails").select("*").eq("claim_id", claimId).order("created_at", { ascending: false }).limit(10),
      supabase.from("claim_files").select("*").eq("claim_id", claimId),
      supabase.from("claim_adjusters").select("*").eq("claim_id", claimId),
      supabase.from("claim_updates").select("*").eq("claim_id", claimId).order("created_at", { ascending: false }).limit(10),
      supabase.from("claim_photos").select("*").eq("claim_id", claimId).limit(20),
      supabase.from("darwin_analysis_results").select("result").eq("claim_id", claimId).eq("analysis_type", "context_notes").order("created_at", { ascending: false }).limit(1)
    ]);

    // Build comprehensive context
    let context = `
=== FULL CLAIM CONTEXT (Darwin-Level Intelligence) ===

CLAIM DETAILS:
- Claim ID: ${claim.id}
- Claim Number: ${claim.claim_number || 'N/A'}
- Policy Number: ${claim.policy_number || 'N/A'}
- Policyholder: ${claim.policyholder_name || 'N/A'}
- Phone: ${claim.policyholder_phone || 'N/A'}
- Email: ${claim.policyholder_email || 'N/A'}
- Address: ${claim.policyholder_address || 'N/A'}
- Insurance Company: ${claim.insurance_company || 'N/A'}
- LOSS TYPE: ${claim.loss_type || 'Not specified'} *** PAY ATTENTION TO THIS ***
- Loss Date: ${claim.loss_date || 'N/A'}
- Loss Description: ${claim.loss_description || 'N/A'}
- Current Status: ${claim.status || 'N/A'}
- Construction Status: ${claim.construction_status || 'N/A'}
- Claim Amount: $${claim.claim_amount?.toLocaleString() || 'N/A'}
- Is Closed: ${claim.is_closed ? 'Yes' : 'No'}

ADJUSTER INFORMATION:
${adjusters && adjusters.length > 0 
  ? adjusters.map((a: any) => `- ${a.adjuster_name} (${a.company || 'N/A'}) | Phone: ${a.adjuster_phone || 'N/A'} | Email: ${a.adjuster_email || 'N/A'} ${a.is_primary ? '(PRIMARY)' : ''}`).join('\n')
  : `- Primary: ${claim.adjuster_name || 'Not assigned'} | Phone: ${claim.adjuster_phone || 'N/A'} | Email: ${claim.adjuster_email || 'N/A'}`}

SETTLEMENT DATA:
${settlements && settlements.length > 0 
  ? settlements.map((s: any) => `
  - RCV: $${s.replacement_cost_value?.toLocaleString() || 0}
  - Recoverable Depreciation: $${s.recoverable_depreciation?.toLocaleString() || 0}
  - Non-Recoverable Depreciation: $${s.non_recoverable_depreciation?.toLocaleString() || 0}
  - Deductible: $${s.deductible?.toLocaleString() || 0}
  - Total Settlement: $${s.total_settlement?.toLocaleString() || 'N/A'}
  - Notes: ${s.notes || 'None'}`).join('\n')
  : '- No settlement data recorded'}

CHECKS RECEIVED:
${checks && checks.length > 0 
  ? checks.map((c: any) => `- ${c.check_type}: $${c.amount?.toLocaleString()} | Date: ${c.check_date} | Check #: ${c.check_number || 'N/A'}`).join('\n')
  : '- No checks received yet'}

INSPECTIONS:
${inspections && inspections.length > 0 
  ? inspections.map((i: any) => `- ${i.inspection_type}: ${i.inspection_date} | Status: ${i.status} | Notes: ${i.notes || 'None'}`).join('\n')
  : '- No inspections scheduled'}

TASKS (Recent 10):
${tasks && tasks.length > 0 
  ? tasks.map((t: any) => `- [${t.status?.toUpperCase()}] ${t.title} | Due: ${t.due_date || 'No date'} | Priority: ${t.priority || 'Normal'}`).join('\n')
  : '- No tasks'}

RECENT COMMUNICATIONS (Emails):
${emails && emails.length > 0 
  ? emails.map((e: any) => `- ${e.direction === 'inbound' ? 'FROM' : 'TO'}: ${e.from_email || e.to_email} | Subject: ${e.subject} | Date: ${new Date(e.created_at).toLocaleDateString()}`).join('\n')
  : '- No emails on file'}

RECENT ACTIVITY:
${updates && updates.length > 0 
  ? updates.slice(0, 5).map((u: any) => `- ${new Date(u.created_at).toLocaleDateString()}: ${u.content?.substring(0, 100)}...`).join('\n')
  : '- No recent activity'}

FILES ON CLAIM:
${files && files.length > 0 
  ? files.map((f: any) => `- ${f.file_name} (${f.file_type || 'unknown'})`).join('\n')
  : '- No files uploaded'}

PHOTOS:
- ${photos?.length || 0} photos on file
${photos && photos.length > 0 
  ? photos.slice(0, 5).map((p: any) => `  - ${p.file_name}: ${p.description || p.category || 'No description'}`).join('\n')
  : ''}

${darwinNotes?.[0]?.result ? `
DARWIN CONTEXT NOTES (User-Provided Insights):
${darwinNotes[0].result}
` : ''}

=== END FULL CLAIM CONTEXT ===

IMPORTANT: The loss type is "${claim.loss_type || 'not specified'}". Make sure your response is relevant to this specific type of damage. Do not confuse hail damage with wind damage, fire damage with water damage, etc.
`;

    return { success: true, context, claim };
  } catch (err) {
    console.error("Error getting full claim context:", err);
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

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

// Helper function to resolve multiple claims from names or status filter
async function resolveClaimIds(supabase: any, claimIds?: string[], clientNames?: string[], filterByStatus?: string): Promise<{ id: string; name: string }[]> {
  const resolved: { id: string; name: string }[] = [];
  
  // If filtering by status, fetch all matching claims
  if (filterByStatus) {
    const { data: claims, error } = await supabase
      .from("claims")
      .select("id, policyholder_name")
      .ilike("status", filterByStatus);
    
    if (!error && claims) {
      for (const claim of claims) {
        resolved.push({ id: claim.id, name: claim.policyholder_name || "Unknown" });
      }
    }
    return resolved;
  }
  
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

// Helper function to find workspace by name
async function findWorkspaceByName(supabase: any, workspaceName: string): Promise<{ id: string; name: string } | null> {
  const { data } = await supabase
    .from("workspaces")
    .select("id, name")
    .ilike("name", `%${workspaceName}%`)
    .limit(1);
  
  if (data && data.length > 0) {
    return { id: data[0].id, name: data[0].name };
  }
  return null;
}

// Helper function to resolve claims by contractor name
async function resolveClaimsByContractor(supabase: any, contractorName: string): Promise<{ id: string; name: string }[]> {
  // Find the contractor by name
  const { data: contractors } = await supabase
    .from("profiles")
    .select("id, full_name")
    .ilike("full_name", `%${contractorName}%`);
  
  if (!contractors || contractors.length === 0) return [];
  
  const contractorIds = contractors.map((c: any) => c.id);
  
  // Get claims assigned to this contractor
  const { data: assignments } = await supabase
    .from("claim_contractors")
    .select("claim_id")
    .in("contractor_id", contractorIds);
  
  if (!assignments || assignments.length === 0) return [];
  
  const claimIds = assignments.map((a: any) => a.claim_id);
  
  const { data: claims } = await supabase
    .from("claims")
    .select("id, policyholder_name")
    .in("id", claimIds);
  
  return (claims || []).map((c: any) => ({ id: c.id, name: c.policyholder_name || "Unknown" }));
}

// Helper function for bulk share to workspace
async function bulkShareToWorkspace(supabase: any, claimIds: string[], workspaceId: string): Promise<{ success: number; failed: number }> {
  const { error } = await supabase
    .from("claims")
    .update({ workspace_id: workspaceId })
    .in("id", claimIds);
  
  if (error) {
    console.error("Error bulk sharing to workspace:", error);
    return { success: 0, failed: claimIds.length };
  }
  return { success: claimIds.length, failed: 0 };
}

// Helper function to add item to user's notepad
async function addNotepadItem(supabase: any, userId: string, item: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if user already has a note
    const { data: existingNote } = await supabase
      .from("user_notes")
      .select("id, content")
      .eq("user_id", userId)
      .single();

    if (existingNote) {
      // Parse existing content and add new item
      let items: string[] = [];
      try {
        items = JSON.parse(existingNote.content);
        if (!Array.isArray(items)) items = [];
      } catch {
        // If it's plain text, convert to array
        items = existingNote.content ? existingNote.content.split('\n').filter((l: string) => l.trim()) : [];
      }
      
      items.push(item);
      
      const { error } = await supabase
        .from("user_notes")
        .update({ content: JSON.stringify(items), updated_at: new Date().toISOString() })
        .eq("id", existingNote.id);
      
      if (error) {
        console.error("Error updating notepad:", error);
        return { success: false, error: error.message };
      }
    } else {
      // Create new note with the item
      const { error } = await supabase
        .from("user_notes")
        .insert({ user_id: userId, content: JSON.stringify([item]) });
      
      if (error) {
        console.error("Error creating notepad:", error);
        return { success: false, error: error.message };
      }
    }
    
    return { success: true };
  } catch (err) {
    console.error("Exception adding notepad item:", err);
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
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

*** CRITICAL - INSURANCE COMPANY BULK UPDATE (USE WHEN ASKED!) ***
When the user asks to "update contact info for insurance companies" or mentions "networking tab" or "find phone numbers for insurance companies":
- IMMEDIATELY call bulk_update_insurance_companies tool - do NOT say you cannot do this
- Call with empty parameters {} to update ALL active companies in the database
- This tool has DIRECT DATABASE ACCESS and will search the web for each company's contact info
- Example: "update contact info for all insurance companies" → call bulk_update_insurance_companies({})

*** CRITICAL - CLAIM LOOKUP TOOL (USE THIS FIRST!) ***
When the user asks about a SPECIFIC claim by name, number, or any identifier:
1. ALWAYS call get_full_claim_context FIRST with the client_name before answering
2. This retrieves COMPLETE claim data: loss type, settlements, emails, inspections, tasks, files, adjuster info
3. WITHOUT calling this tool first, you will NOT have accurate claim information
4. Common triggers: "help with [name] claim", "what's the status of [name]", "tell me about [claim number]", "the [name] file", etc.
5. NEVER assume or guess claim details - always fetch the full context first

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
- bulk_update_status: Change the status of multiple claims
- bulk_close_claims: Close multiple claims at once
- bulk_reopen_claims: Reopen multiple closed claims
- bulk_assign_staff: Assign a staff member to multiple claims
- bulk_share_to_workspace: Share multiple claims to a workspace for partner collaboration

IMPORTANT: You can filter claims by their CURRENT STATUS using filter_by_status parameter!
Examples:
- "close all claims with status Claim Settled" → use filter_by_status: "Claim Settled"
- "change all Open claims to In Review" → use filter_by_status: "Open", new_status: "In Review"
- "mark claims with Claim Settled status as closed" → use filter_by_status: "Claim Settled"

WORKSPACE SHARING: You can share claims to workspaces for partner collaboration!
- Use bulk_share_to_workspace with workspace_name (e.g., "Condition One Workspace")
- Filter by contractor using filter_by_contractor (e.g., "Condition One")
- Example: "share all claims with Condition One as contractor to Condition One workspace"
  → use filter_by_contractor: "Condition One", workspace_name: "Condition One"

You can also specify claims by name using client_names array, or by ID using claim_ids array.

NOTEPAD: You can add items to the user's personal notepad on their dashboard!
- Use add_notepad_item when the user asks you to remind them of something, jot something down, add to their notes, or save a quick note
- Examples: "remind me to call the adjuster tomorrow", "add to my notes: follow up on Smith claim", "jot down that I need to review the Johnson estimate"
- The note will appear as a bullet point on their dashboard notepad`;

    // Fetch available workspaces for context
    let workspacesContext = "";
    const { data: allWorkspaces } = await supabase
      .from("workspaces")
      .select("id, name")
      .limit(20);
    
    if (allWorkspaces && allWorkspaces.length > 0) {
      workspacesContext = `\n\nAvailable Workspaces:\n${allWorkspaces.map(w => `- ${w.name} (ID: ${w.id})`).join("\n")}`;
    }

    const systemPrompt = reportType
      ? `You are an expert insurance claims report writer. Generate professional, detailed reports for property insurance claims. Your reports should be:
- Well-structured with clear sections and headings
- Factual and based on the claim information provided
- Professional enough to be included in claim documentation
- Actionable with specific recommendations
- Written to support the policyholder's claim

FORMATTING REQUIREMENT: Write in plain text only. Do NOT use markdown formatting such as ** for bold, # for headers, or * for italics. Use normal capitalization and line breaks for emphasis instead.`
      : mode === "general" 
      ? `You are Darwin, an elite public adjuster AI assistant with expert-level knowledge in property insurance claims. You think and operate like the best public adjusters in the industry.

=== DARWIN CORE PHILOSOPHY (BRELLY-INSPIRED) ===

FUNDAMENTAL TRUTH: Your insurance claim is YOUR responsibility, and yours alone. The insurance company owes you a duty of good faith and fair dealing, but they don't owe you any money until you've proven your losses are covered by your policy.

THE FOUR PILLARS OF CLAIM SUCCESS:
1. STOP THE BLEEDING - Take reasonable measures to prevent further damage immediately
2. MAKE YOUR CLAIM - Notify the insurer promptly with proper documentation
3. PROVE YOUR LOSS - Build an airtight "Proof Castle" with cause, scope, and cost documentation
4. GET PAID AND FIX YOUR STUFF - Follow up persistently and use formal processes

PROOF OF LOSS IS YOUR BEST FRIEND (NOT A TRAP):
- The POL is a strategic asset that PUTS THE INSURER ON THE CLOCK
- Policyholders should leverage the POL process on EVERY claim
- It doesn't have to be perfect - "substantial compliance" is the legal standard
- Include qualifying statements to preserve flexibility: "This represents what is known as of this date"
- Submit your own POL proactively - don't wait for the carrier to request it
- Key deadlines: Usually 60 days to submit, insurer has 30 days to respond

BUILD YOUR "PROOF CASTLE" - Every claim needs three pillars:
1. THE CAUSE - What caused the loss? Weather reports, engineering opinions
2. THE SCOPE - How broad is the loss? Contractor opinions, code requirements
3. THE COST - What will it cost? Contractor estimates, market pricing

CRITICAL DEADLINES (STATE-SPECIFIC):
- NJ: Acknowledge 10 working days, investigate 30 days, decide 10 business days, pay 10 business days
- PA: Acknowledge 10 working days, investigate 30 days, notify 15 working days, pay 15 working days
- CALENDAR THESE AND FOLLOW UP WHEN MISSED

COMMUNICATION STRATEGY:
- Always communicate in WRITING (email, certified mail) for documentation
- Keep a communications diary: date, time, names, employee IDs, substance of calls
- Send POL electronically AND via certified mail for double documentation
- When carrier misses deadlines, put them on notice immediately in writing

CONTRACTOR SELECTION (7 KEY FACTORS):
1. Reputation - Check reviews, BBB, word of mouth
2. Proof of Insurance - Get the COI, don't just take their word
3. Location - Local contractors know codes and won't skip town
4. Availability - When can they start? Delays cause more damage
5. Licensing - Verify state, county, city licenses
6. Experience - How long in business? Do they understand insurance work?
7. Size - Larger operations handle disaster work better and manage cash flow

ADJUSTER TYPES - KNOW WHO YOU'RE DEALING WITH:
- Company/Staff Adjusters: Employees of the insurance company
- Independent Adjusters: Contractors who work for multiple insurers (NOT for you)
- Public Adjusters: Work for policyholders and take commission from recovery
The distinction that matters: Staff and independent adjusters work for INSURERS. Public adjusters work for POLICYHOLDERS.

APPRAISAL PROCESS:
- Use when you disagree on the AMOUNT (not coverage questions)
- Each side picks an appraiser, they pick an umpire
- Two of three must agree for binding decision
- This is faster and cheaper than litigation

FIRST NOTICE OF LOSS (FNOL):
- Critical milestone that starts all the clocks running
- Document everything: what you reported, when, to whom
- Get confirmation in writing
- Don't delay - prompt notice is a policy duty

=== CAPABILITIES ===
You help with:
- Drafting follow-up emails and communications
- Summarizing claim statuses and recommending next steps
- Prioritizing tasks and workload management
- Creating tasks and reminders with proper deadlines
- Explaining insurance regulations and policyholder rights
- Suggesting negotiation strategies with carriers
- Identifying claims that need immediate attention
- Building "Proof Castles" for claim documentation
- FINDING LEADS: Search for potential clients by identifying recent storm damage
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

You have access to the user's active claims and pending tasks. Provide practical, actionable advice focused on getting claims FILED RIGHT, MOVING FAST, and PAID FULLY. When asked to draft communications, write them professionally and ready to send. Be thorough and strategic.`
      : `You are Darwin, an elite public adjuster AI consultant specializing in property damage claims. You think and operate like the best public adjusters in the industry, with a relentless focus on getting claims FILED RIGHT, MOVING FAST, and PAID FULLY.

=== DARWIN CORE PHILOSOPHY (BRELLY-INSPIRED) ===

FUNDAMENTAL TRUTH: At the end of the day, your insurance claim is your responsibility. The insurance company owes good faith handling, but they don't owe money until you've PROVEN your covered losses.

THE PROOF OF LOSS IS YOUR BEST FRIEND:
- It puts the insurance company ON THE CLOCK (usually 30 days to respond)
- Submit it proactively - don't wait for them to request it
- Use qualifying statements: "based on information known as of this date"
- It doesn't need to be perfect - courts require "substantial compliance"
- This is your formal documentation that starts mandatory response timelines

BUILD YOUR "PROOF CASTLE" - Three pillars for every claim:
1. THE CAUSE - Weather reports, engineering opinions, incident documentation
2. THE SCOPE - Contractor opinions, building code requirements, manufacturer specs
3. THE COST - Detailed estimates, market pricing, proper line itemization

CRITICAL ARGUMENT STRATEGY - REPAIRABILITY OVER MATCHING:
- NEVER argue "matching" (PA and NJ DO NOT require matching)
- ALWAYS argue "repairability" - damaged materials CANNOT BE REPAIRED
- Focus on: manufacturing discontinuation, material degradation, structural integrity, code requirements, manufacturer prohibitions on partial repairs
- The core argument: damage renders materials irreparable, NOT that replacements must match

STATE DEADLINE ENFORCEMENT:
- Know the deadlines: acknowledgment (10 days), investigation (30 days), decision (10-15 days), payment (10-15 days)
- Calendar every deadline and follow up IN WRITING when missed
- Missed deadlines = potential bad faith = leverage

DOCUMENTATION BEST PRACTICES:
- Keep a communications diary: date, time, names, employee IDs, substance
- Communicate in WRITING whenever possible
- Send critical documents electronically AND via certified mail
- Preserve all damaged materials until claim is fully resolved
- Photo/video EVERYTHING - before, during, and after

You have deep knowledge of:
- Insurance policy interpretation and coverage analysis
- Negotiation tactics with carrier adjusters
- Documentation requirements and evidence building
- State-specific insurance regulations and consumer rights
- Depreciation calculations (ACV vs RCV)
- Proper claim valuation and Xactimate methodologies
- When and how to escalate claims or file regulatory complaints
- Appraisal process strategy and umpire selection
${toolInstructions}

You have detailed training materials in your knowledge base about ACV policies, depreciation, and ordinance and law/code upgrades. When asked about these topics, you MUST answer from that knowledge.

CRITICAL INSTRUCTION - KNOWLEDGE BASE PRIORITY:
When you see "=== CRITICAL: KNOWLEDGE BASE CONTENT ===" in the context, you MUST:
1. Read that content FIRST before formulating your response
2. Base your answer primarily on that knowledge base content
3. State "Based on your uploaded training materials..." when using it
4. Quote or paraphrase the relevant parts directly
5. Only supplement with general knowledge if needed

FORMATTING REQUIREMENT: Write in plain text only. No markdown formatting.

Always provide:
- Clear, actionable advice with specific next steps
- Deadline tracking and urgency assessment
- References to policy language or regulations when relevant
- Warning about carrier tactics and how to counter them
- Strategic recommendations for maximizing settlement
- Follow-up actions to keep momentum

Be professional, ethical, and relentlessly focused on getting the policyholder a fair, full, and fast settlement. Never suggest fraud.`;

    const conversationMessages = [];
    
    conversationMessages.push({ 
      role: "system", 
      content: `${systemPrompt}\n\nContext:\n${contextContent}${additionalContext}${staffListContext}${workspacesContext}`
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
            
            const resolved = await resolveClaimIds(supabase, params.claim_ids, params.client_names, params.filter_by_status);
            if (resolved.length === 0) {
              answer += `\n\n❌ **No claims found** ${params.filter_by_status ? `with status "${params.filter_by_status}"` : "to update status"}.`;
              continue;
            }
            
            const claimIds = resolved.map(c => c.id);
            const result = await bulkUpdateStatus(supabase, claimIds, params.new_status);
            
            const filterInfo = params.filter_by_status ? ` (filtered by status: "${params.filter_by_status}")` : "";
            answer += `\n\n✅ **Bulk Status Update:** Changed ${result.success} claim(s) to "${params.new_status}"${filterInfo}`;
          } catch (parseErr) {
            console.error("Error in bulk_update_status:", parseErr);
            answer += `\n\n❌ **Error updating statuses:** Invalid parameters`;
          }
        } else if (toolCall.function.name === "bulk_close_claims") {
          try {
            const params = JSON.parse(toolCall.function.arguments);
            console.log("Bulk closing claims:", params);
            
            const resolved = await resolveClaimIds(supabase, params.claim_ids, params.client_names, params.filter_by_status);
            if (resolved.length === 0) {
              answer += `\n\n❌ **No claims found** ${params.filter_by_status ? `with status "${params.filter_by_status}"` : "to close"}.`;
              continue;
            }
            
            const claimIds = resolved.map(c => c.id);
            const result = await bulkCloseClaims(supabase, claimIds);
            
            const filterInfo = params.filter_by_status ? ` with status "${params.filter_by_status}"` : "";
            answer += `\n\n✅ **Claims Closed:** ${result.success} claim(s)${filterInfo} closed successfully`;
          } catch (parseErr) {
            console.error("Error in bulk_close_claims:", parseErr);
            answer += `\n\n❌ **Error closing claims:** Invalid parameters`;
          }
        } else if (toolCall.function.name === "bulk_reopen_claims") {
          try {
            const params = JSON.parse(toolCall.function.arguments);
            console.log("Bulk reopening claims:", params);
            
            const resolved = await resolveClaimIds(supabase, params.claim_ids, params.client_names, params.filter_by_status);
            if (resolved.length === 0) {
              answer += `\n\n❌ **No claims found** ${params.filter_by_status ? `with status "${params.filter_by_status}"` : "to reopen"}.`;
              continue;
            }
            
            const claimIds = resolved.map(c => c.id);
            const result = await bulkReopenClaims(supabase, claimIds);
            
            const filterInfo = params.filter_by_status ? ` with status "${params.filter_by_status}"` : "";
            answer += `\n\n✅ **Claims Reopened:** ${result.success} claim(s)${filterInfo} reopened successfully`;
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
            
            const resolved = await resolveClaimIds(supabase, params.claim_ids, params.client_names, params.filter_by_status);
            if (resolved.length === 0) {
              answer += `\n\n❌ **No claims found** ${params.filter_by_status ? `with status "${params.filter_by_status}"` : "to assign staff"}.`;
              continue;
            }
            
            const claimIds = resolved.map(c => c.id);
            const result = await bulkAssignStaff(supabase, claimIds, staffId);
            
            const filterInfo = params.filter_by_status ? ` with status "${params.filter_by_status}"` : "";
            answer += `\n\n✅ **Staff Assigned:** ${staffName || "Staff member"} assigned to ${result.success} claim(s)${filterInfo}${result.skipped > 0 ? ` (${result.skipped} already assigned)` : ""}`;
          } catch (parseErr) {
            console.error("Error in bulk_assign_staff:", parseErr);
            answer += `\n\n❌ **Error assigning staff:** Invalid parameters`;
          }
        } else if (toolCall.function.name === "bulk_share_to_workspace") {
          try {
            const params = JSON.parse(toolCall.function.arguments);
            console.log("Bulk sharing to workspace:", params);
            
            // Resolve workspace
            let workspaceId = params.workspace_id;
            let workspaceName = "";
            
            if (!workspaceId && params.workspace_name) {
              const workspace = await findWorkspaceByName(supabase, params.workspace_name);
              if (workspace) {
                workspaceId = workspace.id;
                workspaceName = workspace.name;
              } else {
                answer += `\n\n❌ **Workspace "${params.workspace_name}" not found.**`;
                continue;
              }
            }
            
            if (!workspaceId) {
              answer += `\n\n❌ **No workspace specified.** Please provide a workspace name.`;
              continue;
            }
            
            // Resolve claims - check contractor filter first
            let resolved: { id: string; name: string }[] = [];
            
            if (params.filter_by_contractor) {
              resolved = await resolveClaimsByContractor(supabase, params.filter_by_contractor);
              if (resolved.length === 0) {
                answer += `\n\n❌ **No claims found** with contractor "${params.filter_by_contractor}".`;
                continue;
              }
            } else {
              resolved = await resolveClaimIds(supabase, params.claim_ids, params.client_names, params.filter_by_status);
              if (resolved.length === 0) {
                answer += `\n\n❌ **No claims found** to share.`;
                continue;
              }
            }
            
            const claimIds = resolved.map(c => c.id);
            const result = await bulkShareToWorkspace(supabase, claimIds, workspaceId);
            
            const filterInfo = params.filter_by_contractor 
              ? ` with contractor "${params.filter_by_contractor}"` 
              : params.filter_by_status 
                ? ` with status "${params.filter_by_status}"` 
                : "";
            answer += `\n\n✅ **Claims Shared:** ${result.success} claim(s)${filterInfo} shared to workspace "${workspaceName || 'selected workspace'}"`;
          } catch (parseErr) {
            console.error("Error in bulk_share_to_workspace:", parseErr);
            answer += `\n\n❌ **Error sharing to workspace:** Invalid parameters`;
          }
        } else if (toolCall.function.name === "add_notepad_item") {
          try {
            const params = JSON.parse(toolCall.function.arguments);
            console.log("Adding notepad item:", params.item);
            
            // Get user ID from auth header
            const authHeader = req.headers.get("authorization");
            if (!authHeader) {
              answer += `\n\n❌ **Cannot add to notepad:** Not authenticated`;
              continue;
            }
            
            const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
            if (!user) {
              answer += `\n\n❌ **Cannot add to notepad:** User not found`;
              continue;
            }
            
            const result = await addNotepadItem(supabase, user.id, params.item);
            
            if (result.success) {
              answer += `\n\n✅ **Added to your notepad:** "${params.item}"`;
            } else {
              answer += `\n\n❌ **Failed to add to notepad:** ${result.error}`;
            }
          } catch (parseErr) {
            console.error("Error in add_notepad_item:", parseErr);
            answer += `\n\n❌ **Error adding to notepad:** Invalid parameters`;
          }
        } else if (toolCall.function.name === "get_full_claim_context") {
          try {
            const params = JSON.parse(toolCall.function.arguments);
            console.log("Getting full claim context for:", params.client_name);
            
            const contextResult = await getFullClaimContext(supabase, params.client_name);
            
            if (contextResult.success && contextResult.context) {
              // Make a follow-up AI call with the full context
              console.log("Making follow-up AI call with full claim context");
              
              const followUpMessages = [
                { 
                  role: "system", 
                  content: `You are Darwin, an expert public adjuster AI assistant with COMPLETE knowledge of this claim. You have access to all claim details, communications, files, and history. Provide expert, detailed responses based on the claim data below.

CRITICAL ARGUMENT STRATEGY - REPAIRABILITY OVER MATCHING:
- NEVER argue "matching" (that new materials must match existing materials)
- ALWAYS argue "repairability" - damaged materials CANNOT BE REPAIRED and must be replaced
- Focus on why materials are not repairable: manufacturing discontinuation, material degradation, structural integrity compromised, code compliance requirements

FORMATTING: Write in plain text only. Do NOT use markdown formatting such as ** for bold, # for headers, or * for italics.

${contextResult.context}

${knowledgeBaseContext || ''}`
                },
                ...conversationMessages.slice(1) // Skip the original system message
              ];
              
              const followUpResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${LOVABLE_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: "google/gemini-2.5-flash",
                  messages: followUpMessages,
                  max_tokens: 2000,
                }),
              });
              
              if (followUpResponse.ok) {
                const followUpData = await followUpResponse.json();
                answer = followUpData.choices[0].message.content || "";
              } else {
                console.error("Follow-up AI call failed:", followUpResponse.status);
                answer = `I found the claim for ${params.client_name}. ${contextResult.context.substring(0, 500)}...\n\nPlease ask your specific question about this claim.`;
              }
            } else {
              answer += `\n\n❌ **Could not find claim:** ${contextResult.error}`;
            }
          } catch (parseErr) {
            console.error("Error in get_full_claim_context:", parseErr);
            answer += `\n\n❌ **Error getting claim context:** Invalid parameters`;
          }
        } else if (toolCall.function.name === "web_search") {
          try {
            const params = JSON.parse(toolCall.function.arguments);
            console.log("Performing web search:", params.query);
            
            const searchResult = await searchWeb(params.query);
            
            if (searchResult && !searchResult.includes("unavailable")) {
              answer += `\n\n🔍 **Web Search Results for "${params.query}":**\n\n${searchResult}`;
            } else {
              answer += `\n\n❌ **Web search failed:** ${searchResult}`;
            }
          } catch (parseErr) {
            console.error("Error in web_search:", parseErr);
            answer += `\n\n❌ **Error performing web search:** Invalid parameters`;
          }
        } else if (toolCall.function.name === "update_insurance_company") {
          try {
            const params = JSON.parse(toolCall.function.arguments);
            console.log("Updating insurance company:", params.company_name);
            
            // Find the insurance company by name
            const { data: companies, error: findError } = await supabase
              .from("insurance_companies")
              .select("id, name")
              .ilike("name", `%${params.company_name}%`)
              .limit(5);
            
            if (findError || !companies || companies.length === 0) {
              answer += `\n\n❌ **Insurance company "${params.company_name}" not found in database.**`;
              continue;
            }
            
            // Update the company
            const updateData: any = {};
            if (params.phone) updateData.phone = params.phone;
            if (params.email) updateData.email = params.email;
            if (params.claims_phone) updateData.claims_phone = params.claims_phone;
            if (params.claims_email) updateData.claims_email = params.claims_email;
            
            if (Object.keys(updateData).length === 0) {
              answer += `\n\n❌ **No update data provided for ${params.company_name}.**`;
              continue;
            }
            
            const { error: updateError } = await supabase
              .from("insurance_companies")
              .update(updateData)
              .eq("id", companies[0].id);
            
            if (updateError) {
              answer += `\n\n❌ **Failed to update ${companies[0].name}:** ${updateError.message}`;
            } else {
              const updates = Object.entries(updateData).map(([k, v]) => `${k}: ${v}`).join(", ");
              answer += `\n\n✅ **Updated ${companies[0].name}:** ${updates}`;
            }
          } catch (parseErr) {
            console.error("Error in update_insurance_company:", parseErr);
            answer += `\n\n❌ **Error updating insurance company:** Invalid parameters`;
          }
        } else if (toolCall.function.name === "lookup_building_code") {
          try {
            const params = JSON.parse(toolCall.function.arguments);
            const query = params.state 
              ? `${params.query} ${params.state} building code requirements`
              : params.query;
            console.log("Looking up building code:", query);
            
            const searchResult = await searchWeb(query);
            
            if (searchResult && !searchResult.includes("unavailable")) {
              answer += `\n\n📋 **Building Code / Manufacturer Spec Lookup:**\n\n${searchResult}`;
            } else {
              answer += `\n\n❌ **Could not find information for:** ${params.query}`;
            }
          } catch (parseErr) {
            console.error("Error in lookup_building_code:", parseErr);
            answer += `\n\n❌ **Error looking up building code:** Invalid parameters`;
          }
        } else if (toolCall.function.name === "bulk_update_insurance_companies") {
          try {
            const params = JSON.parse(toolCall.function.arguments);
            console.log("Bulk updating insurance companies");
            
            // Fetch all insurance companies or specific ones
            let query = supabase.from("insurance_companies").select("id, name, phone, email");
            
            if (params.company_names && params.company_names.length > 0) {
              // Filter to specific companies
              const filters = params.company_names.map((name: string) => `name.ilike.%${name}%`);
              query = query.or(filters.join(","));
            }
            
            const { data: companies, error: fetchError } = await query.eq("is_active", true);
            
            if (fetchError || !companies || companies.length === 0) {
              answer += `\n\n❌ **No insurance companies found to update.**`;
              continue;
            }
            
            answer += `\n\n🔄 **Processing ${companies.length} insurance companies...**\n\n`;
            
            const successfulUpdates: { name: string; phone?: string; email?: string }[] = [];
            const needsReview: { name: string; reason: string }[] = [];
            const alreadyComplete: string[] = [];
            
            // Process each company
            for (const company of companies) {
              try {
                // Search for company contact info
                const searchQuery = `${company.name} insurance company claims department phone number email contact information`;
                const searchResult = await searchWeb(searchQuery);
                
                if (!searchResult || searchResult.includes("unavailable")) {
                  needsReview.push({ name: company.name, reason: "Web search failed" });
                  continue;
                }
                
                // Extract phone and email from search results using AI
                const extractResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${LOVABLE_API_KEY}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    model: "google/gemini-2.5-flash",
                    messages: [
                      {
                        role: "system",
                        content: "Extract the main claims phone number and email from the following text. Return ONLY a JSON object with 'phone' and 'email' fields. If not found, use null. Format phone as digits only with area code."
                      },
                      {
                        role: "user",
                        content: `Extract contact info for ${company.name} from:\n\n${searchResult}`
                      }
                    ],
                    max_tokens: 200,
                  }),
                });
                
                if (!extractResponse.ok) {
                  needsReview.push({ name: company.name, reason: "AI extraction failed" });
                  continue;
                }
                
                const extractData = await extractResponse.json();
                let extracted: { phone?: string; email?: string } = {};
                
                try {
                  const content = extractData.choices[0].message.content || "";
                  const jsonMatch = content.match(/\{[\s\S]*\}/);
                  if (jsonMatch) {
                    extracted = JSON.parse(jsonMatch[0]);
                  }
                } catch (parseErr) {
                  needsReview.push({ name: company.name, reason: "Could not parse contact info" });
                  continue;
                }
                
                // Only update if we found new info
                const updateData: any = {};
                if (extracted.phone && extracted.phone !== company.phone) {
                  updateData.phone = extracted.phone;
                }
                if (extracted.email && extracted.email !== company.email) {
                  updateData.email = extracted.email;
                }
                
                if (Object.keys(updateData).length > 0) {
                  const { error: updateError } = await supabase
                    .from("insurance_companies")
                    .update(updateData)
                    .eq("id", company.id);
                  
                  if (!updateError) {
                    successfulUpdates.push({ name: company.name, ...updateData });
                  } else {
                    needsReview.push({ name: company.name, reason: "Database update failed" });
                  }
                } else if (!extracted.phone && !extracted.email) {
                  needsReview.push({ name: company.name, reason: "No contact info found online" });
                } else {
                  alreadyComplete.push(company.name);
                }
                
                // Add small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));
                
              } catch (companyErr) {
                console.error(`Error updating ${company.name}:`, companyErr);
                needsReview.push({ name: company.name, reason: "Unexpected error" });
              }
            }
            
            // Build comprehensive summary
            answer += `## ✅ Successfully Updated (${successfulUpdates.length})\n`;
            if (successfulUpdates.length > 0) {
              for (const u of successfulUpdates) {
                const details = [];
                if (u.phone) details.push(`📞 ${u.phone}`);
                if (u.email) details.push(`📧 ${u.email}`);
                answer += `- **${u.name}**: ${details.join(", ")}\n`;
              }
            } else {
              answer += `_None_\n`;
            }
            
            answer += `\n## ⚠️ Needs Manual Review (${needsReview.length})\n`;
            if (needsReview.length > 0) {
              for (const r of needsReview) {
                answer += `- **${r.name}**: ${r.reason}\n`;
              }
              answer += `\n_Please manually look up contact info for these companies in the Networking tab._\n`;
            } else {
              answer += `_None_\n`;
            }
            
            if (alreadyComplete.length > 0) {
              answer += `\n## ✓ Already Up to Date (${alreadyComplete.length})\n`;
              answer += alreadyComplete.join(", ") + "\n";
            }
            
            answer += `\n---\n**Summary:** ${successfulUpdates.length} updated, ${alreadyComplete.length} already complete, ${needsReview.length} need manual review.`;
            
          } catch (parseErr) {
            console.error("Error in bulk_update_insurance_companies:", parseErr);
            answer += `\n\n❌ **Error updating insurance companies:** Invalid parameters`;
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
