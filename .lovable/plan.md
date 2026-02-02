
# Semi-Autonomous Mode Enhancement

## Status: ✅ IMPLEMENTED

## Overview

This change redefines autonomy levels so that **semi-autonomous** does everything automatically except send emails to insurance companies/adjusters. Client communications (emails, SMS) will be sent automatically, and all status updates, task completions, and accounting updates will happen without requiring human review.

---

## Autonomy Level Definitions (IMPLEMENTED)

| Action | Supervised | Semi-Autonomous | Fully Autonomous |
|--------|------------|-----------------|------------------|
| Status updates (Estimate Received, Denied, Approved) | Manual | ✅ Auto | ✅ Auto |
| Task creation | Auto | ✅ Auto | ✅ Auto |
| Task completion | Manual | ✅ Auto | ✅ Auto |
| Accounting updates (RCV extraction) | Auto | ✅ Auto | ✅ Auto |
| Emails to **clients/policyholders** | Queue for review | ✅ Auto | ✅ Auto |
| SMS to clients | Queue for review | ✅ Auto | ✅ Auto |
| Emails to **contractors** | Queue for review | ✅ Auto | ✅ Auto |
| Emails to **insurance companies/adjusters** | Queue for review | ⏸️ Queue for review | ✅ Auto |
| Deep analysis (rebuttals, gap analysis) | Auto | ✅ Auto | ✅ Auto |

---

## Changes Made

### 1. `darwin-process-document/index.ts` - Status Updates ✅
- Added `isAutonomous` check that includes both `semi_autonomous` and `fully_autonomous`
- Status now auto-updates for Denied, Estimate Received, and Approved when `isAutonomous` is true

### 2. `darwin-autonomous-agent/index.ts` - Email/SMS Auto-Send ✅
- Updated to process auto-send for both semi and fully autonomous claims
- Added recipient type filtering: insurance emails require human review for semi-autonomous
- Added `processAutoSendSMS` function with same filtering logic
- Task auto-completion now works for semi-autonomous claims too

### 3. `process-claim-ai-action/index.ts` - Recipient Type ✅
- Added `recipient_type` detection when creating email draft pending actions
- Checks policyholder, adjuster, and insurance email addresses to classify recipient

### 4. `inbound-email/index.ts` - Sender Type Passing ✅
- Now passes `senderType` to process-claim-ai-action for better recipient classification

---

## Summary

**Semi-Autonomous claims now automatically**:
- ✅ Update status when estimates, denials, or approvals arrive
- ✅ Complete tasks when responses are received
- ✅ Send emails/SMS to clients and contractors
- ✅ Run deep analysis on documents
- ✅ Create escalations for urgent items

**Semi-Autonomous claims still require human review for**:
- ⏸️ Emails to adjusters
- ⏸️ Emails to insurance companies
- ⏸️ Any communication containing escalation keywords (lawsuit, attorney, etc.)

**Fully Autonomous** remains unchanged - everything auto-executes (with keyword blockers still applying).
