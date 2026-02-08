import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Strategic output types that MUST go through the pipeline
const STRATEGIC_TYPES = [
  'denial_rebuttal',
  'demand_package',
  'next_steps',
  'auto_draft_rebuttal',
  'systematic_dismantling',
  'correspondence',
  'one_click_package',
  'engineer_report_rebuttal',
  'supplement',
  'estimate_gap_analysis',
];

interface PipelineRequest {
  claimId: string;
  analysisType: string;
  forceRefresh?: boolean;
}

interface ThesisObject {
  primary_cause_of_loss: string;
  primary_coverage_theory: string;
  primary_carrier_error: string;
  evidence_map: Array<{ type: 'document' | 'photo'; id: string; name: string; relevance: string }>;
  anticipated_pushback: string;
  pushback_counter: string;
}

// ─── STEP A: Load Memory ───────────────────────────────────────────────

async function loadMemory(supabase: any, claimId: string, claim: any) {
  console.log(`[Pipeline Step A] Loading memory for claim ${claimId}`);

  // 1. Claim memory snapshot: latest strategic insights + declared position + last analysis results
  const [
    insightsResult,
    positionResult,
    recentAnalysesResult,
    filesResult,
    photosResult,
    notesResult,
    emailsResult,
    checksResult,
    settlementsResult,
  ] = await Promise.all([
    supabase.from('claim_strategic_insights').select('*').eq('claim_id', claimId).maybeSingle(),
    supabase.from('declared_positions').select('*').eq('claim_id', claimId).eq('is_locked', true).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('darwin_analysis_results').select('analysis_type, result, created_at, pdf_file_name').eq('claim_id', claimId).order('created_at', { ascending: false }).limit(10),
    supabase.from('claim_files').select('id, file_name, document_classification, classification_metadata, uploaded_at, extracted_text').eq('claim_id', claimId),
    supabase.from('claim_photos').select('id, file_name, category, ai_analyzed_at, ai_condition_rating, ai_detected_damages, ai_material_type, ai_analysis_summary').eq('claim_id', claimId),
    supabase.from('notes').select('id, content, created_at').eq('claim_id', claimId).order('created_at', { ascending: false }).limit(10),
    supabase.from('emails').select('id, subject, body_text, direction, created_at').eq('claim_id', claimId).order('created_at', { ascending: false }).limit(10),
    supabase.from('claim_checks').select('*').eq('claim_id', claimId),
    supabase.from('claim_settlements').select('*').eq('claim_id', claimId).order('created_at', { ascending: false }).limit(1),
  ]);

  const memorySnapshot = {
    strategicInsights: insightsResult.data || null,
    declaredPosition: positionResult.data || null,
    recentAnalyses: recentAnalysesResult.data || [],
    files: filesResult.data || [],
    photos: photosResult.data || [],
    notes: notesResult.data || [],
    emails: emailsResult.data || [],
    checks: checksResult.data || [],
    settlement: settlementsResult.data || null,
  };

  // 2. Recent deltas since last thesis/analysis
  const { data: existingThesis } = await supabase
    .from('claim_thesis_objects')
    .select('last_deltas_reviewed_at, updated_at')
    .eq('claim_id', claimId)
    .maybeSingle();

  const lastReviewedAt = existingThesis?.last_deltas_reviewed_at || existingThesis?.updated_at || '1970-01-01';

  const [newFilesResult, newNotesResult, newEmailsResult] = await Promise.all([
    supabase.from('claim_files').select('id, file_name, document_classification, uploaded_at').eq('claim_id', claimId).gt('uploaded_at', lastReviewedAt),
    supabase.from('notes').select('id, content, created_at').eq('claim_id', claimId).gt('created_at', lastReviewedAt),
    supabase.from('emails').select('id, subject, direction, created_at').eq('claim_id', claimId).gt('created_at', lastReviewedAt),
  ]);

  const deltas = {
    newFiles: newFilesResult.data || [],
    newNotes: newNotesResult.data || [],
    newEmails: newEmailsResult.data || [],
    hasDelta: (newFilesResult.data?.length || 0) + (newNotesResult.data?.length || 0) + (newEmailsResult.data?.length || 0) > 0,
  };

  // 3. Top 5 cross-claim lessons based on (carrier, loss type, denial theme)
  const carrier = claim.insurance_company || '';
  const lossType = claim.loss_type || '';

  // Find outcomes from similar claims
  const { data: crossClaimLessons } = await supabase
    .from('claim_outcomes')
    .select(`
      id, claim_id, initial_estimate, final_settlement, recovery_percentage,
      winning_arguments, effective_evidence, key_leverage_points, failed_arguments,
      resolution_type, notes,
      claims!inner(insurance_company, loss_type, status)
    `)
    .neq('claim_id', claimId)
    .order('created_at', { ascending: false })
    .limit(50);

  // Score and rank lessons by relevance
  const scoredLessons = (crossClaimLessons || []).map((lesson: any) => {
    let score = 0;
    if (lesson.claims?.insurance_company?.toLowerCase() === carrier.toLowerCase()) score += 3;
    if (lesson.claims?.loss_type?.toLowerCase() === lossType.toLowerCase()) score += 2;
    if (lesson.winning_arguments && Object.keys(lesson.winning_arguments).length > 0) score += 1;
    return { ...lesson, relevanceScore: score };
  })
    .filter((l: any) => l.relevanceScore > 0)
    .sort((a: any, b: any) => b.relevanceScore - a.relevanceScore)
    .slice(0, 5);

  // 4. Cached industry notes matching (state, peril, material, denial theme)
  const state = claim.policyholder_address?.match(/\b([A-Z]{2})\b/)?.[1] || 'NJ';
  const { data: cachedNotes } = await supabase
    .from('industry_notes_cache')
    .select('*')
    .gt('expires_at', new Date().toISOString())
    .or(`state_code.eq.${state},state_code.is.null`)
    .limit(10);

  // Filter further by relevance
  const relevantNotes = (cachedNotes || []).filter((note: any) => {
    if (note.peril && lossType && !lossType.toLowerCase().includes(note.peril.toLowerCase())) return false;
    return true;
  });

  console.log(`[Pipeline Step A] Memory loaded: ${memorySnapshot.files.length} files, ${deltas.hasDelta ? 'has new deltas' : 'no new deltas'}, ${scoredLessons.length} cross-claim lessons, ${relevantNotes.length} industry notes`);

  return { memorySnapshot, deltas, crossClaimLessons: scoredLessons, industryNotes: relevantNotes, state };
}

