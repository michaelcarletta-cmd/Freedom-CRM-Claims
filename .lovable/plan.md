

# Personal Property Photo Pipeline for Home Inventory Builder

## Overview

Add an AI-powered photo scanning pipeline to the existing Home Inventory Builder that lets users upload room photos, automatically detects items visible in the images, normalizes them into claim-grade inventory records, prices each item (RCV and ACV), and presents an editable "Items Found" UI with confidence indicators, user confirmation prompts, and bulk category filtering.

## What Changes

### 1. New Edge Function: `inventory-photo-pipeline`

A new backend function that runs a 3-stage AI pipeline on uploaded room photos:

- **Stage 1 -- Object Detection**: Sends the photo to Gemini 2.5 Flash with a structured prompt. Returns a JSON array of detected items, each with: `label`, `confidence` (0-1), `bounding_box` (x/y/w/h percentages), and `estimated_category`.
- **Stage 2 -- Item Normalization**: Takes the raw detections and normalizes each into a claim-grade record: `category` (Electronics, Furniture, Appliances, Clothing, etc.), `brand` (if identifiable), `model` (if identifiable), `brand_confidence`, `model_confidence`, `attributes` (color, size, material), `condition_estimate`.
- **Stage 3 -- Pricing**: For each normalized item, uses Gemini to perform retail price matching. Returns: `rcv` (replacement cost value), `acv` (actual cash value based on condition/age), `pricing_confidence`, `pricing_source` (e.g., "Amazon retail match", "Home Depot comparable", "industry average"), `pricing_rationale` (1-2 sentence explanation), and `comparable_url` if available.

**Confidence thresholds** (configurable):
- Detection confidence below 0.6 = item flagged for review
- Brand/model confidence below 0.7 = fields marked "unconfirmed" requiring user edit
- Pricing confidence below 0.7 = price flagged with warning badge

### 2. Database Migration

Add new columns to `claim_home_inventory`:

| Column | Type | Purpose |
|--------|------|---------|
| `source` | text | "manual" or "ai_photo_scan" |
| `ai_confidence` | numeric | Overall detection confidence |
| `brand_confirmed` | boolean | User confirmed brand (default false) |
| `model_confirmed` | boolean | User confirmed model (default false) |
| `price_confirmed` | boolean | User confirmed pricing (default false) |
| `pricing_source` | text | Where the price came from |
| `pricing_rationale` | text | Why that price was chosen |
| `comparable_url` | text | Link to comparable product |
| `category` | text | Standardized category |
| `attributes` | jsonb | Color, size, material, etc. |
| `source_photo_id` | uuid | FK to claim_photos |
| `needs_review` | boolean | Flagged for user confirmation |
| `depreciation_rate` | numeric | Annual depreciation percentage |
| `age_years` | numeric | Estimated or entered age |

Add a new table `inventory_scan_runs`:

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid PK | |
| `claim_id` | uuid FK | |
| `photo_ids` | uuid[] | Photos processed |
| `status` | text | pending/processing/complete/error |
| `detected_count` | int | Items found |
| `confirmed_count` | int | Items user-confirmed |
| `created_by` | uuid | |
| `created_at` | timestamptz | |

### 3. Frontend: Rebuilt `DarwinHomeInventoryBuilder.tsx`

The component gets a new **tabbed layout** with three views:

**Tab 1: Scan Photos** (new)
- "Select Photos to Scan" button opens a photo picker showing claim photos grouped by room/category
- Progress bar during pipeline execution (Stage 1/2/3)
- After scan: shows a card grid of detected items with:
  - Thumbnail crop from the photo (bounding box overlay)
  - Item name, category, brand/model (editable inline)
  - Confidence badges (green >= 0.7, yellow 0.5-0.7, red < 0.5)
  - RCV / ACV columns
  - Pricing source pill (e.g., "Amazon", "Industry Avg")
  - Checkbox to accept/reject each item
  - Items below confidence thresholds show amber "Needs Review" banner
- **Bulk actions toolbar**:
  - Category filter dropdown (Electronics, Furniture, Appliances, etc.)
  - "Accept All Confirmed" (items above all thresholds)
  - "Accept Selected" / "Reject Selected"
  - Room assignment dropdown for bulk assignment
- "Add to Inventory" moves accepted items into the inventory table

**Tab 2: Inventory** (existing, enhanced)
- Current table view, now with:
  - `Source` column showing "Manual" or "AI Scan" badge
  - `Confirmed` indicators (checkmarks for brand/model/price)
  - ACV column alongside RCV
  - Pricing source tooltip on hover
  - Inline editing for any field
  - Depreciation info (age, rate, calculated ACV)

**Tab 3: Summary** (existing, enhanced)
- Totals now show both RCV and ACV
- Breakdown by category (not just room)
- Export includes all new fields (source, pricing rationale, ACV)

## Technical Details

### Edge Function Pipeline Flow

```text
Photo URL(s)
    |
    v
[Stage 1: Object Detection]
  model: gemini-2.5-flash (vision)
  input: photo + structured prompt
  output: [{label, confidence, bounding_box, category}]
    |
    v
[Stage 2: Normalization]
  model: gemini-2.5-flash
  input: detection results + photo context
  output: [{category, brand, model, brand_confidence, 
            model_confidence, attributes, condition}]
    |
    v
[Stage 3: Pricing]
  model: gemini-2.5-pro (for accuracy)
  input: normalized items + "find current retail replacement"
  output: [{rcv, acv, pricing_confidence, pricing_source, 
            pricing_rationale, comparable_url}]
    |
    v
Return merged results to frontend
```

### ACV Calculation

`ACV = RCV * (1 - (depreciation_rate * age_years))`

Default depreciation rates by category:
- Electronics: 15%/yr
- Furniture: 5%/yr  
- Appliances: 10%/yr
- Clothing: 25%/yr
- Other: 10%/yr

Users can override age and rate per item.

### Files Created/Modified

| File | Action |
|------|--------|
| `supabase/functions/inventory-photo-pipeline/index.ts` | Create |
| `src/components/claim-detail/DarwinHomeInventoryBuilder.tsx` | Full rewrite |
| Database migration (new columns + new table) | Create |

