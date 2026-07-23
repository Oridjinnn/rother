# Architecture Audit 07 — Dashboard Components

**Date:** 2026-07-22
**Subsystem:** `src/components/dashboard/` — 36 React (Next.js) components
**Repository root:** `D:\Documents (D)\Softwares\Rother\Rother - 0.0.1`

---

## Executive Summary

The Dashboard Components directory contains **36 client-side React components** (~312KB total, ~8,800 lines) forming the entire presentation layer of the GBP Monitor dashboard. Every component uses the `"use client"` directive.

| Metric | Value |
|---|---|
| Total files | 36 `.tsx` files |
| Total size | ~312 KB |
| Largest | `overview-section.tsx` (30,419 bytes, 807 lines) |
| Smallest | `section-motion.tsx` (967 bytes, 42 lines) |
| Client components | 36/36 (100%) |
| Server components | 0/36 |
| TanStack Query usage | 0/36 (imported in package.json, never used) |
| Zustand usage | 0/36 (imported in package.json, never used) |
| External API calls | 36+ (all self-fetching components use `fetch()`) |

**Maturity: Prototype / Late Alpha.** The component architecture is consistent and well-patterned but every component self-fetches its data client-side with raw `fetch()` + `useState`/`useEffect` — no caching, no deduplication, no server components, no TanStack Query despite it being installed.

**Risk score: Medium** — consistent architecture, good loading/error/empty state coverage, but heavy reliance on client-side data fetching with zero caching means poor performance at scale.

---

## 1. Component Catalog

### 1.1 Section/Layout Components (8 files)

| Component | Lines | Role | Data source |
|---|---|---|---|
| `overview-section.tsx` | 807 | Main Overview tab layout — composes 18+ sub-components | Props (`OverviewResponse`) |
| `reviews-section.tsx` | 733 | Reviews tab — filterable, paginated review table with TanStack Table | Self-fetches from `/api/reviews`, `/api/branches` |
| `branches-section.tsx` | 444 | Branches tab — accordion of branches with competitor rows, Sheet detail | Props + self-fetches per-competitor reviews |
| `branch-comparison-section.tsx` | 332 | Compare tab — grid of branch cards with competitor details | Props (`BranchesResponse`) |
| `config-section.tsx` | 350 | Config tab — tabbed JSON viewer for listings.json + selectors.json | Self-fetches from `/api/config/listings`, `/api/config/selectors` |
| `logs-section.tsx` | 440 | Logs tab — log file viewer with color-coded parsing, auto-polling | Self-fetches from `/api/logs` |
| `footer.tsx` | 222 | Sticky footer — health indicator, selector badge, mode switcher | Props (health, verifiedBy, mode) |
| `header.tsx` | 159 | Sticky header — logo, title, theme toggle, run button, export, shortcuts | Props (callbacks) |

### 1.2 Self-Fetching Card Components (9 files)

| Component | Lines | Fetches from | Polls? |
|---|---|---|---|
| `run-comparison-card.tsx` | 390 | `/api/history` | No |
| `run-history-timeline.tsx` | 413 | `/api/history` | Yes (30s) |
| `review-recency-heatmap.tsx` | 318 | `/api/history` | No |
| `reviews-over-time-card.tsx` | 125 | `/api/reviews-over-time` | No |
| `review-lengths-card.tsx` | 240 | `/api/review-lengths` | No |
| `top-reviewers.tsx` | 349 | `/api/reviews` | No |
| `review-language-distribution.tsx` | 315 | `/api/reviews` | No |
| `review-word-cloud.tsx` | 266 | `/api/reviews` | No |
| `competitor-correlation.tsx` | 308 | `/api/competitor-correlation` | No |

### 1.3 Data-Driven Sub-Components (3 files)

| Component | Lines | Role |
|---|---|---|
| `competitor-leaderboard.tsx` | 279 | Sortable ranked list of competitors (via props) |
| `competitor-growth-rate.tsx` | 282 | Reviews/day bar chart with color-coded levels (via props) |
| `competitor-rating-dist-comparison.tsx` | 274 | Grouped bar chart of per-competitor rating distribution (self-fetches) |

### 1.4 Presentation Helpers (6 files)

| Component | Lines | Role |
|---|---|---|
| `kpi-card.tsx` | 64 | Large number + label + icon + hint card |
| `star-rating.tsx` | 71 | 5-star display with optional numeric value |
| `empty-state.tsx` | 47 | Reusable empty/error state with icon, title, description, action |
| `section-motion.tsx` | 42 | Framer Motion fade-in section wrapper |
| `freshness-badge.tsx` | 170 | Color-coded data freshness indicator (fresh/recent/stale/never) |
| `copy-button.tsx` | 117 | Clipboard copy with fallback + toast |