// ─── STEP B: Decide if Web Search Needed ───────────────────────────────

async function decideWebSearch(
  supabase: any,
  claim: any,
  memorySnapshot: any,
  industryNotes: any[],
  state: string,
): Promise<{ needed: boolean; queries: string[]; reasons: string[] }> {
  console.log(`[Pipeline Step B] Evaluating web search need`);

  const queries: string[] = [];
  const reasons: string[] = [];

  // 1. State regulation referenced but not cached or expired?
  const hasStateRegulation = industryNotes.some(
    (n: any) => n.source_type === 'regulation' && n.state_code === state,
  );
  if (!hasStateRegulation) {
    queries.push(`${state} state insurance regulations property damage claims unfair claims settlement practices statute`);
    reasons.push(`State regulation for ${state} not cached`);
  }

  // 2. Manufacturer spec referenced but not cached?
  // Check if photos identified specific materials
  const materials = memorySnapshot.photos
    ?.map((p: any) => p.ai_material_type)
    .filter(Boolean)
    .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i) || [];

  for (const material of materials.slice(0, 2)) {
    const hasMaterialSpec = industryNotes.some(
      (n: any) => n.source_type === 'manufacturer_spec' && n.material?.toLowerCase() === material.toLowerCase(),
    );
    if (!hasMaterialSpec) {
      queries.push(`${material} manufacturer installation specifications warranty requirements`);
      reasons.push(`Manufacturer spec for ${material} not cached`);
    }
  }

  // 3. Weather validation for DOL not in file?
  const hasWeatherFile = memorySnapshot.files?.some(
    (f: any) =>
      f.document_classification === 'weather_report' ||
      f.document_classification === 'storm_report' ||
      f.file_name?.toLowerCase().includes('weather') ||
      f.file_name?.toLowerCase().includes('storm'),
  );
  if (!hasWeatherFile && claim.loss_date) {
    queries.push(
      `severe weather ${claim.policyholder_address || ''} ${claim.loss_date} hail wind storm damage reports NOAA NWS`,
    );
    reasons.push('Weather validation for DOL not in claim files');
  }

  const needed = queries.length > 0;
  console.log(`[Pipeline Step B] Web search ${needed ? 'NEEDED' : 'NOT needed'}. Reasons: ${reasons.join('; ') || 'none'}`);

  return { needed, queries, reasons };
}

