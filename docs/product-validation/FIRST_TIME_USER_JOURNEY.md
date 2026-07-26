# First-Time User Journey — Rother v0.0.1

**Persona:** Sarah, Operations Manager at a multi-branch retail chain  
**Device:** Windows 11 desktop, Chrome browser  
**Goal:** Evaluate Rother as a replacement for manual competitor review monitoring  
**Benchmark:** GMB Everywhere

---

## Stage 1: Discovery & Installation

### Step 1.1 — Finding the product
Sarah hears about "Rother" from a colleague. She searches for it and finds... nothing. There's no website, no landing page, no download page. The colleague sends her a GitHub link.

**Experience:** Confusing. Product name doesn't match project name.

> **Issue P0-1:** Package name is `nextjs_tailwind_shadcn_ts`, project title is "GBP Monitor — Copenhagen Bali", UI says "Rother". Three different names.

### Step 1.2 — Reading the README
Sarah opens the README. It says:

```
# Rother — GBP Competitor Review Monitor
```

She thinks: "Okay, this is for me." Then she reads:

```
| **Node.js** | >= 18 (v22.11.0) |
| **npm** | >= 9 (10.9.0) |
| **Python** | 3.12+ (3.14.4) |
```

She doesn't have Node.js, npm, or Python installed. She also sees:

```
npm install        → 669 packages
npx prisma db push → "Database already in sync"
```

She wonders: "Why does a review monitor need 669 packages and a database?"

> **Issue P1-1:** 669 npm packages for a review monitoring tool
> **Issue P1-2:** Prisma database is required but documented as "scaffold only, not used"

### Step 1.3 — Running the application
After installing dependencies, Sarah runs `npm run dev` and sees:

```
▲ Next.js 16.2.11 (Turbopack)
- Local: http://localhost:3000
✓ Ready in 6.0s
```

She opens `http://localhost:3000` in Chrome.

---

## Stage 2: First Landing

### Step 2.1 — Initial page load
Sarah sees:

**Browser tab:** "GBP Monitor — Copenhagen Bali"  
**Header logo:** A coffee cup icon with a sparkle  
**Header text:** "Rother v0.0.1" — "Competitor review insights"

**First impression confusion:**
- Tab says "GBP Monitor" — she thought this was "Rother"
- Subtitle says "Competitor review insights" — generic
- Coffee cup icon — charming but unprofessional

> **Issue P0-2:** HTML title doesn't match product name
> **Issue P1-3:** Generic coffee cup icon instead of a product logo

### Step 2.2 — The loading experience
Sarah sees a brief skeleton screen, then the Overview tab appears:

- 6 KPI cards in a row (Branches: 6, Competitors: 12, Reviews Monitored: 10, etc.)
- A "Last Run Health" card with a green bar showing 3/0/9 (success/failed/skipped)
- 6 chart cards, most showing empty states
- A competitor comparison radar chart showing "No competitor data yet"
- A word cloud area (empty)
- A heatmap (empty)
- Multiple other empty chart spaces

Sarah tries to understand what she's looking at. The page is very long — she needs to scroll through 20+ sections, most of which are empty.

> **Issue P2-1:** First-time user sees 6+ empty states simultaneously
> **Issue P2-2:** 20-section dashboard is overwhelming on first visit

### Step 2.3 — "What should I do first?"
There is no onboarding hint, no tooltip tour, no "Getting Started" card. Sarah looks for a call to action.

She sees a green "Update Now" button in the header. She clicks it.

**Toast message:** "Updating data…" — "Refreshing the latest review data"

0.6 seconds later:

**Toast:** "Update complete" — "+0 new reviews · 3 ok · 0 failed · 9 skipped"

Sarah thinks: "Update complete? But nothing changed. Why were 9 skipped?"

> **Issue P1-4:** "+0 new reviews" makes the product look broken
> **Issue P1-5:** "9 skipped" confuses the user — no explanation of what "skipped" means

---

## Stage 3: Understanding the Dashboard

### Step 3.1 — Exploring tabs
Sarah clicks through the tabs:

**Branches tab:** Shows 6 branches in an accordion. First branch (Seminyak) is open, showing 2 competitors. Both competitors show "No snapshot yet". She scrolls down — only 2 of 12 competitors have data.

**Compare tab:** Shows "Branch Comparison" — 6 cards in a grid, most showing "no data" badges. She notices the icons look identical for "Branch Comparison" and "Historical" sub-tabs.

**Reviews tab:** Shows "All Reviews" with a filter bar and a paginated table. 10 reviews exist. Filters work. Export dropdown is disabled because... wait, there ARE reviews. Why is export disabled? Oh, it's not disabled — the button just says "Export" with no count.

**Alerts tab:** Shows 2 alerts: "CSS selectors degraded" (warning) and "New reviews for Crate Cafe Canggu" (info). She dismisses the "New reviews" alert. Navigates away. Comes back. The alert is back.

> **Issue P1-6:** Dismissed alerts reappear (not persisted)
> **Issue P2-3:** Two sub-tabs in Compare use the same icon

### Step 3.2 — Can she add a competitor?
Sarah wants to add her own competitor. She looks for an "Add" button. She checks the header, the Branches tab, the Overview tab. Nothing.

She notices the URL supports `?mode=dev` (from the README). She tries it.

Now she sees 7 tabs (including "Config" and "Run Logs"). She clicks **Config**.

