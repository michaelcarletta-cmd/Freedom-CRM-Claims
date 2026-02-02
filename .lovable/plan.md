
# Darwin Document Intelligence System

## Overview

This enhancement enables Darwin to automatically detect, classify, and process incoming documents - whether from emails or direct uploads. When an estimate, denial letter, or carrier status update arrives, Darwin will:

1. **Detect** the document type (estimate, denial, approval, RFI, etc.)
2. **Extract** relevant data (financials, deadlines, key language)
3. **Take action** (update status, create tasks, flag for escalation)
4. **Log** everything for audit trail

---

## Current State

**What exists:**
- `claim_files` table with OCR fields (`extracted_text`, `ocr_processed_at`)
- `extracted_document_data` table for structured data extraction
- `extract-estimate` edge function for estimate parsing
- `DarwinSmartDocumentSort` component for basic classification
- `darwin-autonomous-agent` for scheduled autonomous actions
- `inbound-email` handler that processes email attachments (currently just saves them)

**Gap:**
- No automatic document type detection on upload
- No automatic extraction when files are added
- No status/task automation based on document content
- Inbound email attachments aren't processed for content

---

## Implementation Plan

### Phase 1: Document Classification Engine

**New edge function: `darwin-process-document`**

This function will:
1. Accept a file ID or file data
2. Use AI to classify the document type:
   - `estimate` (Xactimate, Symbility, contractor)
   - `denial` (claim denial letter)
   - `approval` (claim approval/payment letter)
   - `rfi` (Request for Information)
   - `engineering_report`
   - `policy_document`
   - `correspondence` (general carrier letter)
   - `invoice`
   - `photo`
   - `other`
3. Extract key metadata:
   - Date mentioned
   - Deadline mentioned
   - Dollar amounts
   - Key phrases (denial reason, approval amount, etc.)
4. Store classification in `claim_files` (new columns)
5. Trigger appropriate follow-up actions

**Database changes:**
```sql
-- Add classification columns to claim_files
ALTER TABLE claim_files 
  ADD COLUMN document_classification TEXT,
  ADD COLUMN classification_confidence NUMERIC(3,2),
  ADD COLUMN classification_metadata JSONB DEFAULT '{}',
  ADD COLUMN processed_by_darwin BOOLEAN DEFAULT FALSE,
  ADD COLUMN darwin_processed_at TIMESTAMPTZ;
```

---

### Phase 2: Automatic Processing Triggers

**Option A: Database trigger (realtime)**
Create a trigger on `claim_files` INSERT that fires a webhook to process new documents.

**Option B: Scheduled processing (batch)**
Extend `darwin-autonomous-agent` to scan for unprocessed files.

**Recommended: Option B** - More reliable, handles retries better, and can respect rate limits.

**Updates to `darwin-autonomous-agent`:**
```typescript
// Add new function: processUnclassifiedDocuments
// Scans for claim_files where document_classification IS NULL
// and processes them in batches
```

---

### Phase 3: Document-Based Automations

**When Darwin detects specific document types:**

| Document Type | Automatic Actions |
|--------------|-------------------|
| **Estimate** | Extract to accounting, update claim status to "Estimate Received", create task "Review estimate" |
| **Denial** | Flag escalation, analyze denial reason, draft rebuttal, update status to "Denied", create urgent task |
| **Approval** | Update status to "Approved", calculate payment amounts, create task "Process payment" |
| **RFI** | Create urgent task with deadline, draft response template |
| **Engineering Report** | Link to claim evidence, flag if contradicts carrier position |
| **Policy Document** | Extract coverage limits, link to claim |

**Updates to `darwin-autonomous-agent`:**
```typescript
// Add function: processDocumentActions
// Based on document_classification, trigger appropriate actions
```

---

### Phase 4: Inbound Email Attachment Processing

**Updates to `inbound-email` edge function:**

Currently, email attachments are handled by `claim-sync-webhook` for some integrations. We need to:

1. Extract attachments from inbound emails
2. Upload them to the claim's file storage
3. Trigger document classification
4. If autonomous mode is enabled, take appropriate actions

**Note:** The current inbound-email handler uses Cloudflare/Mailjet webhooks which may not include full attachment data. We may need to:
- Store attachment metadata from the webhook
- Use a separate process to download and process attachments
- Or rely on manual upload + smart sorting for now

---

### Phase 5: UI Enhancements

**Update `ClaimFiles.tsx`:**
- Show document classification badges
- Add "Reprocess with Darwin" button
- Show extraction results in file details

**Update `DarwinOperationsCenter.tsx`:**
- Add "Documents Processed" metric
- Show recent document classifications in action log

---

## Technical Implementation Details

### New Edge Function: `darwin-process-document`

