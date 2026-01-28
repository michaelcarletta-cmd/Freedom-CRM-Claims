import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// State-specific insurance regulations for strategic analysis
const stateRegulations: Record<string, any> = {
  'PA': {
    stateName: 'Pennsylvania',
    promptPayDays: 15,
    acknowledgmentDays: 10,
    decisionDays: 30,
    badFaithStatute: '42 Pa.C.S. § 8371',
    adminCode: '31 Pa. Code Chapter 146'
  },
  'NJ': {
    stateName: 'New Jersey',
    promptPayDays: 30,
    acknowledgmentDays: 10,
    decisionDays: 30,
    badFaithStatute: 'N.J.S.A. 17:29B-4',
    adminCode: 'N.J.A.C. 11:2-17'
  },
  'TX': {
    stateName: 'Texas',
    promptPayDays: 5,
    acknowledgmentDays: 15,
    decisionDays: 15,
    badFaithStatute: 'Texas Insurance Code Chapter 541',
    adminCode: '28 TAC § 21.203'
  },
  'FL': {
    stateName: 'Florida',
    promptPayDays: 20,
    acknowledgmentDays: 14,
    decisionDays: 90,
    badFaithStatute: 'F.S. § 624.155',
    adminCode: 'Fla. Admin. Code 69O-166'
  }
};

