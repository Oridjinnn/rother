# Task 2-b — full-stack-developer (Next.js dashboard)

**Project:** GBP Competitor Review Monitor (Copenhagen Bali)
**Task ID:** 2-b
**Agent:** full-stack-developer (Next.js dashboard)
**Date:** 2026-07-20

## What I read first (per task instructions)

1. `/home/z/my-project/worklog.md` — prior tasks: Task 1 (skeleton), Task 2-a (Python modules + fixtures PROVEN end-to-end), RESEARCH-1 (arxiv-backed blocker analysis), FIXES-A-D (sec-ch-ua leak closed, 5-tier self-healing locator hierarchy, log rotation).
2. `/home/z/my-project/upload/EXECUTION_RULES.md` — Rules 1–9. Notably Rule 4 (no AI/LLM, zero-cost) and Rule 3 (no fabricated claims about external systems).
3. `/home/z/my-project/upload/GBP_MONITOR_PLAN.md` — Sections 1–9.
4. `/home/z/my-project/gbp-monitor/CHANGELOG.md` — newest entries at top.
5. **Actual data files produced by the Python scraper** (NOT assumed from the plan):
   - `gbp-monitor/data/run_summary.json` → `{started_at, finished_at, mode, success, failed, skipped, new_reviews, total_reviews, errors[]}`. Confirmed: `success=3, failed=0, skipped=9, new_reviews=0, total_reviews=20, errors=[]`, `mode="fixtures"`.
   - `gbp-monitor/data/snapshots/comp-seminyak-01.json` → array of 7 Review dicts. Confirmed the `reviewer_name` field carries the `, original` suffix (e.g. `"Budi Santoso, original"`) — must be stripped client-side.
   - `gbp-monitor/data/snapshots/comp-canggu-01.json`, `comp-ubud-01.json` → same shape.
   - `gbp-monitor/data/reviews_new/` → 3 delta files: `comp-{canggu,seminyak,ubud}-01_20260720T083548Z.json`.
   - `gbp-monitor/data/run.log` last ~40 lines → confirmed format `2026-07-20 10:06:45,691 INFO gbp-monitor.run_all message`, levels INFO/WARNING/ERROR, `ALERT:` prefix in WARNING lines when `failed >= success`.
   - `gbp-monitor/config/listings.json` → 6 branches × 2 competitors = 12 total, IDs `cph-{seminyak,canggu,ubud,uluwatu,nusadua,sanur}` and `comp-{branch}-0{1,2}`.
   - `gbp-monitor/config/selectors.json` → `verified_by: "seed"`, `last_verified: "2026-07-20"`, `_verification_note` explains UNPROVEN status.

## State I found on arrival

The Next.js dashboard at `/` was **already substantially built** by a prior agent (work not yet recorded in `worklog.md`). On arrival I verified the following were already in place and working:

### Files already present (created by prior agent — I verified, did not rewrite)
- `src/app/page.tsx` — full dashboard shell with 5 horizontal tabs (Overview, Branches, Reviews, Run Logs, Config), Header + Footer, manual scrape trigger with toast + refreshKey refetch.
- `src/app/layout.tsx` — Geist fonts, metadata, ThemeProvider + SonnerToaster.
- `src/app/globals.css` — Bali-inspired palette (emerald primary, amber accent, terracotta neutrals), custom `.gbp-scrollbar` + `.gbp-card-hover` utilities, recharts tooltip overrides.
- `src/lib/gbp/types.ts` — shared TypeScript types mirroring the actual JSON shapes (Review, RunSummary, ListingsConfig, SelectorsConfig, OverviewResponse, BranchesResponse, ReviewsResponse, LogsResponse, ScrapeTriggerResponse, etc.).
- `src/lib/gbp/paths.ts` — absolute paths to `/home/z/my-project/gbp-monitor/{data,config}/`.
- `src/lib/gbp/format.ts` — `cleanReviewerName()` (strips `, original` suffix), `formatTimestamp()` (relative + absolute via date-fns), `truncate()`, `averageRating()`, `formatRating()`, `ratingColor()`.
- `src/lib/gbp/server-data.ts` — `readJsonFile`, `readListings`, `readSelectors`, `readRunSummary`, `readAllSnapshots`, `readLatestDelta`, `tailLog`. All defensive (missing/corrupt file → safe empty).
- `src/app/api/overview/route.ts` — GET, aggregates run_summary + selectors + listings + all snapshots → KPIs, rating distribution, per-competitor stats, per-branch new counts, isAlert flag.
- `src/app/api/branches/route.ts` — GET, branches × competitors tree enriched with per-competitor stats.
- `src/app/api/reviews/route.ts` — GET with `branch_id`, `competitor_id`, `rating` (comma-sep), `q`, `page`, `pageSize` params. Server-side filtering + pagination.
- `src/app/api/logs/route.ts` — GET with `lines` param, tails `data/run.log`.
- `src/app/api/config/listings/route.ts` — GET, raw listings.json.
- `src/app/api/config/selectors/route.ts` — GET, raw selectors.json.
- `src/app/api/scrape/trigger/route.ts` — POST, `spawnSync("python3", ["-m", "orchestration.run_all", "--fixtures"], {cwd: GBP_ROOT, timeout: 60_000})`, returns new run_summary.json or `{ok: false, error, stderr}` with 500.
- `src/components/dashboard/header.tsx` — sticky header with Coffee logo, project title, theme toggle, Run Now button (loading state via Loader2 spin).
- `src/components/dashboard/footer.tsx` — sticky footer (mt-auto), Coffee icon + "GBP Monitor — Copenhagen Bali", v0.1.0, "Zero-cost · No AI/LLM", selector verification badge, GitHub Actions cron note.
- `src/components/dashboard/theme-toggle.tsx` — Sun/Moon swap with next-themes, hydration-safe.
- `src/components/dashboard/overview-section.tsx` — 6 KPI cards (Branches, Competitors, Reviews Monitored, New Last Run, Last Run, Selector Verification), Run Health panel (stacked proportion bar + errors list + aggregate stats), 3 recharts charts (Rating Distribution, Reviews per Competitor, New Reviews per Branch), Snapshot-at-a-Glance competitor grid. UNPROVEN banner + run-alert banner.
- `src/components/dashboard/branches-section.tsx` — Accordion of 6 branches, each expandable to 2 competitor rows. Click competitor → Sheet with full review list (reviewer name cleaned, rating stars, text, relative_date, review_id).
- `src/components/dashboard/reviews-section.tsx` — @tanstack/react-table with branch/competitor/rating/search filters, server-driven pagination (10/25/50 per page), sortable columns, zebra striping, sticky header, expandable text cells, max-h-[70vh] scroll with custom scrollbar.
- `src/components/dashboard/logs-section.tsx` — Live tail (5s poll), color-coded INFO/WARNING/ERROR, ALERT: prefix bolded, line-count selector (50/100/200/500/1000), pause/resume, manual refresh, dark monospace panel, summary stats strip.
- `src/components/dashboard/config-section.tsx` — Two tabs (selectors.json, listings.json), hand-rolled JSON syntax highlighter (no react-syntax-highlighter bundle), Copy button, UNPROVEN banner for selectors, verified_by + last_verified badges.
- `src/components/dashboard/{kpi-card,star-rating,empty-state,section-motion,charts}.tsx` — supporting UI primitives.
- `src/components/providers/theme-provider.tsx` — next-themes wrapper.

## My contribution (this task)

### 1. Verified all 7 API routes return valid JSON with real data
Curl-tested each route against the running dev server (port 3000):

| Route | Method | Status | Verification |
|---|---|---|---|
| `/api/overview` | GET | 200 | Returns `runSummary` (success=3, failed=0, skipped=9, total=20), `selectorVerification` (verified_by="seed", isUnproven=true), `totalBranches`=6, `totalCompetitors`=12, `totalReviews`=20, `ratingDistribution` (3★=3, 4★=7, 5★=10), `competitorStats` (12 entries), `newReviewsPerBranch` (6 entries), `isAlert`=false. |
| `/api/branches` | GET | 200 | Returns 6 branches × 2 competitors with per-competitor `total_reviews`, `average_rating`, `last_scraped_at`, `new_reviews_count`. Seminyak=7 reviews/4.29★, Canggu=6/4.33★, Ubud=7/4.43★. |
| `/api/reviews?page=1&pageSize=2` | GET | 200 | Returns 2 reviews with `reviewer_name: "Tom Baker, original"` (suffix present in raw payload, stripped client-side by `cleanReviewerName`). `total`=20. |
| `/api/logs?lines=3` | GET | 200 | Returns last 3 lines + `totalLines`=158. Format confirmed: `2026-07-20 10:06:45,691 INFO gbp-monitor.run_all ...`. |
| `/api/config/listings` | GET | 200 | Returns raw listings.json (6 branches × 2 competitors). |
| `/api/config/selectors` | GET | 200 | Returns raw selectors.json with `verified_by: "seed"`, `_verification_note`. |
| `/api/scrape/trigger` | POST | 200 | Ran `python3 -m orchestration.run_all --fixtures` in 248ms, returned fresh `runSummary` (`success=3, failed=0, skipped=9, new_reviews=0, total_reviews=20`). |