```typescript
// supabase/functions/darwin-process-document/index.ts

// Input: { fileId: string } or { claimId: string, fileName: string, fileContent: base64 }
// 
// Process:
// 1. Fetch file from storage (if fileId provided)
// 2. Send to AI for classification
// 3. Based on type, perform additional extraction
// 4. Update claim_files with classification
// 5. If claim has autonomy enabled, trigger actions
// 6. Log to darwin_action_log
```

### AI Prompt for Classification

```text
You are a document classifier for insurance claims. Analyze this document and classify it.

Return JSON:
{
  "classification": "estimate|denial|approval|rfi|engineering_report|policy|correspondence|invoice|photo|other",
  "confidence": 0.0-1.0,
  "metadata": {
    "date_mentioned": "YYYY-MM-DD or null",
    "deadline_mentioned": "YYYY-MM-DD or null",
    "amounts": [{"description": "...", "amount": 0.00}],
    "key_phrases": ["..."],
    "sender": "carrier|adjuster|contractor|policyholder|unknown",
    "requires_action": true/false,
    "urgency": "high|medium|low",
    "summary": "One sentence summary"
  }
}

For denials, also extract:
- denial_reason: Main reason given
- denial_type: "full|partial|coverage|causation|procedure"

For estimates, also extract:
- estimate_type: "xactimate|symbility|contractor|unknown"
- gross_rcv: Total before depreciation

For approvals, also extract:
- approved_amount: Payment amount
- payment_type: "initial|supplement|final"
```

### Updates to `darwin-autonomous-agent`

Add new function to process unclassified documents:

```typescript
async function processUnclassifiedDocuments(supabase, results) {
  // Get claims with autonomy enabled
  const claimIds = [/* from main query */];
  
  // Find unprocessed files for these claims
  const { data: unprocessedFiles } = await supabase
    .from('claim_files')
    .select('id, claim_id, file_name, file_path')
    .in('claim_id', claimIds)
    .is('document_classification', null)
    .eq('processed_by_darwin', false)
    .limit(10); // Process in batches
  
  for (const file of unprocessedFiles) {
    await processDocument(supabase, file, results);
  }
}

async function processDocument(supabase, file, results) {
  // Call darwin-process-document function
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/darwin-process-document`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ fileId: file.id })
    }
  );
  
  const result = await response.json();
  
  // Handle actions based on classification
  if (result.classification === 'denial') {
    await handleDenialDetected(supabase, file.claim_id, result);
  } else if (result.classification === 'estimate') {
    await handleEstimateDetected(supabase, file.claim_id, result);
  }
  // ... etc
}
```

---

## Database Migration

```sql
-- Add classification columns to claim_files
ALTER TABLE claim_files 
  ADD COLUMN IF NOT EXISTS document_classification TEXT,
  ADD COLUMN IF NOT EXISTS classification_confidence NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS classification_metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS processed_by_darwin BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS darwin_processed_at TIMESTAMPTZ;

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_claim_files_unprocessed 
  ON claim_files(claim_id) 
  WHERE document_classification IS NULL AND processed_by_darwin = FALSE;

-- Document type index
CREATE INDEX IF NOT EXISTS idx_claim_files_classification 
  ON claim_files(document_classification);
```

---

## Files to Create/Modify

### New Files
- `supabase/functions/darwin-process-document/index.ts` - Document classification and processing

### Files to Modify
- `supabase/functions/darwin-autonomous-agent/index.ts` - Add document processing loop
- `src/components/claim-detail/ClaimFiles.tsx` - Show classification badges, reprocess button
- `src/components/dashboard/DarwinOperationsCenter.tsx` - Add document processing metrics

### Database Migration
- Add classification columns to `claim_files` table

---

## Safety Controls

1. **Batch processing**: Only process 10 documents per run to avoid overloading
2. **Confidence threshold**: Only auto-act on classifications with confidence > 0.8
3. **Human review for high-stakes**: Denials always create escalation, never auto-respond
4. **Logging**: All classifications logged to `darwin_action_log`
5. **Reprocessing**: Users can manually trigger reprocessing if classification was wrong

---

## Cron Setup

To make the autonomous agent run automatically, we'll set up a cron job:

```sql
-- Schedule darwin-autonomous-agent to run every 15 minutes
SELECT cron.schedule(
  'darwin-autonomous-agent',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url:='https://tnnzihuszaosnyeyceed.supabase.co/functions/v1/darwin-autonomous-agent',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);
```

---

## Summary

This implementation will enable Darwin to:
1. Automatically classify every document uploaded to claims
2. Extract relevant data from estimates, denials, approvals
3. Take appropriate actions (update status, create tasks, flag escalations)
4. Process documents from both direct uploads and email attachments
5. Provide full audit trail of all document processing

The system respects the existing autonomy levels - in supervised mode, it will classify and suggest actions; in autonomous mode, it will execute them.
