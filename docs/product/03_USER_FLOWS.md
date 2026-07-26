# 03 — User Flows

**Document:** `03_USER_FLOWS.md`  
**Milestone:** M15.0  

---

## Purpose

Define the primary workflows a user performs in Rother. Every flow documents the optimal path, current friction points, and proposed improvements. Flows are ordered by frequency of use.

---

## Flow 1: Daily Check-In

**Frequency:** Daily  
**Primary persona:** Sarah (Operations Manager)  
**Time budget:** <30 seconds

### Flow Steps

```
1. Open Rother tab                    → Already open or pinned
2. Scan Overview KPIs                 → "6 branches, 12 competitors, 210 reviews"
3. Check Update Health               → Green bar: "Healthy · 12 ok"
4. Check New Reviews count           → "+3 new reviews"
5. Scan Alerts badge                 → "2 alerts"
6. (Optional) Click Alerts tab       → Review alert details
7. Close tab                         → Done
```

### Current Friction
- No alert count badge on Alerts tab — must click to check
- "+0 new reviews" when there are no deltas — user thinks it's broken
- No visual indicator when new alerts arrive (unless user is on the tab)

### Proposed Improvements
- Add unread alert count badge to Alerts tab
- Show "+3 new" as a prominent badge in the header, not just in the KPI card
- If 0 new reviews, show a subtle "No new reviews since last update" instead of "+0"
- Use browser tab title to show alert count: `Rother (2)` when unread alerts exist

---

## Flow 2: Respond to New Negative Review

**Frequency:** As needed (1-3 times per week)  
**Primary persona:** Sarah (Operations Manager)  
**Time budget:** <2 minutes

### Flow Steps

```
1. Receive alert                    → Browser tab shows "Rother (2)"
2. Switch to Rother tab             → See new review count
3. Click Alerts tab                 → "New 1★ review for [Competitor]"
4. Click alert to navigate          → Opens Reviews tab filtered to that competitor
5. Read the review                  → "Terrible service, waited 30 minutes"
6. Note competitor name, branch     → "Crate Cafe, Canggu"
7. Open Google Maps in new tab      → Click the Google Maps link from competitor detail
8. Draft response                   → Done in Google Maps
```

### Current Friction
- Alert has no action link — cannot click to jump to the review
- Reviews tab filters are not set automatically when navigating from alert
- Google Maps link opens in same tab (actually `target="_blank"` is used — confirmed correct)
- Reviewer name shows ", original" suffix

### Proposed Improvements
- Add `action` field to alerts: `{ type: "navigate", tab: "reviews", filters: { competitor_id: "..." } }`
- Clicking an alert navigates to Reviews tab with filters pre-applied
- Strip ", original" at the API layer
- Add "View on Google Maps" button directly on the review row

---

## Flow 3: Weekly Competitive Analysis

**Frequency:** Weekly  
**Primary persona:** David (Marketing Manager)  
**Time budget:** 5-10 minutes

### Flow Steps

```
1. Open Rother                     → Overview tab
2. Scan rating distribution        → "60% 5★, 20% 4★, 10% 3★, 10% 1-2★"
3. Check sentiment chart           → "75% positive"
4. Switch to Compare tab           → See all 6 branches ranked
5. Click top competitor            → Open detail sheet
6. Read recent reviews             → Check latest customer feedback
7. Export competitor data (CSV)    → For weekly report
8. Switch to Overview              → Check Reviews Over Time chart
9. Note trends                     → "Canggu up 15% this month"
```

### Current Friction
- Compare tab has "Historical" sub-tab with identical icon — confusing
- Competitor detail sheet shows internal `competitor_id`
- Export filename is generic `gbp-reviews.csv` — not report-ready
- Reviews Over Time chart may be empty (no historical data yet)

### Proposed Improvements
- Fix Compare tab icon (distinct icon for Historical sub-tab)
- Remove internal IDs from user-facing labels
- Allow export filename prefix: `weekly-report-canggu.csv`
- Show "Insufficient data for trend" when <2 data points exist

---

## Flow 4: Adding a New Competitor

**Frequency:** Monthly or on-boarding  
**Primary persona:** Sarah (Operations Manager) or IT support  
**Time budget:** 3 minutes

### Flow Steps (Proposed)

