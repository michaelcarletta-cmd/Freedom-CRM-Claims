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

// Helper function to analyze document content
async function analyzeDocument(fileUrl: string, fileName: string): Promise<string> {
  try {
    // For now, return file metadata. In future, could integrate OCR/PDF parsing
    return `Document: ${fileName} (${fileUrl})`;
  } catch (error) {
    console.error("Error analyzing document:", error);
    return `Document: ${fileName} (unable to analyze content)`;
  }
}

// Search knowledge base for relevant chunks
async function searchKnowledgeBase(supabase: any, question: string, category?: string): Promise<string> {
  try {
    // Get all chunks - simple text matching for now
    // In production, you'd use vector embeddings for semantic search
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

    const { data: chunks, error } = await query.limit(50);

    if (error || !chunks || chunks.length === 0) {
      return "";
    }

    // Simple keyword matching - find chunks that contain words from the question
    const questionWords = question.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    
    const scoredChunks = chunks.map((chunk: any) => {
      const contentLower = chunk.content.toLowerCase();
      const matchCount = questionWords.filter(word => contentLower.includes(word)).length;
      return { ...chunk, score: matchCount };
    }).filter((c: any) => c.score > 0)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 5);

    if (scoredChunks.length === 0) {
      return "";
    }

    let knowledgeContext = "\n\nRelevant Knowledge Base Information:\n";
    scoredChunks.forEach((chunk: any, i: number) => {
      const source = chunk.ai_knowledge_documents?.file_name || "Unknown source";
      const category = chunk.ai_knowledge_documents?.category || "General";
      knowledgeContext += `\n[Source: ${source} | Category: ${category}]\n${chunk.content}\n`;
    });

    return knowledgeContext;
  } catch (error) {
    console.error("Error searching knowledge base:", error);
    return "";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { claimId, question, messages, mode } = await req.json();
    
    if (!question) {
      return new Response(
        JSON.stringify({ error: "Missing question" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let claim = null;
    let claimsOverview = "";
    let knowledgeBaseContext = "";

    // If in general mode, fetch overview of all claims
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
          claimsOverview += `${i + 1}. ${c.claim_number || 'No #'} - ${c.policyholder_name} | ${c.status || 'Unknown'} | ${c.loss_type || 'Unknown loss'} | ${c.insurance_company || 'Unknown carrier'}\n`;
        });
      }

      // Also fetch pending tasks
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
      // Fetch specific claim details
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
      // Specific claim context
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
      // General mode context
      contextContent = `You are helping a public adjuster manage their claims workload.${claimsOverview}`;
    }

    // Search the knowledge base for relevant information
    knowledgeBaseContext = await searchKnowledgeBase(supabase, question);
    
    // Determine if web search is needed based on question content
    let webSearchResults = "";
    const needsWebSearch = /regulation|law|legal|code|requirement|guideline|best practice|industry standard/i.test(question);
    
    if (needsWebSearch) {
      console.log("Performing web search for:", question);
      const lossType = claim?.loss_type || "property damage";
      const searchQuery = `${lossType} insurance claim ${question}`;
      webSearchResults = await searchWeb(searchQuery);
      if (webSearchResults && webSearchResults !== "Web search unavailable: API key not configured") {
        webSearchResults = `\n\nRelevant Industry Information:\n${webSearchResults}`;
      }
    }

    // Call Lovable AI
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = mode === "general" 
      ? `You are an expert AI assistant for public adjusters managing property insurance claims. You help with:
- Drafting follow-up emails and communications
- Summarizing claim statuses and next steps
- Prioritizing tasks and workload management
- Explaining insurance regulations and best practices
- Suggesting negotiation strategies with carriers
- Identifying claims that need attention

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

You also have access to:
- Current claim files and estimates uploaded by the user
- Real-time web search results for regulations and best practices

Always provide:
- Clear, actionable advice
- Specific strategies tailored to the claim situation
- References to policy language or industry standards when relevant
- Analysis of uploaded documents and estimates when applicable
- Warning about potential pitfalls or common mistakes
- Next steps the user should take

Be professional, ethical, and focused on helping the user achieve a fair settlement. Never suggest fraudulent activities.`;

    // Build conversation history with claim context
    const conversationMessages = [];
    
    // Add system prompt with claim context
    conversationMessages.push({ 
      role: "system", 
      content: `${systemPrompt}\n\nContext:\n${contextContent}${knowledgeBaseContext}${webSearchResults}`
    });
    
    // Add previous conversation history if provided
    if (messages && messages.length > 0) {
      conversationMessages.push(...messages);
    }
    
    // Add current question
    conversationMessages.push({ 
      role: "user", 
      content: question 
    });

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: conversationMessages,
        temperature: 0.7,
        max_tokens: 1500,
      }),
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
    const answer = aiData.choices[0].message.content;

    return new Response(
      JSON.stringify({ answer }),
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