async function executeWebSearches(queries: string[]): Promise<Array<{ query: string; result: string }>> {
  const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY') || Deno.env.get('PERPLEXITY_API_KEY_1');
  if (!PERPLEXITY_API_KEY) {
    console.log('[Pipeline Step B] Perplexity API key not configured, skipping web search');
    return [];
  }

  const results: Array<{ query: string; result: string }> = [];

  // Execute searches (max 3 to control cost/latency)
  for (const query of queries.slice(0, 3)) {
    try {
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [
            {
              role: 'system',
              content: 'You are a research assistant for insurance claims. Provide factual, citation-backed information. Focus on regulations, manufacturer specifications, and weather data.',
            },
            { role: 'user', content: query },
          ],
          max_tokens: 1500,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        results.push({ query, result: data.choices?.[0]?.message?.content || '' });
      } else {
        console.error(`Perplexity search failed for query: ${query}`, response.status);
      }
    } catch (error) {
      console.error(`Web search error for: ${query}`, error);
    }
  }

  return results;
}

// ─── STEP C: Build/Validate Claim Thesis Object ───────────────────────

async function buildThesisObject(
  supabase: any,
  claimId: string,
  claim: any,
  memorySnapshot: any,
  deltas: any,
  crossClaimLessons: any[],
  industryNotes: any[],
  webSearchResults: any[],
  forceRefresh: boolean,
): Promise<{ thesis: ThesisObject; isNew: boolean; validationErrors: string[] }> {
  console.log(`[Pipeline Step C] Building Claim Thesis Object`);

  // Check for existing locked thesis
  if (!forceRefresh) {
    const { data: existingThesis } = await supabase
      .from('claim_thesis_objects')
      .select('*')
      .eq('claim_id', claimId)
      .maybeSingle();

    if (existingThesis && existingThesis.is_locked) {
      console.log(`[Pipeline Step C] Using existing locked thesis`);
      return {
        thesis: {
          primary_cause_of_loss: existingThesis.primary_cause_of_loss,
          primary_coverage_theory: existingThesis.primary_coverage_theory,
          primary_carrier_error: existingThesis.primary_carrier_error,
          evidence_map: existingThesis.evidence_map || [],
          anticipated_pushback: existingThesis.anticipated_pushback || '',
          pushback_counter: existingThesis.pushback_counter || '',
        },
        isNew: false,
        validationErrors: [],
      };
    }
  }

  // Check for declared position first
  const declaredPosition = memorySnapshot.declaredPosition;
  if (declaredPosition) {
    console.log(`[Pipeline Step C] Building thesis from declared position`);
    // Map evidence from files and photos
    const evidenceMap = buildEvidenceMap(memorySnapshot.files, memorySnapshot.photos, claim);
    const thesis: ThesisObject = {
      primary_cause_of_loss: declaredPosition.primary_cause_of_loss || claim.loss_type || 'Unknown',
      primary_coverage_theory: declaredPosition.primary_coverage_theory || 'Direct physical loss from covered peril',
      primary_carrier_error: declaredPosition.primary_carrier_error || 'Carrier failed to properly evaluate claim evidence',
      evidence_map: evidenceMap,
      anticipated_pushback: declaredPosition.carrier_dependency_statement || '',
      pushback_counter: '',
    };

    // Use AI to fill in anticipated pushback counter if missing
    const validationErrors = validateThesis(thesis);

    // Upsert thesis
    await upsertThesis(supabase, claimId, thesis, memorySnapshot, deltas, crossClaimLessons, industryNotes, webSearchResults);

    return { thesis, isNew: true, validationErrors };
  }

  // No declared position - use AI to generate thesis
  console.log(`[Pipeline Step C] Generating thesis via AI`);
  const thesis = await generateThesisViaAI(supabase, claimId, claim, memorySnapshot, crossClaimLessons, industryNotes, webSearchResults);
  const validationErrors = validateThesis(thesis);

  await upsertThesis(supabase, claimId, thesis, memorySnapshot, deltas, crossClaimLessons, industryNotes, webSearchResults);

  return { thesis, isNew: true, validationErrors };
}