```
1. Navigate to Config tab          → Visible in all modes
2. Click "Add Competitor"         → Opens form dialog
3. Select branch                  → Dropdown (existing branch or "+ New Branch")
4. Enter competitor name          → Text field: "Grounded Cafe"
5. Enter Google Maps URL          → Text field: https://maps.google.com/...
6. (Optional) Enter Place ID      → Text field or auto-extracted from URL
7. Click "Save"                   → Validates, writes to listings.json
8. See confirmation               → "Competitor added. Run Update Now to scrape data."
```

### Current Friction
- Config tab hidden in client mode (P0)
- Only raw JSON editing (P0)
- JSON errors don't show field-level feedback (P1)

### Proposed Improvements
- Show Config tab in all modes with simplified "Competitors" view
- Replace JSON editor with a form for adding/removing competitors
- JSON editor becomes "Advanced" mode accessible via toggle
- Auto-extract Place ID from Google Maps URL using URL pattern matching
- Validate Place ID format before saving
- Show success toast with next-step CTA

---

## Flow 5: Running a Manual Update

**Frequency:** As needed (1-3 times per week)  
**Primary persona:** All users  
**Time budget:** <1 minute

### Flow Steps

```
1. Click "Update Now"             → Header button
2. See progress                   → "Updating: 3/12 competitors…"
3. Wait for completion           → Progress updates every N seconds
4. See result                     → "+3 new reviews · 12 ok · 0 failed"
5. (If failures)                  → "2 competitors failed. Tap to see details."
```

### Current Friction
- Button label "Update Now" misleading (user thinks API refresh, actual: Playwright launch)
- No progress indicator (only spinner)
- `spawnSync` blocks server
- No cancel button
- Preflight warnings not shown in UI

### Proposed Improvements
- Rename to "Update Data" (client mode) / "Run Scraper" (dev mode)
- Add progress bar with per-competitor status: `[====----] 6/12 • Crate Cafe Canggu`
- Replace `spawnSync` with `spawn` and poll status from a run state file
- Add "Cancel" button during run
- Surface preflight warnings (missing fixtures, no Playwright) before the run starts

---

## Flow 6: Exporting Data for a Report

**Frequency:** Weekly  
**Primary persona:** David (Marketing Manager)  
**Time budget:** 2 minutes

### Flow Steps

```
1. Click Export icon (header)     → Unified export dropdown
2. Select "Reviews → CSV"        → Downloads filtered reviews
3. File saves as                  → "rother-reviews-2026-07-25.csv"
4. Open in Excel                  → Columns: reviewer, rating, text, date, competitor, branch
5. Pivot/filter for report        → Done
```

### Current Friction
- Two export entry points (header dialog vs reviews dropdown)
- File name is generic
- CSV headers may contain raw data (", original" suffix)

### Proposed Improvements
- Single export dropdown in header
- File name format: `rother-{type}-{date}.{format}`
- Strip raw suffixes in export output
- Add "Export current view" tooltip to clarify scope
- Add XLSX export (V2)

---

## Flow 7: Onboarding (First-Time User)

**Frequency:** Once per user  
**Primary persona:** All users  
**Time budget:** 5 minutes

### Flow Steps (Proposed)

```
1. First visit                    → No data exists
   → Show "Welcome to Rother" card
   → "Get started in 3 steps: Add competitors → Run update → View data"
2. "Add Competitor" link          → Opens Config tab with Add form
3. "Run Update Now" link          → Triggers first scrape
4. "View Your Dashboard" link     → Switches to Overview tab
5. Data appears                   → Dismiss welcome card
```

### Current Friction
- No welcome/onboarding experience
- First-time user sees 6+ empty states and thinks the product is broken
- "9 skipped" with no explanation

### Proposed Improvements
- Add dismissible "Welcome to Rother" card on first visit
- Three action links: Add Competitor, Run Update, View Dashboard
- Remove empty-state charts on first visit — show only KPI row + getting-started card
- Consolidate 6 empty charts into one "No data yet" section
- Track first-visit state via localStorage or cookie

---

## Flow Summary

| Flow | Frequency | Current Score | Target Score |
|------|:---------:|:-------------:|:------------:|
| Daily Check-In | Daily | 6/10 | 9/10 |
| Respond to Negative Review | Weekly | 4/10 | 9/10 |
| Weekly Analysis | Weekly | 5/10 | 8/10 |
| Add Competitor | Monthly | 1/10 | 9/10 |
| Run Manual Update | Weekly | 3/10 | 8/10 |
| Export Report | Weekly | 5/10 | 8/10 |
| Onboarding | Once | 1/10 | 9/10 |

**Total Current: 3.6/10 → Target: 8.6/10**