### 1.5 Controls (5 files)

| Component | Lines | Role |
|---|---|---|
| `auto-refresh-toggle.tsx` | 107 | Live/pause toggle for auto-refresh |
| `export-buttons.tsx` | 154 | CSV/JSON export dropdown for Reviews tab |
| `theme-toggle.tsx` | 40 | Light/dark theme toggle (next-themes) |
| `scrape-schedule.tsx` | 190 | Next-run countdown with timezone display |
| `health-sparkline.tsx` | 144 | Tiny bar chart of recent run health, polls every 60s |

### 1.6 Dialogs (3 files)

| Component | Lines | Role |
|---|---|---|
| `competitor-detail-dialog.tsx` | 292 | Modal with full competitor detail + review list |
| `export-dashboard-dialog.tsx` | 225 | Combined export dialog for all data formats |
| `shortcuts-help-dialog.tsx` | 126 | Keyboard shortcuts reference |

### 1.7 Chart Library (1 file)

| Component | Lines | Exports |
|---|---|---|
| `charts.tsx` | 839 | `RatingDistributionChart`, `ReviewsPerCompetitorChart`, `NewReviewsPerBranchChart`, `SentimentDistributionChart`, `ReviewsOverTimeChart`, `CompetitorRadarChart` |

### 1.8 Utility (1 file)

| Component | Lines | Role |
|---|---|---|
| `live-clock.tsx` | 122 | Live time display with "X ago" for last scrape |

---

## 2. Architecture Patterns

### 2.1 Data Fetching Strategy

All data fetching uses a consistent raw `fetch()` pattern:

```typescript
const fetchData = React.useCallback(async () => {
  try {
    setError(null);
    const res = await fetch("/api/some-route", { cache: "no-store" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || `failed (${res.status})`);
    }
    const json = await res.json();
    setData(json);
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err));
  } finally {
    setLoading(false);
  }
}, []);

React.useEffect(() => {
  setLoading(true);
  fetchData();
}, [fetchData, refreshKey]);
```

This exact pattern appears in **9 components** with minimal variation:
- `run-comparison-card.tsx`
- `run-history-timeline.tsx`
- `review-recency-heatmap.tsx`
- `reviews-over-time-card.tsx`
- `review-lengths-card.tsx`
- `top-reviewers.tsx`
- `review-language-distribution.tsx`
- `review-word-cloud.tsx`
- `competitor-correlation.tsx`

Variants of this pattern (with abort controller, deduplication via `cancelled` flag) appear in:
- `reviews-section.tsx`
- `branches-section.tsx`
- `competitor-detail-dialog.tsx`
- `logs-section.tsx`
- `config-section.tsx`

**Key observation: TanStack Query (react-query) is in `package.json` as a dependency but is never used.** Every component reimplements the same caching/deduplication/refetch logic manually.

### 2.2 State Management

No external state management is used despite Zustand being in `package.json`. State is entirely local to each component via `useState`/`useEffect`. The parent `page.tsx` manages:
- The active tab state
- The `OverviewResponse` and `BranchesResponse` data (fetched once, passed as props to sections)
- The `refreshKey` counter (bumped after scrape trigger)
- Auto-refresh interval
- Dialog open states
- App mode (dev/client)

### 2.3 Props vs Self-Fetching

**Props-driven** (data passed from parent):
- `overview-section.tsx` — receives `OverviewResponse`
- `branches-section.tsx` — receives `BranchesResponse`
- `branch-comparison-section.tsx` — receives `BranchesResponse`
- `competitor-leaderboard.tsx` — receives `CompetitorStats[]`
- `competitor-growth-rate.tsx` — receives `CompetitorStats[]`
- `footer.tsx` — receives health/selector/mode props
- `header.tsx` — receives callbacks

**Self-fetching** (fetches their own data):
- All card components (`run-comparison-card`, `run-history-timeline`, etc.)
- `reviews-section.tsx`
- `config-section.tsx`
- `logs-section.tsx`
- `competitor-detail-dialog.tsx`
- `competitor-rating-dist-comparison.tsx`

### 2.4 Refresh Mechanism

All self-fetching components accept an optional `refreshKey?: number` prop. When the parent bumps this value (after a scrape trigger), the component's `useEffect` dependency triggers a re-fetch.

