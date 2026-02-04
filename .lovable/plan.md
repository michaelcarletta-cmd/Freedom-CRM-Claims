

# Fix Darwin Document Date Extraction

## Problem Summary
Darwin is incorrectly extracting document dates from uploaded files. In the Hoosack claim, a denial letter was classified with `date_mentioned: 2023-10-26` when the actual document date is 2026. This causes incorrect timeline analysis, deadline calculations, and strategic intelligence throughout the system.

## Root Cause
The document classification AI prompt lacks:
1. **Current date context** - The AI doesn't know what year it is
2. **Date validation rules** - No sanity checks for unreasonable dates  
3. **Extraction priority guidance** - No clarity on which date to extract (letter date vs. loss date vs. claim date)
4. **Format disambiguation** - No handling of ambiguous date formats (10/26/23 vs 10/26/2023)

## Solution

### 1. Enhanced Date Extraction Prompt
Update the `classifyDocument` function in `darwin-process-document/index.ts` to include:

- **Current date injection**: Tell the AI the current date so it can validate extracted dates
- **Date type specification**: Request extraction of `document_date` (the date the document was written/issued) separately from other dates mentioned
- **Validation rules**: Instruct the AI to flag dates that seem incorrect (e.g., future dates, dates before the claim's loss date)
- **Format handling**: Specify US date format priority and how to interpret 2-digit years (23 = 2023 for older docs, but 26 = 2026 for current context)

### 2. Add Date Confidence Score
Include a `date_confidence` field in the classification metadata to indicate how certain the AI is about the extracted date.

### 3. Add Date Validation Layer
Post-processing validation after AI extraction:
- Reject dates more than 10 years in the past
- Flag dates in the future
- Cross-reference with claim creation date for sanity checks

---

## Technical Details

### File: `supabase/functions/darwin-process-document/index.ts`

**Changes to `classifyDocument` function:**

```typescript
const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

const systemPrompt = `You are a document classifier for insurance claims. 
CURRENT DATE: ${currentDate}

Analyze the document and classify it.

DATE EXTRACTION RULES:
1. Extract the DOCUMENT DATE - the date the letter/document was written or issued
2. This is typically found in the letterhead, header, or near the signature
3. Do NOT confuse this with loss dates, claim dates, or policy dates mentioned in the body
4. For 2-digit years: interpret based on current year (${currentYear}):
   - Years 00-29 are 2000-2029
   - Years 30-99 are 1930-1999
5. If no clear document date is found, return null - do not guess
6. Flag any date that seems incorrect (e.g., future dates, very old dates)

Return ONLY valid JSON with this structure:
{
  "classification": "estimate|denial|approval|rfi|engineering_report|policy|correspondence|invoice|photo|other",
  "confidence": 0.0-1.0,
  "metadata": {
    "document_date": "YYYY-MM-DD or null - the date this document was issued",
    "date_confidence": 0.0-1.0,
    "date_mentioned": "YYYY-MM-DD or null - DEPRECATED, use document_date",
    "dates_found": [{"type": "letter_date|loss_date|claim_date|policy_date|deadline", "date": "YYYY-MM-DD", "context": "brief context"}],
    ...
  }
}`;
```

**Add post-extraction validation:**

```typescript
function validateExtractedDate(dateStr: string | null, claimCreatedAt?: string): {
  isValid: boolean;
  correctedDate: string | null;
  warning: string | null;
} {
  if (!dateStr) return { isValid: true, correctedDate: null, warning: null };
  
  const extracted = new Date(dateStr);
  const now = new Date();
  const tenYearsAgo = new Date();
  tenYearsAgo.setFullYear(now.getFullYear() - 10);
  
  // Reject dates more than 10 years old
  if (extracted < tenYearsAgo) {
    return {
      isValid: false,
      correctedDate: null,
      warning: `Extracted date ${dateStr} appears too old, likely a misread`
    };
  }
  
  // Reject future dates
  if (extracted > now) {
    return {
      isValid: false,
      correctedDate: null,
      warning: `Extracted date ${dateStr} is in the future`
    };
  }
  
  return { isValid: true, correctedDate: dateStr, warning: null };
}
```

### File: `supabase/functions/darwin-strategic-intelligence/index.ts`

**Update `getDocumentDate` helper:**

```typescript
const getDocumentDate = (file: any): { date: string | null; source: 'document' | 'upload'; confidence: number } => {
  const metadata = file.classification_metadata;
  if (metadata && typeof metadata === 'object') {
    // Prefer new document_date field over deprecated date_mentioned
    const documentDate = (metadata as any).document_date;
    const dateMentioned = (metadata as any).date_mentioned;
    const dateConfidence = (metadata as any).date_confidence || 0.5;
    
    const dateStr = documentDate || dateMentioned;
    
    if (dateStr && typeof dateStr === 'string' && dateStr !== 'null') {
      // Validate the date is reasonable
      const dateObj = new Date(dateStr);
      const now = new Date();
      const fiveYearsAgo = new Date();
      fiveYearsAgo.setFullYear(now.getFullYear() - 5);
      
      // Only use document date if it's within reasonable range and has decent confidence
      if (dateObj >= fiveYearsAgo && dateObj <= now && dateConfidence >= 0.6) {
        return { date: dateStr, source: 'document', confidence: dateConfidence };
      }
    }
  }
  // Fallback to upload date with high confidence (it's always accurate)
  return { date: file.uploaded_at, source: 'upload', confidence: 1.0 };
};
```

---

## Files to Modify
1. `supabase/functions/darwin-process-document/index.ts` - Enhanced date extraction prompt and validation
2. `supabase/functions/darwin-strategic-intelligence/index.ts` - Updated date helper with validation

## Testing
After implementation:
1. Re-process the Hoosack denial document to verify correct date extraction
2. Test with various document formats (MM/DD/YY, MM/DD/YYYY, written dates)
3. Verify timeline displays correctly in the claim detail view

