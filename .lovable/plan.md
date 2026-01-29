
# Mobile Readability Fix Plan
## Darwin Tab Tables and Grids

---

## Problem Analysis

Several Darwin tab components have fixed-column grid layouts that become unreadable on mobile devices:

| Component | Issue | Current Layout |
|-----------|-------|----------------|
| ClaimWarRoom | Quick stats row | `grid-cols-5` (no responsive) |
| ClaimWarRoom | 4-quadrant layout | `grid-cols-2` (no responsive) |
| DarwinInsightsPanel | Health score dashboard | `grid-cols-5` (no responsive) |
| CarrierPlaybookDialog | Carrier profile metrics | `grid-cols-4` (no responsive) |
| CarrierBehaviorProfile | Metric cards | `grid-cols-4` (no responsive) |

---

## Solution Approach

Add responsive breakpoints using Tailwind's mobile-first approach:
- Mobile: Stack vertically or use smaller grids (2 columns max)
- Keep desktop layouts exactly as-is

---

## Files to Modify

### 1. ClaimWarRoom.tsx

**Quick Stats Row (Line 156)**
```
// Before: grid grid-cols-5
// After:  grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5
```

**4-Quadrant Layout (Line 192)**
```
// Before: grid grid-cols-2
// After:  grid grid-cols-1 md:grid-cols-2
```

### 2. DarwinInsightsPanel.tsx

**Health Score Dashboard (Line 216)**
```
// Before: grid grid-cols-5
// After:  grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5
```
The "Overall" score will span full width on mobile for emphasis.

### 3. CarrierPlaybookDialog.tsx

**Carrier Profile Metrics (Line 170)**
```
// Before: grid grid-cols-4
// After:  grid grid-cols-2 md:grid-cols-4
```

**Badge Filters (Line 207)**
- Wrap in `flex-wrap` with `gap-1` (already has gap-1, add overflow handling)

### 4. CarrierBehaviorProfile.tsx

**Metric Cards Grid (Line 163)**
```
// Before: grid grid-cols-4
// After:  grid grid-cols-2 md:grid-cols-4
```

---

## Technical Details

All changes follow Tailwind responsive prefix pattern:
- Default (no prefix): Mobile styles
- `sm:` → 640px and up
- `md:` → 768px and up

This ensures desktop layouts remain unchanged while mobile becomes readable.

---

## Summary of Changes

| File | Line | Change |
|------|------|--------|
| ClaimWarRoom.tsx | 156 | Add `grid-cols-2 sm:grid-cols-3 md:grid-cols-5` |
| ClaimWarRoom.tsx | 192 | Add `grid-cols-1 md:grid-cols-2` |
| DarwinInsightsPanel.tsx | 216 | Add `grid-cols-2 sm:grid-cols-3 md:grid-cols-5` |
| CarrierPlaybookDialog.tsx | 170 | Add `grid-cols-2 md:grid-cols-4` |
| CarrierBehaviorProfile.tsx | 163 | Add `grid-cols-2 md:grid-cols-4` |
