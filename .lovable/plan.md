
# Fix Client Portal Not Showing Claims

## Problem Identified

When "Michael Carletta (Test)" logs in with the `client` role, no claims appear. The root cause is a **missing RLS policy on the `clients` table**.

### How the Client Portal Fetches Claims

```text
┌─────────────────────────────────────────────────────────────────┐
│ 1. User logs in with client role                                │
│ 2. ClaimsTableConnected queries clients table for their record  │
│    → SELECT id FROM clients WHERE user_id = auth.uid()          │
│ 3. RLS blocks this query (no policy for client role!)           │
│ 4. No client record found → returns empty claims array          │
└─────────────────────────────────────────────────────────────────┘
```

### Current RLS Policies on `clients` Table

| Policy | Allows |
|--------|--------|
| Authenticated users with roles can view clients | admin, staff, read_only only |
| Staff and admins can manage clients | admin, staff only |

**Missing**: A policy for the `client` role to view their own record.

---

## Solution

Add an RLS policy that allows users with the `client` role to view their own client record (where `clients.user_id = auth.uid()`).

### Database Migration

```sql
-- Allow clients to view their own client record
CREATE POLICY "Clients can view own record"
  ON public.clients
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
```

This ensures:
1. Clients can only see their own record (not other clients)
2. The claims query will work correctly by finding the linked client_id
3. No changes needed to the application code

---

## Technical Details

### Why the Current Claims Policy Depends on This

The existing claims policy for clients is:
```sql
"Clients can view their claims"
USING: EXISTS (SELECT 1 FROM clients WHERE clients.id = claims.client_id AND clients.user_id = auth.uid())
```

This nested query to the `clients` table **also respects RLS**. When a client user can't read the `clients` table, this subquery returns no rows, making the claims invisible.

By adding the new policy, both the direct client lookup in the code AND the nested subquery in the claims RLS policy will work correctly.

### Files Changed

| Location | Change |
|----------|--------|
| Database (RLS Policy) | Add "Clients can view own record" policy on `clients` table |

---

## Expected Outcome

After this fix:
1. Michael Carletta (Test) logs in
2. The app queries `clients` for their record → finds `be7018f5-665a-47fe-97eb-7650dd9cfa92`
3. Queries claims with `client_id = be7018f5-...`
4. Both claims appear in the portal