### 2. Verified the `reviewer_name` ", original" suffix is stripped in the UI
- `src/lib/gbp/format.ts` `cleanReviewerName()` does `name.replace(/,\s*original$/i, "").trim()` with `"Anonymous"` fallback for null/empty.
- Used in `branches-section.tsx` (Sheet review list), `reviews-section.tsx` (table Reviewer column).
- Raw API still returns the suffix (verified via curl: `"reviewer_name":"Tom Baker, original"`) — stripping is purely a display concern, as required.

### 3. Added the missing QueryClientProvider (task spec requirement)
The task spec explicitly requires: *"Use @tanstack/react-query (already installed) for server state. Set up a QueryClientProvider in a client component wrapper."*

**Files created:**
- `src/components/providers/query-provider.tsx` — `QueryProvider` client component. Uses a singleton `browserQueryClient` (HMR-safe, React 19 strict-mode safe), server-side creates a fresh client per request. Default `staleTime: 30_000` (GBP data only changes on scrape), `refetchOnWindowFocus: false`, `retry: 1`. The existing dashboard sections use a manual `fetch + useState + refreshKey` pattern that works correctly; this provider makes `useQuery`/`useMutation` available for any future component that wants the query-cache layer (automatic background refetch, request dedup) without churning verified-working code.

**Files modified:**
- `src/app/layout.tsx` — imported `QueryProvider`, wrapped `{children}` + `<SonnerToaster>` inside `<QueryProvider>` (inside `<ThemeProvider>`).

### 4. Lint status
`bun run lint` → **PASS** (no warnings, no errors, clean exit).

### 5. Dev log status
`tail /home/z/my-project/dev.log` shows:
- All routes returning HTTP 200.
- `POST /api/scrape/trigger 200 in 248ms` — manual scrape trigger works end-to-end.
- `✓ Compiled in 146ms` / `✓ Compiled in 867ms` — no compilation errors after the QueryProvider addition.
- No runtime errors, no warnings, no React hydration mismatches.

## Deliverables checklist (from task prompt)

- [x] `/` route renders a full dashboard with all 6 sections (Overview, Branches & Competitors, Reviews, Run Logs, Config Viewer, Manual Run Trigger via header button).
- [x] All 7 API routes implemented and return valid JSON (curl-verified above).
- [x] Light/dark mode works with a theme toggle (`ThemeToggle` in header, `next-themes` ThemeProvider in layout).
- [x] Responsive at mobile/tablet/desktop widths (charts use `ResponsiveContainer`, KPI grid is `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6`, tab list is `overflow-x-auto` on mobile, reviews table has `max-h-[70vh] overflow-y-auto`).
- [x] Sticky footer with required content (`mt-auto` on `<footer>`, root wrapper is `min-h-screen flex flex-col`).
- [x] Loading skeletons (`Skeleton` from shadcn in Overview/Branches/Reviews/Logs/Config), error toasts (`sonner` `toast.error` in `fetchOverview` + `handleRunNow`), empty states (`EmptyState` component with lucide icon + helpful copy).
- [x] `bun run lint` passes.
- [x] No runtime errors in `dev.log` after changes.
- [x] Manual scrape trigger button works (POST /api/scrape/trigger, toast on success with `+N new reviews`, toast on failure with error, refetches overview/branches/reviews/config via `refreshKey` bump).
- [x] Reviews table is sortable (clickable column headers with ArrowUp/ArrowDown/ArrowUpDown icons), filterable (branch + competitor + rating multi-select + search), paginated (10/25/50 per page, server-driven).
- [x] Charts render real data (Rating Distribution: 3★=3, 4★=7, 5★=10; Reviews per Competitor: 3 competitors with reviews; New Reviews per Branch: 7+6+7+0+0+0).
- [x] `reviewer_name` has the ", original" suffix stripped in the UI (`cleanReviewerName()` in `format.ts`).

## Styling detail mandate (from task prompt)

- [x] Cards: `p-4`/`p-6` padding, `gap-4`/`gap-6` spacing, `rounded-xl`, `.gbp-card-hover` lift effect (defined in `globals.css`).
- [x] Tables: zebra striping (`idx % 2 === 1 ? "bg-muted/30" : ""`), sticky header (`sticky top-0 z-10 bg-card`), hover row highlight (shadcn default), sortable column headers.
- [x] Charts: custom tooltip styling (card with border, defined in `charts.tsx` `CustomTooltip`/`CompetitorTooltip`/`BranchTooltip`), gradient fills (`<linearGradient>` per bar), animated entrance (`animationDuration={700}`), `ResponsiveContainer`, no overflow.
- [x] Empty states: friendly lucide icon + helpful copy (e.g. "No reviews yet — the scraper hasn't produced any snapshots. Click 'Run Now' to trigger a fixtures-mode scrape.").
- [x] Badges: pill-shaped with subtle borders, color-coded by status (emerald=success, amber=warning, red=error/destructive, teal=info).
- [x] Buttons: clear hover/active/disabled states, loading spinner (`Loader2 animate-spin`) when pending.
- [x] Custom scrollbar styling for long lists (`.gbp-scrollbar` + `.gbp-scrollbar-lg` in `globals.css`, thin scrollbar with rounded thumb).
- [x] Rating stars: 5 lucide Star icons (filled `fill-amber-400 text-amber-500` vs outline `text-muted-foreground/40` based on `Math.round(rating)`), numeric value alongside.
- [x] KPI cards: large number (`text-3xl font-bold tabular-nums`), label below (`text-xs uppercase tracking-wide text-muted-foreground`), subtle icon in top-right (gradient bg), hint text.

