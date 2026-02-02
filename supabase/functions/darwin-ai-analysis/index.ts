import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore - pdf.js for Deno
import * as pdfjsLib from "https://esm.sh/pdfjs-dist@4.0.379/build/pdf.min.mjs";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Size threshold for using native extraction vs AI multimodal (8MB base64 ~ 6MB file)
const AI_EXTRACTION_LIMIT = 8 * 1024 * 1024;

// Extract text from PDF using pdf.js (Deno-compatible, no AI, lower memory usage)
async function extractTextFromPDFNative(base64Content: string, fileName: string): Promise<string> {
  console.log(`Native PDF extraction for: ${fileName}`);
  
  try {
    // Decode base64 to bytes
    const binaryString = atob(base64Content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Load PDF using pdf.js
    const loadingTask = pdfjsLib.getDocument({ data: bytes.buffer });
    const pdf = await loadingTask.promise;
    
    const textParts: string[] = [];
    
    // Extract text from each page
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      if (pageText.trim()) {
        textParts.push(pageText);
      }
    }
    
    const extractedText = textParts.join('\n\n');
    console.log(`Native extraction got ${extractedText.length} characters from ${pdf.numPages} pages`);
    
    if (!extractedText || extractedText.trim().length < 100) {
      throw new Error('PDF appears to be scanned/image-based with minimal text');
    }
    
    return extractedText;
  } catch (error) {
    console.error('Native PDF extraction failed:', error);
    throw error;
  }
}