Components that poll automatically:
- `run-history-timeline.tsx` — polls `/api/history` every 30s
- `logs-section.tsx` — polls `/api/logs` every 5s (configurable)
- `health-sparkline.tsx` — polls `/api/health-trend` every 60s

### 2.5 Loading/Error/Empty State Coverage

Every component implements at minimum 2 of 3 states. Most implement all 3:

| Component | Loading | Error | Empty |
|---|---|---|---|
| `overview-section.tsx` | Skeleton grid | EmptyState | Returns null |
| `reviews-section.tsx` | Skeleton rows | EmptyState | EmptyState |
| `branches-section.tsx` | Skeleton cards | EmptyState | EmptyState |
| `logs-section.tsx` | Skeleton lines | EmptyState | EmptyState |
| `config-section.tsx` | Skeleton blocks | EmptyState | EmptyState |
| `run-history-timeline.tsx` | Skeleton cards | EmptyState | EmptyState |
| `run-comparison-card.tsx` | Skeleton | EmptyState | EmptyState |
| `top-reviewers.tsx` | Skeleton | EmptyState | EmptyState |
| All other cards | Skeleton | EmptyState | EmptyState |

### 2.6 shadcn/ui Component Usage

The following shadcn/ui primitives are used across the dashboard:

| shadcn/ui component | Used in |
|---|---|
| `Card`, `CardHeader`, `CardContent`, `CardTitle`, `CardDescription` | All card components |
| `Badge` | 15+ components |
| `Button` | 12+ components |
| `Skeleton` | 10+ components |
| `Tooltip`, `TooltipContent`, `TooltipProvider`, `TooltipTrigger` | 10+ components |
| `Select`, `SelectTrigger`, `SelectContent`, `SelectItem` | 4 components |
| `Alert`, `AlertTitle`, `AlertDescription` | 2 components |
| `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow` | 1 component (reviews-section) |
| `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger` | 1 component (config-section) |
| `Accordion`, `AccordionContent`, `AccordionItem`, `AccordionTrigger` | 1 component (branches-section) |
| `Sheet`, `SheetContent`, `SheetDescription`, `SheetHeader`, `SheetTitle` | 1 component (branches-section) |
| `Dialog`, `DialogContent`, `DialogDescription`, `DialogHeader`, `DialogTitle` | 3 components |
| `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuLabel`, `DropdownMenuSeparator`, `DropdownMenuTrigger` | 3 components |
| `Checkbox` | 1 component (reviews-section) |
| `Input` | 1 component (reviews-section) |
| `Separator` | 2 components |

### 2.7 Third-Party Library Usage

| Library | Used in | Purpose |
|---|---|---|
| `framer-motion` | 20+ components | Animations (fade-in, slide-in, bar fills) |
| `recharts` | 5 components | Charts (bar, pie, area, radar) |
| `lucide-react` | 30+ components | Icons |
| `@tanstack/react-table` | 1 component (reviews-section) | Sortable table |
| `sonner` | 4 components | Toast notifications |
| `next-themes` | 1 component (theme-toggle) | Theme switching |

**Not used (but in package.json):**
- TanStack Query (`@tanstack/react-query`) — 0 components
- Zustand — 0 components
- `next-auth` — 0 components
- `react-hook-form` — 0 components
- `@dnd-kit` — 0 components
- `@mdxeditor/editor` — 0 components
- `react-markdown` — 0 components

---

## 3. Deep Analysis of Key Components

### 3.1 `overview-section.tsx` (807 lines)

The orchestrator component of the Overview tab. Composes 18+ sub-components in a structured layout.

**Structure:**
1. `VerificationBadge` — inline badge component for selector verification status
2. `RunHealthPanel` — inline component for the run health display (stacked bar, errors, stats)
3. `ChartCard` — reusable card wrapper with consistent header + skeleton state
4. Main `OverviewSection` — composes KPI row, health panel, charts grid, timeline, etc.

**Design observations:**
- Two inline components (`VerificationBadge`, `RunHealthPanel`, `ChartCard`) are defined within the file. `ChartCard` and `VerificationBadge` could be extracted as shared utilities.
- `RunHealthPanel` redefines the alert logic from the API layer (line 172: `data.isAlert ?`...). Duplicates the decision of what constitutes an alert.
- The `isDev` pattern (line 416, 460, 476, etc.) switches between developer-oriented and client-oriented language throughout the component. This is a clean dual-mode pattern.
- 18 sub-components are composed in a single render tree — a refactor might split into smaller sections.