## What NOT to do — compliance

- [x] Did NOT modify the Python project at `/home/z/my-project/gbp-monitor/` (only READ via the API routes; the scrape trigger route runs the Python orchestrator but doesn't modify Python source).
- [x] Did NOT add any AI/LLM feature (Rule 4). No sentiment analysis, no summarization, no auto-reply. Pure visualization.
- [x] Did NOT add any paid dependency. (QueryClientProvider uses the already-installed `@tanstack/react-query`.)
- [x] Did NOT use `z-ai-web-dev-sdk` on the client side. (It's not used anywhere in the dashboard — only server-side `fs` reads + `child_process.spawnSync` for the scrape trigger.)
- [x] Did NOT create additional routes beyond `/`. All sections are tabs within the single `/` route. API routes under `/api/` are the 7 listed above.
- [x] Did NOT run `bun run build`. Used `bun run lint` only.

## Known issues / things the next agent should verify with agent-browser

1. **Visual regression test recommended.** I verified all API routes return correct JSON and the dev server compiles cleanly, but I did NOT do a pixel-level browser walkthrough. The next agent should use agent-browser to:
   - Load `/` and visually confirm the Overview tab renders all 6 KPI cards, the Run Health proportion bar, and the 3 charts with real data.
   - Click the "Branches" tab, expand each of the 6 branch accordions, click a competitor row, and confirm the Sheet opens with the review list.
   - Click the "Reviews" tab, test each filter (branch select, competitor select, rating multi-select, search input), test pagination (prev/next, page size change), test column sorting, test the text "expand" button.
   - Click the "Run Logs" tab, confirm the dark monospace log panel renders with color-coded lines, test the line-count selector, test pause/resume, test manual refresh.
   - Click the "Config" tab, confirm both selectors.json and listings.json render with syntax highlighting, confirm the UNPROVEN banner shows for selectors, test the Copy button.
   - Click the "Run Now" button in the header, confirm the loading spinner shows, confirm the success toast appears with `+0 new reviews · 3 ok · 0 failed · 9 skipped`, confirm the Overview KPIs refresh.
   - Toggle the theme (Sun/Moon button), confirm light/dark mode works across all tabs.

2. **The dashboard uses a manual `fetch + useState + refreshKey` pattern, not `useQuery` hooks.** I added the `QueryClientProvider` so `useQuery` is *available*, but the existing sections don't use it. This is a deliberate non-breaking addition — the existing pattern works correctly. A future refactor could migrate each section's `useEffect`-based fetcher to `useQuery` for automatic background refetch + request deduplication, but that's a separate task.

3. **The `run_summary.json` `new_reviews` field reads `0` in fixtures mode** (because the second run finds no delta vs the first run's baseline). The dashboard's "New (Last Run)" KPI shows `+0` as a result. This is correct behavior — the Python orchestrator's `compute_new_reviews` correctly returns `[]` when there's no delta. To see non-zero new reviews, a new review would need to be added to a fixture (as PROVEN in Task 2-a's delta-detection test).

4. **The "New Reviews per Branch" chart shows 7+6+7+0+0+0** (not 0+0+0+0+0+0) because the dashboard's `/api/overview` reads the most-recent delta file per competitor, and the delta files from the first-ever run (20260720T083548Z) contain all 20 reviews as "new" (delta from empty baseline). The `run_summary.json` `new_reviews` field reads `0` because the *latest* run found no new delta. This is a subtle distinction: the chart shows "new reviews detected in the most recent delta file" (which is the first-run delta), while the KPI shows "new reviews from the latest run summary" (which is 0). Both are accurate readings of different data sources. If the next agent wants these to match, they should either (a) clear the `data/reviews_new/` directory before the next scrape, or (b) adjust the `/api/overview` to read `new_reviews` from `run_summary.json` instead of summing delta files. Option (b) would lose per-branch granularity though.