// Reuse the same knowledge base search logic as the main Claims AI Assistant
// so Darwin can leverage uploaded training materials (including ACV audio).
async function searchKnowledgeBase(supabase: any, question: string, category?: string): Promise<string> {
  try {
    let query = supabase
      .from('ai_knowledge_chunks')
      .select(`
        content,
        metadata,
        ai_knowledge_documents!inner(category, file_name, status)
      `)
      .eq('ai_knowledge_documents.status', 'completed');

    if (category) {
      query = query.eq('ai_knowledge_documents.category', category);
    }

    const { data: chunks, error } = await query.limit(100);

    if (error || !chunks || chunks.length === 0) {
      console.log('Darwin KB: no chunks found');
      return '';
    }

    console.log(`Darwin KB: searching ${chunks.length} chunks`);

    const questionLower = question.toLowerCase();
    const questionWords = questionLower
      .split(/\s+/)
      .filter((w) => w.length >= 2)
      .map((w) => w.replace(/[^a-z0-9]/g, ''))
      .filter((w) => w.length >= 2);

    const importantTerms = [
      'depreciation',
      'acv',
      'rcv',
      'actual cash value',
      'replacement cost',
      'ordinance',
      'law',
      'code',
      'compliance',
      'deductible',
      'coverage',
      'policy',
      'claim',
      'adjuster',
      'supplement',
      'denial',
      'settlement',
      'recoverable',
      'non-recoverable',
      'dwelling',
      'roofing',
      'damage',
      'wind',
      'hail',
      'storm',
      'inspection',
      'estimate',
      'xactimate',
    ];

    const matchedTerms = importantTerms.filter((term) => questionLower.includes(term));
    const isAcvQuestion = /\bacv\b|actual cash value|code upgrade|ordinance and law|ordinance & law/i.test(questionLower);

    const scoredChunks = chunks
      .map((chunk: any) => {
        const contentLower = chunk.content.toLowerCase();
        const sourceName = (chunk.ai_knowledge_documents?.file_name || '').toLowerCase();
        const category = (chunk.ai_knowledge_documents?.category || '').toLowerCase();
        const isFromAcvAudio = sourceName.includes('acv and code upgrade');
        const isFromAudioRecording = isFromAcvAudio || (category === 'building-codes' && sourceName.includes('acv'));

        let score = 0;

        questionWords.forEach((word) => {
          if (contentLower.includes(word)) {
            score += 1;
            if (importantTerms.includes(word)) {
              score += 2;
            }
          }
        });

        matchedTerms.forEach((term) => {
          if (contentLower.includes(term)) {
            score += 3;
          }
        });

        const phrases = questionLower.match(/["']([^"']+)["']/g);
        if (phrases) {
          phrases.forEach((phrase) => {
            const cleanPhrase = phrase.replace(/["']/g, '');
            if (contentLower.includes(cleanPhrase)) {
              score += 5;
            }
          });
        }

        if (isAcvQuestion && isFromAudioRecording) {
          score += 30;
        }

        return { ...chunk, score, sourceName, category, isFromAudioRecording };
      })
      .filter((c: any) => c.score > 0);

    let finalChunks: any[] = scoredChunks;
    if (isAcvQuestion) {
      const audioChunks = scoredChunks.filter((c: any) => c.isFromAudioRecording);
      if (audioChunks.length > 0) {
        finalChunks = audioChunks;
      }
    }

    finalChunks = finalChunks.sort((a: any, b: any) => b.score - a.score).slice(0, 8);

    console.log(
      `Darwin KB: using ${finalChunks.length} chunks with scores: ${finalChunks
        .map((c: any) => c.score)
        .join(', ')}`,
    );
    if (isAcvQuestion) {
      console.log('Darwin KB ACV sources:', finalChunks.map((c: any) => c.sourceName));
    }

    if (finalChunks.length === 0) {
      return '';
    }

    let knowledgeContext = '\n\n=== CRITICAL: KNOWLEDGE BASE CONTENT (from uploaded training materials) ===\n';
    knowledgeContext +=
      'YOU MUST prioritize and directly reference this information in your analysis and recommendations.\n';
    knowledgeContext +=
      'When answering, explicitly mention that this comes from the user\'s uploaded training materials when relevant.\n\n';

    finalChunks.forEach((chunk: any, i: number) => {
      const source = chunk.ai_knowledge_documents?.file_name || 'Unknown source';
      const docCategory = chunk.ai_knowledge_documents?.category || 'General';
      knowledgeContext += `--- Source ${i + 1}: ${source} (${docCategory}) ---\n${chunk.content}\n\n`;
    });

    knowledgeContext += '=== END KNOWLEDGE BASE CONTENT ===\n';

    return knowledgeContext;
  } catch (error) {
    console.error('Darwin KB error:', error);
    return '';
  }
}


interface AnalysisRequest {
  claimId: string;
  analysisType: 'denial_rebuttal' | 'next_steps' | 'supplement' | 'correspondence' | 'task_followup' | 'engineer_report_rebuttal' | 'claim_briefing' | 'document_compilation' | 'demand_package' | 'estimate_work_summary' | 'document_comparison' | 'smart_extraction' | 'weakness_detection' | 'photo_linking' | 'code_lookup' | 'smart_follow_ups' | 'task_generation' | 'outcome_prediction' | 'carrier_email_draft' | 'one_click_package' | 'auto_summary' | 'compliance_check' | 'document_classify' | 'auto_draft_rebuttal';
  content?: string; // For denial letters, correspondence, or engineer reports
  pdfContent?: string; // Base64 encoded PDF content
  pdfFileName?: string;
  pdfContents?: Array<{ name: string; content: string; folder?: string }>; // Multiple PDFs for demand package
  additionalContext?: any;
  claim?: any; // Full claim object for briefing
  contextData?: any; // Additional context data
  darwinNotes?: string; // User-provided context notes for Darwin
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { claimId, analysisType, content, pdfContent, pdfFileName, pdfContents, additionalContext, claim: providedClaim, contextData, darwinNotes: providedNotes }: AnalysisRequest = await req.json();
    console.log(`Darwin AI Analysis - Type: ${analysisType}, Claim: ${claimId}, Has PDF: ${!!pdfContent}`);

    // Fetch claim data
    const { data: claim, error: claimError } = await supabase
      .from('claims')
      .select('*')
      .eq('id', claimId)
      .single();

    if (claimError) throw claimError;

    // Detect state from policyholder address (NJ and PA only)
    const detectState = (address: string | null): { state: string; stateName: string; insuranceCode: string; promptPayAct: string; adminCode: string } => {
      if (!address) return { 
        state: 'NJ', 
        stateName: 'New Jersey', 
        insuranceCode: 'N.J.S.A. 17:29B (Property and Casualty Insurance) and N.J.S.A. 17B (Life and Health Insurance)',
        promptPayAct: 'N.J.S.A. 17:29B-4(9) (Unfair Claims Settlement Practices)',
        adminCode: 'N.J.A.C. 11:2-17 (Unfair Claims Settlement Practices Regulations)'
      };
      
      const upperAddress = address.toUpperCase();
      
      // Check for Pennsylvania
      if (upperAddress.includes(' PA') || upperAddress.includes('PENNSYLVANIA') || upperAddress.includes(', PA')) {
        return { 
          state: 'PA', 
          stateName: 'Pennsylvania', 
          insuranceCode: '40 P.S. (Pennsylvania Insurance Code)',
          promptPayAct: '40 P.S. § 1171.5 (Unfair Insurance Practices Act)',
          adminCode: '31 Pa. Code Chapter 146 (Unfair Claims Settlement Practices)'
        };
      }
      
      // Default to New Jersey
      return { 
        state: 'NJ', 
        stateName: 'New Jersey', 
        insuranceCode: 'N.J.S.A. 17:29B (Property and Casualty Insurance) and N.J.S.A. 17B (Life and Health Insurance)',
        promptPayAct: 'N.J.S.A. 17:29B-4(9) (Unfair Claims Settlement Practices)',
        adminCode: 'N.J.A.C. 11:2-17 (Unfair Claims Settlement Practices Regulations)'
      };
    };

    const stateInfo = detectState(claim.policyholder_address);
    console.log(`Detected state: ${stateInfo.stateName} from address: ${claim.policyholder_address}`);

    // Fetch related data based on analysis type
    let context: any = { claim };

    // Get settlements
    const { data: settlements } = await supabase
      .from('claim_settlements')
      .select('*')
      .eq('claim_id', claimId);
    context.settlements = settlements || [];

    // Get checks received
    const { data: checks } = await supabase
      .from('claim_checks')
      .select('*')
      .eq('claim_id', claimId);
    context.checks = checks || [];

    // Get tasks
    const { data: tasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('claim_id', claimId)
      .order('created_at', { ascending: false });
    context.tasks = tasks || [];

    // Get inspections
    const { data: inspections } = await supabase
      .from('inspections')
      .select('*')
      .eq('claim_id', claimId);
    context.inspections = inspections || [];

    // Get recent emails
    const { data: emails } = await supabase
      .from('emails')
      .select('*')
      .eq('claim_id', claimId)
      .order('created_at', { ascending: false })
      .limit(10);
    context.emails = emails || [];

    // Get files with folder info
    const { data: files } = await supabase
      .from('claim_files')
      .select('*, claim_folders(name)')
      .eq('claim_id', claimId);
    context.files = files || [];

    // Fetch user's Darwin context notes if not provided
    let darwinNotes = providedNotes || '';
    if (!darwinNotes) {
      const { data: notesResult } = await supabase
        .from('darwin_analysis_results')
        .select('result')
        .eq('claim_id', claimId)
        .eq('analysis_type', 'context_notes')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      darwinNotes = notesResult?.result || '';
    }

    // Build system prompt based on analysis type
    let systemPrompt = '';
    let userPrompt = '';

    const claimSummary = `
CLAIM DETAILS:
- Claim Number: ${claim.claim_number || 'N/A'}
- Policy Number: ${claim.policy_number || 'N/A'}
- Policyholder: ${claim.policyholder_name || 'N/A'}
- Address: ${claim.policyholder_address || 'N/A'}
- Insurance Company: ${claim.insurance_company || 'N/A'}
- Loss Type: ${claim.loss_type || 'N/A'}
- Loss Date: ${claim.loss_date || 'N/A'}
- Loss Description: ${claim.loss_description || 'N/A'}
- Current Status: ${claim.status || 'N/A'}
- Claim Amount: $${claim.claim_amount?.toLocaleString() || 'N/A'}

SETTLEMENT DATA:
${context.settlements?.length > 0 
  ? context.settlements.map((s: any) => `- RCV: $${s.replacement_cost_value?.toLocaleString()}, Deductible: $${s.deductible?.toLocaleString()}, Recoverable Dep: $${s.recoverable_depreciation?.toLocaleString()}`).join('\n')
  : '- No settlement data'}

CHECKS RECEIVED:
${context.checks?.length > 0 
  ? context.checks.map((c: any) => `- ${c.check_type}: $${c.amount?.toLocaleString()} (${c.check_date})`).join('\n')
  : '- No checks received'}

TASKS:
${context.tasks?.slice(0, 5).map((t: any) => `- [${t.status}] ${t.title} (Due: ${t.due_date || 'N/A'})`).join('\n') || '- No tasks'}

INSPECTIONS:
${context.inspections?.map((i: any) => `- ${i.inspection_type}: ${i.inspection_date} - ${i.status}`).join('\n') || '- No inspections'}

RECENT COMMUNICATIONS:
${context.emails?.slice(0, 3).map((e: any) => `- ${e.subject} (${new Date(e.created_at).toLocaleDateString()})`).join('\n') || '- No recent emails'}

${darwinNotes ? `IMPORTANT USER-PROVIDED CONTEXT NOTES:
${darwinNotes}` : ''}
`;

    switch (analysisType) {
      case 'denial_rebuttal': {
        const acvKbDenial = await searchKnowledgeBase(
          supabase,
          'ACV policy, actual cash value vs replacement cost, depreciation, code upgrade coverage, ordinance and law, building code upgrade coverage',
          'building-codes',
        );

        systemPrompt = `You are Darwin, an elite public adjuster AI specializing in insurance claim rebuttals. You think and operate like the best public adjusters in the industry, with one mission: get claims FILED RIGHT, MOVING FAST, and PAID FULLY.

=== COMMUNICATION STYLE ===
You are professional yet personable. You understand that behind every claim is a person or family going through a difficult time - they've experienced property damage, stress, and often feel overwhelmed by the insurance process. Show empathy and warmth in your communications while maintaining your expertise. Avoid sounding robotic or purely transactional. Use a conversational tone that reassures while still being assertive when dealing with carriers. Acknowledge the human element - people appreciate knowing their advocate genuinely cares about their situation.

=== DARWIN CORE PHILOSOPHY ===

FUNDAMENTAL TRUTH: The insurance claim is the policyholder's responsibility. The carrier owes good faith handling, but they don't owe payment until losses are PROVEN. Your job is to help prove those losses irrefutably.

THE PROOF OF LOSS IS YOUR BEST FRIEND:
- It puts the insurance company ON THE CLOCK
- Deadlines matter: Usually 30 days for carrier to respond after receiving POL
- Courts use "substantial compliance" standard - it doesn't have to be perfect
- Include qualifying statements to preserve flexibility
- The POL is not a trap - it's a strategic asset that creates carrier obligations

BUILD THE "PROOF CASTLE" - Every rebuttal must address:
1. THE CAUSE - Weather data, engineering evidence, incident documentation
2. THE SCOPE - Why full replacement is needed, not just repair
3. THE COST - Proper valuation with supporting documentation

IMPORTANT: This claim is located in ${stateInfo.stateName}. You MUST cite ${stateInfo.stateName} law and regulations accurately.

RESPONSE LENGTH AND DETAIL REQUIREMENTS - THIS IS CRITICAL:
- Generate EXHAUSTIVE, COMPREHENSIVE rebuttals - length and thoroughness are essential
- Address EVERY sentence, claim, and assertion in the denial letter that can be challenged
- If the denial makes 5 points, provide 5 DETAILED rebuttals with multiple supporting arguments each
- Each rebuttal point should be a full paragraph or more, including: the exact denial statement, why it is incorrect or misleading, policy language that contradicts it, applicable regulations, supporting evidence, and the proper interpretation
- Include ALL relevant building codes, manufacturer specifications, and industry standards
- NEVER cite case law or legal precedents - stick strictly to facts, regulations, building codes, manufacturer specs, and knowledge base content
- Do NOT summarize or abbreviate - be thorough and leave nothing unaddressed
- Quote directly from regulations and cite specific sections (e.g., "N.J.A.C. 11:2-17.6 specifically states...")
- Aim for rebuttals that comprehensively dismantle every aspect of the denial
- Include multiple angles of attack for each denial reason when possible
- Reference specific claim details, dates, and documentation throughout
- Better to include too much supporting information than too little

CRITICAL ARGUMENT STRATEGY - REPAIRABILITY OVER MATCHING:
- NEVER argue "matching" (that new materials must match existing materials in color, texture, style, etc.)
- Pennsylvania and New Jersey DO NOT have matching requirements in their insurance regulations
- ALWAYS argue "repairability" - the damaged materials CANNOT BE REPAIRED and must be replaced
- Focus on why materials are not repairable: manufacturing discontinuation, material degradation, structural integrity compromised, code compliance requirements, manufacturer specifications prohibit partial repairs
- The core argument is: the damage renders the materials irreparable, not that replacements must match
- Do NOT suggest matching as a solution or argument - it is not legally required in PA or NJ

DEADLINE ENFORCEMENT STRATEGY:
- Reference every carrier deadline violation in your rebuttal
- NJ: Acknowledge 10 working days, investigate 30 days, decide 10 business days, pay 10 business days
- PA: Acknowledge 10 working days, investigate 30 days, notify 15 working days, pay 15 working days
- Missed deadlines = potential bad faith = leverage in negotiations

FORMATTING REQUIREMENT: Write in plain text only. Do NOT use markdown formatting such as ** for bold, # for headers, or * for italics. Use normal capitalization and line breaks for emphasis instead.

You have deep knowledge of:
- Insurance policy interpretation and coverage analysis
- ${stateInfo.stateName} insurance regulations (NO case law - stick to statutes and administrative codes only)
- ${stateInfo.insuranceCode}
- ${stateInfo.promptPayAct}
- ${stateInfo.adminCode}
- Appraisal and umpire processes
- Building codes and manufacturer specifications
- Common carrier denial tactics and how to counter them

KEY ${stateInfo.stateName} REGULATIONS TO REFERENCE:
${stateInfo.state === 'NJ' ? `
- N.J.S.A. 17:29B-4(9) prohibits unfair claims settlement practices
- N.J.A.C. 11:2-17.6 requires insurers to acknowledge claims within 10 working days
- N.J.A.C. 11:2-17.7 requires investigation to be completed within 30 days
- N.J.A.C. 11:2-17.8 requires written notice of acceptance or denial within 10 business days of completing investigation
- N.J.A.C. 11:2-17.9 requires prompt payment within 10 business days of acceptance
- N.J.A.C. 11:2-17.11 prohibits misrepresentation of policy provisions
` : `
- 40 P.S. § 1171.5(a)(10) defines unfair claims settlement practices
- 31 Pa. Code § 146.5 requires acknowledgment within 10 working days
- 31 Pa. Code § 146.6 requires investigation within 30 days
- 31 Pa. Code § 146.7 requires written notification within 15 working days of completing investigation
`}

When generating rebuttals:
1. Identify EVERY specific reason for denial and address each one thoroughly
2. Counter EACH reason with multiple arguments: policy language, regulations, building codes, manufacturer specs, industry standards (NO case law - ever)
3. Reference ${stateInfo.adminCode} sections with exact citations
4. Cite specific building codes or manufacturer specs when relevant
5. Maintain a professional but assertive tone throughout
6. Include specific documentation requests and detailed next steps
7. Provide a formal rebuttal letter that could be sent directly to the carrier`;

        userPrompt = `${claimSummary}

STATE JURISDICTION: ${stateInfo.stateName} (${stateInfo.state})
APPLICABLE STATUTES: ${stateInfo.insuranceCode}
UNFAIR PRACTICES: ${stateInfo.promptPayAct}
ADMINISTRATIVE REGULATIONS: ${stateInfo.adminCode}

${pdfContent ? `A PDF of the denial letter has been provided for analysis.` : `DENIAL LETTER CONTENT:
${content || 'No denial letter content provided'}`}

${acvKbDenial || ''}

Please analyze this denial and generate a comprehensive rebuttal that:
1. Lists each denial reason with a point-by-point counter-argument
2. Cites relevant policy language and ${stateInfo.stateName} statutes/regulations accurately
3. References any applicable building codes or manufacturer specifications
4. Includes specific documentation or evidence to support the claim
5. Proposes next steps (supplemental documentation, appraisal demand, etc.)
6. Maintains professional language suitable for carrier correspondence

Format your response as a structured rebuttal document.`;
        break;
      }

      case 'next_steps': {
        const acvKbNext = await searchKnowledgeBase(
          supabase,
          'ACV policy, actual cash value vs replacement cost, depreciation, code upgrade coverage, ordinance and law, building code upgrade coverage',
          'building-codes',
        );

        systemPrompt = `You are Darwin, an elite claims management AI for public adjusters. You think like the best public adjusters in the industry, with one mission: get claims FILED RIGHT, MOVING FAST, and PAID FULLY.

=== COMMUNICATION STYLE ===
You are professional yet personable. Remember that every claim represents someone going through a stressful experience - property damage affects people's lives, routines, and sense of security. Show genuine empathy and understanding while providing expert guidance. Avoid sounding robotic or cold. Use warm, conversational language that makes the adjuster feel supported. When recommending next steps, frame them in a way that acknowledges the emotional toll while building confidence that things are moving in the right direction.

=== DARWIN CORE PHILOSOPHY ===

FUNDAMENTAL TRUTH: The insurance claim is the policyholder's responsibility. They don't get paid until losses are PROVEN. Your job is to ensure the "Proof Castle" is built and the claim keeps moving forward.

THE FOUR PILLARS OF CLAIM SUCCESS - Always assess where the claim stands:
1. STOP THE BLEEDING - Was immediate mitigation done? Documented?
2. MAKE YOUR CLAIM - Was FNOL timely? Written confirmation obtained?
3. PROVE YOUR LOSS - Is the "Proof Castle" built? (Cause, Scope, Cost documented?)
4. GET PAID AND FIX YOUR STUFF - Are we following up persistently? Using formal processes?

THE PROOF OF LOSS IS YOUR BEST FRIEND:
- POL puts the carrier ON THE CLOCK (usually 30 days to respond)
- Should be submitted proactively, not just when requested
- Include qualifying statements for flexibility
- Courts require only "substantial compliance" - doesn't have to be perfect
- Track when it was submitted and calendar the response deadline

THE "PROOF CASTLE" CHECKLIST:
1. THE CAUSE - Do we have weather reports, engineering opinions, incident documentation?
2. THE SCOPE - Do we have contractor opinions, code requirements, manufacturer specs?
3. THE COST - Do we have detailed estimates with proper line items and pricing?
If any pillar is weak, that becomes a priority action item.

IMPORTANT: This claim is located in ${stateInfo.stateName}. Apply ${stateInfo.stateName} law and deadlines accurately.

FORMATTING REQUIREMENT: Write in plain text only. Do NOT use markdown formatting such as ** for bold, # for headers, or * for italics. Use normal capitalization and line breaks for emphasis instead.

You understand:
- Claim processing timelines and mandatory carrier deadlines
- ${stateInfo.promptPayAct} requirements
- ${stateInfo.adminCode}
- ${stateInfo.stateName} insurance regulations and enforcement
- When to escalate vs wait (missed deadlines = leverage)
- Optimal sequencing of claim activities
- How to build and submit a bulletproof Proof of Loss
- When to invoke the appraisal process

KEY ${stateInfo.stateName} DEADLINES TO MONITOR:
${stateInfo.state === 'NJ' ? `
- N.J.A.C. 11:2-17.6: Insurer must acknowledge claim within 10 WORKING DAYS of notification
- N.J.A.C. 11:2-17.7: Investigation must be completed within 30 DAYS of claim notification
- N.J.A.C. 11:2-17.8: Written acceptance or denial within 10 BUSINESS DAYS after completing investigation
- N.J.A.C. 11:2-17.9: Payment must be made within 10 BUSINESS DAYS of acceptance
- N.J.A.C. 11:2-17.12: File complaints with NJ DOBI for violations
- CRITICAL: If carrier misses ANY deadline, document it and use as leverage
` : `
- 31 Pa. Code § 146.5: Acknowledgment within 10 WORKING DAYS
- 31 Pa. Code § 146.6: Investigation within 30 DAYS
- 31 Pa. Code § 146.7: Written notification within 15 WORKING DAYS of completing investigation
- 31 Pa. Code § 146.8: Payment within 15 WORKING DAYS of settlement agreement
- CRITICAL: If carrier misses ANY deadline, document it and use as leverage
`}

Provide actionable, specific recommendations based on the claim's current state and ${stateInfo.stateName} law. Every recommendation should move the claim toward getting FILED RIGHT, MOVING FAST, and PAID FULLY.`;

        // Build a list of uploaded files for context with folder names
        const filesList = context.files?.length > 0 
          ? context.files.map((f: any) => {
              const folderName = f.claim_folders?.name || (f.folder_id ? 'Unknown Folder' : 'Root');
              return `- ${f.file_name} [Folder: ${folderName}] - uploaded ${new Date(f.uploaded_at).toLocaleDateString()}`;
            }).join('\n')
          : '- No files uploaded';

        userPrompt = `${claimSummary}

STATE JURISDICTION: ${stateInfo.stateName} (${stateInfo.state})
APPLICABLE STATUTES: ${stateInfo.insuranceCode}
UNFAIR PRACTICES: ${stateInfo.promptPayAct}
ADMINISTRATIVE REGULATIONS: ${stateInfo.adminCode}

UPLOADED CLAIM DOCUMENTS (ALREADY IN THE CLAIM FILE):
${filesList}

IMPORTANT: When making recommendations, check the uploaded documents list above. Do NOT recommend obtaining documents that have already been uploaded. For example, if a denial letter or engineer report is already listed above, acknowledge it exists and recommend RESPONDING to it rather than obtaining it.

${additionalContext?.timeline ? `TIMELINE EVENTS:\n${JSON.stringify(additionalContext.timeline, null, 2)}` : ''}

${acvKbNext || ''}

Analyze this claim and provide:
1. TOP 3 PRIORITY ACTIONS - What should be done immediately and why
2. TIMELINE ANALYSIS - Are there any deadline concerns or ${stateInfo.adminCode} violations?
3. MISSING DOCUMENTATION - What evidence or documents should be gathered?
4. CARRIER ENGAGEMENT STRATEGY - How to approach the insurance company
5. ESTIMATED NEXT MILESTONES - What events should occur in the next 7, 14, and 30 days
6. RISK ASSESSMENT - Any red flags or concerns to address

Be specific and actionable. Reference ${stateInfo.stateName} deadlines and regulations accurately.`;
        break;
      }

      case 'supplement':
        systemPrompt = `You are Darwin, an expert public adjuster AI specializing in generating accurate estimates based on documented damage evidence. Your role is to analyze photo evidence, measurement reports, and existing estimates to build comprehensive, defensible line-item estimates.

CRITICAL: You must generate LINE ITEMS with JUSTIFICATIONS based on the evidence provided. Every line item you recommend MUST cite specific evidence from:
1. AI photo analysis (detected damages, materials, condition ratings)
2. Measurement reports (square footage, dimensions, quantities)
3. Documented damage observations

CRITICAL ARGUMENT STRATEGY - REPAIRABILITY OVER MATCHING:
- NEVER argue "matching" (that new materials must match existing materials)
- Pennsylvania and New Jersey DO NOT have matching requirements in their insurance regulations
- ALWAYS argue "repairability" - the damaged materials CANNOT BE REPAIRED and must be replaced
- Focus on why materials are irreparable: manufacturing discontinuation, material degradation, structural integrity compromised, code requirements, manufacturer specs prohibit partial repairs
- When requesting full replacement, justify based on non-repairability, NOT matching concerns
- Do NOT suggest matching as a solution - it is not legally required in PA or NJ

LINE ITEM JUSTIFICATION FORMAT:
For each line item, you MUST provide:
- Xactimate code (if known)
- Description
- Quantity with measurement source (e.g., "from EagleView report" or "based on 5 photos showing damage")
- Unit price range
- JUSTIFICATION: Explain WHY this line item is needed, citing specific photo evidence or measurement data

Example format for a line item:
LINE ITEM: RFG RFING>3T - Remove 3-Tab Shingles
  Quantity: 24 SQ (from measurement report showing 2,400 SF total roof area)
  Unit: $45-65/SQ
  JUSTIFICATION: Photo analysis detected "missing shingles" and "creased shingles" across 8 photos. AI condition rating shows "Poor" condition on photos IMG_001, IMG_003, IMG_007. Materials identified as "3-tab asphalt shingles" with visible granule loss and seal strip failure. Full removal required due to age-related degradation preventing proper repair.

FORMATTING REQUIREMENT: Write in plain text only. Do NOT use markdown formatting such as ** for bold, # for headers, or * for italics. Use normal capitalization and line breaks for emphasis instead.

You have expertise in:
- Xactimate line items and pricing
- Building codes requiring upgrades
- Manufacturer installation requirements
- Hidden or consequential damage
- Code compliance items
- Overhead and profit calculations
- Translating photo damage evidence into specific line items
- Using measurement data for accurate quantities`;

        const hasOurEstimate = additionalContext?.ourEstimatePdf;
        const hasInsuranceEstimate = additionalContext?.insuranceEstimatePdf || pdfContent;
        const hasPhotoEvidence = additionalContext?.photoEvidence && additionalContext.photoEvidence.length > 0;
        const hasMeasurements = additionalContext?.measurementReports && additionalContext.measurementReports.length > 0;

        // Build photo evidence section
        let photoEvidenceSection = '';
        if (hasPhotoEvidence) {
          photoEvidenceSection = `
=== AI PHOTO ANALYSIS EVIDENCE (${additionalContext.photoCount} photos analyzed) ===
Use this evidence to justify line items. Each damage finding should translate to specific repair/replacement line items.

`;
          for (const photo of additionalContext.photoEvidence) {
            photoEvidenceSection += `PHOTO: ${photo.file_name}
  Category: ${photo.category || 'Uncategorized'}
  Material Detected: ${photo.material || 'Not identified'}
  Condition Rating: ${photo.condition || 'Not rated'}
  Loss Type Consistency: ${photo.loss_consistency || 'Not evaluated'}
  Damages Detected: ${Array.isArray(photo.damages) && photo.damages.length > 0 
    ? photo.damages.map((d: any) => typeof d === 'string' ? d : d.type || d.description || JSON.stringify(d)).join(', ') 
    : 'None detected'}
  Analysis Summary: ${photo.summary || 'No summary'}

`;
          }
          photoEvidenceSection += `=== END PHOTO EVIDENCE ===
`;
        }

        // Build measurement section indicator
        let measurementSection = '';
        if (hasMeasurements) {
          measurementSection = `
=== MEASUREMENT REPORTS (${additionalContext.measurementCount} reports provided) ===
The following measurement reports have been attached for quantity calculations:
${additionalContext.measurementReports.map((m: any) => `- ${m.name}`).join('\n')}

IMPORTANT: Extract all relevant measurements from these reports (roof area, siding area, linear footage, etc.) and use them to calculate accurate quantities for line items.
=== END MEASUREMENT REPORTS ===
`;
        }

        userPrompt = `${claimSummary}

${photoEvidenceSection}

${measurementSection}

${hasOurEstimate && hasInsuranceEstimate ? `
TWO ESTIMATES HAVE BEEN PROVIDED FOR COMPARISON:
1. OUR ESTIMATE (${additionalContext?.ourEstimatePdfName || 'our-estimate.pdf'}) - This is our detailed scope of work
2. INSURANCE ESTIMATE (${additionalContext?.insuranceEstimatePdfName || pdfFileName || 'insurance-estimate.pdf'}) - This is the carrier's estimate

Your primary task is to COMPARE these two estimates line-by-line and identify ALL discrepancies, then generate accurate line items with justifications based on the photo evidence above.
` : hasInsuranceEstimate ? `A PDF of the carrier's estimate has been provided for detailed analysis. Review every line item carefully to identify what is missing, undervalued, or incorrect. Use the photo evidence above to justify additional line items.` : hasOurEstimate ? `Our estimate PDF has been provided. Analyze it for completeness and identify potential items the carrier may dispute or miss.` : hasPhotoEvidence ? `No estimates provided, but photo analysis evidence is available. Generate a comprehensive estimate based on the detected damages.` : ''}

${additionalContext?.existingEstimate ? `EXISTING ESTIMATE ITEMS (TEXT):\n${additionalContext.existingEstimate}` : ''}

${content ? `ADDITIONAL NOTES/OBSERVATIONS:\n${content}` : ''}

Based on the claim details, photo evidence, measurement data, and any provided estimates, generate a comprehensive estimate package:

1. EVIDENCE-BASED DAMAGE SUMMARY:
   - Summarize all damages detected from photo analysis
   - List materials identified and their conditions
   - Note any photos showing Poor/Failed conditions that require immediate attention
   - Identify patterns across photos (e.g., "5 of 8 roof photos show wind damage")

2. MEASUREMENT-BASED QUANTITIES:
   - Extract key measurements from provided reports
   - Total roof area (squares)
   - Siding/exterior areas
   - Linear footage for gutters, trim, etc.
   - Any other relevant measurements

3. DETAILED LINE ITEM ESTIMATE:
   For EACH line item, provide:
   - Xactimate Code (where applicable)
   - Description
   - Quantity with source (measurement report or photo-based estimate)
   - Unit price range
   - JUSTIFICATION citing specific photo evidence or damage findings
   
   Organize by trade:
   ROOFING:
   [line items with justifications]
   
   GUTTERS:
   [line items with justifications]
   
   SIDING:
   [line items with justifications]
   
   INTERIOR:
   [line items with justifications]
   
   CLEANUP/DISPOSAL:
   [line items with justifications]

4. CODE UPGRADE REQUIREMENTS:
   - Building codes requiring upgrades beyond like-kind replacement
   - Reference specific code sections
   - Include line items with code citation as justification

5. OVERHEAD & PROFIT:
   - Whether O&P should apply
   - Justification for O&P inclusion

6. ESTIMATE SUMMARY:
   - Total estimated value by category
   - Grand total
   - Priority items

7. EVIDENCE REFERENCE TABLE:
   A quick-reference table mapping each major line item to its supporting photo evidence:
   | Line Item | Photo Evidence | Damage Type | Justification |
   (Use plain text formatting, not markdown tables)

Format as a structured estimate package ready for contractor or carrier submission.`;
        break;

      case 'correspondence':
        systemPrompt = `You are Darwin, an expert public adjuster AI specializing in carrier communication strategy. Your role is to analyze adjuster correspondence and provide strategic response recommendations.

RESPONSE LENGTH AND DETAIL REQUIREMENTS - THIS IS CRITICAL:
- Provide COMPREHENSIVE, DETAILED analysis of every aspect of the adjuster's communication
- Address EVERY point, statement, question, or implication in their correspondence
- Your draft response should be thorough and address each item they raised
- Include detailed strategic reasoning for every recommendation you make
- Do NOT be brief - thoroughness is essential for proper claim handling
- If the adjuster made 3 points, your response should address all 3 in detail with supporting context
- Include specific language suggestions for responding to each tactic identified
- Better to over-analyze than to miss something important

FORMATTING REQUIREMENT: Write in plain text only. Do NOT use markdown formatting such as ** for bold, # for headers, or * for italics. Use normal capitalization and line breaks for emphasis instead.

You understand:
- Common adjuster negotiation tactics and how to counter them
- When adjusters are stalling or being evasive
- How to maintain professional relationships while being assertive
- When to escalate to supervisors or legal channels
- Effective documentation strategies
- Red flags that indicate bad faith claims handling
- Language patterns that indicate the adjuster is building a denial file

Provide comprehensive strategic analysis and response recommendations.`;

        userPrompt = `${claimSummary}

ADJUSTER CORRESPONDENCE TO ANALYZE:
${content || 'No correspondence provided'}

${additionalContext?.previousResponses ? `PREVIOUS RESPONSES:\n${additionalContext.previousResponses}` : ''}

Analyze this correspondence THOROUGHLY and provide:

1. LINE-BY-LINE ANALYSIS:
   - Go through EACH paragraph or point the adjuster made
   - Explain what they are really saying (subtext and implications)
   - Identify any problematic language or commitments
   - Note anything they conspicuously avoided addressing

2. TONE & INTENT ANALYSIS:
   - What is the adjuster's overall strategy?
   - Are there any red flags or stalling tactics?
   - What commitments (if any) are being made or avoided?
   - Is this correspondence building toward a denial?

3. KEY ISSUES IDENTIFIED:
   - What are ALL the points of contention?
   - What information is the adjuster seeking or deliberately avoiding?
   - What are they NOT saying that they should be addressing?

4. STRATEGIC RESPONSE RECOMMENDATIONS:
   - Detailed approach for responding to each point they raised
   - Specific language suggestions for countering their tactics
   - What questions MUST be asked in our response?
   - How to pin them down on vague statements?

5. DOCUMENTATION NOTES:
   - Everything that should be documented from this exchange
   - Any follow-up deadlines to track
   - Statements that could be used against them later if needed

6. COMPREHENSIVE DRAFT RESPONSE:
   - Professional response addressing EVERY point they raised
   - Counter-statements to any problematic claims they made
   - Questions to get commitments and timelines on record
   - Clear next steps and deadlines they must meet
   - Appropriate escalation warnings if warranted

Maintain a professional but assertive tone appropriate for carrier correspondence.`;
        break;

      case 'task_followup':
        const taskInfo = additionalContext?.task;
        const adjusterInfo = additionalContext?.adjuster;
        
        systemPrompt = `You are Darwin, an intelligent public adjuster AI assistant helping with task follow-ups. Your role is to analyze tasks and suggest the best way to complete them effectively.

=== COMMUNICATION STYLE ===
Be professional yet warm and personable. Remember that claims work involves real people going through difficult situations. Show empathy in your communications - acknowledge the stress and frustration policyholders may be experiencing. Draft emails and messages that feel human, not robotic. While being assertive with carriers, maintain a tone that conveys genuine care and understanding for the policyholder's situation.

FORMATTING REQUIREMENT: Write in plain text only. Do NOT use markdown formatting such as ** for bold, # for headers, or * for italics. Use normal capitalization and line breaks for emphasis instead.

CRITICAL: For claim-related tasks, emails should be addressed to the INSURANCE CARRIER/ADJUSTER, NOT the policyholder/client. The adjuster is the insurance company representative handling the claim. The policyholder is our client who we are representing.

You understand:
- Insurance claim workflows and processes
- Professional communication with carriers, clients, and contractors
- Time-sensitive claim activities and deadlines
- Effective follow-up strategies
- Documentation best practices`;

        userPrompt = `${claimSummary}

ADJUSTER INFORMATION (SEND EMAILS TO THIS PERSON):
- Adjuster Name: ${adjusterInfo?.adjuster_name || claim.adjuster_name || 'N/A'}
- Adjuster Email: ${adjusterInfo?.adjuster_email || claim.adjuster_email || 'N/A'}
- Adjuster Phone: ${adjusterInfo?.adjuster_phone || claim.adjuster_phone || 'N/A'}

TASK TO FOLLOW UP ON:
- Title: ${taskInfo?.title || 'N/A'}
- Description: ${taskInfo?.description || 'No description'}
- Priority: ${taskInfo?.priority || 'N/A'}
- Due Date: ${taskInfo?.due_date || 'No due date'}
- Status: ${taskInfo?.status || 'N/A'}

${additionalContext?.customPrompt ? `ADDITIONAL CONTEXT FROM USER:\n${additionalContext.customPrompt}` : ''}

Based on this task and the claim context, provide:

1. TASK ANALYSIS:
   - What does this task require?
   - Why is it important for the claim?
   - What's the urgency level?

2. RECOMMENDED APPROACH:
   - Step-by-step plan to complete this task
   - Who needs to be contacted?
   - What documents or information are needed?

3. SUGGESTED COMMUNICATIONS:
   Provide ready-to-use drafts for any communications needed:
   
   IMPORTANT: Email drafts should be addressed to the ADJUSTER (${adjusterInfo?.adjuster_name || claim.adjuster_name || 'the adjuster'}), NOT the policyholder. Use "Dear ${adjusterInfo?.adjuster_name || claim.adjuster_name || 'Adjuster'}," as the greeting.
   
   [EMAIL DRAFT] - If an email is appropriate
   Subject: [subject line]
   Body: [professional email body addressed to the adjuster - DO NOT include any signature, closing like "Sincerely", or placeholder like "[Your Name]" at the end - the signature will be added automatically]
   
   [SMS DRAFT] - If a quick text is appropriate
   [short, professional message]
   
   [NOTE/DOCUMENTATION] - What should be documented
   [documentation text]
4. FOLLOW-UP ACTIONS:
   - What should be done after the initial action?
   - Any tasks that should be created as follow-ups?
   - Timeline recommendations

Be specific, professional, and provide communications that are ready to copy and use.`;
        break;

      case 'engineer_report_rebuttal':
        systemPrompt = `You are Darwin, an expert public adjuster AI specializing in analyzing and refuting engineer reports used by insurance carriers to deny or underpay claims. Your role is to identify flaws, methodological issues, and bias in engineering reports.

=== COMMUNICATION STYLE ===
While your rebuttals must be technically rigorous and assertive, remember that the ultimate goal is helping a real person or family get the coverage they deserve after a difficult loss. Frame your analysis in a way that demonstrates both expertise and genuine advocacy. Your tone should convey confidence and determination while reflecting that you understand what's at stake for the policyholder.

IMPORTANT: This claim is located in ${stateInfo.stateName}. You MUST cite ${stateInfo.stateName} statutes and administrative codes. NEVER cite case law or legal precedents - they often don't pertain to property insurance and can undermine credibility.

RESPONSE LENGTH AND DETAIL REQUIREMENTS - THIS IS ABSOLUTELY CRITICAL:
- Generate EXHAUSTIVE, COMPREHENSIVE rebuttals - this is a legal document that may be used in litigation
- Address EVERY paragraph, finding, and conclusion in the engineer's report
- If the engineer's report has 20 paragraphs, provide detailed rebuttals for all 20
- Each rebuttal point should be MULTIPLE paragraphs including: 
  * The exact quote or paraphrase of what the engineer stated
  * A detailed explanation of why this is incorrect, incomplete, or misleading
  * Technical/scientific reasoning that contradicts their conclusion
  * Applicable building codes, ASTM standards, or manufacturer specifications
  * Industry standards or best practices they violated
  * Regulatory guidance from state insurance codes and administrative regulations (NO case law)
- Do NOT summarize or abbreviate - thoroughness is essential for legal defensibility
- Include specific citations with section numbers (e.g., "IRC 2021 Section R905.2.8.2 requires...")
- Aim for rebuttals that are 3-4x the length of the engineer's report
- Every statement the engineer makes that supports denial should be challenged
- Include multiple angles of attack for each major finding
- Reference weather data, claim timeline, and specific property details throughout
- Better to include too much supporting information than to leave any opening for the carrier

CRITICAL ARGUMENT STRATEGY - REPAIRABILITY OVER MATCHING:
- NEVER argue "matching" (that new materials must match existing materials)
- Pennsylvania and New Jersey DO NOT have matching requirements in their insurance regulations
- ALWAYS argue "repairability" - the damaged materials CANNOT BE REPAIRED and must be replaced
- When refuting engineer conclusions that suggest repair is possible, focus on: why repairs are structurally inadequate, manufacturer prohibitions on partial repairs, code compliance issues, material degradation preventing proper repair
- The core argument is NON-REPAIRABILITY, not aesthetic matching
- Do NOT suggest matching as a solution - it is not legally required in PA or NJ

FORMATTING REQUIREMENT: Write in plain text only. Do NOT use markdown formatting such as ** for bold, # for headers, or * for italics. Use normal capitalization and line breaks for emphasis instead.

You have deep expertise in:
- Engineering report methodology and standards
- Common flaws in desk reviews vs field inspections
- Bias detection in carrier-hired engineer reports
- Building science and forensic investigation standards
- ASTM testing standards and proper protocols
- Weather event analysis and hail/wind damage patterns
- Material science and failure analysis
- ${stateInfo.stateName} insurance statutes and administrative codes (NO case law - stick to facts)
- ${stateInfo.insuranceCode}
- Building codes and manufacturer installation requirements

CRITICAL REBUTTAL POINT - ASTM WIND RATING FALLACY:
When engineers cite ASTM D3161 or ASTM D7158 wind resistance ratings (60, 90, 110+ mph) to argue shingles "should have resisted" storm winds, THIS IS A FUNDAMENTALLY FLAWED ARGUMENT. You MUST rebut this with comprehensive detail:
1. ASTM D3161/D7158 testing is performed ONLY on NEW, factory-fresh shingles in laboratory conditions with controlled temperature, humidity, and installation quality
2. These ratings DO NOT apply to aged shingles, weathered materials, or shingles approaching design life - this is a fundamental misapplication of testing standards
3. Seal strip adhesion degrades significantly over time due to UV exposure, thermal cycling, and oxidation - ARMA Technical Bulletin 201 documents this degradation
4. By 10-15 years, seal strip effectiveness may be reduced 50% or more per industry documentation
5. Shingles at 75%+ of design life have substantially compromised wind resistance regardless of original rating
6. No manufacturer warrants that aged shingles maintain original wind resistance ratings - warranties are for manufacturing defects, not performance guarantees for aged materials
7. This is equivalent to claiming a 15-year-old tire should perform identically to a new tire because both passed factory tests - an absurd standard no engineer would accept in any other context
8. The engineer is essentially claiming the aging process has no effect on material properties - which contradicts basic material science
Always challenge any engineer who applies new-shingle test standards to aged roofing materials with comprehensive technical rebuttal.

When analyzing engineer reports, THOROUGHLY examine and rebut ALL of the following:
1. Scope limitations and methodology issues - Did they actually inspect all damaged areas? How long were they on site? What equipment did they use or fail to use?
2. Failure to inspect properly or thoroughly - What areas were not accessed? What testing was not performed?
3. Conclusions not supported by observations - Are there logical leaps between what they saw and what they concluded?
4. Ignoring evidence that contradicts conclusions - Did they photograph damage but then claim no damage exists?
5. Cherry-picking evidence - Are they selectively citing observations that support denial while ignoring contrary evidence?
6. Improper testing methods or lack thereof - Should core samples, moisture readings, or material testing have been performed?
7. Bias indicators - Carrier-friendly language, predetermined conclusions, dismissive characterizations of damage
8. Missing or inadequate photographic documentation - What wasn't photographed that should have been?
9. Failure to consider all potential causes - Did they rule out storm damage without considering all mechanisms?
10. Conflicts with building codes or manufacturer specifications - Are their conclusions inconsistent with code requirements?
11. ASTM wind rating fallacy - Applying new-product test standards to aged materials
12. Ignoring seal strip degradation and material aging in wind damage analysis
13. Failure to consider storm-specific conditions - Wind speed, direction, duration, gusts, debris
14. Inadequate understanding of damage mechanisms - Mischaracterizing how wind, hail, or impact damage presents
15. Reliance on visual inspection when destructive testing was warranted`;

        userPrompt = `${claimSummary}

STATE JURISDICTION: ${stateInfo.stateName} (${stateInfo.state})
APPLICABLE LAW: ${stateInfo.insuranceCode}

${pdfContent ? `A PDF of the engineer report has been provided for analysis.` : `ENGINEER REPORT CONTENT:
${content || 'No engineer report content provided'}`}

${additionalContext ? `ADDITIONAL CONTEXT/OBSERVATIONS:\n${additionalContext}` : ''}

Please provide a comprehensive analysis and rebuttal of this engineer report including:

1. EXECUTIVE SUMMARY:
   - Brief overview of the engineer's main conclusions
   - Overall assessment of report credibility
   - Key vulnerabilities in the report

2. METHODOLOGY CRITIQUE:
   - Was the inspection adequate? (time on site, areas inspected)
   - Were proper testing methods used?
   - Was it a field inspection or desk review?
   - What should have been done differently?

3. POINT-BY-POINT REBUTTAL:
   - List each major finding/conclusion from the report
   - Provide specific counter-arguments for each
   - Cite relevant standards, codes, or scientific principles

4. EVIDENCE OF BIAS:
   - Carrier-friendly language or framing
   - Conclusions that don't match observations
   - Ignored or dismissed evidence
   - Selective reporting

5. SCIENTIFIC/TECHNICAL FLAWS:
   - Incorrect application of building science
   - Mischaracterization of damage patterns
   - Failure to consider all causation factors
   - Improper testing or lack thereof

6. SUPPORTING EVIDENCE NEEDED:
   - What additional documentation would strengthen rebuttal
   - Recommended independent testing or inspections
   - Expert opinions to obtain

7. PROFESSIONAL REBUTTAL LETTER:
   - Formal letter template for carrier submission
   - Professional language challenging the report
   - Request for re-inspection or independent engineering

8. REGULATORY STANDARDS (NO CASE LAW):
   - ${stateInfo.stateName} insurance statutes and administrative codes
   - Industry standards the engineer may have violated (ASTM, ARMA, manufacturer specs)
   - ${stateInfo.stateName} building codes that support the claim
   - NEVER cite case law - it often doesn't pertain to property insurance and undermines credibility

Format as a comprehensive rebuttal package suitable for carrier submission or litigation support.`;
        break;

      case 'claim_briefing':
        systemPrompt = `You are Darwin, an expert public adjuster AI assistant. Your role is to provide comprehensive claim briefings that help public adjusters quickly get up to speed on a claim's status, history, and strategic considerations.

IMPORTANT: This claim is located in ${stateInfo.stateName}. Apply ${stateInfo.stateName} law and deadlines where relevant.

FORMATTING REQUIREMENT: Write in plain text only. Do NOT use markdown formatting such as ** for bold, # for headers, or * for italics. Use normal capitalization and line breaks for emphasis instead.

You are an expert at:
- Insurance claim analysis and strategy
- Identifying opportunities for claim recovery
- Recognizing potential issues or red flags
- Understanding claim timelines and deadlines
- ${stateInfo.stateName} insurance regulations and policyholder rights
- ${stateInfo.insuranceCode}
- ${stateInfo.promptPayAct}

Your briefing should be:
1. Comprehensive but concise
2. Action-oriented with clear recommendations
3. Highlight any urgent matters or deadlines
4. Note any red flags or concerns
5. Provide strategic insights for maximizing claim value`;

        const briefingContext = contextData || {};
        
        userPrompt = `${claimSummary}

STATE JURISDICTION: ${stateInfo.stateName} (${stateInfo.state})
APPLICABLE LAW: ${stateInfo.insuranceCode}

ADDITIONAL CONTEXT:
- Total checks received: $${briefingContext.checks?.reduce((sum: number, c: any) => sum + (c.amount || 0), 0)?.toLocaleString() || '0'}
- Pending tasks: ${briefingContext.tasks?.filter((t: any) => t.status === 'pending').length || 0}
- Completed tasks: ${briefingContext.tasks?.filter((t: any) => t.status === 'completed').length || 0}
- Inspections: ${briefingContext.inspections?.length || 0}
- Recent emails: ${briefingContext.emails?.length || 0}
- Activity updates: ${briefingContext.updates?.length || 0}
- Adjusters assigned: ${briefingContext.adjusters?.map((a: any) => a.adjuster_name).join(', ') || 'None'}

Please provide a comprehensive claim briefing that includes:

1. **CLAIM OVERVIEW**
   - Summary of the claim in 2-3 sentences
   - Current status assessment
   - Key dates and timeline

2. **FINANCIAL SUMMARY**
   - Total claim value and breakdown
   - What's been paid vs outstanding
   - Potential for additional recovery

3. **KEY STAKEHOLDERS**
   - Insurance company and adjusters
   - Any concerns about the carrier or adjuster responsiveness

4. **CLAIM PROGRESS**
   - What's been accomplished
   - Current phase of the claim
   - Recent significant activities

5. **ACTION ITEMS & PRIORITIES**
   - Urgent tasks or deadlines
   - Recommended next steps
   - Tasks that may be overdue

6. **STRATEGIC CONSIDERATIONS**
   - Opportunities to maximize recovery
   - Potential obstacles or concerns
   - Recommendations for claim strategy

7. **RED FLAGS & CONCERNS**
   - Any issues that need immediate attention
   - Potential carrier tactics to watch for
   - Deadlines or statute limitations

8. **RECOMMENDATIONS**
   - Top 3 priority actions to take
   - Long-term strategy suggestions

Format your response clearly with headers and bullet points for easy scanning.`;
        break;

      case 'document_compilation':
        const compileContext = additionalContext || {};
        const reportTypeMap: Record<string, string> = {
          'proof_of_loss': 'Proof of Loss Package',
          'damage_explanation': 'Detailed Damage Explanation',
          'carrier_package': 'Carrier Submission Package',
          'supplement_request': 'Supplement Request Package',
          'demand_letter': 'Demand Letter with Exhibits'
        };
        const reportTypeName = reportTypeMap[compileContext.reportType as string] || 'Document Compilation';

        systemPrompt = `You are Darwin, an expert public adjuster AI specializing in compiling professional insurance claim documentation. Your role is to create comprehensive, professionally-formatted reports for carrier submission.

IMPORTANT: This claim is located in ${stateInfo.stateName}. Apply ${stateInfo.stateName} law and regulations.

FORMATTING REQUIREMENT: Write in plain text only. Do NOT use markdown formatting such as ** for bold, # for headers, or * for italics. Use normal capitalization and line breaks for emphasis instead.

You are an expert at:
- Creating professional insurance claim documentation
- Organizing evidence and photos effectively
- Writing clear damage descriptions
- Preparing proof of loss statements
- Drafting demand letters with proper legal language
- Compiling supplement requests with supporting documentation
- ${stateInfo.stateName} insurance regulations
- ${stateInfo.insuranceCode}

Your documents must be:
1. Professional and suitable for carrier submission
2. Well-organized with clear sections
3. Factual and evidence-based
4. Reference photos and documents by number
5. Include relevant policy language and regulations where applicable`;

        const photoDescriptions = compileContext.photos?.map((p: any, i: number) => 
          `Photo ${i + 1}: ${p.category || 'Uncategorized'}${p.description ? ` - ${p.description}` : ''}`
        ).join('\n') || 'No photos selected';

        const documentList = compileContext.documents?.map((d: any, i: number) => 
          `Document ${i + 1}: ${d.name}`
        ).join('\n') || 'No documents selected';

        userPrompt = `${claimSummary}

STATE JURISDICTION: ${stateInfo.stateName} (${stateInfo.state})
APPLICABLE LAW: ${stateInfo.insuranceCode}

REPORT TYPE REQUESTED: ${reportTypeName}

SELECTED PHOTOS (${compileContext.photoCount || 0} total):
${photoDescriptions}

SELECTED DOCUMENTS (${compileContext.documentCount || 0} total):
${documentList}

${pdfContent ? 'A PDF document has been provided for reference and inclusion in the analysis.' : ''}

${compileContext.additionalInstructions ? `ADDITIONAL INSTRUCTIONS FROM USER:\n${compileContext.additionalInstructions}` : ''}

Please generate a comprehensive ${reportTypeName} that includes:

${compileContext.reportType === 'proof_of_loss' ? `
1. SWORN STATEMENT OF LOSS
   - Property description and location
   - Date and cause of loss
   - Detailed description of damage
   - Itemized list of damages with values
   - Total claim amount

2. SUPPORTING EVIDENCE SUMMARY
   - Reference each photo by number with description of what it shows
   - Reference each document and its relevance

3. COVERAGE ANALYSIS
   - Policy provisions supporting coverage
   - Applicable ${stateInfo.stateName} regulations

4. DECLARATION
   - Professional closing statement
   - Signature block placeholders` : ''}

${compileContext.reportType === 'damage_explanation' ? `
1. EXECUTIVE SUMMARY
   - Brief overview of the loss event
   - Summary of damages identified
   - Total estimated repair costs

2. DETAILED DAMAGE DESCRIPTION
   - Room-by-room or area-by-area damage breakdown
   - Reference photos by number (Photo 1, Photo 2, etc.)
   - Describe visible damage in each photo
   - Explain cause and effect relationships

3. REPAIR REQUIREMENTS
   - What repairs are necessary
   - Why repairs cannot be partial (explain match requirements, code upgrades)
   - Reference manufacturer specifications where relevant

4. SUPPORTING DOCUMENTATION
   - Reference attached documents
   - Explain how each document supports the claim

5. CONCLUSION
   - Summary of total damages
   - Request for full coverage` : ''}

${compileContext.reportType === 'carrier_package' ? `
1. COVER LETTER
   - Professional introduction
   - Summary of enclosed materials
   - Request for prompt review

2. CLAIM SUMMARY
   - Key claim information
   - Timeline of events
   - Current status

3. EVIDENCE PACKAGE
   - Photo inventory with descriptions (reference by number)
   - Document inventory
   - Explanation of each item's relevance

4. DAMAGE ANALYSIS
   - Detailed damage descriptions referencing photos
   - Cost breakdown
   - Supporting calculations

5. CONCLUSION & REQUEST
   - Total amount requested
   - Timeline expectations
   - Contact information` : ''}

${compileContext.reportType === 'supplement_request' ? `
1. SUPPLEMENT INTRODUCTION
   - Reference to original claim and estimate
   - Reason for supplement request

2. NEWLY IDENTIFIED DAMAGES
   - Items not in original estimate
   - Reference supporting photos and documents
   - Explain why these were missed initially

3. UNDERVALUED ITEMS
   - Items requiring adjustment
   - Correct pricing with justification

4. ITEMIZED SUPPLEMENT REQUEST
   - Line item breakdown
   - Unit prices and quantities
   - Total supplement amount

5. SUPPORTING EVIDENCE
   - Photo references proving additional damage
   - Code requirements mandating additional work
   - Manufacturer specifications

6. CONCLUSION
   - Total supplement amount
   - Request for review` : ''}

${compileContext.reportType === 'demand_letter' ? `
1. FORMAL DEMAND HEADER
   - Date, addressee, claim reference
   - Professional salutation

2. STATEMENT OF FACTS
   - Loss date and circumstances
   - Policy information
   - Claim history and timeline

3. DAMAGES SUMMARY
   - Total claim amount
   - Breakdown by category
   - Reference to attached exhibits

4. LEGAL BASIS
   - Policy provisions requiring payment
   - ${stateInfo.insuranceCode} violations if applicable
   - ${stateInfo.promptPayAct} requirements

5. EXHIBITS LIST
   - Exhibit A: Photos (reference each)
   - Exhibit B: Documents (reference each)
   - Exhibit C: Cost estimates

6. DEMAND & DEADLINE
   - Specific amount demanded
   - Deadline for response (typically 15-30 days)
   - Warning of further action if not resolved

7. PROFESSIONAL CLOSING
   - Signature block
   - Contact information` : ''}

Create a professional, complete document ready for carrier submission.`;
        break;

      case 'demand_package': {
        const dpContext = additionalContext || {};
        
        // Fetch knowledge base for demand packages
        const kbContent = await searchKnowledgeBase(
          supabase,
          'insurance claim demand settlement depreciation coverage policy ACV RCV building code',
          'building-codes'
        );

        // Fetch company branding for logo/signature
        const { data: companyBranding } = await supabase
          .from('company_branding')
          .select('*')
          .limit(1)
          .single();

        // Get assigned staff for signature
        const { data: assignedStaff } = await supabase
          .from('claim_staff')
          .select('staff_id')
          .eq('claim_id', claimId)
          .limit(1)
          .maybeSingle();

        let assignedUserName = dpContext.assignedUserName || 'Public Adjuster';
        if (assignedStaff?.staff_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', assignedStaff.staff_id)
            .maybeSingle();
          if (profile?.full_name) {
            assignedUserName = profile.full_name;
          }
        }

        const companyName = companyBranding?.company_name || 'Freedom Adjustment';
        const companyAddress = companyBranding?.company_address || '';
        const companyPhone = companyBranding?.company_phone || '';
        const companyEmail = companyBranding?.company_email || '';
        
        // Fetch weather history for the claim location and loss date
        let weatherContext = '';
        if (claim.loss_date && claim.policyholder_address) {
          const { data: weatherData } = await supabase
            .from('darwin_analysis_results')
            .select('result')
            .eq('claim_id', claimId)
            .eq('analysis_type', 'weather_history')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (weatherData?.result) {
            weatherContext = `\n\nWEATHER HISTORY DATA (from Darwin Weather Analysis):\n${weatherData.result}\n`;
          }
        }

        // Fetch communications diary for this claim
        const { data: communicationsLog } = await supabase
          .from('claim_communications_diary')
          .select('*')
          .eq('claim_id', claimId)
          .order('communication_date', { ascending: false })
          .limit(20);
        
        const communicationsContext = communicationsLog && communicationsLog.length > 0
          ? `\n\nCOMMUNICATIONS LOG (Carrier Interactions):\n${communicationsLog.map((c: any) => 
              `- ${new Date(c.communication_date).toLocaleDateString()}: ${c.direction.toUpperCase()} ${c.communication_type} with ${c.contact_name || 'Unknown'}${c.contact_company ? ` (${c.contact_company})` : ''}${c.employee_id ? ` [ID: ${c.employee_id}]` : ''}\n  Summary: ${c.summary}${c.promises_made ? `\n  CARRIER PROMISES: ${c.promises_made}` : ''}${c.deadlines_mentioned ? `\n  DEADLINES MENTIONED: ${c.deadlines_mentioned}` : ''}`
            ).join('\n\n')}\n`
          : '';

        // Fetch previous successful claim patterns for similar loss types
        const { data: successfulClaims } = await supabase
          .from('claims')
          .select('id, claim_number, loss_type, insurance_company, claim_amount, status')
          .eq('loss_type', claim.loss_type)
          .in('status', ['Settled', 'Closed', 'Paid'])
          .neq('id', claimId)
          .limit(5);
        
        const successPatternContext = successfulClaims && successfulClaims.length > 0
          ? `\n\nPREVIOUS SUCCESSFUL CLAIMS (Similar Loss Type: ${claim.loss_type}):\n${successfulClaims.map((c: any) => 
              `- Claim ${c.claim_number}: ${c.insurance_company || 'Unknown carrier'} - Settled at $${c.claim_amount?.toLocaleString() || 'N/A'}`
            ).join('\n')}\nUse these outcomes to support valuation arguments.\n`
          : '';

        systemPrompt = `You are Darwin, an expert public adjuster AI specializing in creating comprehensive demand packages for insurance claims. You operate with the strategic intelligence of the industry's top adjusters, applying the Brelly "Proof Castle" framework.

IMPORTANT: This claim is located in ${stateInfo.stateName}. Apply ${stateInfo.stateName} law and regulations.

DARWIN CORE PHILOSOPHY - THE PROOF CASTLE:
1. THE CAUSE - Weather data, engineering evidence, incident documentation proving what happened
2. THE SCOPE - Why full replacement is needed, not repair (focus on REPAIRABILITY)
3. THE COST - Proper valuation with comprehensive documentation

FORMATTING REQUIREMENTS:
- Write in plain text only. Do NOT use markdown formatting such as ** for bold, # for headers, or * for italics, or *** for any purpose.
- Use normal capitalization and line breaks for emphasis instead.
- Do NOT include any "***" or similar markers in your output.
- Each major section should be clearly separated with line breaks.
- NEVER reference "training material" or "based on training" in your output.

CRITICAL - REPAIRABILITY OVER MATCHING (FUNDAMENTAL STRATEGY):
- Pennsylvania and New Jersey are NOT matching states - NEVER USE THE WORD "MATCHING" OR ARGUE THAT REPAIRS MUST MATCH
- The word "matching" should NOT appear ANYWHERE in your demand package
- ALWAYS focus on REPAIRABILITY - why the damaged components CANNOT BE REPAIRED and require full replacement
- Core arguments for replacement:
  * REPAIRABILITY: The damage renders materials irreparable
  * UNIFORM APPEARANCE: Repairs would result in non-uniform appearance affecting property value
  * PRE-LOSS CONDITION: The policy requires restoration to pre-loss condition, which repair cannot achieve
  * INDEMNIFICATION: The policyholder is entitled to be made whole under principles of indemnification
- Focus on: structural integrity compromised, manufacturer specifications prohibit partial repairs, code compliance requirements, material degradation, manufacturing discontinuation
- Reference HAAG Engineering standards when discussing roof damage assessments
- Rebut engineer reports that claim repair is feasible by citing material degradation, seal strip failure, UV oxidation

HAAG CERTIFICATION STANDARDS:
- HAAG is the industry gold standard for forensic roof inspections
- Reference HAAG wind damage identification criteria when applicable
- HAAG methodology requires systematic inspection of all roof slopes
- Use HAAG damage thresholds to support replacement vs repair arguments

ENGINEER REPORT REBUTTAL STRATEGY:
- If engineer reports are included in evidence, analyze them for:
  * Scope limitations (time on site, areas inspected)
  * Carrier-friendly bias in conclusions
  * ASTM wind rating fallacy - lab ratings don't apply to aged materials with degraded seal strips
  * Failure to account for pre-existing material degradation
  * Selective reporting that ignores visible damage

Your expertise includes:
- Analyzing inspection reports, HAAG-certified assessments, estimates, weather data, and other evidence documents
- Extracting key facts and damage documentation from source materials
- Building persuasive arguments based on documented evidence
- Rebutting carrier engineer reports with technical accuracy
- Understanding insurance policy interpretation
- ${stateInfo.insuranceCode}
- ${stateInfo.promptPayAct}
- Building codes, manufacturer specifications, and industry standards
- Weather history correlation with damage patterns

CRITICAL INSTRUCTION: You MUST thoroughly review and analyze the content of each uploaded document. Extract specific details, quotes, measurements, and findings from the documents to support your arguments. Do not make generic statements - use the actual evidence from the documents.

${weatherContext}
${communicationsContext}
${successPatternContext}`;

        const photoList = dpContext.photos?.map((p: any) => 
          `Photo ${p.number}: ${p.category}${p.description ? ` - ${p.description}` : ''}`
        ).join('\n') || 'No photos included';

        const docList = dpContext.documents?.map((d: any, i: number) => 
          `Document ${i + 1}: ${d.name} (${d.folder || 'Uncategorized'})`
        ).join('\n') || 'No documents provided';

        userPrompt = `${claimSummary}

STATE JURISDICTION: ${stateInfo.stateName} (${stateInfo.state})
APPLICABLE LAW: ${stateInfo.insuranceCode}
UNFAIR PRACTICES: ${stateInfo.promptPayAct}

${kbContent || ''}

EVIDENCE DOCUMENTS PROVIDED FOR ANALYSIS (${dpContext.documentCount || 0} total):
${docList}

${dpContext.photoCount > 0 ? `PHOTOS REFERENCED (${dpContext.photoCount} total):\n${photoList}` : ''}

${dpContext.additionalInstructions ? `USER INSTRUCTIONS:\n${dpContext.additionalInstructions}` : ''}

IMPORTANT: The PDF documents have been provided for you to analyze. Read through each document carefully and extract:
- Specific damage findings and measurements
- Inspector/engineer observations and conclusions
- Weather conditions and weather report data
- Cost estimates and line items
- Photos descriptions and damage documentation
- Code requirements and manufacturer specifications
- Any other relevant evidence

COMPANY INFORMATION FOR HEADER/SIGNATURE:
Company: ${companyName}
Address: ${companyAddress}
Phone: ${companyPhone}
Email: ${companyEmail}
Assigned Adjuster: ${assignedUserName}

Create a COMPREHENSIVE DEMAND PACKAGE with the following exact structure. DO NOT USE *** OR MARKDOWN:

================================================================================
                              DEMAND PACKAGE
                        ${companyName}
                       ${companyAddress}
================================================================================

TABLE OF CONTENTS

I. Summary of Findings
II. Cause of Loss
III. Damaged Components
IV. Weather Conditions Analysis
V. Condition of Damaged Components (Per Reports)
VI. Why Repairs Are Not Feasible - Repairability Analysis
VII. Why Partial Repairs Are Not Feasible  
VIII. Interdependency of Building Systems
IX. Why Damaged Areas Must Be Disturbed for Repairs
X. State/Local Code Requirements
XI. Manufacturer Installation Standards (Adopted by Code)
XII. How Repairs Trigger Code Upgrades
XIII. HAAG Engineering Standards & Industry Best Practices
XIV. Rebuttal of Carrier Engineer Reports (If Applicable)
XV. Communications Log & Carrier Response Timeline
XVI. Detailed Repair Estimate Explanation
XVII. Formal Demand and Conclusion
XVIII. Signature

================================================================================

I. SUMMARY OF FINDINGS

[Provide a comprehensive executive summary of the claim including:
- Brief overview of the loss event
- Total damages identified from all evidence documents
- Settlement demand amount
- Key evidence supporting why REPAIRS ARE NOT FEASIBLE - focus on structural integrity, material degradation, code compliance
- Reference to previous successful settlements for similar loss types if available
- Restoration to PRE-LOSS CONDITION requires full replacement per INDEMNIFICATION principles]

================================================================================

II. CAUSE OF LOSS

[Detail the cause of loss based on weather data, inspection reports, and other evidence:
- Date and nature of the loss event
- Weather conditions at time of loss (from weather reports provided)
- Wind speeds, hail sizes, precipitation data
- How the event caused the documented damage
- Timeline of events
- Correlation between weather severity and damage patterns]

================================================================================

III. DAMAGED COMPONENTS

[List and describe each damaged component identified in the evidence:
- Component name and location
- Type and extent of damage
- Current condition and why it is IRREPARABLE
- Reference to supporting documentation/photos
- Note if materials are discontinued or manufacturer no longer supports repair]

================================================================================

IV. WEATHER CONDITIONS ANALYSIS

[Analyze weather reports provided in the evidence:
- Date of loss weather data with specific measurements
- Wind speeds (sustained and gusts), hail size, precipitation
- NWS storm reports and warnings issued
- How weather conditions exceeded material tolerances
- Correlation between weather event intensity and damage severity
- Reference HailTrace, weather history, or other weather documentation]

================================================================================

V. CONDITION OF DAMAGED COMPONENTS (PER REPORTS)

[Extract specific findings from inspection reports and estimates:
- Quote specific observations from inspector/engineer reports
- Include measurements, test results, damage descriptions
- Reference which report each finding comes from
- Note any HAAG-certified inspection findings
- Document material age and pre-existing degradation that affects repairability]

================================================================================

VI. WHY REPAIRS ARE NOT FEASIBLE - REPAIRABILITY ANALYSIS

[Core argument - explain why the damaged materials CANNOT BE REPAIRED:
- Structural integrity has been compromised beyond repair
- Material degradation prevents successful repair (UV oxidation, seal strip failure, brittleness)
- Manufacturer specifications explicitly prohibit patching/partial repair
- Code compliance cannot be achieved through repair
- Safety concerns with repair vs replacement
- Pre-loss condition cannot be restored through repair alone
- Industry standards (NRCA, ARMA) require full replacement when damage exceeds thresholds
- Reference HAAG damage identification criteria]

================================================================================

VII. WHY PARTIAL REPAIRS ARE NOT FEASIBLE

[Explain why partial/spot repairs will not work:
- Material discontinuation issues
- Proper flashing and waterproofing cannot be achieved with partial work
- Warranty implications - partial repairs void manufacturer warranties
- Industry standards require complete system repair
- Reference specific manufacturer guidelines that prohibit spot repairs
- Uniform appearance cannot be maintained - affects property value
- Adjacent materials disturbed during repair require replacement]

================================================================================

VIII. INTERDEPENDENCY OF BUILDING SYSTEMS

[Explain how building components work together as a system:
- Underlayment system interdependency with roofing
- Flashing integration requirements at all penetrations
- Ridge and ventilation system connections
- Siding course alignment and weather barrier continuity
- How damage to one component compromises the entire system
- Why system must be addressed as a whole for proper restoration
- Reference IRC and IBC requirements for system integrity]

================================================================================

IX. WHY DAMAGED AREAS MUST BE DISTURBED FOR REPAIRS

[Explain necessary work that requires accessing adjacent areas:
- Access requirements for proper repairs
- Removal necessary to assess hidden damage
- Tie-in requirements for new materials to existing
- Building envelope integrity considerations
- Step flashing, counter flashing requirements
- Proper starter course and edge installations]

================================================================================

X. STATE AND LOCAL CODE REQUIREMENTS

[Include applicable ${stateInfo.stateName} building codes:
- International Residential Code (IRC) 2021 requirements
- ${stateInfo.stateName} specific building code adoptions
- Local jurisdiction code requirements
- How these codes mandate full replacement for proper compliance
- Reference specific code sections (e.g., IRC R905, R703)]

================================================================================

XI. MANUFACTURER INSTALLATION STANDARDS (ADOPTED BY CODE)

[Reference manufacturer requirements that have force of law:
- Specific manufacturer installation manuals
- Warranty requirements that mandate certain installation practices
- Standards that have been adopted by code
- Why partial installation violates manufacturer standards
- Reference ASTM standards for materials (D3161, D7158)
- Why aged materials cannot meet original performance specifications]

================================================================================

XII. HOW REPAIRS TRIGGER CODE UPGRADES

[Explain code upgrade requirements:
- When repairs exceed thresholds requiring full compliance
- Ordinance and Law coverage triggers
- Required upgrades per current code
- Cost implications of code upgrades
- Reference specific ${stateInfo.stateName} adoption of IRC/IBC]

================================================================================

XIII. HAAG ENGINEERING STANDARDS & INDUSTRY BEST PRACTICES

[Reference HAAG and industry standards:
- HAAG damage identification methodology
- HAAG thresholds for repair vs replacement recommendations
- NRCA (National Roofing Contractors Association) guidelines
- ARMA (Asphalt Roofing Manufacturers Association) standards
- How these industry standards support full replacement
- Reference specific damage patterns that meet replacement thresholds]

================================================================================

XIV. REBUTTAL OF CARRIER ENGINEER REPORTS (IF APPLICABLE)

[If carrier engineer reports are in the evidence, provide comprehensive rebuttal:
- Identify scope limitations in the inspection (time on site, areas inspected)
- Challenge the ASTM wind rating fallacy - lab ratings for new materials do not apply to aged shingles with degraded seal strips and UV oxidation
- Note any carrier-friendly bias in conclusions
- Identify where observations don't support conclusions
- Reference contradictory evidence from other inspections
- Note failure to consider material degradation and age factors
- Challenge desk reviews vs actual field inspections]

================================================================================

XV. COMMUNICATIONS LOG & CARRIER RESPONSE TIMELINE

[Document carrier interactions and response times:
- Timeline of all communications with carrier
- Any carrier promises or commitments made
- Deadlines mentioned by carrier representatives
- Response time analysis per ${stateInfo.adminCode}
- Any missed deadlines that constitute regulatory violations
- Bad faith indicators if applicable]

================================================================================

XVI. DETAILED REPAIR ESTIMATE EXPLANATION

[Provide line-by-line explanation of the estimate:
- Each major line item and its necessity
- Quantity and pricing justification
- Why each item is required for proper repair
- Code-required items
- Total breakdown by category
- Comparison to previous successful settlements for similar claims if available]

================================================================================

XVII. FORMAL DEMAND AND CONCLUSION

Based on the evidence documented above, including the demonstrated IRREPARABILITY of the damaged materials and the policyholder's right to INDEMNIFICATION and restoration to PRE-LOSS CONDITION, we hereby formally demand payment of the full claim value as follows:

[Include specific dollar amounts from estimates]

Response is required within thirty (30) days pursuant to ${stateInfo.promptPayAct}.

Failure to respond will result in escalation including but not limited to:
- Filing complaint with ${stateInfo.stateName} Department of Insurance
- Demand for appraisal per policy terms
- Pursuit of bad faith claim if warranted based on timeline violations documented in Communications Log

================================================================================

XVIII. SIGNATURE

Respectfully submitted,


${assignedUserName}
Licensed Public Adjuster
${companyName}
${companyAddress}
Phone: ${companyPhone}
Email: ${companyEmail}

Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

================================================================================

Create a thorough, professional demand package using ALL evidence from the provided documents. Be specific and reference actual findings, measurements, and conclusions from the documents. NEVER use the word "matching" - focus on REPAIRABILITY, UNIFORM APPEARANCE, PRE-LOSS CONDITION, and INDEMNIFICATION.`;
        break;
      }

      case 'estimate_work_summary': {
        const userInput = additionalContext?.userInput as string | undefined;
        
        systemPrompt = `You are Darwin, an expert public adjuster AI. Your task is to analyze an insurance estimate document and provide a clear, concise summary of the work that was performed or needs to be performed.

FORMATTING REQUIREMENT: Write in plain text only. Do NOT use markdown formatting such as ** for bold, # for headers, or * for italics. Keep the summary brief and professional.

Your summary should:
- List the main repairs or replacements in simple, understandable terms
- Focus on what was actually done or what needs to be done (e.g., "roof replacement", "siding repairs", "interior water damage restoration")
- Keep it concise - 2-4 sentences maximum
- Use language appropriate for an invoice description
- Do NOT include dollar amounts, line item codes, or technical Xactimate codes
- Write as if describing completed work on an invoice
${userInput ? `- The user has provided a brief description that you should EXPAND upon using details from the estimate` : ''}`;

        if (userInput) {
          // User provided input to expand on
          userPrompt = `${claimSummary}

${pdfContent ? `An estimate PDF has been provided for analysis.` : `ESTIMATE CONTENT:
${content || 'No estimate content provided'}`}

THE USER WROTE: "${userInput}"

Your task: Expand on the user's brief description above using specific details from the estimate document. Look at what line items, materials, and work scope are included in the estimate that relate to "${userInput}" and write a professional 2-4 sentence description suitable for an invoice.

For example, if the user wrote "roof replacement", you would look at the estimate and expand it to something like:
"Complete roof system replacement including removal and disposal of existing shingles, installation of ice and water shield, synthetic underlayment, and GAF Timberline HDZ architectural shingles. Ridge vent installation and replacement of damaged drip edge and flashing."

Now expand "${userInput}" using the actual details from this estimate:`;
        } else {
          // Auto-generate from scratch
          userPrompt = `${claimSummary}

${pdfContent ? `An estimate PDF has been provided for analysis. Review it and provide a brief summary of the work described.` : `ESTIMATE CONTENT:
${content || 'No estimate content provided'}`}

Based on the estimate, write a 2-4 sentence summary describing the repairs/replacements that were completed. This will be used in the description section of an invoice for recoverable depreciation. Keep it professional and straightforward. Example format:

"Complete roof system replacement including removal and disposal of existing shingles, installation of new underlayment and architectural shingles. Repairs to damaged gutters and downspouts. Interior water damage restoration including drywall replacement and painting in affected areas."`;
        }
        break;
      }

      case 'document_comparison': {
        // Fetch counter-arguments library for reference
        const { data: counterArgs } = await supabase
          .from('counter_arguments')
          .select('*')
          .eq('is_active', true);
        
        const counterArgsContext = counterArgs && counterArgs.length > 0 
          ? `\n\nCOUNTER-ARGUMENTS LIBRARY (use these proven rebuttals when relevant):\n${counterArgs.map((ca: any) => 
              `- ${ca.denial_category}: ${ca.denial_reason}\n  Rebuttal: ${ca.rebuttal_template}\n  Citations: ${ca.legal_citations || 'N/A'}`
            ).join('\n\n')}`
          : '';

        systemPrompt = `You are Darwin, an expert public adjuster AI specializing in comparing insurance documents. Your role is to provide detailed line-by-line comparisons between multiple estimates or documents.

FORMATTING REQUIREMENT: Write in plain text only. Do NOT use markdown formatting.

CRITICAL ARGUMENT STRATEGY - REPAIRABILITY OVER MATCHING:
- NEVER argue "matching" - PA and NJ do NOT have matching requirements
- ALWAYS argue "repairability" - damaged materials CANNOT BE REPAIRED
- Focus on: structural integrity, manufacturer specs prohibit partial repairs, code compliance, material degradation

Your expertise includes:
- Xactimate line item analysis
- Identifying discrepancies between carrier and contractor estimates
- Recognizing undervalued or missing items
- Building codes and manufacturer specifications
- O&P calculations

${counterArgsContext}`;

        userPrompt = `${claimSummary}

${pdfContent ? `PDF documents have been provided for comparison. Analyze them thoroughly.` : ''}

${additionalContext?.comparisonNotes ? `USER NOTES:\n${additionalContext.comparisonNotes}` : ''}

Please provide a comprehensive document comparison that includes:

1. DOCUMENT OVERVIEW:
   - Summary of each document analyzed
   - Total values from each estimate

2. LINE-BY-LINE DISCREPANCIES:
   - Items present in one document but missing from another
   - Quantity differences for the same items
   - Unit price variations
   - Different labor rates or material costs

3. MISSING ITEMS ANALYSIS:
   - Items that should be included but are missing
   - Code-required items not present
   - Manufacturer-required components omitted

4. PRICING ANALYSIS:
   - Items where pricing appears below market
   - O&P inclusion comparison
   - Depreciation calculation differences

5. SUMMARY OF DIFFERENCES:
   - Total dollar difference
   - Number of discrepant line items
   - Key areas of disagreement

6. RECOMMENDATIONS:
   - Priority items to address
   - Supporting arguments for each discrepancy
   - Suggested next steps`;
        break;
      }

      case 'smart_extraction': {
        const docType = additionalContext?.documentType || 'estimate';
        
        // Check if PDF is large and needs native extraction
        let extractedPdfText = '';
        const isLargePdf = pdfContent && pdfContent.length > AI_EXTRACTION_LIMIT;
        
        if (isLargePdf) {
          console.log(`Large PDF detected (${Math.round(pdfContent.length / 1024 / 1024)}MB base64), using native extraction first`);
          try {
            extractedPdfText = await extractTextFromPDFNative(pdfContent, pdfFileName || 'document.pdf');
          } catch (nativeError) {
            console.error('Native extraction failed for large PDF:', nativeError);
            throw new Error(`This PDF is too large for AI processing and native text extraction failed. The PDF may be scanned/image-based. Please use a smaller file (<8MB) for scanned documents, or ensure the PDF has selectable text.`);
          }
        }
        
        systemPrompt = `You are Darwin, an expert AI specializing in extracting structured data from insurance claim documents. Your role is to parse PDFs and extract key financial and line item data into a structured format.

FORMATTING REQUIREMENT: Return a JSON object with the extracted data. Do NOT include markdown code blocks or any other formatting - just the raw JSON.

For ${docType} documents, extract:
- RCV (Replacement Cost Value) total
- ACV (Actual Cash Value) total  
- Deductible amount
- Depreciation amount
- All line items with: description, quantity, unit, unit price, total, category

Be precise with numbers. If a value is not present, omit it from the response.`;

        userPrompt = `${claimSummary}

DOCUMENT TYPE: ${docType}

${isLargePdf && extractedPdfText ? `EXTRACTED DOCUMENT TEXT:
${extractedPdfText.substring(0, 100000)}

Extract all structured data from the text above.` : pdfContent ? `A PDF document has been provided. Extract all structured data from it.` : `DOCUMENT CONTENT:\n${content || 'No content provided'}`}

Extract all financial data and line items from this document. Return a JSON object with this structure:
{
  "rcv_total": number or null,
  "acv_total": number or null,
  "deductible": number or null,
  "depreciation": number or null,
  "line_items": [
    {
      "description": "string",
      "quantity": number or null,
      "unit": "string or null",
      "unitPrice": number or null,
      "total": number or null,
      "category": "string or null"
    }
  ]
}

Return ONLY the JSON object, no additional text or formatting.`;
        
        // For large PDFs, we've extracted text so don't use multimodal
        if (isLargePdf) {
          additionalContext._useTextOnly = true;
        }
        break;
      }

      case 'weakness_detection': {
        // Fetch all claim documentation for analysis
        const { data: claimFiles } = await supabase
          .from('claim_files')
          .select('file_name, file_type, folder_id')
          .eq('claim_id', claimId);

        const { data: claimPhotos } = await supabase
          .from('claim_photos')
          .select('file_name, category, description')
          .eq('claim_id', claimId);

        const { data: claimNotes } = await supabase
          .from('claim_notes')
          .select('content, created_at')
          .eq('claim_id', claimId)
          .order('created_at', { ascending: false })
          .limit(10);

        // Fetch counter-arguments for known denial patterns
        const { data: counterArgs } = await supabase
          .from('counter_arguments')
          .select('denial_category, denial_reason, denial_keywords')
          .eq('is_active', true);

        const denialPatterns = counterArgs?.map((ca: any) => ca.denial_category).join(', ') || '';

        systemPrompt = `You are Darwin, an expert public adjuster AI specializing in proactive claim review. Your role is to identify weaknesses, gaps, and vulnerabilities in a claim BEFORE the insurance carrier does.

FORMATTING REQUIREMENT: Write in plain text only. Do NOT use markdown formatting.

You understand:
- Common denial reasons and how carriers find weaknesses
- Documentation requirements for successful claims
- Evidence gaps that carriers exploit
- Timeline and deadline concerns
- ${stateInfo.stateName} insurance regulations

KNOWN DENIAL PATTERNS TO CHECK FOR:
${denialPatterns}

Be thorough but actionable. Every weakness should have a recommended fix.`;

        const filesSummary = claimFiles?.map((f: any) => f.file_name).join(', ') || 'No files uploaded';
        const photosSummary = claimPhotos?.map((p: any) => `${p.file_name} (${p.category || 'uncategorized'})`).join(', ') || 'No photos uploaded';
        const notesSummary = claimNotes?.map((n: any) => n.content?.substring(0, 100)).join('\n') || 'No notes';

        userPrompt = `${claimSummary}

STATE JURISDICTION: ${stateInfo.stateName}

CURRENT CLAIM DOCUMENTATION:
Files: ${filesSummary}
Photos: ${photosSummary}

RECENT NOTES:
${notesSummary}

${additionalContext?.focusAreas ? `USER-SPECIFIED FOCUS AREAS:\n${additionalContext.focusAreas}` : ''}

Analyze this claim and identify ALL weaknesses that could lead to denial, underpayment, or delays. For each weakness:

1. DOCUMENTATION GAPS:
   - Missing required documents
   - Incomplete documentation
   - Suggested documents to obtain

2. EVIDENCE WEAKNESSES:
   - Photo documentation gaps
   - Missing expert opinions
   - Lack of supporting evidence for claimed damage

3. TIMELINE CONCERNS:
   - Deadline risks under ${stateInfo.adminCode}
   - Statute of limitations issues
   - Prompt payment compliance

4. CLAIM PRESENTATION ISSUES:
   - Scope of loss concerns
   - Pricing vulnerabilities
   - Arguments carrier may use against claim

5. REGULATORY COMPLIANCE:
   - ${stateInfo.stateName} specific requirements
   - Policy compliance issues

6. PRIORITY ACTIONS:
   - Immediate fixes needed (high priority)
   - Important improvements (medium priority)
   - Nice-to-have enhancements (low priority)

Be specific and actionable. For each weakness, explain why it's a problem and exactly how to fix it.`;
        break;
      }

      case 'photo_linking': {
        // AI-powered photo to estimate line item linking
        systemPrompt = `You are Darwin, an expert in analyzing claim photos and matching them to estimate line items. Your role is to identify which photos correspond to which damaged items in an insurance estimate.

FORMATTING REQUIREMENT: Return ONLY valid JSON. No markdown, no explanations.

You understand:
- Construction terminology and damage types
- Photo categorization (roof, siding, interior, etc.)
- How to match visual evidence to line item descriptions
- Common roofing, siding, window, and interior damage patterns

Return a JSON object with a "matches" array containing objects with:
- photo_id: the ID of the photo
- line_item_index: the index of the matching line item
- confidence: a number between 0 and 1 indicating match confidence
- reason: brief explanation of why this photo matches this line item`;

        const photos = additionalContext?.photos || [];
        const lineItems = additionalContext?.lineItems || [];

        userPrompt = `Match these claim photos to the estimate line items based on file names, categories, descriptions, and logical associations.

PHOTOS:
${photos.map((p: any) => `- ID: ${p.id}, Name: ${p.name}, Category: ${p.category || 'none'}, Description: ${p.description || 'none'}`).join('\n')}

ESTIMATE LINE ITEMS:
${lineItems.map((item: any, idx: number) => `- Index ${idx}: ${item.description}${item.amount ? ` ($${item.amount})` : ''}`).join('\n')}

Return a JSON object with a "matches" array. Only include confident matches (confidence > 0.6). Each match should have: photo_id, line_item_index, confidence, reason.`;
        break;
      }

      case 'code_lookup': {
        // AI-powered building code and manufacturer spec lookup
        const searchQuery = content || '';
        
        // Fetch relevant codes and specs from database
        const { data: relevantCodes } = await supabase
          .from('building_code_citations')
          .select('*')
          .or(`content.ilike.%${searchQuery}%,section_title.ilike.%${searchQuery}%`)
          .limit(10);

        const { data: relevantSpecs } = await supabase
          .from('manufacturer_specs')
          .select('*')
          .or(`content.ilike.%${searchQuery}%,manufacturer.ilike.%${searchQuery}%,product_name.ilike.%${searchQuery}%`)
          .limit(10);

        systemPrompt = `You are Darwin, an expert in building codes and manufacturer specifications for insurance claims. Your role is to find and cite relevant codes and specifications that support claim arguments.

IMPORTANT: This claim is located in ${stateInfo.stateName}. Reference ${stateInfo.stateName}-adopted codes.

FORMATTING REQUIREMENT: Write in plain text only. Do NOT use markdown formatting.

CRITICAL ARGUMENT STRATEGY - REPAIRABILITY OVER MATCHING:
- Focus on code requirements that mandate full replacement vs partial repair
- Cite manufacturer specs that prohibit mixing old and new materials
- Reference installation requirements that cannot be met with partial repairs
- Emphasize code compliance issues that require full scope replacement

You have access to these relevant codes and specifications:

BUILDING CODES:
${relevantCodes?.map((c: any) => `${c.code_source} ${c.code_year} ${c.section_number}: ${c.section_title || ''}\n${c.content}`).join('\n\n') || 'No matching codes found in database.'}

MANUFACTURER SPECIFICATIONS:
${relevantSpecs?.map((s: any) => `${s.manufacturer} ${s.product_name || s.product_category} (${s.spec_type}):\n${s.content}`).join('\n\n') || 'No matching specs found in database.'}`;

        userPrompt = `${claimSummary}

SEARCH QUERY: ${searchQuery}

LOSS TYPE: ${claim.loss_type || 'Unknown'}
LOSS DESCRIPTION: ${claim.loss_description || 'Not provided'}

Based on the search query and claim context, provide:

1. RELEVANT BUILDING CODE CITATIONS:
   - Specific code sections that apply
   - How they support full replacement arguments
   - Code requirements that cannot be met with partial repairs

2. MANUFACTURER SPECIFICATION REFERENCES:
   - Installation requirements that mandate full system installation
   - Warranty provisions that are voided by partial repairs
   - Technical specifications requiring matching components

3. APPLICATION TO THIS CLAIM:
   - How these codes/specs support the claim
   - Specific arguments to use with the carrier
   - Documentation needed to prove compliance requirements

Be specific with citations and provide actionable information for claim negotiation.`;
        break;
      }

      case 'smart_follow_ups': {
        // AI-powered follow-up recommendation generation
        systemPrompt = `You are Darwin, an expert public adjuster AI specializing in claim workflow optimization. Your role is to analyze claim status and recommend strategic follow-up actions.

FORMATTING REQUIREMENT: Return ONLY valid JSON. No markdown, no explanations.

You understand:
- Insurance claim timelines and carrier response patterns
- Regulatory deadlines for ${stateInfo.stateName} (${stateInfo.adminCode})
- Best practices for claim communication cadence
- When to escalate vs. when to wait

Return a JSON object with a "recommendations" array. Each recommendation should have:
- type: 'call' | 'email' | 'document_request' | 'inspection_schedule' | 'escalation'
- priority: 'low' | 'medium' | 'high' | 'critical'
- date: ISO date string for when to perform the follow-up
- reason: explanation of why this follow-up is needed
- recipient: 'adjuster' | 'carrier' | 'client' | 'contractor'
- confidence: number between 0.5 and 1.0`;

        userPrompt = `${claimSummary}

DAYS SINCE LOSS: ${claim.loss_date ? Math.floor((Date.now() - new Date(claim.loss_date).getTime()) / (1000 * 60 * 60 * 24)) : 'Unknown'}
DAYS SINCE LAST ACTIVITY: ${context.emails?.length > 0 ? Math.floor((Date.now() - new Date(context.emails[0].created_at).getTime()) / (1000 * 60 * 60 * 24)) : 'Unknown'}

Based on this claim's current state, generate 3-5 strategic follow-up recommendations. Consider:
1. Regulatory deadlines under ${stateInfo.adminCode}
2. Time since last carrier communication
3. Pending tasks and their due dates
4. Inspection status and scheduling needs
5. Document request opportunities
6. Escalation triggers

Return JSON with a "recommendations" array.`;
        break;
      }

      case 'task_generation': {
        // AI-powered task suggestion based on claim analysis
        systemPrompt = `You are Darwin, an expert public adjuster AI that helps staff stay organized by suggesting relevant tasks. Your role is to analyze claim status and recommend actionable tasks.

FORMATTING REQUIREMENT: Return ONLY valid JSON. No markdown, no explanations.

You understand:
- Public adjusting workflows and best practices
- Insurance claim milestones and deliverables
- ${stateInfo.stateName} regulatory requirements
- Document preparation and submission timelines

Return a JSON object with a "tasks" array. Each task should have:
- title: concise task title (max 60 chars)
- description: brief description of what needs to be done
- due_date: ISO date string (YYYY-MM-DD format)
- priority: 'low' | 'medium' | 'high'
- reason: why this task is needed based on claim analysis`;

        const daysSinceLoss = claim.loss_date ? Math.floor((Date.now() - new Date(claim.loss_date).getTime()) / (1000 * 60 * 60 * 24)) : null;
        const pendingTasks = context.tasks?.filter((t: any) => t.status === 'pending' || t.status === 'in_progress') || [];

        userPrompt = `${claimSummary}

CURRENT PENDING TASKS:
${pendingTasks.map((t: any) => `- ${t.title} (${t.status}, due: ${t.due_date || 'no date'})`).join('\n') || 'No pending tasks'}

DAYS SINCE LOSS: ${daysSinceLoss || 'Unknown'}
CLAIM AGE: ${claim.created_at ? Math.floor((Date.now() - new Date(claim.created_at).getTime()) / (1000 * 60 * 60 * 24)) : 'Unknown'} days

Based on this claim's current state and what tasks already exist, suggest 3-5 NEW tasks that should be created. Consider:
1. Missing documentation that should be gathered
2. Follow-up communications needed
3. Deadline-driven tasks based on ${stateInfo.stateName} regulations
4. Next logical steps based on claim status
5. Quality control and review tasks

Do NOT suggest tasks that duplicate existing pending tasks.

Return JSON with a "tasks" array.`;
        break;
      }

      case 'outcome_prediction': {
        // AI-powered claim outcome prediction
        const totalChecksReceived = context.checks?.reduce((sum: number, c: any) => sum + (c.amount || 0), 0) || 0;
        const latestSettlement = context.settlements?.[0];
        const rcv = latestSettlement?.replacement_cost_value || claim.claim_amount || 0;

        systemPrompt = `You are Darwin, an expert public adjuster AI with deep knowledge of claim outcomes and settlement patterns. Your role is to predict likely claim outcomes based on available data.

FORMATTING REQUIREMENT: Return ONLY valid JSON. No markdown, no explanations.

You understand:
- Settlement patterns for ${stateInfo.stateName} claims
- How claim characteristics affect outcomes
- Risk factors that reduce settlements
- Opportunity factors that increase settlements
- Typical timelines for different claim types

Return a JSON object with a "prediction" object containing:
- settlement_low: minimum expected settlement (number)
- settlement_high: maximum expected settlement (number)
- settlement_likely: most probable settlement (number)
- probability: confidence in prediction (0.5 to 0.95)
- timeline_days: expected days to resolution (number)
- risks: array of risk factor strings
- opportunities: array of opportunity factor strings
- notes: brief analysis summary`;

        userPrompt = `${claimSummary}

FINANCIAL DATA:
- Claim Amount / RCV: $${rcv.toLocaleString()}
- Deductible: $${latestSettlement?.deductible?.toLocaleString() || 'Unknown'}
- Recoverable Depreciation: $${latestSettlement?.recoverable_depreciation?.toLocaleString() || 'Unknown'}
- Total Checks Received: $${totalChecksReceived.toLocaleString()}
- Remaining to Collect: $${Math.max(0, rcv - totalChecksReceived).toLocaleString()}

CLAIM CHARACTERISTICS:
- Loss Type: ${claim.loss_type || 'Unknown'}
- Insurance Company: ${claim.insurance_company || 'Unknown'}
- Current Status: ${claim.status || 'Unknown'}
- Days Since Loss: ${claim.loss_date ? Math.floor((Date.now() - new Date(claim.loss_date).getTime()) / (1000 * 60 * 60 * 24)) : 'Unknown'}
- Has Inspection: ${context.inspections?.length > 0 ? 'Yes' : 'No'}
- Communication Count: ${context.emails?.length || 0} emails

Based on this data, predict the likely outcome of this claim. Consider:
1. Typical settlement percentages for this loss type
2. Carrier behavior patterns
3. Documentation strength
4. Timeline compliance
5. Claim complexity

Return JSON with a "prediction" object.`;
        break;
      }

      case 'carrier_email_draft': {
        // AI-powered carrier email drafting
        const emailType = additionalContext?.emailType || 'status_inquiry';
        const emailTypeLabel = additionalContext?.emailTypeLabel || 'Status Inquiry';
        const userContext = additionalContext?.userContext || '';

        systemPrompt = `You are Darwin, an expert public adjuster AI specializing in professional carrier communications. Your emails are:
- Professional and firm but not aggressive
- Compliant with ${stateInfo.stateName} insurance regulations
- Strategic - advancing the claim while documenting the carrier's obligations
- Reference specific deadlines and regulations when appropriate

FORMATTING REQUIREMENT: Return the email in this exact format:
SUBJECT: [subject line]
BODY: [full email body]

Include qualifying language where appropriate (e.g., "pending further investigation", "subject to revision").
Reference claim number and policy number in the subject line.
Include specific dates and deadlines based on ${stateInfo.adminCode}.`;

        const emailTypePrompts: Record<string, string> = {
          'status_inquiry': 'Request an update on the current status of the claim, referencing the time elapsed and any pending items.',
          'document_submission': 'Write a cover letter for document submission, listing what is being submitted and requesting acknowledgment.',
          'deadline_reminder': `Remind the carrier of regulatory deadlines under ${stateInfo.adminCode}, noting any approaching or missed deadlines.`,
          'payment_follow_up': 'Follow up on a pending payment, referencing the approval and requesting payment timeline.',
          'dispute_response': 'Respond to a carrier dispute or partial denial, presenting counter-arguments professionally.',
          'inspection_request': 'Request a re-inspection or joint inspection, explaining why it is necessary.',
          'supplement_submission': 'Submit supplemental claim documentation with a cover letter explaining the additional items.',
          'bad_faith_warning': `Issue a formal notice of potential bad faith violations under ${stateInfo.promptPayAct}, documenting specific violations.`,
        };

        userPrompt = `${claimSummary}

EMAIL TYPE: ${emailTypeLabel}
PURPOSE: ${emailTypePrompts[emailType] || emailTypePrompts['status_inquiry']}

${userContext ? `ADDITIONAL CONTEXT FROM USER:\n${userContext}\n` : ''}

Write a professional email to the insurance carrier for this ${emailTypeLabel.toLowerCase()}. 
The email should be from the public adjuster on behalf of the policyholder.
Include appropriate regulatory references for ${stateInfo.stateName}.
Address the email to the adjuster (${claim.adjuster_name || 'Claims Adjuster'}) at ${claim.insurance_company || 'the insurance company'}.`;
        break;
      }

      case 'one_click_package': {
        // Compile comprehensive claim package with Darwin analyses
        const components = additionalContext?.components || [];
        const darwinAnalyses = additionalContext?.darwinAnalyses || [];
        
        // Build Darwin analyses section for the package
        let darwinAnalysesSection = '';
        if (darwinAnalyses.length > 0) {
          darwinAnalysesSection = `\n\nDARWIN AI ANALYSES & REBUTTALS TO INCLUDE:\n`;
          darwinAnalysesSection += `The following ${darwinAnalyses.length} Darwin-generated analyses should be incorporated as formal rebuttals and supporting documentation:\n\n`;
          
          darwinAnalyses.forEach((analysis: any, index: number) => {
            darwinAnalysesSection += `=== ${analysis.type.toUpperCase()} (${new Date(analysis.date).toLocaleDateString()}) ===\n`;
            if (analysis.summary) {
              darwinAnalysesSection += `Source Document: ${analysis.summary}\n`;
            }
            darwinAnalysesSection += `\n${analysis.content}\n\n`;
            darwinAnalysesSection += `${'─'.repeat(80)}\n\n`;
          });
        }
        
        systemPrompt = `You are Darwin, an expert public adjuster AI. Your task is to compile a comprehensive claim package that serves as a FORMAL SUBMISSION to the insurance carrier.

=== CRITICAL REQUIREMENTS ===
1. When Darwin analyses/rebuttals are included, they form the CORE of this package
2. Structure the package as a formal demand/rebuttal document
3. The rebuttals should be presented as professional, referenced arguments
4. Include all supporting data (claim details, financials) as context for the rebuttals
5. Format as a professional legal-style document ready for carrier submission
6. IMPORTANT: When photos are included, REFERENCE THEM AS EVIDENCE throughout the document
   - Cite specific photos by name when discussing damage
   - Group photo evidence by damage type (hail, wind, water, etc.)
   - Note dates photos were taken to establish timeline of damage
   - Use photos to corroborate claims in rebuttals

=== DOCUMENT STRUCTURE ===
If Darwin rebuttals are included, structure as:
1. COVER LETTER - Professional introduction stating purpose of package
2. CLAIM SUMMARY - Key claim facts and current status  
3. PHOTOGRAPHIC EVIDENCE - Detailed inventory of all photos with descriptions, organized by damage type
4. FORMAL REBUTTALS & DEMANDS - Present each Darwin analysis as a formal section, REFERENCING specific photos as supporting evidence
5. SUPPORTING DOCUMENTATION - List of attached evidence
6. FINANCIAL SUMMARY - Amounts claimed and calculations
7. CONCLUSION & DEMANDS - Clear statement of what is being requested

Use professional legal formatting with proper section numbering.
Each rebuttal should be presented as a formal argument with citations preserved.
When discussing damage, ALWAYS reference the specific photos that document it.`;

        // Build detailed photo documentation section
        let photoDocumentation = '';
        if (additionalContext?.includePhotos && context.photos?.length > 0) {
          photoDocumentation = `\n\n=== PHOTOGRAPHIC EVIDENCE (${context.photos.length} photos) ===\n`;
          photoDocumentation += `These photos document the damage and support the claim:\n\n`;
          
          // Group photos by category
          const photosByCategory: Record<string, any[]> = {};
          context.photos.forEach((photo: any) => {
            const category = photo.category || 'Uncategorized';
            if (!photosByCategory[category]) {
              photosByCategory[category] = [];
            }
            photosByCategory[category].push(photo);
          });
          
          Object.entries(photosByCategory).forEach(([category, photos]) => {
            photoDocumentation += `\n**${category}** (${photos.length} photos):\n`;
            photos.forEach((photo: any) => {
              photoDocumentation += `  - ${photo.file_name}`;
              if (photo.description) {
                photoDocumentation += `: ${photo.description}`;
              }
              if (photo.taken_at) {
                photoDocumentation += ` (taken: ${new Date(photo.taken_at).toLocaleDateString()})`;
              }
              photoDocumentation += `\n`;
            });
          });
          
          photoDocumentation += `\nIMPORTANT: Reference these photos as evidence when presenting rebuttals. Photos documenting hail damage, storm damage, or other loss conditions are critical supporting evidence.\n`;
        }

        userPrompt = `${claimSummary}

REQUESTED COMPONENTS: ${components.join(', ')}
${photoDocumentation}
${additionalContext?.includeDocuments ? `\nDOCUMENTS ON FILE: ${context.files?.filter((f: any) => !f.file_type?.startsWith('image/'))?.length || 0} documents available` : ''}
${additionalContext?.includeCommunications ? `\nCOMMUNICATIONS: ${context.emails?.length || 0} emails on file` : ''}
${additionalContext?.includeInspections ? `\nINSPECTIONS:\n${context.inspections?.map((i: any) => `- ${i.inspection_type}: ${i.inspection_date} (${i.status})`).join('\n') || 'None scheduled'}` : ''}
${darwinAnalysesSection}

${darwinAnalyses.length > 0 ? `
IMPORTANT: This package includes ${darwinAnalyses.length} Darwin-generated rebuttals/analyses. 
You MUST:
1. Present these as formal, professional rebuttals addressed to the carrier
2. Preserve all citations, code references, and technical arguments
3. Structure them under clear section headers (e.g., "SECTION 3: REBUTTAL TO ENGINEER REPORT")
4. Include a cover letter explaining this is a formal response with supporting documentation
5. End with a clear DEMANDS section stating what the carrier must do

Compile this as a FORMAL CARRIER SUBMISSION PACKAGE, not just a summary.
` : `
Compile a comprehensive claim package summary including:
1. Executive Summary - Current claim status and key metrics
2. Claim Details - All relevant claim information
3. Financial Summary - Settlement data, checks received, amounts outstanding
4. Documentation Inventory - List of all files and photos
5. Communication Timeline - Summary of carrier correspondence
6. Next Steps - Recommended actions and pending items
`}

Format this as a professional document ready for carrier submission.`;
        break;
      }

      case 'auto_summary': {
        // Auto-generated claim summary with key facts
        systemPrompt = `You are Darwin, an expert public adjuster AI. Generate a comprehensive yet concise claim summary.

FORMATTING REQUIREMENT: Return ONLY valid JSON with this structure:
{
  "id": "summary_[timestamp]",
  "created_at": "[ISO date]",
  "summary": "2-3 paragraph executive summary",
  "key_facts": ["fact 1", "fact 2", ...],
  "next_actions": ["action 1", "action 2", ...],
  "risk_factors": ["risk 1", "risk 2", ...],
  "estimated_value": {
    "low": number,
    "likely": number,
    "high": number
  }
}`;

        const totalChecksReceived = context.checks?.reduce((sum: number, c: any) => sum + (c.amount || 0), 0) || 0;
        const latestSettlement = context.settlements?.[0];

        userPrompt = `${claimSummary}

ADDITIONAL DATA:
- Total Checks Received: $${totalChecksReceived.toLocaleString()}
- Documents on File: ${context.files?.length || 0}
- Photos on File: ${context.files?.filter((f: any) => f.file_type?.startsWith('image/'))?.length || 0}

Generate a comprehensive claim summary in the specified JSON format. Include:
1. Executive summary of the claim status and key issues
2. 5-7 key facts about the claim
3. 3-5 recommended next actions
4. Any risk factors that could affect the outcome
5. Estimated claim value range based on available data

Return ONLY valid JSON.`;
        break;
      }

      case 'compliance_check': {
        // Compliance-aware messaging checker
        const textToCheck = additionalContext?.text || content || '';
        const state = claim?.policyholder_state || stateInfo.state;
        
        systemPrompt = `You are Darwin, an expert public adjuster compliance advisor for ${stateInfo.stateName}. 
You analyze communications for compliance issues, risky language, and professional best practices.

Your task is to identify any language that could:
1. Constitute unauthorized practice of law (UPL)
2. Make guarantees or promises that can't be kept
3. Allege bad faith without proper documentation
4. Use emotional or unprofessional language
5. Make improper coverage determinations
6. Violate ${stateInfo.stateName} insurance regulations

Return ONLY valid JSON with this structure:
{
  "issues": [
    {
      "severity": "error|warning|info",
      "category": "Category name",
      "originalText": "The problematic text",
      "issue": "Description of the issue",
      "suggestion": "Recommended alternative",
      "regulation": "Relevant regulation reference if any"
    }
  ],
  "overallScore": "compliant|needs_review|risky",
  "summary": "Brief overall assessment"
}`;

        userPrompt = `Analyze this communication for compliance issues:

---
${textToCheck}
---

State: ${stateInfo.stateName}
Applicable Regulations: ${stateInfo.adminCode}

Return ONLY valid JSON with any compliance issues found.`;
        break;
      }

      case 'document_classify': {
        // Document classification for smart sorting
        const fileName = additionalContext?.fileName || '';
        const fileSize = additionalContext?.fileSize || 0;
        
        systemPrompt = `You are Darwin, an expert document classifier for insurance claims.
Based on the file name and context, classify this document into one of these categories:
- Policy Documents
- Correspondence
- Estimates
- Photos
- Invoices
- Inspection Reports
- Legal Documents
- Contracts
- Weather Reports
- Engineering Reports
- Other

Return ONLY valid JSON with this structure:
{
  "classification": {
    "folder": "Category name",
    "type": "Specific document type",
    "confidence": 0.0-1.0,
    "sender": "Sender if identifiable",
    "date": "Date if identifiable",
    "topic": "Brief topic description"
  }
}`;

        userPrompt = `Classify this document:
File Name: ${fileName}
File Size: ${fileSize} bytes
Claim Type: ${claim?.loss_type || 'Property damage'}
Insurance Company: ${claim?.insurance_company || 'Unknown'}

Return ONLY valid JSON with the classification.`;
        break;
      }

      case 'auto_draft_rebuttal': {
        // Comprehensive rebuttal using all claim intelligence
        const strategicData = additionalContext?.strategicInsights || {};
        const previousAnalyses = additionalContext?.darwinAnalyses || [];
        const carrierBehavior = additionalContext?.carrierProfile || {};
        const fileList = additionalContext?.claimFiles || [];
        const aiPhotoAnalysis = additionalContext?.aiPhotoAnalysis || [];
        const photoAnalysisSummary = additionalContext?.photoAnalysisSummary || {};
        
        // Fetch knowledge base content for rebuttals
        const kbContent = await searchKnowledgeBase(
          supabase,
          'rebuttal strategy insurance claim denial depreciation coverage policy building codes manufacturer specifications',
        );

        systemPrompt = `You are Darwin, an elite public adjuster AI generating a COMPREHENSIVE STRATEGIC REBUTTAL. You have access to ALL claim intelligence, strategic analyses, carrier behavior data, and previous Darwin analyses for this claim.

=== COMMUNICATION STYLE ===
You are professional yet personable. Show empathy and warmth while being assertive when dealing with carriers. Use a conversational tone that reassures while maintaining expertise.

=== CORE PHILOSOPHY ===
- Build the "PROOF CASTLE": THE CAUSE (weather/incident data), THE SCOPE (full replacement, not repair), THE COST (proper valuation)
- Focus on REPAIRABILITY over matching - PA and NJ do NOT have matching requirements
- NEVER cite case law or legal precedents - stick to facts, regulations, building codes, manufacturer specs
- Arguments must be grounded in: IRC/IBC building codes, manufacturer specifications, ASTM/ARMA standards, ${stateInfo.stateName} regulations

=== STATE-SPECIFIC REGULATIONS ===
This claim is in ${stateInfo.stateName}:
- Insurance Code: ${stateInfo.insuranceCode}
- Prompt Pay Act: ${stateInfo.promptPayAct}
- Administrative Code: ${stateInfo.adminCode}

=== RESPONSE REQUIREMENTS ===
- Generate an EXHAUSTIVE, COMPREHENSIVE rebuttal document
- Address EVERY denial point, carrier argument, and engineer finding from the analyses
- Each rebuttal section should be a full paragraph with: the carrier's position, why it is incorrect, regulatory/code citations, supporting evidence
- Include specific references to claim files, dates, and documentation
- Cite building codes, manufacturer specs, and state regulations liberally
- Structure as a formal legal-style demand letter ready for carrier submission

${kbContent}`;

        // Build context from all available data
        let intelligenceContext = '';
        
        if (Object.keys(strategicData).length > 0) {
          intelligenceContext += `\n=== STRATEGIC POSITION DATA ===
Health Score: ${JSON.stringify(strategicData.health_score || {})}
Leverage Points: ${JSON.stringify(strategicData.leverage_points || [])}
Coverage Triggers: ${JSON.stringify(strategicData.coverage_triggers || [])}
Recommended Strategy: ${strategicData.recommended_strategy || 'Not analyzed'}
\n`;
        }

        if (Object.keys(carrierBehavior).length > 0) {
          intelligenceContext += `\n=== CARRIER BEHAVIOR PROFILE: ${carrierBehavior.carrier_name || claim.insurance_company} ===
First Offer vs Final Ratio: ${carrierBehavior.first_offer_vs_final_ratio || 'Unknown'}
Supplement Approval Rate: ${carrierBehavior.supplement_approval_rate || 'Unknown'}%
Typical Denial Reasons: ${JSON.stringify(carrierBehavior.typical_denial_reasons || [])}
Common Lowball Tactics: ${JSON.stringify(carrierBehavior.common_lowball_tactics || [])}
Recommended Approach: ${carrierBehavior.recommended_approach || 'Standard approach'}
Counter Sequences: ${JSON.stringify(carrierBehavior.counter_sequences || [])}
\n`;
        }

        if (previousAnalyses.length > 0) {
          intelligenceContext += `\n=== PREVIOUS DARWIN ANALYSES (${previousAnalyses.length} total) ===\n`;
          for (const analysis of previousAnalyses.slice(0, 10)) {
            intelligenceContext += `\n--- ${analysis.type} (${new Date(analysis.created_at).toLocaleDateString()}) ---\n${analysis.result?.substring(0, 3000) || 'No content'}\n`;
          }
        }

        if (fileList.length > 0) {
          intelligenceContext += `\n=== CLAIM FILES ON RECORD (${fileList.length} documents) ===
${fileList.join(', ')}
\n`;
        }

        // Add AI photo analysis evidence - critical for rebuttals
        if (aiPhotoAnalysis.length > 0) {
          intelligenceContext += `\n=== DARWIN AI PHOTO ANALYSIS (${aiPhotoAnalysis.length} photos analyzed) ===
Summary: ${photoAnalysisSummary.totalAnalyzed || 0} analyzed, ${photoAnalysisSummary.poorConditionCount || 0} in poor/failed condition, ${photoAnalysisSummary.withDamagesCount || 0} with detected damages
Materials Identified: ${(photoAnalysisSummary.materials || []).join(', ') || 'Various'}

DETAILED PHOTO EVIDENCE:
${aiPhotoAnalysis.slice(0, 20).map((p: any, i: number) => {
  const damages = p.detectedDamages ? (typeof p.detectedDamages === 'string' ? JSON.parse(p.detectedDamages) : p.detectedDamages) : [];
  const damageList = Array.isArray(damages) ? damages.map((d: any) => `${d.type || d.damage_type}: ${d.description || ''} (${d.severity || 'Unknown'} severity)`).join('; ') : '';
  return `${i + 1}. ${p.fileName} (${p.category || 'Uncategorized'})
   Material: ${p.material || 'Not identified'}
   Condition: ${p.condition || 'Not assessed'} - ${p.conditionNotes || ''}
   AI Summary: ${p.summary || 'No summary'}
   Detected Damages: ${damageList || 'None detected'}`;
}).join('\n\n')}

*** USE THIS PHOTO EVIDENCE in the rebuttal to counter carrier claims about property condition ***
\n`;
        }

        userPrompt = `${claimSummary}

${intelligenceContext}

Based on ALL the intelligence above, generate a COMPREHENSIVE STRATEGIC REBUTTAL document that:

1. EXECUTIVE SUMMARY (1 paragraph)
   - State the overall position and demand
   - Reference key leverage points

2. REGULATORY FRAMEWORK (cite specific ${stateInfo.stateName} regulations)
   - Carrier obligations under ${stateInfo.promptPayAct}
   - Timeline violations if any
   - Bad faith indicators if present

3. COMPREHENSIVE REBUTTAL OF CARRIER POSITIONS
   - Address EVERY denial reason, engineer finding, or carrier argument from the analyses
   - For each point: State their position → Explain why it's incorrect → Cite supporting regulations/codes → Reference specific evidence

4. EVIDENCE SUMMARY
   - Reference specific documents from the claim files
   - Cite photos, inspection reports, and estimates

5. CARRIER-SPECIFIC STRATEGY
   - Apply the counter-sequences from the carrier profile
   - Use approaches that work with ${claim.insurance_company}

6. FORMAL DEMAND
   - State the specific dollar amount demanded
   - Set deadline for response (cite regulations)
   - State escalation path (DOI complaint, appraisal, bad faith)

Make this document READY FOR SUBMISSION to the carrier. Be thorough, specific, and cite everything.`;
        break;
      }

      default:
        throw new Error(`Unknown analysis type: ${analysisType}`);

    }

    // Build messages array - handle PDF content with multimodal format
    let messages: any[];
    
    // Handle multiple PDFs for demand_package
    if (pdfContents && pdfContents.length > 0 && analysisType === 'demand_package') {
      const contentParts: any[] = [];
      
      // Add each PDF as an image_url (Gemini will process PDFs this way)
      // Limit to 3 PDFs to reduce payload size and avoid timeouts during gateway issues
      for (const pdf of pdfContents.slice(0, 3)) {
        contentParts.push({
          type: 'image_url',
          image_url: {
            url: `data:application/pdf;base64,${pdf.content}`
          }
        });
      }
      
      // Add the text prompt last
      contentParts.push({
        type: 'text',
        text: userPrompt
      });
      
      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contentParts }
      ];
      
      console.log(`Demand package with ${pdfContents.length} PDFs (processing ${Math.min(pdfContents.length, 3)})`);
    } else if (analysisType === 'supplement' && (additionalContext?.ourEstimatePdf || additionalContext?.insuranceEstimatePdf || pdfContent)) {
      // Supplement comparison with potentially two PDFs
      const contentParts: any[] = [];
      
      if (additionalContext?.ourEstimatePdf) {
        contentParts.push({
          type: 'image_url',
          image_url: {
            url: `data:application/pdf;base64,${additionalContext.ourEstimatePdf}`
          }
        });
        contentParts.push({
          type: 'text',
          text: `[Above is OUR ESTIMATE: ${additionalContext?.ourEstimatePdfName || 'our-estimate.pdf'}]`
        });
      }
      
      if (additionalContext?.insuranceEstimatePdf || pdfContent) {
        contentParts.push({
          type: 'image_url',
          image_url: {
            url: `data:application/pdf;base64,${additionalContext?.insuranceEstimatePdf || pdfContent}`
          }
        });
        contentParts.push({
          type: 'text',
          text: `[Above is INSURANCE ESTIMATE: ${additionalContext?.insuranceEstimatePdfName || pdfFileName || 'insurance-estimate.pdf'}]`
        });
      }
      
      contentParts.push({
        type: 'text',
        text: userPrompt
      });
      
      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contentParts }
      ];
      
      console.log(`Supplement analysis with ${additionalContext?.ourEstimatePdf ? 1 : 0} our estimate + ${(additionalContext?.insuranceEstimatePdf || pdfContent) ? 1 : 0} insurance estimate`);
    } else if (pdfContent && !additionalContext?._useTextOnly && (analysisType === 'denial_rebuttal' || analysisType === 'engineer_report_rebuttal' || analysisType === 'document_compilation' || analysisType === 'estimate_work_summary' || analysisType === 'document_comparison' || analysisType === 'smart_extraction')) {
      // Use multimodal format for PDF analysis with Gemini-compatible inline_data format
      messages = [
        { role: 'system', content: systemPrompt },
        { 
          role: 'user', 
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:application/pdf;base64,${pdfContent}`
              }
            },
            {
              type: 'text',
              text: userPrompt
            }
          ]
        }
      ];
    } else {
      // Standard text-only format
      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];
    }

    // Call Lovable AI with model fallback chain for reliability
    const hasPdfContent = pdfContent || (pdfContents && pdfContents.length > 0) || additionalContext?.ourEstimatePdf || additionalContext?.insuranceEstimatePdf;
    const needsPdfProcessing = hasPdfContent && !additionalContext?._useTextOnly && ['denial_rebuttal', 'engineer_report_rebuttal', 'document_compilation', 'estimate_work_summary', 'supplement', 'demand_package', 'document_comparison', 'smart_extraction'].includes(analysisType);
    
    // Model fallback chain - use only Gemini models for PDF processing (OpenAI doesn't support PDF multimodal)
    // For text-only analysis, we can use OpenAI as fallback
    // IMPORTANT: gemini-3-flash-preview first as it's on newer infrastructure
    const modelFallbackChain = needsPdfProcessing ? [
      'google/gemini-3-flash-preview', // Newest model, different infrastructure - try first
      'google/gemini-2.5-flash',       // Fast option for PDFs
      'google/gemini-2.5-pro',         // Most capable for PDFs
      'google/gemini-3-pro-preview',   // Newer pro model
    ] : [
      'google/gemini-3-flash-preview', // Newest, fastest
      'openai/gpt-5-mini',             // Different provider fallback
      'google/gemini-2.5-flash',       // Fast Google fallback
      'openai/gpt-5.2',                // Most capable OpenAI (user's preference for Darwin)
      'openai/gpt-5-nano',             // Fast OpenAI fallback
    ];
    console.log(`Model fallback chain: ${modelFallbackChain.join(' -> ')} (PDF processing: ${needsPdfProcessing})`);
    
    // For task_followup, use tool calling to get structured actions
    let baseRequestBody: any = {
      messages,
      temperature: 0.7,
      max_tokens: 8000,
    };
    
    if (analysisType === 'task_followup') {
      baseRequestBody.tools = [
        {
          type: 'function',
          function: {
            name: 'provide_task_followup',
            description: 'Provide analysis and suggested follow-up actions for a task',
            parameters: {
              type: 'object',
              properties: {
                analysis: {
                  type: 'string',
                  description: 'Detailed analysis of the task including what it requires, why its important, urgency level, and recommended approach'
                },
                suggestedActions: {
                  type: 'array',
                  description: 'List of suggested follow-up actions',
                  items: {
                    type: 'object',
                    properties: {
                      type: {
                        type: 'string',
                        enum: ['email', 'sms', 'note'],
                        description: 'Type of action'
                      },
                      title: {
                        type: 'string',
                        description: 'Brief title for the action'
                      },
                      content: {
                        type: 'string',
                        description: 'The actual content - email body, SMS message, or note text'
                      }
                    },
                    required: ['type', 'title', 'content']
                  }
                }
              },
              required: ['analysis', 'suggestedActions']
            }
          }
        }
      ];
      baseRequestBody.tool_choice = { type: 'function', function: { name: 'provide_task_followup' } };
    }
    
    // Model fallback with retries - more retries for PDF processing since fewer models available
    const RETRIES_PER_MODEL = needsPdfProcessing ? 3 : 1;
    const RETRY_DELAY = 2000; // 2 seconds between retries
    
    let aiData: any = null;
    let lastError: string = '';
    let successfulModel: string = '';
    
    modelLoop:
    for (const currentModel of modelFallbackChain) {
      console.log(`Trying model: ${currentModel}`);
      
      for (let attempt = 0; attempt < RETRIES_PER_MODEL; attempt++) {
        try {
          console.log(`  Attempt ${attempt + 1}/${RETRIES_PER_MODEL} for ${currentModel}`);
          
          const requestBody = { ...baseRequestBody, model: currentModel };
          
          const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          });

          // Handle HTTP-level errors
          if (!response.ok) {
            const errorText = await response.text();
            lastError = `HTTP ${response.status} on ${currentModel}: ${errorText.substring(0, 200)}`;
            console.error(`  AI Gateway HTTP error:`, response.status);
            
            // Don't retry on client errors (4xx) except 429
            if (response.status === 429) {
              return new Response(
                JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
                { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
            if (response.status === 402) {
              return new Response(
                JSON.stringify({ error: 'AI usage limit reached. Please add credits to continue.' }),
                { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
            // For 4xx errors (not 429/402), try next model immediately
            if (response.status >= 400 && response.status < 500) {
              console.log(`  Client error ${response.status}, trying next model...`);
              continue modelLoop;
            }
            
            // Retry on 5xx errors
            if (attempt < RETRIES_PER_MODEL - 1) {
              console.log(`  Retrying in ${RETRY_DELAY}ms...`);
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
              continue;
            }
            // Exhausted retries for this model, try next
            console.log(`  Exhausted retries for ${currentModel}, trying next model...`);
            continue modelLoop;
          }
          
          // Parse the response
          aiData = await response.json();
          
          // Log the raw response for debugging
          console.log(`  Response structure:`, JSON.stringify({
            hasChoices: !!aiData.choices,
            choicesLength: aiData.choices?.length,
            hasMessage: !!aiData.choices?.[0]?.message,
            contentType: typeof aiData.choices?.[0]?.message?.content,
            contentLength: aiData.choices?.[0]?.message?.content?.length,
            finishReason: aiData.choices?.[0]?.finish_reason,
            error: aiData.error
          }));
          
          // Check if there was an error in the response body
          if (aiData.error) {
            const errorCode = aiData.error.code || aiData.error.status || 0;
            const errorMsg = aiData.error.message || aiData.error || 'Unknown error';
            lastError = `API Error ${errorCode} on ${currentModel}: ${errorMsg}`;
            console.error('  AI Gateway returned error in body:', aiData.error);
            
            // Retry on server errors (5xx codes in the body)
            if (errorCode >= 500 && attempt < RETRIES_PER_MODEL - 1) {
              console.log(`  Retrying due to API error ${errorCode} in ${RETRY_DELAY}ms...`);
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
              continue;
            }
            // Try next model
            console.log(`  Error from ${currentModel}, trying next model...`);
            continue modelLoop;
          }
          
          // Check if we got valid choices
          if (!aiData.choices || aiData.choices.length === 0) {
            lastError = `No choices from ${currentModel}`;
            console.error('  AI Gateway returned no choices');
            
            if (attempt < RETRIES_PER_MODEL - 1) {
              console.log(`  Retrying due to empty response in ${RETRY_DELAY}ms...`);
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
              continue;
            }
            // Try next model
            console.log(`  No choices from ${currentModel}, trying next model...`);
            continue modelLoop;
          }
          
          // Success!
          successfulModel = currentModel;
          console.log(`  SUCCESS with model ${currentModel}!`);
          break modelLoop;
          
        } catch (fetchError) {
          console.error(`  Fetch error (attempt ${attempt + 1}):`, fetchError);
          lastError = fetchError instanceof Error ? fetchError.message : 'Network error';
          
          if (attempt < RETRIES_PER_MODEL - 1) {
            console.log(`  Retrying in ${RETRY_DELAY}ms...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          }
          // If exhausted retries, will continue to next model
        }
      }
    }
    
    if (!aiData || !aiData.choices || aiData.choices.length === 0) {
      console.error('All models failed:', lastError);
      throw new Error(`AI Gateway temporarily unavailable. Tried ${modelFallbackChain.length} models. ${lastError}`);
    }
    
    console.log(`Darwin AI analysis completed using model: ${successfulModel}`);

    // For task_followup, parse the tool call response
    let suggestedActions: Array<{type: string; title: string; content: string}> = [];
    let analysisResult = '';
    
    if (analysisType === 'task_followup') {
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        try {
          const parsed = JSON.parse(toolCall.function.arguments);
          analysisResult = parsed.analysis || 'No analysis generated';
          suggestedActions = parsed.suggestedActions || [];
          console.log(`Parsed ${suggestedActions.length} suggested actions from tool call`);
        } catch (e) {
          console.error('Failed to parse tool call response:', e);
          analysisResult = aiData.choices?.[0]?.message?.content || 'No analysis generated';
        }
      } else {
        analysisResult = aiData.choices?.[0]?.message?.content || 'No analysis generated';
      }
    } else {
      // Extract content - handle both string and potential array formats
      const messageContent = aiData.choices?.[0]?.message?.content;
      
      if (typeof messageContent === 'string' && messageContent.trim()) {
        analysisResult = messageContent;
      } else if (Array.isArray(messageContent)) {
        // Some models return content as array of parts
        analysisResult = messageContent
          .filter((part: any) => part.type === 'text' && part.text)
          .map((part: any) => part.text)
          .join('\n') || 'No analysis generated';
      } else {
        // Log what we actually got for debugging
        console.error('Unexpected content format:', JSON.stringify(messageContent));
        
        // Check finish_reason - if it's 'length', the response was cut off
        const finishReason = aiData.choices?.[0]?.finish_reason;
        if (finishReason === 'length') {
          analysisResult = 'Analysis was too long and got truncated. Please try with fewer documents.';
        } else if (finishReason === 'content_filter') {
          analysisResult = 'Content was filtered by the AI model. Please try with different documents.';
        } else {
          analysisResult = 'No analysis generated - the AI model returned an empty response. Please try again.';
        }
      }
    }
    
    console.log(`Darwin AI Analysis completed for ${analysisType}, result length: ${analysisResult.length}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        analysisType,
        result: analysisResult,
        analysis: analysisResult,
        suggestedActions,
        claimId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Darwin AI Analysis error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
