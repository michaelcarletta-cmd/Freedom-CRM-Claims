

# Darwin Deep Analysis on Document Detection

## Overview

This enhancement makes Darwin go beyond classification - when a denial, engineer report, or estimate arrives, Darwin will **automatically run the appropriate analyzer** so when you enter the claim, the analysis is already complete with:

- **Denials**: Full rebuttal drafted, denial reason parsed, ambiguous statements highlighted
- **Engineer Reports**: Weaknesses identified, contradictions flagged, counter-arguments prepared  
- **Estimates**: Gap analysis completed, missing line items identified, supplement opportunities noted

---

## What Happens Now vs After Implementation

### Current Flow (Classification Only)

```text
Document Uploaded → Classification Badge Appears → "Denial" tag shown
User must manually → Open Denial Analyzer → Select File → Click Generate → Wait
```

### New Flow (Deep Analysis)

```text
Document Uploaded → Classification → Auto-Trigger Deep Analysis
                                    ↓
When you open the claim:
  - Rebuttal already drafted
  - Weaknesses already identified  
  - Gaps already analyzed
  - Escalation alert with summary
```

---

## Document-Specific Deep Analysis

| Document Type | Auto-Analysis Triggered | What You'll See Ready |
|--------------|------------------------|----------------------|
| **Denial** | `denial_rebuttal` | Full point-by-point rebuttal with citations, ambiguous language flagged, carrier deadline tracked |
| **Engineer Report** | `engineer_report_rebuttal` | Technical counter-arguments, code violations identified, contradictions with photos highlighted |
| **Estimate** | `estimate_gap_analysis` (new) | Missing line items, underpaid quantities, supplement opportunities, comparison to typical scope |

---

## Technical Implementation

### Modify `darwin-process-document/index.ts`

After classification completes with high confidence (≥0.8), trigger the appropriate deep analysis:

```typescript
// After classification is stored, trigger deep analysis
if (classificationResult.confidence >= 0.8) {
  await triggerDeepAnalysis(
    supabase,
    targetClaimId,
    classificationResult.classification,
    fileId,
    file?.file_path
  );
}
```

### New Function: `triggerDeepAnalysis`

```typescript
async function triggerDeepAnalysis(
  supabase: any,
  claimId: string,
  classification: DocumentClassification,
  fileId: string,
  filePath: string
) {
  // Map classification to analysis type
  const analysisMap: Record<string, string> = {
    'denial': 'denial_rebuttal',
    'engineering_report': 'engineer_report_rebuttal',
    'estimate': 'estimate_gap_analysis',
  };

  const analysisType = analysisMap[classification];
  if (!analysisType) return; // No deep analysis for this type

  console.log(`Triggering deep analysis: ${analysisType} for file ${fileId}`);

  // Download file for analysis
  const { data: fileBlob } = await supabase.storage
    .from('claim-files')
    .download(filePath);

  if (!fileBlob) {
    console.error('Could not download file for deep analysis');
    return;
  }

  // Convert to base64
  const arrayBuffer = await fileBlob.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

  // Call darwin-ai-analysis
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  await fetch(`${SUPABASE_URL}/functions/v1/darwin-ai-analysis`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      claimId,
      analysisType,
      pdfContent: base64,
      pdfFileName: filePath.split('/').pop(),
      additionalContext: {
        auto_triggered: true,
        source_file_id: fileId,
        trigger_reason: `Automatically analyzed upon ${classification} detection`
      }
    })
  });

  // Log the auto-analysis action
  await supabase.from('darwin_action_log').insert({
    claim_id: claimId,
    action_type: 'auto_deep_analysis',
    action_details: {
      file_id: fileId,
      classification,
      analysis_type: analysisType,
    },
    was_auto_executed: true,
    result: `Automatically triggered ${analysisType} for detected ${classification}`,
    trigger_source: 'darwin_document_intelligence',
  });
}
```

---

## New Analysis Type: `estimate_gap_analysis`

Add to `darwin-ai-analysis/index.ts` to analyze incoming estimates for gaps and supplement opportunities:

```typescript
case 'estimate_gap_analysis': {
  systemPrompt = `You are Darwin, analyzing an incoming insurance estimate to identify gaps, underpayments, and supplement opportunities.