function buildEvidenceMap(files: any[], photos: any[], claim: any): ThesisObject['evidence_map'] {
  const map: ThesisObject['evidence_map'] = [];

  // Add critical documents
  for (const file of files || []) {
    const classification = file.document_classification?.toLowerCase();
    if (['denial', 'estimate', 'engineering_report', 'policy', 'storm_report', 'weather_report', 'invoice'].includes(classification)) {
      map.push({
        type: 'document',
        id: file.id,
        name: file.file_name,
        relevance: classification === 'denial' ? 'Carrier denial to rebut'
          : classification === 'estimate' ? 'Scope/cost evidence'
          : classification === 'engineering_report' ? 'Technical evidence'
          : classification === 'policy' ? 'Coverage reference'
          : classification === 'storm_report' || classification === 'weather_report' ? 'Causation evidence'
          : 'Supporting evidence',
      });
    }
  }

  // Add photos with damage evidence
  for (const photo of (photos || []).filter((p: any) => p.ai_condition_rating === 'Poor' || p.ai_condition_rating === 'Failed')) {
    map.push({
      type: 'photo',
      id: photo.id,
      name: photo.file_name,
      relevance: `Damage evidence - ${photo.ai_condition_rating} condition${photo.ai_material_type ? ` (${photo.ai_material_type})` : ''}`,
    });
  }

  return map;
}

function validateThesis(thesis: ThesisObject): string[] {
  const errors: string[] = [];
  if (!thesis.primary_cause_of_loss || thesis.primary_cause_of_loss === 'Unknown') {
    errors.push('Missing primary cause of loss');
  }
  if (!thesis.primary_coverage_theory) {
    errors.push('Missing primary coverage theory');
  }
  if (!thesis.primary_carrier_error) {
    errors.push('Missing primary carrier error');
  }
  if (!thesis.evidence_map || thesis.evidence_map.length === 0) {
    errors.push('No evidence anchors (doc IDs / photo IDs) found');
  }
  return errors;
}

async function upsertThesis(
  supabase: any,
  claimId: string,
  thesis: ThesisObject,
  memorySnapshot: any,
  deltas: any,
  crossClaimLessons: any[],
  industryNotes: any[],
  webSearchResults: any[],
) {
  await supabase.from('claim_thesis_objects').upsert(
    {
      claim_id: claimId,
      primary_cause_of_loss: thesis.primary_cause_of_loss,
      primary_coverage_theory: thesis.primary_coverage_theory,
      primary_carrier_error: thesis.primary_carrier_error,
      evidence_map: thesis.evidence_map,
      anticipated_pushback: thesis.anticipated_pushback,
      pushback_counter: thesis.pushback_counter,
      last_memory_snapshot: {
        fileCount: memorySnapshot.files?.length || 0,
        photoCount: memorySnapshot.photos?.length || 0,
        analysisCount: memorySnapshot.recentAnalyses?.length || 0,
      },
      last_deltas_reviewed_at: new Date().toISOString(),
      cross_claim_lessons: crossClaimLessons.map((l: any) => ({
        claimId: l.claim_id,
        carrier: l.claims?.insurance_company,
        lossType: l.claims?.loss_type,
        winningArguments: l.winning_arguments,
        recoveryPct: l.recovery_percentage,
      })),
      industry_notes_used: industryNotes.map((n: any) => ({
        id: n.id,
        type: n.source_type,
        state: n.state_code,
      })),
      web_search_performed: webSearchResults.length > 0,
      web_search_results: webSearchResults.length > 0 ? webSearchResults : null,
    },
    { onConflict: 'claim_id' },
  );
}