### 3.2 `charts.tsx` (839 lines)

All Recharts-based charts in a single file. Exports 6 chart components.

**Exports:**
- `RatingDistributionChart` — vertical bar chart, 1★–5★ with gradient fills
- `ReviewsPerCompetitorChart` — horizontal bar chart, top 12 competitors
- `NewReviewsPerBranchChart` — bar chart with custom hatched pattern for 0-value bars
- `SentimentDistributionChart` — donut chart (Positive/Neutral/Negative) with center label
- `ReviewsOverTimeChart` — area chart (cumulative) with gradient fill
- `CompetitorRadarChart` — radar chart for top N competitors across 4 dimensions

**Design observations:**
- Tooltip components are defined inline (`CustomTooltip`, `CompetitorTooltip`, `BranchTooltip`, etc.) — 6 inline tooltip components
- `CompetitorRadarChart` computes recency score client-side with `computeRecencyScore()` — duplicates logic that could live in the API
- `SentimentDistributionChart` uses `useMemo` for bucket computation (line 479) — correctly memoized
- All charts use `oklch()` CSS color space for modern wide-gamut colors
- The hatched pattern for 0-value bars in `NewReviewsPerBranchChart` (lines 363–385) is a thoughtful UX detail

### 3.3 `reviews-section.tsx` (733 lines)

The most complex interactive component. Implements a fully featured data table with TanStack Table.

**Features:**
- 4 filter controls: branch, competitor, rating (multi-select), text search
- 300ms debounced search input
- Server-driven pagination (page/pageSize)
- Client-side sorting on the current page
- Export dropdown (via `ExportButtons`)
- Error/loading/empty states
- Column visibility (defined but not exposed to user)

**Design observations:**
- Fetches branches + reviews in separate effects (lines 123–137, 175–233) — reviews effect depends on `nameLookup` which depends on branches. This creates an implicit chain: branches fetch → nameLookup computed → reviews fetch.
- Rating filter uses `aria-pressed` toggle buttons instead of checkboxes — accessible but unconventional
- The TanStack Table is configured with `manualPagination: true` and `pageCount: 1` (line 324–325) to tell the table "all rows fit on one page" since pagination is server-driven
- `ReviewTextCell` (lines 711–733) is an inline component with click-to-expand for long text

### 3.4 `logs-section.tsx` (440 lines)

Log file viewer with color-coded parsing, auto-polling, and summary stats.

**Features:**
- Configurable line count (50–1000)
- Auto-polling with pause/resume (5s interval)
- Regex-based log line parser (`parseLine` at line 52)
- Summary stats strip (lines shown, INFO count, warnings, errors)
- Auto-scroll to bottom (when auto-refresh is on)

**Design observations:**
- `parseLine` (lines 52–88) is a non-trivial regex-based parser that handles Python logging format, fallback keyword search, and ALERT detection
- The log viewer has a dark terminal aesthetic (line 359: `bg-zinc-950 p-3 font-mono text-xs`)
- `renderMessage` (lines 429–440) bolds `ALERT:` prefix — another inline component
- Summary stats are computed from parsed data via `filter` (lines 166–168) — these iterate the array multiple times

### 3.5 `footer.tsx` (222 lines)

Footer with health indicator, selector verification badge, mode switcher, and sparkline.

**Features:**
- Health level computation (`computeHealth`, lines 61–98) — same logic as API but redefined in the component
- Selector verification badge with color-coded status
- Mode switcher button that toggles `?mode=dev` URL parameter
- Pulsing dot animation for healthy status (line 142: `animate-ping`)

---

## 4. Duplication Analysis

### 4.1 Fully Duplicated Data Fetching Pattern

The following 4-line block appears in **9 components** with only the URL changing:

```typescript
const fetchData = React.useCallback(async () => {
  try {
    setError(null);
    const res = await fetch("/api/...", { cache: "no-store" });
    if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.detail || `failed (${res.status})`); }
    const json = await res.json();
    setData(json);
  } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  finally { setLoading(false); }
}, []);
```

### 4.2 Same API Fetched by Multiple Components

| API endpoint | Consumers |
|---|---|
| `/api/history` | `run-comparison-card.tsx`, `run-history-timeline.tsx`, `review-recency-heatmap.tsx` |
| `/api/reviews` | `reviews-section.tsx`, `top-reviewers.tsx`, `review-language-distribution.tsx`, `review-word-cloud.tsx`, `competitor-detail-dialog.tsx`, `branches-section.tsx` |
| `/api/competitor-correlation` | `competitor-correlation.tsx`, `competitor-rating-dist-comparison.tsx` |

