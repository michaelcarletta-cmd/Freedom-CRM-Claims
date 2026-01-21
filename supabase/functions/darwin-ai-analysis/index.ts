import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  analysisType: 'denial_rebuttal' | 'next_steps' | 'supplement' | 'correspondence' | 'task_followup' | 'engineer_report_rebuttal' | 'claim_briefing' | 'document_compilation' | 'demand_package' | 'estimate_work_summary' | 'document_comparison' | 'smart_extraction' | 'weakness_detection' | 'photo_linking' | 'code_lookup' | 'smart_follow_ups' | 'task_generation' | 'outcome_prediction';
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

    // Get files
    const { data: files } = await supabase
      .from('claim_files')
      .select('*')
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

        systemPrompt = `You are Darwin, an expert public adjuster AI specializing in insurance claim rebuttals. Your role is to analyze denial letters and generate professional, legally-sound rebuttals that maximize claim recovery for policyholders.

IMPORTANT: This claim is located in ${stateInfo.stateName}. You MUST cite ${stateInfo.stateName} law and regulations accurately.

CRITICAL ARGUMENT STRATEGY - REPAIRABILITY OVER MATCHING:
- NEVER argue "matching" (that new materials must match existing materials in color, texture, style, etc.)
- Pennsylvania and New Jersey DO NOT have matching requirements in their insurance regulations
- ALWAYS argue "repairability" - the damaged materials CANNOT BE REPAIRED and must be replaced
- Focus on why materials are not repairable: manufacturing discontinuation, material degradation, structural integrity compromised, code compliance requirements, manufacturer specifications prohibit partial repairs
- The core argument is: the damage renders the materials irreparable, not that replacements must match
- Do NOT suggest matching as a solution or argument - it is not legally required in PA or NJ

FORMATTING REQUIREMENT: Write in plain text only. Do NOT use markdown formatting such as ** for bold, # for headers, or * for italics. Use normal capitalization and line breaks for emphasis instead.

You have deep knowledge of:
- Insurance policy interpretation and coverage analysis
- ${stateInfo.stateName} insurance regulations and case law
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
1. Identify each specific reason for denial
2. Counter each reason with policy language, regulations, or case law
3. Reference ${stateInfo.adminCode} where applicable
4. Cite specific building codes or manufacturer specs when relevant
5. Maintain a professional but assertive tone
6. Include specific documentation requests and next steps`;

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

        systemPrompt = `You are Darwin, an intelligent claims management AI for public adjusters. Your role is to analyze claim status, timeline, and activities to recommend the optimal next actions.

IMPORTANT: This claim is located in ${stateInfo.stateName}. Apply ${stateInfo.stateName} law and deadlines accurately.

FORMATTING REQUIREMENT: Write in plain text only. Do NOT use markdown formatting such as ** for bold, # for headers, or * for italics. Use normal capitalization and line breaks for emphasis instead.

You understand:
- Claim processing timelines and deadlines
- ${stateInfo.promptPayAct} requirements
- ${stateInfo.adminCode}
- ${stateInfo.stateName} insurance regulations and timelines
- When to escalate vs wait
- Optimal sequencing of claim activities
- Resource allocation and prioritization

KEY ${stateInfo.stateName} DEADLINES TO MONITOR:
${stateInfo.state === 'NJ' ? `
- N.J.A.C. 11:2-17.6: Insurer must acknowledge claim within 10 WORKING DAYS of notification
- N.J.A.C. 11:2-17.7: Investigation must be completed within 30 DAYS of claim notification
- N.J.A.C. 11:2-17.8: Written acceptance or denial within 10 BUSINESS DAYS after completing investigation
- N.J.A.C. 11:2-17.9: Payment must be made within 10 BUSINESS DAYS of acceptance
- N.J.A.C. 11:2-17.12: File complaints with NJ DOBI for violations
` : `
- 31 Pa. Code § 146.5: Acknowledgment within 10 WORKING DAYS
- 31 Pa. Code § 146.6: Investigation within 30 DAYS
- 31 Pa. Code § 146.7: Written notification within 15 WORKING DAYS of completing investigation
- 31 Pa. Code § 146.8: Payment within 15 WORKING DAYS of settlement agreement
`}

Provide actionable, specific recommendations based on the claim's current state and ${stateInfo.stateName} law.`;

        userPrompt = `${claimSummary}

STATE JURISDICTION: ${stateInfo.stateName} (${stateInfo.state})
APPLICABLE STATUTES: ${stateInfo.insuranceCode}
UNFAIR PRACTICES: ${stateInfo.promptPayAct}
ADMINISTRATIVE REGULATIONS: ${stateInfo.adminCode}

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
        systemPrompt = `You are Darwin, an expert public adjuster AI specializing in identifying missed damage and generating supplement requests. Your role is to maximize claim recovery by comparing estimates and finding overlooked items.