async function generateThesisViaAI(
  supabase: any,
  claimId: string,
  claim: any,
  memorySnapshot: any,
  crossClaimLessons: any[],
  industryNotes: any[],
  webSearchResults: any[],
): Promise<ThesisObject> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  // Build context for AI
  const filesContext = (memorySnapshot.files || [])
    .filter((f: any) => f.document_classification)
    .map((f: any) => `- [${f.document_classification}] ${f.file_name} (ID: ${f.id})`)
    .join('\n');

  const photosContext = (memorySnapshot.photos || [])
    .filter((p: any) => p.ai_analyzed_at)
    .map((p: any) => `- ${p.file_name} [${p.ai_condition_rating || 'N/A'}] ${p.ai_material_type || ''} (ID: ${p.id})`)
    .join('\n');

  const lessonsContext = crossClaimLessons
    .map((l: any) => `- Carrier: ${l.claims?.insurance_company}, Loss: ${l.claims?.loss_type}, Recovery: ${l.recovery_percentage}%, Winning args: ${JSON.stringify(l.winning_arguments)}`)
    .join('\n');

  const prompt = `You are a senior public adjuster strategist. Based on the following claim data, generate a Claim Thesis Object.

CLAIM:
- Claim #: ${claim.claim_number}
- Loss Type: ${claim.loss_type || 'Unknown'}
- Loss Date: ${claim.loss_date || 'Unknown'}
- Insurance Company: ${claim.insurance_company || 'Unknown'}
- Status: ${claim.status}
- Description: ${claim.loss_description || 'N/A'}

DOCUMENTS ON FILE:
${filesContext || 'None'}

PHOTOS ON FILE:
${photosContext || 'None'}

CROSS-CLAIM LESSONS:
${lessonsContext || 'None available'}

You MUST return a JSON object with these exact fields:
{
  "primary_cause_of_loss": "The specific peril/event that caused damage",
  "primary_coverage_theory": "Why this loss is covered under the policy",
  "primary_carrier_error": "What the carrier got wrong or failed to do",
  "evidence_map": [{"type": "document|photo", "id": "actual ID from above", "name": "filename", "relevance": "why this matters"}],
  "anticipated_pushback": "What the carrier will likely argue back",
  "pushback_counter": "How to counter their anticipated argument"
}

IMPORTANT: evidence_map MUST reference actual document/photo IDs from the lists above. No fabricated IDs.`;

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [
        { role: 'system', content: 'You are a claims strategy AI. Return ONLY valid JSON, no markdown.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    console.error('AI thesis generation failed:', response.status);
    // Return a minimal thesis
    return {
      primary_cause_of_loss: claim.loss_type || 'Unknown - requires manual input',
      primary_coverage_theory: 'Direct physical loss from covered peril',
      primary_carrier_error: 'Insufficient evaluation of claim evidence',
      evidence_map: buildEvidenceMap(memorySnapshot.files, memorySnapshot.photos, claim),
      anticipated_pushback: '',
      pushback_counter: '',
    };
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  try {
    // Clean markdown code fences if present
    const cleaned = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      primary_cause_of_loss: parsed.primary_cause_of_loss || claim.loss_type || 'Unknown',
      primary_coverage_theory: parsed.primary_coverage_theory || 'Direct physical loss',
      primary_carrier_error: parsed.primary_carrier_error || 'Insufficient evaluation',
      evidence_map: Array.isArray(parsed.evidence_map) ? parsed.evidence_map : buildEvidenceMap(memorySnapshot.files, memorySnapshot.photos, claim),
      anticipated_pushback: parsed.anticipated_pushback || '',
      pushback_counter: parsed.pushback_counter || '',
    };
  } catch (e) {
    console.error('Failed to parse AI thesis:', e, content.substring(0, 200));
    return {
      primary_cause_of_loss: claim.loss_type || 'Unknown',
      primary_coverage_theory: 'Direct physical loss from covered peril',
      primary_carrier_error: 'Carrier failed to properly evaluate claim',
      evidence_map: buildEvidenceMap(memorySnapshot.files, memorySnapshot.photos, claim),
      anticipated_pushback: '',
      pushback_counter: '',
    };
  }
}