**Impact:** When `refreshKey` is bumped, 3 components independently re-fetch `/api/history`, 5 components re-fetch `/api/reviews`, and 2 re-fetch `/api/competitor-correlation`. No deduplication.

### 4.3 Duplicated Logic

| Logic | Defined in | Duplicated in |
|---|---|---|
| Branch name shortening (`replace(/^Copenhagen Bali\s*-\s*/i, ...)`) | `branch-comparison-section.tsx:145` | `run-comparison-card.tsx:347`, `competitor-growth-rate.tsx:193` |
| `cleanReviewerName` (regex strip) | `format.ts:13` | `reviews/export/route.ts:109,154` (inline regex) |
| Health level computation | `footer.tsx:61` | `health-trend/route.ts:28` (API side) |

---

## 5. Strengths

### S1. Consistent component architecture
Every component follows the same patterns: `"use client"`, `useState`/`useCallback`/`useEffect` triad, Skeleton loading, EmptyState for errors/empty, consistent className patterns.

### S2. Comprehensive state coverage
Every component handles loading (Skeleton), error (EmptyState with AlertTriangle), and empty (EmptyState with contextual icon) states. The dashboard never shows a blank screen or crashes on missing data.

### S3. Accessible markup
Components use `aria-label`, `aria-hidden`, `role="status"`, `role="log"`, `role="img"`, `role="list"` attributes. Interactive elements have `focus-visible` ring styles.

### S4. Performance-aware patterns
- Debounced search input (300ms) in `reviews-section.tsx`
- Cancelled flags to prevent state updates after unmount
- 1s `setInterval` instead of rAF for clock (conscious tradeoff)
- Hydration-safe patterns in `live-clock.tsx` and `freshness-badge.tsx` (null initial state → client mount)

### S5. Dual-mode (dev/client) throughout
The `isDev` pattern in `overview-section.tsx` conditionally shows developer information (selector status, mode badge, technical details) while showing client-friendly language for normal users.

### S6. Thoughtful UX details
- Hatched pattern for 0-value bars (not empty space) in `NewReviewsPerBranchChart`
- Pulsing dot animation for healthy/fresh indicators
- Click-to-expand for long review text
- Keyboard shortcuts documentation
- Toast notifications for exports and clipboard actions

### S7. No AI/LLM dependency
Multiple components explicitly document their heuristic approach: language detection uses Unicode range checks (line 38), sentiment uses star-rating buckets (line 433), word cloud uses regex splitting + stopword list (line 67).

---

## 6. Weaknesses

### W1. [HIGH] No TanStack Query usage despite being installed
TanStack Query (`@tanstack/react-query`) is in `package.json` but every component reimplements `fetch` + `useState` + `useEffect` + `useCallback`. This means: no automatic caching, no request deduplication, no stale-while-revalidate, no background refetching, no retry logic, no cache invalidation. 9 components independently re-fetch the same routes on mount. The same API may be called 3+ times on a single page load.

### W2. [HIGH] `charts.tsx` is a 839-line monolith
All 6 chart components, 6 inline tooltip components, color constants, and helper functions are in one file. This is a maintenance risk — changes to one chart require scrolling past all others.

### W3. [MEDIUM] 3 components independently fetch `/api/history`
`run-comparison-card.tsx`, `run-history-timeline.tsx`, and `review-recency-heatmap.tsx` each independently call `GET /api/history`. They all mount simultaneously on the Overview tab. A TanStack Query hook with `queryKey: ["history"]` would serve all three from one fetch.

### W4. [MEDIUM] 5 components independently fetch `/api/reviews`
Same issue as W3 — 5 components re-fetch the same endpoint with different parameters.

### W5. [MEDIUM] Inline component definitions prevent reuse
`overview-section.tsx` defines 3 inline components (`VerificationBadge`, `RunHealthPanel`, `ChartCard`). These cannot be imported or tested independently.

### W6. [MEDIUM] All 36 components are `"use client"`
No server components exist in the dashboard directory. The entire component tree is client-rendered — no React Server Components, no Partial Prerendering benefits.

### W7. [MEDIUM] No Zustand usage despite being installed
Zustand is in `package.json` but unused. Global state (active tab, refreshKey, app mode, auto-refresh state) could be simplified with a store instead of prop drilling from `page.tsx`.