function getStateInfo(stateCode: string) {
  return stateRegulations[stateCode?.toUpperCase()] || stateRegulations['PA'];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { claimId, analysisType } = await req.json();

    if (!claimId) {
      throw new Error('Claim ID is required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Gather comprehensive claim data for strategic analysis
    const [
      claimResult,
      filesResult,
      photosResult,
      emailsResult,
      tasksResult,
      checksResult,
      settlementResult,
      inspectionsResult,
      deadlinesResult,
      adjustersResult,
      diaryResult,
      notesResult
    ] = await Promise.all([
      supabase.from('claims').select('*, clients(*)').eq('id', claimId).single(),
      supabase.from('claim_files').select('*').eq('claim_id', claimId),
      supabase.from('claim_photos').select('*').eq('claim_id', claimId),
      supabase.from('emails').select('*').eq('claim_id', claimId).order('created_at', { ascending: false }),
      supabase.from('tasks').select('*').eq('claim_id', claimId),
      supabase.from('claim_checks').select('*').eq('claim_id', claimId),
      supabase.from('claim_settlements').select('*').eq('claim_id', claimId).order('created_at', { ascending: false }).limit(1),
      supabase.from('inspections').select('*').eq('claim_id', claimId),
      supabase.from('claim_carrier_deadlines').select('*').eq('claim_id', claimId),
      supabase.from('claim_adjusters').select('*').eq('claim_id', claimId),
      supabase.from('claim_communications_diary').select('*').eq('claim_id', claimId).order('communication_date', { ascending: false }),
      supabase.from('notes').select('*').eq('claim_id', claimId).order('created_at', { ascending: false })
    ]);

    if (claimResult.error || !claimResult.data) {
      throw new Error(`Claim not found: ${claimResult.error?.message}`);
    }

    const claim = claimResult.data;
    const files = filesResult.data || [];
    const photos = photosResult.data || [];
    const emails = emailsResult.data || [];
    const tasks = tasksResult.data || [];
    const checks = checksResult.data || [];
    const settlement = settlementResult.data?.[0];
    const inspections = inspectionsResult.data || [];
    const deadlines = deadlinesResult.data || [];
    const adjusters = adjustersResult.data || [];
    const diary = diaryResult.data || [];
    const notes = notesResult.data || [];

    const stateCode = claim.property_state || 'PA';
    const stateInfo = getStateInfo(stateCode);

    // Calculate key metrics
    const daysSinceLoss = claim.loss_date 
      ? Math.floor((Date.now() - new Date(claim.loss_date).getTime()) / (1000 * 60 * 60 * 24))
      : null;
    const daysOpen = claim.created_at
      ? Math.floor((Date.now() - new Date(claim.created_at).getTime()) / (1000 * 60 * 60 * 24))
      : null;
    
    const totalChecksReceived = checks.reduce((sum, c) => sum + (c.amount || 0), 0);
    const estimateAmount = settlement?.estimate_amount || claim.claim_amount || 0;
    const totalSettlement = settlement?.total_settlement || 0;

    // Analyze evidence inventory
    const hasEstimate = files.some(f => f.file_name?.toLowerCase().includes('estimate') || f.folder_id?.toString().includes('estimate'));
    const hasDenialLetter = files.some(f => f.file_name?.toLowerCase().includes('denial') || f.folder_id?.toString().includes('denial'));
    const hasEngineerReport = files.some(f => f.file_name?.toLowerCase().includes('engineer') || f.folder_id?.toString().includes('engineer'));
    const hasPolicy = files.some(f => f.file_name?.toLowerCase().includes('policy') || f.folder_id?.toString().includes('policy'));
    const hasProofOfLoss = files.some(f => f.file_name?.toLowerCase().includes('proof of loss') || f.file_name?.toLowerCase().includes('pol'));
    const hasContractorInvoice = files.some(f => f.file_name?.toLowerCase().includes('invoice') || f.file_name?.toLowerCase().includes('contractor'));
    
    const photoCount = photos.length;
    const categorizedPhotos = photos.filter(p => p.category && p.category !== 'uncategorized');
    const annotatedPhotos = photos.filter(p => p.annotations);

    // Check for coverage-related files
    const hasOrdinanceInfo = files.some(f => 
      f.file_name?.toLowerCase().includes('ordinance') || 
      f.file_name?.toLowerCase().includes('code') ||
      f.file_name?.toLowerCase().includes('permit')
    );

    // Build comprehensive context for AI
    const claimContext = `
=== CLAIM STRATEGIC ANALYSIS CONTEXT ===

CLAIM OVERVIEW:
- Claim #: ${claim.claim_number}
- Policyholder: ${claim.clients?.name || 'Unknown'}
- Property: ${claim.property_address || 'Not specified'}, ${claim.property_city || ''}, ${stateCode}
- Status: ${claim.status}
- Loss Type: ${claim.loss_type || 'Not specified'}
- Loss Date: ${claim.loss_date || 'Not specified'}
- Days Since Loss: ${daysSinceLoss ?? 'Unknown'}
- Days Open: ${daysOpen ?? 'Unknown'}
- Insurance Company: ${claim.insurance_company || 'Not specified'}
- Policy Number: ${claim.policy_number || 'Not specified'}

FINANCIAL SNAPSHOT:
- Estimate Amount: $${estimateAmount?.toLocaleString() || '0'}
- Total Settlement: $${totalSettlement?.toLocaleString() || '0'}
- Checks Received: $${totalChecksReceived?.toLocaleString() || '0'} (${checks.length} checks)
- Deductible: $${settlement?.deductible?.toLocaleString() || claim.deductible?.toLocaleString() || 'Unknown'}
- Recoverable Depreciation: $${settlement?.recoverable_depreciation?.toLocaleString() || '0'}
- Coverage Limits: Dwelling $${claim.dwelling_limit?.toLocaleString() || 'Unknown'}, ALE $${claim.ale_limit?.toLocaleString() || 'Unknown'}

EVIDENCE INVENTORY:
- Total Files: ${files.length}
- Photos: ${photoCount} (${categorizedPhotos.length} categorized, ${annotatedPhotos.length} annotated)
- Has Estimate: ${hasEstimate ? 'Yes' : 'NO - MISSING'}
- Has Denial Letter: ${hasDenialLetter ? 'Yes' : 'No'}
- Has Engineer Report: ${hasDenialLetter ? 'Yes' : 'No'}
- Has Policy: ${hasPolicy ? 'Yes' : 'NO - RECOMMEND OBTAINING'}
- Has Proof of Loss: ${hasProofOfLoss ? 'Yes' : 'No'}
- Has Contractor Invoice: ${hasContractorInvoice ? 'Yes' : 'No'}
- Has Ordinance/Code Info: ${hasOrdinanceInfo ? 'Yes' : 'No'}

TIMELINE & ACTIVITY:
- Inspections: ${inspections.length} (${inspections.filter(i => i.status === 'completed').length} completed)
- Active Deadlines: ${deadlines.filter(d => d.status !== 'resolved').length}
- Overdue Deadlines: ${deadlines.filter(d => d.days_overdue && d.days_overdue > 0).length}
- Communications Logged: ${diary.length}
- Emails: ${emails.length}
- Open Tasks: ${tasks.filter(t => t.status !== 'completed').length}
- Adjuster(s): ${adjusters.map(a => `${a.adjuster_name} (${a.company || 'Unknown company'})`).join(', ') || 'None assigned'}

RECENT ACTIVITY (Last 5 items):
${emails.slice(0, 3).map(e => `- Email (${e.direction}): ${e.subject?.substring(0, 50)}... [${new Date(e.created_at).toLocaleDateString()}]`).join('\n')}
${diary.slice(0, 2).map(d => `- ${d.communication_type}: ${d.summary?.substring(0, 50)}... [${new Date(d.communication_date).toLocaleDateString()}]`).join('\n')}

STATE REGULATIONS (${stateInfo.stateName}):
- Prompt Pay: ${stateInfo.promptPayDays} days
- Acknowledgment Required: ${stateInfo.acknowledgmentDays} days
- Decision Required: ${stateInfo.decisionDays} days
- Bad Faith Statute: ${stateInfo.badFaithStatute}
- Admin Code: ${stateInfo.adminCode}

NOTES CONTEXT (Recent):
${notes.slice(0, 3).map(n => `- ${n.content?.substring(0, 100)}...`).join('\n') || 'No notes'}
`;

    // System prompt for strategic intelligence
    const systemPrompt = `You are Darwin, a strategic claims intelligence system for property insurance public adjusters. You think like a senior PA with decades of experience, but you also have comprehensive knowledge of:

- Insurance policy interpretation and coverage analysis
- ${stateInfo.stateName} insurance regulations (statutes and administrative codes only - NEVER cite case law)
- Building codes (IRC, IBC) and manufacturer specifications
- ASTM standards and industry best practices
- Carrier behavior patterns and negotiation tactics
- Evidence requirements and documentation standards

YOUR ROLE: Analyze claims strategically and form OPINIONS. You're not just reporting facts - you're identifying:
1. LEVERAGE POINTS - What gives the policyholder power in negotiations
2. COVERAGE TRIGGERS - If/then coverage opportunities (e.g., "wind damage + code upgrade needs = ordinance coverage demand")
3. EVIDENCE GAPS - What's missing that could hurt the claim
4. CARRIER WEAKNESSES - Delays, procedural violations, contradictions
5. TIMELINE RISKS - Deadlines, statute issues, bad faith indicators
6. NEXT STRATEGIC MOVES - What a senior PA would do right now

You must provide specific, actionable insights - not generic advice. Reference specific documents, dates, and regulations when relevant.

CRITICAL RULES:
- NEVER cite case law or legal precedents
- Focus on facts, regulations, building codes, and industry standards
- Be direct and opinionated - tell them what you think, not just what you see
- Prioritize by impact - what matters most right now
- Think like you're protecting a real family's financial recovery`;

    let userPrompt = '';
    let responseFormat = '';

    if (analysisType === 'full_strategic_analysis') {
      userPrompt = `Analyze this claim and provide a comprehensive strategic assessment:

${claimContext}

Generate a COMPLETE strategic analysis with the following structure:

1. HEALTH SCORE (rate each 1-100):
   - Coverage Strength: How strong is their coverage position?
   - Evidence Quality: Is the documentation sufficient to prove the claim?
   - Leverage Score: How much negotiating power do they have?
   - Timeline Risk: Are there deadline/timing concerns?
   - OVERALL HEALTH SCORE (weighted average)

2. CRITICAL WARNINGS (if any):
   - List any immediate concerns that need attention
   - Include severity (critical/high/medium/low)
   - Suggest specific actions for each

3. LEVERAGE OPPORTUNITIES:
   - Identify specific leverage points (delays, violations, strong evidence)
   - Explain why each creates pressure on the carrier
   - Suggest how to use each leverage point

4. COVERAGE TRIGGER ANALYSIS:
   - Look for if/then coverage opportunities:
     - Wind/hail + code upgrade needs → Ordinance coverage?
     - Structural damage + ALE limits → Loss of use claim?
     - Multiple trades affected → Matching requirements?
   - Flag any coverage that may be available but not being pursued

5. EVIDENCE ASSESSMENT:
   - Strong evidence: What's working well
   - Weak/missing evidence: What needs improvement
   - Specific recommendations (e.g., "Get moisture mapping", "Need engineer letter")
   - Sufficiency rating for causation, scope, pricing

6. RECOMMENDED NEXT MOVES (prioritized):
   - What should happen IMMEDIATELY
   - What should happen THIS WEEK
   - What can wait

7. SENIOR PA OPINION:
   - If you were handling this claim personally, what would you do?
   - What's the one thing that could change the outcome?

Format your response as structured JSON.`;

      responseFormat = 'strategic_analysis';
    } else if (analysisType === 'quick_warnings') {
      userPrompt = `Quickly scan this claim for any critical warnings or issues that need immediate attention:

${claimContext}

Return ONLY warnings/alerts in JSON format:
{
  "warnings": [
    {
      "type": "deadline_risk|evidence_gap|coverage_opportunity|carrier_violation|documentation_issue|strategy_alert",
      "severity": "critical|high|medium|low",
      "title": "Brief warning title",
      "message": "Detailed explanation of the issue",
      "suggested_action": "What to do about it",
      "context": "Any relevant references (dates, documents, regulations)"
    }
  ]
}

Focus on actionable items. Don't generate warnings for things that are fine.`;

      responseFormat = 'warnings';
    } else if (analysisType === 'coverage_triggers') {
      userPrompt = `Analyze this claim specifically for coverage trigger opportunities:

${claimContext}

Look for IF/THEN coverage opportunities. For each one found:
1. Identify the trigger condition (what's present in the claim)
2. Identify the coverage opportunity (what it could unlock)
3. Explain the connection
4. Assess likelihood of success
5. Recommend specific action

Common triggers to check:
- Wind/hail + roof damage + code deficiencies → Ordinance & Law coverage
- Structural damage requiring temporary relocation → ALE coverage
- Multiple trades affected + matching clause → Full replacement
- Carrier delay + missed deadlines → Prompt pay penalties
- Lowball estimate vs code requirements → Supplement opportunity

Return as JSON:
{
  "coverage_triggers": [
    {
      "trigger": "What condition exists",
      "coverage_opportunity": "What coverage this unlocks",
      "reasoning": "Why this applies",
      "confidence": "high|medium|low",
      "action_required": "What to do",
      "potential_value": "Estimated impact if available"
    }
  ]
}`;

      responseFormat = 'coverage_triggers';
    } else {
      userPrompt = `Provide a brief strategic overview of this claim:

${claimContext}

Give me:
1. One-sentence claim health assessment
2. Top 3 priorities right now
3. Biggest risk or opportunity
4. What a senior PA would focus on`;

      responseFormat = 'overview';
    }

    console.log(`Strategic analysis type: ${analysisType} for claim ${claimId}`);

    // Call AI
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 8000
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiData = await response.json();
    const result = aiData.choices?.[0]?.message?.content;

    if (!result) {
      throw new Error('No response from AI');
    }

    // Try to parse as JSON if applicable
    let parsedResult: any = result;
    if (responseFormat !== 'overview') {
      try {
        // Clean up markdown code blocks if present
        let cleanedResult = result;
        if (result.includes('```json')) {
          cleanedResult = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        } else if (result.includes('```')) {
          cleanedResult = result.replace(/```\n?/g, '').trim();
        }
        parsedResult = JSON.parse(cleanedResult);
      } catch (e) {
        console.log('Result is not JSON, returning as text');
        parsedResult = { text: result };
      }
    }

    // Store the insights in the database
    if (analysisType === 'full_strategic_analysis' && typeof parsedResult === 'object') {
      const healthScore = parsedResult.health_score || parsedResult.healthScore || {};
      const warnings = parsedResult.warnings || parsedResult.critical_warnings || [];
      const leveragePoints = parsedResult.leverage_opportunities || parsedResult.leveragePoints || [];
      const coverageTriggers = parsedResult.coverage_trigger_analysis || parsedResult.coverageTriggers || [];
      const evidenceGaps = parsedResult.evidence_assessment?.weak_missing_evidence || [];
      const nextMoves = parsedResult.recommended_next_moves || parsedResult.nextMoves || [];
      const seniorPaOpinion = parsedResult.senior_pa_opinion || parsedResult.seniorPaOpinion || '';

      // Upsert strategic insights
      await supabase
        .from('claim_strategic_insights')
        .upsert({
          claim_id: claimId,
          coverage_strength_score: healthScore.coverage_strength || healthScore.coverageStrength,
          evidence_quality_score: healthScore.evidence_quality || healthScore.evidenceQuality,
          leverage_score: healthScore.leverage_score || healthScore.leverageScore,
          timeline_risk_score: healthScore.timeline_risk || healthScore.timelineRisk,
          overall_health_score: healthScore.overall || healthScore.overallHealthScore,
          warnings: warnings,
          leverage_points: leveragePoints,
          coverage_triggers_detected: coverageTriggers,
          evidence_gaps: evidenceGaps,
          recommended_next_moves: nextMoves,
          senior_pa_opinion: typeof seniorPaOpinion === 'string' ? seniorPaOpinion : JSON.stringify(seniorPaOpinion),
          last_analyzed_at: new Date().toISOString(),
          analysis_version: '1.0'
        }, {
          onConflict: 'claim_id'
        });

      // Log warnings for tracking
      if (Array.isArray(warnings) && warnings.length > 0) {
        const warningsToInsert = warnings.map((w: any) => ({
          claim_id: claimId,
          warning_type: w.type || 'strategy_alert',
          severity: w.severity || 'medium',
          title: w.title || 'Warning',
          message: w.message || w.description || '',
          suggested_action: w.suggested_action || w.action || '',
          context: w.context ? JSON.stringify(w.context) : null,
          shown_in_context: 'insights_panel'
        }));

        await supabase.from('claim_warnings_log').insert(warningsToInsert);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      analysisType,
      result: parsedResult,
      claimNumber: claim.claim_number
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Strategic intelligence error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