// ─── STEP D: Build Pipeline Context for Output ────────────────────────

function buildPipelineContext(
  thesis: ThesisObject,
  memorySnapshot: any,
  deltas: any,
  crossClaimLessons: any[],
  industryNotes: any[],
  webSearchResults: any[],
  validationErrors: string[],
): string {
  let ctx = '\n\n=== STRATEGIC PIPELINE CONTEXT (MANDATORY REVIEW) ===\n';
  ctx += 'You MUST review the following before generating output.\n\n';

  // Thesis
  ctx += '── CLAIM THESIS (Locked Position) ──\n';
  ctx += `Primary Cause of Loss: ${thesis.primary_cause_of_loss}\n`;
  ctx += `Primary Coverage Theory: ${thesis.primary_coverage_theory}\n`;
  ctx += `Primary Carrier Error: ${thesis.primary_carrier_error}\n`;
  ctx += `Anticipated Pushback: ${thesis.anticipated_pushback || 'Not specified'}\n`;
  ctx += `Counter: ${thesis.pushback_counter || 'Not specified'}\n`;
  if (validationErrors.length > 0) {
    ctx += `⚠️ Thesis Warnings: ${validationErrors.join('; ')}\n`;
  }
  ctx += '\n';

  // Evidence map
  ctx += '── EVIDENCE ANCHORS ──\n';
  ctx += 'ALL outputs MUST cite at least one of these anchors:\n';
  for (const evidence of thesis.evidence_map) {
    ctx += `- [${evidence.type.toUpperCase()}] ${evidence.name} (ID: ${evidence.id}) — ${evidence.relevance}\n`;
  }
  if (thesis.evidence_map.length === 0) {
    ctx += '⚠️ NO EVIDENCE ANCHORS AVAILABLE. Output should note evidence gaps.\n';
  }
  ctx += '\n';

  // Deltas
  ctx += '── RECENT DELTAS ──\n';
  if (deltas.hasDelta) {
    if (deltas.newFiles.length > 0) {
      ctx += `New files since last review:\n${deltas.newFiles.map((f: any) => `  - ${f.file_name} [${f.document_classification || 'unclassified'}] (uploaded ${new Date(f.uploaded_at).toLocaleDateString()})`).join('\n')}\n`;
    }
    if (deltas.newNotes.length > 0) {
      ctx += `New notes: ${deltas.newNotes.length}\n`;
    }
    if (deltas.newEmails.length > 0) {
      ctx += `New emails: ${deltas.newEmails.map((e: any) => `${e.subject} (${e.direction})`).join(', ')}\n`;
    }
    ctx += 'MANDATE: You must explicitly incorporate at least one delta item in your output.\n';
  } else {
    ctx += 'No new file activity since last review.\n';
  }
  ctx += '\n';

  // Cross-claim lessons
  ctx += '── CROSS-CLAIM LESSONS ──\n';
  if (crossClaimLessons.length > 0) {
    for (const lesson of crossClaimLessons) {
      ctx += `- Carrier: ${lesson.claims?.insurance_company || 'Unknown'}, Loss: ${lesson.claims?.loss_type || 'Unknown'}, Recovery: ${lesson.recovery_percentage || 'N/A'}%\n`;
      if (lesson.winning_arguments) {
        const args = typeof lesson.winning_arguments === 'string' ? lesson.winning_arguments : JSON.stringify(lesson.winning_arguments);
        ctx += `  Winning args: ${args.substring(0, 200)}\n`;
      }
    }
  } else {
    ctx += 'No matching cross-claim lessons found.\n';
  }
  ctx += '\n';

  // Industry notes
  ctx += '── INDUSTRY NOTES ──\n';
  if (industryNotes.length > 0) {
    for (const note of industryNotes.slice(0, 5)) {
      ctx += `- [${note.source_type}] ${note.cache_key}: ${note.content.substring(0, 200)}...\n`;
    }
  } else {
    ctx += 'No cached industry notes matched.\n';
  }
  ctx += '\n';

  // Web search results
  if (webSearchResults.length > 0) {
    ctx += '── WEB SEARCH RESULTS ──\n';
    for (const result of webSearchResults) {
      ctx += `Query: ${result.query}\nResult: ${result.result.substring(0, 500)}\n\n`;
    }
  }

  ctx += '=== END STRATEGIC PIPELINE CONTEXT ===\n';
  ctx += 'RULE: No rebuttal/strategic output unless thesis exists and is backed by claim anchors (doc IDs / photo IDs).\n';

  return ctx;
}