### W8. [MEDIUM] Three unused npm packages
`@dnd-kit`, `@mdxeditor/editor`, `react-markdown` are in `package.json` with zero usage. These add unnecessary bundle size.

### W9. [LOW] Duplicated branch name shortening
The regex `/^Copenhagen Bali\s*-\s*/i` appears in 3 components. Should be a shared utility.

### W10. [LOW] `config-section.tsx` hardcodes sandbox path in UI
Line 255: `<code>/home/z/my-project/gbp-monitor/config/</code>` — this absolute path appears in the rendered UI.

### W11. [LOW] `scrape-schedule.tsx` comments document a 1-hour discrepancy
Lines 58–66: the comments document confusion between the cron value (22:00 UTC) and the plan's stated time (05:00 WITA). The actual cron is `0 22 * * *` but the schedule computes 06:00 WITA, not 05:00.

### W12. [LOW] `live-clock.tsx` keeps interval running when hidden
The 1s interval continues even when the component is visually hidden on mobile (line 36 comment acknowledges this).

---

## 7. Technical Debt Register

| ID | Description | Module(s) | Severity | Effort |
|---|---|---|---|---|
| TD-07-01 | No TanStack Query — manual fetch boilerplate in 9+ components | All self-fetching cards | High | 8 hours |
| TD-07-02 | `charts.tsx` is 839-line monolith with 6 chart types | `charts.tsx` | High | 2 hours |
| TD-07-03 | Same API fetched by multiple independent components | 3× `/api/history`, 5× `/api/reviews` | Medium | 4 hours |
| TD-07-04 | Inline components block reuse/testing | `overview-section.tsx` | Medium | 1 hour |
| TD-07-05 | All-client architecture, no server components | All 36 files | Medium | N/A (architectural) |
| TD-07-06 | Unused packages in bundle | `@dnd-kit`, `@mdxeditor/editor`, `react-markdown` | Low | 30 min |
| TD-07-07 | Duplicated branch name shortening | 3 components | Low | 15 min |
| TD-07-08 | Hardcoded sandbox path in UI | `config-section.tsx:255` | Low | 5 min |
| TD-07-09 | `scrape-schedule.tsx` has 1h timezone discrepancy | `scrape-schedule.tsx:58-66` | Low | 15 min |

---

## 8. Risks

### R1. Client-side data fetching without deduplication
At scale (100+ competitors, 10k+ reviews), the Overview tab triggers 15+ independent API calls on mount. No deduplication, no caching, no request batching.

### R2. `charts.tsx` monolith merge conflicts
The 839-line file is a merge-conflict magnet. Two developers making changes to different chart components will conflict.

### R3. Sandbox path shown in UI
`/home/z/my-project/gbp-monitor` appears in the UI in `config-section.tsx`. If the dashboard is deployed to clients, this exposes internal development paths.

---

## 9. Missing Documentation

1. No component-level README or Storybook stories
2. No JSDoc on most inline components
3. No documentation of the "props parent" vs "self-fetching" component decision
4. No documentation of when to create a new component vs inline

---

## 10. Open Questions

1. **Q1:** Should TanStack Query replace raw `fetch()` in all self-fetching components?
2. **Q2:** Should `charts.tsx` be split into one file per chart type?
3. **Q3:** Should `overview-section.tsx` be split into smaller files?
4. **Q4:** Should inline components (`VerificationBadge`, `RunHealthPanel`, `ChartCard`) be extracted to separate files?
5. **Q5:** Should a shared data-fetching hook be created (e.g., `useApi<T>(url, refreshKey)`) to eliminate the duplicated boilerplate?
6. **Q6:** Could the Overview tab's 15 API calls be consolidated into fewer endpoints?
7. **Q7:** Should unused npm dependencies be removed from `package.json`?

---

## 11. Test Coverage

| Component group | Test files | Estimated coverage |
|---|---|---|
| All 36 components | None | 0% |

**Total: 0 test files, 0% coverage.** No Jest/Vitest/Testing Library configuration found.

### Recommended test targets (by priority):
1. `format.ts` — pure functions, easiest to test
2. `star-rating.tsx` — edge cases: null rating, 0, 5, fractional values
3. `empty-state.tsx` — rendering with/without icon, title, action
4. `reviews-section.tsx` — filter logic, pagination, table rendering
5. `overview-section.tsx` — all 3 states (loading, error, empty data, full data)
6. `charts.tsx` — render with data, empty data, partial data