Your task is to:
1. Identify MISSING line items that should be included
2. Flag UNDERPRICED quantities (e.g., roof area seems low)
3. Spot MISSING categories (e.g., no O&P, no code upgrade, no detach/reset)
4. Compare to typical scope for this loss type
5. Note any ambiguous or limiting language

Respond with a structured analysis:

## ESTIMATE SUMMARY
- Estimate Type: [Xactimate/Symbility/Contractor]
- Total RCV: $X
- Depreciation: $X  
- Net Claim: $X

## MISSING LINE ITEMS
1. [Item] - Typically included for [loss type], estimated value: $X
2. ...

## QUANTITY CONCERNS
1. [Line item]: Listed as X SQ, typical for this property would be Y SQ
2. ...

## SUPPLEMENT OPPORTUNITIES  
1. [Category]: [Specific opportunity]
2. ...

## AMBIGUOUS LANGUAGE TO CHALLENGE
1. "[Quote from estimate]" - This is vague because...

## RECOMMENDED ACTIONS
1. Request supplement for [items]
2. Challenge [specific items]
`;
  break;
}
```

---

## UI: Show Auto-Analysis Results

The existing components (DarwinDenialAnalyzer, DarwinEngineerReportAnalyzer) already load previous analysis on mount:

```typescript
useEffect(() => {
  const loadPreviousAnalysis = async () => {
    const { data } = await supabase
      .from('darwin_analysis_results')
      .select('*')
      .eq('claim_id', claimId)
      .eq('analysis_type', 'denial_rebuttal')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (data) {
      setAnalysis(data.result);
      setLastAnalyzed(new Date(data.created_at));
    }
  };
  loadPreviousAnalysis();
}, [claimId]);
```

This means when you open the claim and go to the Darwin tab → Denial Analyzer, **the analysis will already be there**.

### Enhancement: Add Notification Banner

Add a banner to DarwinTab showing pending auto-analyses:

```typescript
// Show alert when auto-analysis completed
{autoAnalyses.length > 0 && (
  <Alert className="mb-4 border-primary/50 bg-primary/10">
    <Brain className="h-4 w-4" />
    <AlertTitle>Darwin Analysis Ready</AlertTitle>
    <AlertDescription>
      {autoAnalyses.map(a => (
        <div key={a.id}>
          <strong>{a.analysis_type}</strong>: {a.input_summary}
          <Button size="sm" onClick={() => scrollToAnalyzer(a.analysis_type)}>
            View
          </Button>
        </div>
      ))}
    </AlertDescription>
  </Alert>
)}
```

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/darwin-process-document/index.ts` | Add `triggerDeepAnalysis` function, call after classification |
| `supabase/functions/darwin-ai-analysis/index.ts` | Add `estimate_gap_analysis` case |
| `src/components/claim-detail/DarwinTab.tsx` | Add auto-analysis notification banner |

---

## Safety Controls

1. **Confidence Threshold**: Only trigger deep analysis if classification confidence ≥ 80%
2. **Rate Limiting**: Don't trigger if same file already analyzed in last hour
3. **Error Isolation**: Deep analysis failures don't affect classification
4. **Logging**: All auto-analyses logged to `darwin_action_log`
5. **Non-blocking**: Deep analysis runs asynchronously (fire-and-forget)

---

## User Experience After Implementation

### When a Denial Letter Arrives (via email or upload)

1. File uploaded and classified as "Denial" (3-5 seconds)
2. Darwin automatically downloads file and runs denial analysis (15-30 seconds)
3. User opens claim → sees escalation warning
4. Goes to Darwin tab → **Rebuttal already drafted and waiting**
5. User can copy, edit, or use in One-Click Package immediately

### When an Engineer Report Arrives

1. Classified as "Engineering Report"
2. Darwin auto-analyzes for weaknesses and contradictions
3. User opens claim → engineer rebuttal ready
4. Contradictions with photos already flagged
5. Counter-arguments citing building codes prepared

### When a Carrier Estimate Arrives

1. Classified as "Estimate"  
2. Darwin extracts RCV to accounting (existing)
3. **NEW**: Gap analysis runs automatically
4. User opens claim → sees "Supplement Opportunities" ready
5. Missing items and underpriced quantities already identified

---

## Summary

After implementation:
- **Denials** get automatic rebuttals drafted
- **Engineer reports** get automatic counter-argument analysis
- **Estimates** get automatic gap/supplement analysis
- All analysis is **ready before you open the claim**
- Nothing left unaddressed - every gap, weakness, and opportunity identified

