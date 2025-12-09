import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AnalysisRequest {
  claimId: string;
  analysisType: 'denial_rebuttal' | 'next_steps' | 'supplement' | 'correspondence' | 'task_followup' | 'engineer_report_rebuttal' | 'claim_briefing';
  content?: string; // For denial letters, correspondence, or engineer reports
  pdfContent?: string; // Base64 encoded PDF content
  pdfFileName?: string;
  additionalContext?: any;
  claim?: any; // Full claim object for briefing
  contextData?: any; // Additional context data
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

    const { claimId, analysisType, content, pdfContent, pdfFileName, additionalContext, claim: providedClaim, contextData }: AnalysisRequest = await req.json();
    console.log(`Darwin AI Analysis - Type: ${analysisType}, Claim: ${claimId}, Has PDF: ${!!pdfContent}`);

    // Fetch claim data
    const { data: claim, error: claimError } = await supabase
      .from('claims')
      .select('*')
      .eq('id', claimId)
      .single();

    if (claimError) throw claimError;

    // Detect state from policyholder address (NJ and PA only)
    const detectState = (address: string | null): { state: string; stateName: string; insuranceCode: string; promptPayAct: string } => {
      if (!address) return { state: 'NJ', stateName: 'New Jersey', insuranceCode: 'New Jersey Insurance Code (N.J.S.A. 17B)', promptPayAct: 'New Jersey Unfair Claims Settlement Practices Act (N.J.S.A. 17:29B-4)' };
      
      const upperAddress = address.toUpperCase();
      
      // Check for Pennsylvania
      if (upperAddress.includes(' PA') || upperAddress.includes('PENNSYLVANIA') || upperAddress.includes(', PA')) {
        return { 
          state: 'PA', 
          stateName: 'Pennsylvania', 
          insuranceCode: 'Pennsylvania Insurance Code (40 P.S.)',
          promptPayAct: 'Pennsylvania Unfair Insurance Practices Act (40 P.S. § 1171.5)'
        };
      }
      
      // Default to New Jersey
      return { state: 'NJ', stateName: 'New Jersey', insuranceCode: 'New Jersey Insurance Code (N.J.S.A. 17B)', promptPayAct: 'New Jersey Unfair Claims Settlement Practices Act (N.J.S.A. 17:29B-4)' };
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
`;

    switch (analysisType) {
      case 'denial_rebuttal':
        systemPrompt = `You are Darwin, an expert public adjuster AI specializing in insurance claim rebuttals. Your role is to analyze denial letters and generate professional, legally-sound rebuttals that maximize claim recovery for policyholders.

IMPORTANT: This claim is located in ${stateInfo.stateName}. You MUST cite ${stateInfo.stateName} law and regulations.

You have deep knowledge of:
- Insurance policy interpretation and coverage analysis
- ${stateInfo.stateName} insurance regulations and case law
- ${stateInfo.insuranceCode}
- ${stateInfo.promptPayAct}
- Appraisal and umpire processes
- Building codes and manufacturer specifications
- Common carrier denial tactics and how to counter them

When generating rebuttals:
1. Identify each specific reason for denial
2. Counter each reason with policy language, regulations, or case law
3. Reference the ${stateInfo.insuranceCode} where applicable
4. Cite specific building codes or manufacturer specs when relevant
5. Maintain a professional but assertive tone
6. Include specific documentation requests and next steps`;

        userPrompt = `${claimSummary}

STATE JURISDICTION: ${stateInfo.stateName} (${stateInfo.state})
APPLICABLE LAW: ${stateInfo.insuranceCode}

${pdfContent ? `A PDF of the denial letter has been provided for analysis.` : `DENIAL LETTER CONTENT:
${content || 'No denial letter content provided'}`}

Please analyze this denial and generate a comprehensive rebuttal that:
1. Lists each denial reason with a point-by-point counter-argument
2. Cites relevant policy language, ${stateInfo.insuranceCode}, and ${stateInfo.stateName} case law
3. References any applicable building codes or manufacturer specifications
4. Includes specific documentation or evidence to support the claim
5. Proposes next steps (supplemental documentation, appraisal demand, etc.)
6. Maintains professional language suitable for carrier correspondence

Format your response as a structured rebuttal document.`;
        break;

      case 'next_steps':
        systemPrompt = `You are Darwin, an intelligent claims management AI for public adjusters. Your role is to analyze claim status, timeline, and activities to recommend the optimal next actions.

IMPORTANT: This claim is located in ${stateInfo.stateName}. Apply ${stateInfo.stateName} law and deadlines.

You understand:
- Claim processing timelines and deadlines
- ${stateInfo.promptPayAct} requirements
- ${stateInfo.stateName} insurance regulations and timelines
- When to escalate vs wait
- Optimal sequencing of claim activities
- Resource allocation and prioritization

Provide actionable, specific recommendations based on the claim's current state and ${stateInfo.stateName} law.`;

        userPrompt = `${claimSummary}

STATE JURISDICTION: ${stateInfo.stateName} (${stateInfo.state})
APPLICABLE LAW: ${stateInfo.insuranceCode}
PROMPT PAYMENT: ${stateInfo.promptPayAct}

${additionalContext?.timeline ? `TIMELINE EVENTS:\n${JSON.stringify(additionalContext.timeline, null, 2)}` : ''}

Analyze this claim and provide:
1. TOP 3 PRIORITY ACTIONS - What should be done immediately and why
2. TIMELINE ANALYSIS - Are there any deadline concerns or ${stateInfo.promptPayAct} violations?
3. MISSING DOCUMENTATION - What evidence or documents should be gathered?
4. CARRIER ENGAGEMENT STRATEGY - How to approach the insurance company
5. ESTIMATED NEXT MILESTONES - What events should occur in the next 7, 14, and 30 days
6. RISK ASSESSMENT - Any red flags or concerns to address

Be specific and actionable. Reference ${stateInfo.stateName} deadlines and regulations where possible.`;
        break;

      case 'supplement':
        systemPrompt = `You are Darwin, an expert public adjuster AI specializing in identifying missed damage and generating supplement requests. Your role is to maximize claim recovery by finding overlooked items in carrier estimates.

You have expertise in:
- Xactimate line items and pricing
- Building codes requiring upgrades
- Manufacturer installation requirements
- Hidden or consequential damage
- Code compliance items
- Overhead and profit calculations
- Comparing carrier estimates against proper scope of work
- Identifying underpayment tactics and missing line items

When analyzing carrier estimates, look for:
1. Missing trades or scopes of work
2. Undervalued or incorrect unit pricing
3. Insufficient quantities
4. Missing code-required items
5. Omitted manufacturer-required components
6. Missing O&P where applicable
7. Incorrect depreciation calculations

Generate comprehensive supplement requests that are defensible and well-documented.`;

        userPrompt = `${claimSummary}

${pdfContent ? `A PDF of the carrier's estimate has been provided for detailed analysis. Review every line item carefully to identify what is missing, undervalued, or incorrect.` : ''}

${additionalContext?.existingEstimate ? `EXISTING ESTIMATE ITEMS (TEXT):\n${additionalContext.existingEstimate}` : ''}

${content ? `ADDITIONAL NOTES/OBSERVATIONS:\n${content}` : ''}

Based on the claim details and the provided estimate, generate a comprehensive supplement analysis that includes:

1. ESTIMATE ANALYSIS (if estimate provided):
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

4. CODE UPGRADE REQUIREMENTS:
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
        systemPrompt = `You are Darwin, an intelligent public adjuster AI assistant helping with task follow-ups. Your role is to analyze tasks and suggest the best way to complete them effectively.

You understand:
- Insurance claim workflows and processes
- Professional communication with carriers, clients, and contractors
- Time-sensitive claim activities and deadlines
- Effective follow-up strategies
- Documentation best practices

Provide actionable, specific suggestions with ready-to-use communications.`;

        userPrompt = `${claimSummary}

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
   
   [EMAIL DRAFT] - If an email is appropriate
   Subject: [subject line]
   Body: [professional email body]
   
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

      default:
        throw new Error(`Unknown analysis type: ${analysisType}`);
    }

    // Build messages array - handle PDF content with multimodal format
    let messages: any[];
    
    if (pdfContent && (analysisType === 'denial_rebuttal' || analysisType === 'engineer_report_rebuttal' || analysisType === 'supplement')) {
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

    // Call Lovable AI - use gemini-2.5-pro for PDF analysis (better document understanding)
    const model = pdfContent ? 'google/gemini-2.5-pro' : 'google/gemini-2.5-flash';
    console.log(`Using model: ${model}`);
    
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 8000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
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
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const aiData = await response.json();
    const analysisResult = aiData.choices?.[0]?.message?.content || 'No analysis generated';

    console.log(`Darwin AI Analysis completed for ${analysisType}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        analysisType,
        result: analysisResult,
        analysis: analysisResult, // Also include as 'analysis' for components that expect it
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
