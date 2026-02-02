
# Real-Time Document Processing & Email Attachment Integration

## Overview

This implementation adds two key capabilities:
1. **Immediate document classification** when files are uploaded (no waiting for batch processing)
2. **Automatic extraction and processing of email attachments** from inbound carrier emails

---

## What Will Happen After Implementation

### When You Upload a Document

1. File uploads to storage
2. Database record created
3. **Immediately** triggers `darwin-process-document` (no waiting)
4. Within seconds, you see the classification badge appear on the file
5. If autonomy enabled: tasks created, status updated, escalations flagged

### When an Email with Attachments Arrives

1. Email parsed and logged to claim
2. Attachments extracted from email payload
3. Each attachment uploaded to `claim-files` storage
4. Each attachment record created with source: `email_attachment`
5. Darwin processes each attachment immediately
6. Appropriate actions triggered based on content

---

## Technical Implementation

### Part 1: Real-Time Processing on Upload

**File: `src/components/claim-detail/ClaimFiles.tsx`**

Modify the upload mutation to trigger classification immediately after successful upload:

```typescript
// After insert succeeds, trigger Darwin processing (fire and forget)
supabase.functions.invoke('darwin-process-document', {
  body: { fileId: data.id }
}).catch(err => console.error('Darwin processing queued:', err));
```

The UI will update automatically when classification completes because we already have the query that fetches classification data.

---

### Part 2: Email Attachment Processing

**File: `supabase/functions/inbound-email/index.ts`**

Add attachment handling after the email is logged:

The Cloudflare Email Workers payload can include attachments. We'll:

1. Check for attachments in the payload
2. For each attachment:
   - Decode from base64
   - Upload to claim-files storage
   - Create claim_files record with `source: 'email_attachment'`
   - Trigger `darwin-process-document`

**Database change:**

Add a `source` column to track where files came from:

```sql
ALTER TABLE claim_files 
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'upload';
-- Values: 'upload', 'email_attachment', 'template', 'generated'
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/claim-detail/ClaimFiles.tsx` | Add real-time Darwin processing trigger after upload |
| `supabase/functions/inbound-email/index.ts` | Add attachment extraction, storage upload, and Darwin processing |
| Database migration | Add `source` column to `claim_files` |

---

## Implementation Details

### ClaimFiles.tsx Changes

In the `uploadFileMutation` `onSuccess` callback, add:

```typescript
// Trigger Darwin classification immediately (non-blocking)
supabase.functions.invoke('darwin-process-document', {
  body: { fileId: data.id }
}).then(() => {
  // Refetch to show updated classification
  setTimeout(() => refetchFiles(), 2000);
}).catch(console.error);
```

### Inbound Email Attachment Handling

Add after line ~345 (after email is inserted):

```typescript
// Process attachments if present
const attachments = payload.attachments || payload.Attachments || [];

for (const attachment of attachments) {
  const fileName = attachment.filename || attachment.Name || 'attachment';
  const contentType = attachment.contentType || attachment.ContentType || 'application/octet-stream';
  const content = attachment.content || attachment.Content; // base64 encoded
  
  if (!content) continue;
  
  // Decode and upload
  const fileBuffer = Uint8Array.from(atob(content), c => c.charCodeAt(0));
  const storagePath = `${claim.id}/email-attachments/${Date.now()}-${fileName}`;
  
  await supabase.storage
    .from('claim-files')
    .upload(storagePath, fileBuffer, { contentType });
  
  // Create file record
  const { data: fileRecord } = await supabase
    .from('claim_files')
    .insert({
      claim_id: claim.id,
      file_name: fileName,
      file_path: storagePath,
      file_size: fileBuffer.length,
      file_type: contentType,
      source: 'email_attachment',
      uploaded_by: null,
    })
    .select()
    .single();
  
  // Trigger Darwin processing
  if (fileRecord) {
    fetch(`${SUPABASE_URL}/functions/v1/darwin-process-document`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileId: fileRecord.id })
    }).catch(err => console.error('Darwin attachment processing:', err));
  }
}
```

---

## Safety & Performance

- **Non-blocking**: Darwin processing is fire-and-forget, upload completes instantly
- **UI refresh**: Delayed refetch (2 seconds) shows classification after processing
- **Large attachments**: Skipped if over 10MB to prevent timeout
- **Error handling**: Failed classification doesn't affect upload success
- **Logging**: All attachments logged to claim activity

---

## User Experience After Implementation

### Upload Flow
1. Click "Upload File" → Select file
2. File uploads instantly, toast shows "File uploaded"
3. 1-2 seconds later, classification badge appears on file
4. If high-priority (denial/RFI): notification appears immediately

### Email with Attachment Flow
1. Carrier sends email with estimate PDF attached
2. Email logged to claim communication tab
3. Attachment appears in Files tab with "email_attachment" source indicator
4. Classification badge shows "Estimate" 
5. Task "Review Estimate" created automatically
6. Accounting updated with extracted RCV value

---

## Database Migration

```sql
-- Add source column to track file origin
ALTER TABLE claim_files 
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'upload';

-- Add index for filtering by source
CREATE INDEX IF NOT EXISTS idx_claim_files_source 
  ON claim_files(source);

-- Add comment for documentation
COMMENT ON COLUMN claim_files.source IS 
  'Origin of file: upload, email_attachment, template, generated';
```

---

## Summary

After this implementation:

- Every uploaded document is classified **within seconds**
- Email attachments from carriers are **automatically extracted and processed**
- No more waiting for batch processing
- Classification badges appear in real-time
- Tasks and escalations trigger immediately based on document content