CRITICAL ARGUMENT STRATEGY - REPAIRABILITY OVER MATCHING:
- NEVER argue "matching" (that new materials must match existing materials)
- Pennsylvania and New Jersey DO NOT have matching requirements in their insurance regulations
- ALWAYS argue "repairability" - the damaged materials CANNOT BE REPAIRED and must be replaced
- Focus on why materials are irreparable: manufacturing discontinuation, material degradation, structural integrity compromised, code requirements, manufacturer specs prohibit partial repairs
- When requesting full replacement, justify based on non-repairability, NOT matching concerns
- Do NOT suggest matching as a solution - it is not legally required in PA or NJ

FORMATTING REQUIREMENT: Write in plain text only. Do NOT use markdown formatting such as ** for bold, # for headers, or * for italics. Use normal capitalization and line breaks for emphasis instead.

You have expertise in:
- Xactimate line items and pricing
- Building codes requiring upgrades
- Manufacturer installation requirements
- Hidden or consequential damage
- Code compliance items
- Overhead and profit calculations
- Comparing carrier estimates against proper scope of work
- Identifying underpayment tactics and missing line items
- Line-by-line comparison of competing estimates

When comparing estimates, look for:
1. Missing trades or scopes of work in the insurance estimate
2. Undervalued or incorrect unit pricing compared to our estimate
3. Insufficient quantities vs what we have documented
4. Missing code-required items
5. Omitted manufacturer-required components
6. Missing O&P where applicable
7. Incorrect depreciation calculations
8. Line items we included that insurance omitted entirely

Generate comprehensive supplement requests that are defensible and well-documented.`;

        const hasOurEstimate = additionalContext?.ourEstimatePdf;
        const hasInsuranceEstimate = additionalContext?.insuranceEstimatePdf || pdfContent;

        userPrompt = `${claimSummary}

${hasOurEstimate && hasInsuranceEstimate ? `
TWO ESTIMATES HAVE BEEN PROVIDED FOR COMPARISON:
1. OUR ESTIMATE (${additionalContext?.ourEstimatePdfName || 'our-estimate.pdf'}) - This is our detailed scope of work
2. INSURANCE ESTIMATE (${additionalContext?.insuranceEstimatePdfName || pdfFileName || 'insurance-estimate.pdf'}) - This is the carrier's estimate

Your primary task is to COMPARE these two estimates line-by-line and identify ALL discrepancies, missing items, and underpayments in the insurance estimate compared to our estimate.
` : hasInsuranceEstimate ? `A PDF of the carrier's estimate has been provided for detailed analysis. Review every line item carefully to identify what is missing, undervalued, or incorrect.` : hasOurEstimate ? `Our estimate PDF has been provided. Analyze it for completeness and identify potential items the carrier may dispute or miss.` : ''}

${additionalContext?.existingEstimate ? `EXISTING ESTIMATE ITEMS (TEXT):\n${additionalContext.existingEstimate}` : ''}

${content ? `ADDITIONAL NOTES/OBSERVATIONS:\n${content}` : ''}

Based on the claim details and the provided estimate(s), generate a comprehensive supplement analysis that includes:

${hasOurEstimate && hasInsuranceEstimate ? `
1. SIDE-BY-SIDE COMPARISON SUMMARY:
   - Total value of OUR estimate vs INSURANCE estimate
   - Dollar difference between the two
   - Number of line items in each
   - Overall assessment of the gap

2. LINE ITEMS IN OUR ESTIMATE BUT MISSING FROM INSURANCE:
   - List each item we included that insurance omitted
   - Include Xactimate codes where visible
   - Provide the value from our estimate
   - Explain why each item is necessary and supported

3. PRICING DISCREPANCIES:
   - Items where insurance used lower unit prices than ours
   - Items where insurance used lower quantities
   - Labor rate differences
   - Material pricing differences

4. ` : `1. ESTIMATE ANALYSIS (if estimate provided):
   - Summary of what the carrier's estimate includes
   - Total value of carrier's estimate
   - Obvious gaps or missing scopes

2. MISSING LINE ITEMS:
   - List specific items NOT in the carrier's estimate that should be included
   - Include Xactimate codes where possible
   - Provide estimated quantities and unit prices
   - Explain why each item is necessary

3. UNDERVALUED ITEMS:
   - Items where quantities are insufficient
   - Items where unit pricing is below market
   - Incorrect labor calculations

4. `}CODE UPGRADE REQUIREMENTS:
   - Building codes requiring upgrades beyond like-kind replacement
   - Reference specific code sections
   - Items carrier estimate fails to account for

5. MANUFACTURER SPECIFICATION ITEMS:
   - Items required by manufacturer installation guidelines
   - Warranty requirements that mandate certain work
   - Components the carrier may have omitted

6. CONSEQUENTIAL/HIDDEN DAMAGE:
   - Damage that may not be immediately visible
   - Areas that should be further inspected
   - Related damage the carrier missed

7. OVERHEAD & PROFIT JUSTIFICATION:
   - Whether O&P was included in carrier estimate
   - Why O&P should apply to this claim
   - Supporting arguments for O&P inclusion

8. SUPPLEMENT VALUE SUMMARY:
   - Total estimated supplement amount
   - Breakdown by category
   - Priority items to pursue first

9. SUPPLEMENT REQUEST LETTER:
   - Professional letter template requesting the supplement
   - Itemized list with values
   - Supporting rationale for each request

Format as a structured supplement package ready for carrier submission.`;
        break;

      case 'correspondence':
        systemPrompt = `You are Darwin, an expert public adjuster AI specializing in carrier communication strategy. Your role is to analyze adjuster correspondence and provide strategic response recommendations.

FORMATTING REQUIREMENT: Write in plain text only. Do NOT use markdown formatting such as ** for bold, # for headers, or * for italics. Use normal capitalization and line breaks for emphasis instead.

You understand:
- Common adjuster negotiation tactics
- When adjusters are stalling or being evasive
- How to maintain professional relationships while being assertive
- When to escalate to supervisors or legal channels
- Effective documentation strategies

Provide strategic analysis and response recommendations.`;

        userPrompt = `${claimSummary}

ADJUSTER CORRESPONDENCE TO ANALYZE:
${content || 'No correspondence provided'}

${additionalContext?.previousResponses ? `PREVIOUS RESPONSES:\n${additionalContext.previousResponses}` : ''}

Analyze this correspondence and provide:

1. TONE & INTENT ANALYSIS:
   - What is the adjuster really saying?
   - Are there any red flags or stalling tactics?
   - What commitments (if any) are being made?

2. KEY ISSUES IDENTIFIED:
   - What are the main points of contention?
   - What information is the adjuster seeking or avoiding?

3. STRATEGIC RESPONSE RECOMMENDATIONS:
   - How should this be responded to?
   - What tone should be used?
   - What questions should be asked?

4. DOCUMENTATION NOTES:
   - What should be documented from this exchange?
   - Any follow-up deadlines to track?

5. DRAFT RESPONSE:
   - Professional response addressing each point
   - Questions to keep the claim moving forward
   - Clear next steps and deadlines

Maintain a professional, assertive tone appropriate for carrier correspondence.`;
        break;

      case 'task_followup':
        const taskInfo = additionalContext?.task;
        const adjusterInfo = additionalContext?.adjuster;
        
        systemPrompt = `You are Darwin, an intelligent public adjuster AI assistant helping with task follow-ups. Your role is to analyze tasks and suggest the best way to complete them effectively.

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

IMPORTANT: This claim is located in ${stateInfo.stateName}. You MUST cite ${stateInfo.stateName} law and case law.

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
- ${stateInfo.stateName} case law regarding engineer testimony and reports
- ${stateInfo.insuranceCode}
- Building codes and manufacturer installation requirements