She sees a JSON editor. Raw JSON. No form fields, no dropdowns, no place_id picker.

She has to construct a JSON object like:
```json
{
  "branch_id": "my-branch",
  "branch_name": "My Branch",
  "competitors": [{
    "competitor_id": "comp-my-01",
    "name": "My Competitor",
    "gmaps_url": "https://...",
    "place_id": null
  }]
}
```

She makes a typo. The error toast says "Invalid JSON" but doesn't tell her WHERE the error is.

She gives up.

> **Issue P0-3:** No "Add Competitor" form — only raw JSON editing
> **Issue P0-4:** Client mode hides Config tab — impossible to configure without known URL parameter
> **Issue P1-7:** JSON errors don't include line/column or field-level feedback in the UI

---

## Stage 4: Data Exploration

### Step 4.1 — Reading reviews
Sarah goes back to the Reviews tab. She sees 10 reviews. She notices:

- "Tom Baker, original" — the reviewer name has ", original" attached
- One review text says "…" with an "expand" link. She clicks it. The text expands. The button now says "show less" — not "collapse" or "show less" consistent with expand pattern
- She tries `Ctrl+F` to find a review — it doesn't work because the table is rendered in a virtualized container

> **Issue P1-8:** Reviewer names have ", original" suffix
> **Issue P2-4:** "show less" should be "collapse"
> **Issue P2-5:** Browser find-in-page doesn't work on table content

### Step 4.2 — Exporting data
Sarah wants to download the data for Excel. She sees two export buttons:
1. Header area: a download icon opens the "Data Export" dialog
2. Reviews tab: an "Export" dropdown with CSV/JSON options

She uses the header dialog. She sees 4 sections (Reviews, History, Competitors, Branches) — most are empty. The disabled buttons don't explain why they're disabled.

She uses the Reviews tab export. She clicks "CSV". A file downloads. The file name is `gbp-reviews.csv` — not useful for her filing system.

> **Issue P2-6:** Two export entry points with different scope, unclear which to use
> **Issue P2-7:** Export filename is generic and server-controlled

---

## Stage 5: Evaluation

### Step 5.1 — What Sarah Liked
- Clean, modern UI with cards and consistent spacing
- Fast page load (after initial JS download)
- Tab navigation is clear and easy
- Filters on the Reviews tab work well
- The health check indicator is useful
- Auto-refresh toggle is nice

### Step 5.2 — What Confused Sarah
- "What is this product called?" (tab says GBP Monitor, UI says Rother)
- "Why are 10 of 12 competitors showing 'no data'?"
- "Where is the Add Competitor button?"
- "Why do I need to install Python to use a web dashboard?"
- "What does 'skipped' mean?"
- "Why did the dismissed alerts come back?"
- "Why does the export filename not match my business?"
- "Why is there a coffee cup as the logo?"

### Step 5.3 — Sarah's Verdict
> "The dashboard looks nice but it's clearly built for someone else's business. I can't customize it without editing raw JSON. There's no way for me to add my competitors without help from a developer. I'll keep using spreadsheets for now."

---

## Journey Pain Points Summary

| Stage | Pain Point | Severity | Effort to Fix |
|-------|------------|:--------:|:-------------:|
| 1.2 | Heavy dependency requirement (Node.js, npm, Python, Playwright) | P1 | Medium (create Windows installer) |
| 1.2 | Prisma required but unused | P1 | Low (remove Prisma or document properly) |
| 2.1 | Brand name confusion (3 different names) | P0 | Low (rename package, title) |
| 2.1 | Coffee cup logo looks unprofessional | P2 | Medium (design proper logo) |
| 2.2 | 20-section dashboard overwhelming | P2 | Medium (collapsible sections) |
| 2.2 | 6+ empty states on first view | P2 | Low (consolidate, add getting-started card) |
| 2.3 | "+0 new reviews" looks broken | P1 | Low (better messaging for first run) |
| 2.3 | "9 skipped" unexplained | P1 | Low (tooltip with explanation) |
| 3.1 | Dismissed alerts not persisted | P1 | Low (localStorage persist) |
| 3.2 | No "Add Competitor" form | P0 | High (build competitor form) |
| 3.2 | Config tab hidden in client mode | P0 | Medium (show config in client mode) |
| 3.2 | JSON editor has no field-level errors | P1 | Low (inline validation) |
| 4.1 | ", original" suffix in names | P1 | Low (strip at API layer) |
| 4.1 | "show less" inconsistent | P2 | Low (rename to "collapse") |
| 4.2 | Two export entry points confusing | P2 | Low (unify or clarify) |
| 4.2 | Export filename server-controlled | P2 | Low (user-chosen filename) |

## Conversion Funnel

```
Discovered product  →  100%
Understood purpose  →  80%  (lost at brand confusion)
Installed           →  40%  (lost at Node.js/Python requirements)
Launched app        →  35%  (lost at npm install)
Saw dashboard       →  35%
Clicked Update Now  →  20%  (lost at "+0 new reviews")
Tried to add competitor → 5% (lost at JSON editor)
Would use regularly →  2%   (lost at configuration barrier)
```

## Top 3 Interventions to Improve Conversion

1. **P0: Fix brand identity** — Package name, HTML title, and UI must all say "Rother"
2. **P0: Add competitor form** — Replace JSON editor with a form UI for client mode
3. **P1: First-run experience** — "Getting Started" card, consolidate empty states, explain skipped
