

# Fix Document Template Generation Bundling Timeout

## Problem Summary
The `generate-document` edge function is failing to deploy with a "Bundle generation timed out" error. This prevents users from generating documents from templates.

## Root Cause Analysis
After comparing with working edge functions (`generate-pol-docx`, `generate-photo-report-docx`), the issue is:

| Function | Supabase Client Import | Status |
|----------|----------------------|--------|
| `generate-pol-docx` | `@supabase/supabase-js@2.39.3` (pinned) | Works |
| `generate-photo-report-docx` | `@supabase/supabase-js@2.39.3` (pinned) | Works |
| `generate-document` | `@supabase/supabase-js@2` (floating) | Fails |

The floating `@2` version resolves to the latest 2.x release, which may include heavier dependencies that cause the bundler to exceed its time limit.

## Solution

### Step 1: Pin the Supabase Client Version
Update the import in `generate-document/index.ts`:

```text
Before:
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

After:
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
```

### Step 2: Update CORS Headers (Already Done)
The CORS headers have already been updated to include the required Supabase client platform headers. This fix is preserved.

## Technical Details

### Why Pinning Works
- esm.sh caches pinned versions, making bundling faster
- Avoids pulling in unexpected transitive dependencies from newer releases
- Matches the pattern used by other working document generation functions

### Files to Modify
- `supabase/functions/generate-document/index.ts` (line 2)

### Expected Outcome
After this change:
1. The bundler will resolve the same cached dependency graph as the working functions
2. Deployment should complete within the timeout
3. Template document generation will resume working

## Verification Steps
1. Deploy the updated function
2. Navigate to a claim and open the Templates tab
3. Select a template and generate a document
4. Confirm the document downloads successfully