When analyzing engineer reports, look for:
1. Scope limitations and methodology issues
2. Failure to inspect properly or thoroughly
3. Conclusions not supported by observations
4. Ignoring evidence that contradicts conclusions
5. Cherry-picking evidence
6. Improper testing methods or lack thereof
7. Bias indicators (carrier-friendly language, predetermined conclusions)
8. Missing or inadequate photographic documentation
9. Failure to consider all potential causes
10. Conflicts with building codes or manufacturer specifications`;

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

8. CASE LAW & STANDARDS:
   - Relevant ${stateInfo.stateName} case law regarding engineer reports
   - Industry standards the engineer may have violated
   - ${stateInfo.stateName} building codes that support the claim

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
        
        systemPrompt = `You are Darwin, an expert public adjuster AI specializing in creating comprehensive demand packages for insurance claims. You have been given evidence documents to analyze and use to build a compelling case.

IMPORTANT: This claim is located in ${stateInfo.stateName}. Apply ${stateInfo.stateName} law and regulations.

FORMATTING REQUIREMENTS:
- Write in plain text only. Do NOT use markdown formatting such as ** for bold, # for headers, or * for italics, or *** for any purpose.
- Use normal capitalization and line breaks for emphasis instead.
- Do NOT include any "***" or similar markers in your output.
- Each major section should be clearly separated with line breaks.

CRITICAL - REPAIRABILITY FOCUS (NO MATCHING ARGUMENTS):
- Pennsylvania and New Jersey are NOT matching states - DO NOT argue that repairs must match existing materials
- ALWAYS focus on REPAIRABILITY - why the damaged components CANNOT BE REPAIRED and require full replacement
- Never mention "matching" as a requirement or argument
- Argue based on: structural integrity compromised, manufacturer specifications prohibit partial repairs, code compliance requirements, material degradation, manufacturing discontinuation

Your expertise includes:
- Analyzing inspection reports, estimates, weather data, and other evidence documents
- Extracting key facts and damage documentation from source materials
- Building persuasive arguments based on documented evidence
- Understanding insurance policy interpretation
- ${stateInfo.insuranceCode}
- ${stateInfo.promptPayAct}
- Building codes, manufacturer specifications, and industry standards

