# 04 — Screen Map

**Document:** `04_SCREEN_MAP.md`  
**Milestone:** M15.0  

---

## Purpose

Complete inventory of every screen, panel, dialog, and overlay in the Rother dashboard. Each entry documents the screen's purpose, data dependencies, interaction model, and accessibility notes.

> **Seed-demo scale is illustrative only.** The "6 branches / 2 competitors per
> branch / #1–6 rank" figures below are the *Copenhagen Bali demo seed* used for
> local development. The product is single-business by design: after onboarding
> the dashboard scopes to the user's own business, and competitor/branch counts
> are data-driven (see `02_INFORMATION_ARCHITECTURE.md`). Do not treat the demo
> topology as a spec limit.

---

## Screen Inventory

### S00 — Pre-Dashboard Screens (Login → Onboarding → Run)

These run **before** the dashboard. The 4 hubs (Insights, Reputation,
Competitors, Tools) are **hidden** until the Run gate completes. Implemented in
`src/components/shell/` and gated by `src/lib/app-state.tsx` (`user`,
`business`, `runStarted`).

#### S00-A — Login Screen (`login-screen.tsx`)

| Property | Value |
|----------|-------|
| Route | `/` (when `user` is null) |
| Purpose | Mock "Sign in with Gmail" (no real auth yet) |
| Data deps | none (local user stored in localStorage) |
| Empty state | n/a (first screen) |

#### S00-B — Onboarding Screen (`onboarding.tsx`)

| Property | Value |
|----------|-------|
| Route | `/` (when `user` set but `business` null) |
| Purpose | Capture THE USER'S OWN business (never the seeded demo) |
| Fields | Business name, Business location (full), **Category** (searchable picker from `src/lib/categories.ts`) |
| Data deps | none (stored locally via `setBusiness`) |
| Validation | Name length > 1, location length > 3 |

**Note:** This is the **category step** added in Execution Prompt B. The
category is persisted with the business (id + label) and forwarded to the Run
screen and to `POST /api/scrape/trigger`.

#### S00-C — Run Screen (`run-screen.tsx`)

| Property | Value |
|----------|-------|
| Route | `/` (when `business` set but `runStarted` false) |
| Purpose | Run gate — attempt a LIVE scrape of THE USER'S OWN business |
| Trigger | "Run" button → `POST /api/scrape/trigger` with `{ name, location, category, categoryId }` |
| Data deps | `/api/scrape/trigger` |
| Loading | Centered "Scanning…" state (no page scroll) |
| Post-run | Hubs reveal **whether or not** the scrape succeeded (failure shows empty states, never blocks navigation) |

---

### S01 — Overview Tab (Default Landing)

| Property | Value |
|----------|-------|
| Route | `/` (`?tab=overview`) |
| Purpose | At-a-glance health, KPIs, and trends |
| Data deps | `/api/overview`, `/api/reviews-over-time`, `/api/review-lengths`, `/api/history` |
| Loading state | Full-page skeleton grid |
| Empty state | "Welcome to Rother" card (first visit) |
| Error state | Card-level EmptyState per section |
| A11y notes | KPI cards use `<span>` not heading elements. Chart SVG needs aria-label |

**Sections (ordered):**
1. Welcome card (first visit only, dismissible)
2. KPI row (6 cards: Branches, Competitors, Reviews, New, Last Updated, Selector Verification*)
3. Update Health panel (stacked bar + stats)
4. Update Schedule card* (dev mode only)
5. Rating Distribution chart
6. Reviews per Competitor chart
7. Sentiment Distribution chart
8. Reviews Over Time chart
9. Competitor Leaderboard
10. Recent Reviews (per-competitor list)
11. Run History timeline
12. Competitor Comparison radar chart

`*` — Dev-mode only. Client mode doesn't see Selector Verification or Schedule.

---

### S02 — Branches Tab

| Property | Value |
|----------|-------|
| Route | `/` (`?tab=branches`) |
| Purpose | Branch-level drill-down with competitor detail |
| Data deps | `/api/branches` |
| Loading state | Accordion-shaped skeletons |
| Empty state | "No branches configured" |
| Error state | EmptyState with error message |

**Sections:**
1. Summary header (X branches, Y competitors, Z reviews)
2. Branch accordion (6 branches)
   - Each branch: header with name + review count + new badge
   - Each branch: competitor cards (2 per branch)
     - Click competitor → S02-D01 (Competitor Detail Sheet)

---

### S02-D01 — Competitor Detail Sheet (Overlay)

| Property | Value |
|----------|-------|
| Trigger | Click competitor card (Branches or Compare tab) |
| Role | Slide-in sheet (right side) |
| Purpose | Full competitor detail with review list |
| Data deps | `/api/reviews?competitor_id=X` |
| Empty state | "No reviews yet" |
| Error state | EmptyState inline |

**Sections:**
1. Sheet header: competitor name, branch, Google Maps link
2. Stats grid: Total, Avg Rating, New (3 columns)
3. Scrollable review list (100 reviews per page)

---

### S03 — Compare Tab

| Property | Value |
|----------|-------|
| Route | `/` (`?tab=compare`) |
| Sub-tabs | `?sub=comparison` (default), `?sub=history` |
| Purpose | Side-by-side branch comparison + historical diff |
| Data deps | `/api/branches`, `/api/history/compare` |

#### S03-ST01 — Branch Comparison (default sub-tab)