// ─── Main Handler ─────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { claimId, analysisType, forceRefresh }: PipelineRequest = await req.json();

    if (!claimId) throw new Error('claimId is required');

    // Check if this analysis type requires the pipeline
    const requiresPipeline = STRATEGIC_TYPES.includes(analysisType);
    if (!requiresPipeline) {
      return new Response(
        JSON.stringify({ pipelineRequired: false, pipelineContext: '' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch claim
    const { data: claim, error: claimError } = await supabase
      .from('claims')
      .select('*')
      .eq('id', claimId)
      .single();
    if (claimError || !claim) throw new Error('Claim not found');

    // ── Step A ──
    const { memorySnapshot, deltas, crossClaimLessons, industryNotes, state } = await loadMemory(supabase, claimId, claim);

    // ── Step B ──
    const searchDecision = await decideWebSearch(supabase, claim, memorySnapshot, industryNotes, state);
    let webSearchResults: any[] = [];
    if (searchDecision.needed) {
      webSearchResults = await executeWebSearches(searchDecision.queries);

      // Cache web search results as industry notes
      for (const result of webSearchResults) {
        if (result.result && result.result.length > 50) {
          const cacheKey = `${state}_${claim.loss_type || 'general'}_${Date.now()}`;
          const sourceType = result.query.includes('regulation') ? 'regulation'
            : result.query.includes('manufacturer') ? 'manufacturer_spec'
            : 'weather_data';
          try {
            await supabase.from('industry_notes_cache').upsert({
              cache_key: cacheKey,
              state_code: state,
              peril: claim.loss_type || null,
              content: result.result.substring(0, 5000),
              source_type: sourceType,
              expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            }, { onConflict: 'cache_key' });
          } catch (e) {
            console.error('Failed to cache industry note:', e);
          }
        }
      }
    }

    // ── Step C ──
    const { thesis, isNew, validationErrors } = await buildThesisObject(
      supabase, claimId, claim, memorySnapshot, deltas,
      crossClaimLessons, industryNotes, webSearchResults, forceRefresh || false,
    );

    // ── Step D ──
    const pipelineContext = buildPipelineContext(
      thesis, memorySnapshot, deltas, crossClaimLessons,
      industryNotes, webSearchResults, validationErrors,
    );

    console.log(`[Pipeline] Complete. Thesis ${isNew ? 'generated' : 'reused'}. ${validationErrors.length} warnings. Context: ${pipelineContext.length} chars`);

    return new Response(
      JSON.stringify({
        pipelineRequired: true,
        pipelineContext,
        thesis,
        thesisIsNew: isNew,
        validationErrors,
        searchPerformed: searchDecision.needed,
        searchReasons: searchDecision.reasons,
        deltaSummary: deltas.hasDelta
          ? `${deltas.newFiles.length} new files, ${deltas.newNotes.length} new notes, ${deltas.newEmails.length} new emails`
          : 'No new activity since last review',
        crossClaimCount: crossClaimLessons.length,
        industryNotesCount: industryNotes.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: any) {
    console.error('Strategic pipeline error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