CRITICAL INSTRUCTION: You MUST thoroughly review and analyze the content of each uploaded document. Extract specific details, quotes, measurements, and findings from the documents to support your arguments. Do not make generic statements - use the actual evidence from the documents.`;

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
VI. Why Repairs Are Not Feasible
VII. Why Partial Repairs Are Not Feasible  
VIII. Interdependency of Building Systems
IX. Why Damaged Areas Must Be Disturbed for Repairs
X. State/Local Code Requirements
XI. Building Department Bulletins and Permit Requirements
XII. Manufacturer Installation Standards (Adopted by Code)
XIII. How Repairs Trigger Code Upgrades
XIV. Detailed Repair Estimate Explanation
XV. Formal Demand and Conclusion
XVI. Signature

================================================================================

I. SUMMARY OF FINDINGS

[Provide a comprehensive executive summary of the claim including:
- Brief overview of the loss event
- Total damages identified
- Settlement demand amount
- Key evidence supporting full replacement vs repair]

================================================================================

II. CAUSE OF LOSS

[Detail the cause of loss based on weather data, inspection reports, and other evidence:
- Date and nature of the loss event
- Weather conditions at time of loss (from weather reports provided)
- How the event caused the documented damage
- Timeline of events]

================================================================================

III. DAMAGED COMPONENTS

[List and describe each damaged component identified in the evidence:
- Component name and location
- Type and extent of damage
- Current condition
- Reference to supporting documentation/photos]

================================================================================

IV. WEATHER CONDITIONS ANALYSIS

[Analyze weather reports provided in the evidence:
- Date of loss weather data
- Wind speeds, hail size, precipitation
- How weather conditions caused the damage
- Correlation between weather event and damage pattern]

================================================================================

V. CONDITION OF DAMAGED COMPONENTS (PER REPORTS)

[Extract specific findings from inspection reports and estimates:
- Quote specific observations from inspector reports
- Include measurements, test results, damage descriptions
- Reference which report each finding comes from]

================================================================================

VI. WHY REPAIRS ARE NOT FEASIBLE

[Explain why the damaged materials cannot be repaired:
- Structural integrity compromised
- Material degradation prevents repair
- Manufacturer specifications prohibit patching/partial repair
- Code compliance cannot be achieved through repair
- Safety concerns with repair vs replacement]

================================================================================

VII. WHY PARTIAL REPAIRS ARE NOT FEASIBLE

[Explain why partial/spot repairs will not work:
- Material discontinuation issues
- Proper flashing and waterproofing cannot be achieved
- Warranty implications
- Industry standards require complete system repair
- Reference specific manufacturer guidelines]

================================================================================

VIII. INTERDEPENDENCY OF BUILDING SYSTEMS

[Explain how building components work together:
- Underlayment system interdependency
- Flashing integration requirements
- Ridge and ventilation system connections
- Siding course alignment and weather barrier
- How damage to one component affects the entire system
- Why system must be addressed as a whole]

================================================================================

IX. WHY DAMAGED AREAS MUST BE DISTURBED FOR REPAIRS

[Explain necessary work that requires accessing adjacent areas:
- Access requirements for proper repairs
- Removal necessary to assess hidden damage
- Tie-in requirements for new materials
- Building envelope integrity considerations]

================================================================================

X. STATE AND LOCAL CODE REQUIREMENTS

[Include applicable ${stateInfo.stateName} building codes:
- International Residential Code (IRC) excerpts
- ${stateInfo.stateName} specific building codes
- Local jurisdiction code requirements
- How these codes mandate full replacement]

================================================================================

XI. BUILDING DEPARTMENT BULLETINS AND PERMIT REQUIREMENTS

[Detail permit and bulletin requirements:
- What work requires permits in this jurisdiction
- Building department bulletins regarding repair standards
- Inspection requirements
- Documentation of permit costs if applicable]

================================================================================

XII. MANUFACTURER INSTALLATION STANDARDS (ADOPTED BY CODE)

[Reference manufacturer requirements:
- Specific manufacturer installation manuals
- Warranty requirements
- Standards that have been adopted by code
- Why partial installation violates standards]

================================================================================

XIII. HOW REPAIRS TRIGGER CODE UPGRADES

[Explain code upgrade requirements:
- When repairs exceed thresholds requiring full compliance
- Ordinance and Law coverage triggers
- Required upgrades per current code
- Cost implications of code upgrades]

================================================================================

XIV. DETAILED REPAIR ESTIMATE EXPLANATION

[Provide line-by-line explanation of the estimate:
- Each major line item and its necessity
- Quantity and pricing justification
- Why each item is required for proper repair
- Code-required items
- Total breakdown by category]

================================================================================

XV. FORMAL DEMAND AND CONCLUSION

Based on the evidence documented above, we hereby formally demand payment of the full claim value as follows:

[Include specific dollar amounts from estimates]

Response is required within thirty (30) days pursuant to ${stateInfo.promptPayAct}.

Failure to respond will result in escalation including but not limited to:
- Filing complaint with ${stateInfo.stateName} Department of Insurance
- Demand for appraisal per policy terms
- Pursuit of bad faith claim if warranted

================================================================================

XVI. SIGNATURE

Respectfully submitted,


${assignedUserName}
Licensed Public Adjuster
${companyName}
${companyAddress}
Phone: ${companyPhone}
Email: ${companyEmail}

Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

================================================================================

Create a thorough, professional demand package using ALL evidence from the provided documents. Be specific and reference actual findings, measurements, and conclusions from the documents.`;
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

${pdfContent ? `A PDF document has been provided. Extract all structured data from it.` : `DOCUMENT CONTENT:\n${content || 'No content provided'}`}

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
    } else if (pdfContent && (analysisType === 'denial_rebuttal' || analysisType === 'engineer_report_rebuttal' || analysisType === 'document_compilation' || analysisType === 'estimate_work_summary' || analysisType === 'document_comparison' || analysisType === 'smart_extraction')) {
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
    const needsPdfProcessing = hasPdfContent && ['denial_rebuttal', 'engineer_report_rebuttal', 'document_compilation', 'estimate_work_summary', 'supplement', 'demand_package', 'document_comparison', 'smart_extraction'].includes(analysisType);
    
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