| Property | Value |
|----------|-------|
| Purpose | All 6 branches ranked in a grid |
| Loading | 6 card skeletons |
| Empty | null (always at least 0 branches) |

**Sections:**
1. Summary header
2. 6 branch cards in responsive grid (3 cols → 2 cols → 1 col)
   - Aggregate stats: Reviews, Avg Rating, New
   - Competitor list within card
   - Rank badge (#1–6)
   - Last scraped timestamp

#### S03-ST02 — Historical Comparison

| Property | Value |
|----------|-------|
| Purpose | Diff two runs for a selected competitor |
| Loading | Skeleton |
| Empty | "Select a competitor and two runs to compare" |

**Sections:**
1. Competitor selector dropdown
2. Run A selector / Run B selector
3. Diff results: new reviews, removed reviews, rating changes

---

### S04 — Reviews Tab

| Property | Value |
|----------|-------|
| Route | `/` (`?tab=reviews`) |
| Purpose | Searchable, filterable, paginated review table |
| Data deps | `/api/reviews`, `/api/branches` (for filter options) |
| Loading | Skeleton rows in table |
| Empty | "No reviews yet" or "No reviews match these filters" |

**Sections:**
1. Filter bar (6 controls: Branch, Competitor, Rating, From, To, Search)
2. Active filter badges
3. Export dropdown (CSV/JSON, respects current filters)
4. Review table (5 columns: Reviewer, Rating, Review, When, Competitor)
5. Pagination footer (showing X-Y of Z, per-page selector, prev/next)

---

### S05 — Alerts Tab

| Property | Value |
|----------|-------|
| Route | `/` (`?tab=alerts`) |
| Purpose | System alerts: failures, new reviews, selector issues |
| Data deps | `/api/alerts` |
| Loading | Skeleton cards |
| Empty | "All clear — no alerts" |

**Sections:**
1. Filter dropdown (by alert type)
2. Alert cards (severity-coded left border)
   - Dismiss button (client-side, persisted in localStorage)
   - Action link (future: click → navigates to relevant tab)
3. "Dismiss all" button

---

### S06 — Config Tab (Previously Dev-Only)

| Property | Value |
|----------|-------|
| Route | `/` (`?tab=config`) |
| Purpose | Manage competitors, view system status |
| Data deps | `/api/config/listings`, `/api/config/selectors`, `/api/logs` |
| Loading | Skeletons |
| Empty | No branches configured |

**Sections (Client Mode):**
1. Competitor list with "Add Competitor" button
2. Add Competitor form dialog (branch select, name, URL, place_id)
3. System info card: scraper status, last run, disk usage

**Additional Sections (Dev Mode):**
4. JSON editor for `listings.json` (advanced toggle)
5. JSON viewer for `selectors.json`
6. Run Logs viewer (collapsible, live tail)

---

### S07 — Export Dialog (Overlay)

| Property | Value |
|----------|-------|
| Trigger | Header export button |
| Role | Modal dialog |
| Purpose | Download all data in CSV or JSON format |
| Data deps | Various export API routes |

**Sections:**
1. Reviews (CSV/JSON) — count badge
2. Competitors (CSV/JSON) — count badge
3. Branches (CSV/JSON) — count badge
4. History (CSV/JSON) — count badge
5. Close button

---

### S08 — Shortcuts Help Dialog (Overlay)

| Property | Value |
|----------|-------|
| Trigger | `?` key or header keyboard button |
| Role | Modal dialog |
| Purpose | Show all available keyboard shortcuts |

**Sections:**
1. Actions: g+r (run), ? (help), Esc (close)
2. Tab navigation: g+o/b/m/v/a/c (switch tabs)

---

## Dialog & Overlay Inventory

| Dialog | Trigger | Type | Size | Dismiss | Modal |
|--------|---------|------|:----:|:-------:|:-----:|
| Competitor Detail | Click competitor card | Sheet (right) | `sm:max-w-lg` | Click outside, Esc | Yes |
| Export | Click header export button | Modal | `max-w-md` | Click outside, Esc, Close button | Yes |
| Shortcuts Help | Press `?` | Modal | `max-w-md` | Click outside, Esc, Close button | Yes |
| Add Competitor | Click "Add" in Config | Modal | `max-w-lg` | Click outside, Esc, Cancel | Yes |

---

## Empty State Strategy

| Screen | Empty State Content |
|--------|---------------------|
| Overview (first visit) | "Welcome to Rother" card with 3 action links |
| Overview (no reviews) | Single "No data yet" card (replaces all empty charts) |
| Branches (no config) | "No branches configured" with "Add Branch" CTA |
| Compare (no data) | "No competitor data to compare" |
| Reviews (no data) | "No reviews yet. Run an update to collect data." |
| Reviews (no match) | "No reviews match these filters" with "Clear filters" button |
| Alerts (none) | "All clear — no alerts" with checkmark icon |
| Config (no branches) | "No competitors configured. Add your first one." with "Add Competitor" CTA |
| Competitor Detail (no reviews) | "No reviews for this competitor yet" |

---

## Future Screens

### V2
- **Settings page** — General preferences (theme, auto-refresh, export defaults)
- **Notifications panel** — History of all notifications with read/unread state
- **Schedule view** — Visual calendar of scheduled scrapes

### V3
- **Report builder** — Select sections, date range, format → generate PDF
- **Dashboard customizer** — Drag-reorder sections, hide/show charts
- **Multi-source dashboard** — Per-source tabs (Google, Facebook, Yelp, etc.)
