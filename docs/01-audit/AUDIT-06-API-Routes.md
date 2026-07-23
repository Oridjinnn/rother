# Architecture Audit 06 — API Routes

**Date:** 2026-07-22
**Subsystem:** `src/app/api/` — 15 Next.js App Router API route handlers
**Repository root:** `D:\Documents (D)\Softwares\Rother\Rother - 0.0.1`

---

## Executive Summary

The API layer consists of **15 route handlers** (1,420 total lines) implementing a **read-heavy, file-backed REST API** for the GBP Monitor dashboard. All routes use Next.js App Router conventions with `route.ts` files and `force-dynamic` rendering.

| Metric | Value |
|---|---|
| Route handlers | 15 |
| Total lines | 1,420 |
| Lines per route (avg) | 95 |
| Smallest route | `/api/config/listings` (14 lines) |
| Largest route | `/api/reviews/export` (182 lines) |
| HTTP methods | GET (14 routes), POST (1 route) |
| Authentication | None (0 routes) |
| Request validation | None (0 routes) |
| Caching | None (0 routes — all `no-store`) |
| Error handling | Uniform try/catch → `{ error, detail }` on 500 |

**Maturity: Alpha.** All routes are functional but exhibit significant duplication, no input validation, no authentication, and no caching.

**Risk score: Medium** — the routes are thin wrappers over file reads with uniform error handling, but the scrape/trigger route executes arbitrary Python subprocesses with no access control.

---

## 1. Route Catalog

| # | Route | Method | File | Lines | Purpose |
|---|---|---|---|---|---|
| 1 | `/api` | GET | `route.ts` | 5 | Placeholder — returns `{ message: "Hello, world!" }` |
| 2 | `/api/overview` | GET | `overview/route.ts` | 138 | Aggregated dashboard overview (4 parallel reads, rating distribution, stats, alert logic) |
| 3 | `/api/branches` | GET | `branches/route.ts` | 97 | Branch×competitor tree enriched with review stats |
| 4 | `/api/reviews` | GET | `reviews/route.ts` | 130 | Paginated, filtered review query (branch, competitor, rating, text search) |
| 5 | `/api/reviews/export` | GET | `reviews/export/route.ts` | 182 | CSV/JSON export of filtered reviews with name enrichment |
| 6 | `/api/history` | GET | `history/route.ts` | 107 | Run history timeline grouped by run timestamp |
| 7 | `/api/history/export` | GET | `history/export/route.ts` | 174 | CSV/JSON export of run history |
| 8 | `/api/logs` | GET | `logs/route.ts` | 39 | Tail of `run.log` (capped at 2000 lines) |
| 9 | `/api/scrape/trigger` | POST | `scrape/trigger/route.ts` | 97 | Spawn Python subprocess, return freshly-written summary |
| 10 | `/api/config/listings` | GET | `config/listings/route.ts` | 14 | Raw `listings.json` proxy |
| 11 | `/api/config/selectors` | GET | `config/selectors/route.ts` | 17 | Raw `selectors.json` proxy |
| 12 | `/api/reviews-over-time` | GET | `reviews-over-time/route.ts` | 68 | Time series of review counts by scraped_at date |
| 13 | `/api/review-lengths` | GET | `review-lengths/route.ts` | 107 | Text length distribution (5 buckets + stats) |
| 14 | `/api/health-trend` | GET | `health-trend/route.ts` | 120 | Run health parsed from log file regex |
| 15 | `/api/competitor-correlation` | GET | `competitor-correlation/route.ts` | 125 | Cosine similarity matrix of rating distributions |

---

## 2. Route Details

### 2.1 `/api` — Placeholder Root (route.ts, 5 lines)
Returns `{ message: "Hello, world!" }`. Dead code — no component fetches this route. Serves no purpose in the dashboard. Could be removed or repurposed as a health-check endpoint.

### 2.2 `/api/overview` — Dashboard Overview (138 lines)
The most complex route. Aggregates everything for the Overview tab:
- Reads 4 files in parallel: `run_summary.json`, `selectors.json`, `listings.json`, all snapshots
- Computes rating distribution (1★–5★ buckets) across all snapshots
- Computes per-branch and per-competitor stats
- Computes `isAlert` flag: `failed > 0 && failed >= success`
- Calls `readLatestDelta()` once per competitor (serial loop — 12 filesystem reads)

**Data returned:** 12 fields in `OverviewResponse`.

**Design observations:**
- `isAlert` logic (line 102–105) duplicates the orchestrator's "loud warning" Rule 7 logic
- `readLatestDelta()` is called inside a serial `for...of` loop — each competitor triggers a `readdir + sort + readFile` I/O sequence serially. For 12 competitors this is 12 sequential I/O operations.
- `competitorStats` computation loops through `listings.branches` and reads each competitor's snapshot from the pre-loaded `Map` (fast), but also calls `readLatestDelta()` per competitor (slow — disk I/O per iteration).

### 2.3 `/api/branches` — Branch Tree (97 lines)
Returns branch×competitor tree enriched with per-competitor stats. Shares ~40 lines of logic with `/api/overview` (average rating computation, delta reading, stats aggregation).

**Design observations:**
- Same `readLatestDelta()` serial I/O pattern as overview — N sequential disk reads
- `last_scraped_at` computed by sorting `scraped_at` strings array — correct by ISO 8601 lexical ordering

### 2.4 `/api/reviews` — Filtered Reviews (130 lines)
Paginated, filtered review query supporting:
- `branch_id`, `competitor_id`, `rating` (comma-separated), `q` (text search), `page`, `pageSize`
- Reads all snapshots + listings in parallel, then filters/sorts/paginates in-memory

**Design observations:**
- Filter logic (lines 91–103): rating rounding + set membership, case-insensitive substring on `reviewer_name` + `text`
- Sort: `scraped_at` descending, tiebreak by `review_id` descending
- `pageSize` capped at 100 (line 39)
- No index on reviews — every request scans all reviews across all competitors
- Rating filter rounds to nearest integer: a 4.5★ review goes to bucket 5, a 4.4★ to bucket 4

### 2.5 `/api/reviews/export` — Reviews Export (182 lines)
CSV or JSON download with same filter semantics as `/api/reviews`. Adds `competitor_name` and `branch_name` enrichment (joined from listings). RFC 4180 CSV escaping.

**Design observations:**
- ~80 lines of logic duplicated from `/api/reviews` (filter construction, competitor-id resolution, rating filter, text search, sorting)
- CSV escaping at line 138–146 is a local inline function — duplicated in `/api/history/export` as a separate inline function
- `cleanReviewerName` regex is reimplemented inline (line 109, 154) rather than reusing `format.cleanReviewerName()`

### 2.6 `/api/history` — Run History (107 lines)
Chronological timeline of scraper runs, grouped by run timestamp. Groups delta files by timestamp, computes per-run aggregates.

**Design observations:**
- Group-by-timestamp logic (lines 57–92) is entirely duplicated in `/api/history/export` (lines 43–78)
- `branches_affected` computed by deduplicating branch IDs from breakdown (line 80–82)
- Sort: newest-first by `localeCompare` on ISO-ish timestamps

### 2.7 `/api/history/export` — History Export (174 lines)
CSV/JSON export. Same grouping logic as `/api/history` with flattened CSV rows (one row per run×competitor pair).

**Design observations:**
- 75+ lines of logic duplicated from `/api/history`
- CSV `escapeCsv` is a separate inline implementation from `/api/reviews/export` — same logic, different code
- Defensive empty-breakdown row (lines 137–153) for edge case where a run has no breakdown entries

### 2.8 `/api/logs` — Log Tail (39 lines)
Thin wrapper around `tailLog()`. Accepts `?lines=` parameter, capped at 2000.

**Design observations:**
- The server-data `tailLog()` function already reads the entire file into memory — this endpoint inherits that behavior
- Minimal route, well-structured

### 2.9 `/api/scrape/trigger` — Scrape Trigger (97 lines)
**The only write endpoint.** Spawns `python3 -m orchestration.run_all --fixtures` as a blocking subprocess. Returns `ScrapeTriggerResponse` on success, `ScrapeTriggerErrorResponse` on failure.

**Design observations:**
- **Hardcodes `--fixtures` mode** (line 36). The comment explicitly states: "the dashboard must never trigger a live Playwright scrape from a browser click." This is a deliberate safety constraint.
- Uses `spawnSync` (blocking) — blocks the Node.js event loop for up to 60s
- `maxDuration = 60` (line 14) — Vercel/serverless timeout must accommodate this
- Error handling distinguishes three failure modes: subprocess error, missing summary file, corrupt summary JSON
- `stderr.slice(-4000)` (line 59, 74, 88) — caps stderr output to 4000 chars
- No authentication — anyone who can reach this endpoint can trigger a scraper run
- No rate limiting
- Reads `GBP_ROOT` and `GBP_RUN_SUMMARY_PATH` directly from paths module rather than through server-data functions

### 2.10 `/api/config/listings` — Listings Proxy (14 lines)
Returns raw `listings.json`. Thin proxy — the client could theoretically read the JSON directly if served as static, but the API layer provides proper content-type headers and defensive fallback.

### 2.11 `/api/config/selectors` — Selectors Proxy (17 lines)
Returns raw `selectors.json`. Returns 404 if file is missing (inconsistent with other routes which return empty defaults).

### 2.12 `/api/reviews-over-time` — Reviews Time Series (68 lines)
Groups all reviews by `scraped_at` date (YYYY-MM-DD). Returns per-date counts + running cumulative.

**Design observations:**
- Simple, focused route — well-structured
- `date = ts.slice(0, 10)` (line 37) — extracts date from ISO timestamp; correct for ISO 8601 format

### 2.13 `/api/review-lengths` — Review Text Lengths (107 lines)
Computes text length distribution across 5 buckets (Empty, Short, Medium, Long, Very Long) plus stats (average, median, min, max).

**Design observations:**
- Bucket colors use `oklch()` CSS color function (line 48, 53, 59, 65, 71) — modern, wide-gamut color space
- Median computation (lines 82–87): correct even/odd handling
- Filter-based bucket counting (e.g., `lengths.filter(l => l >= 1 && l <= 80).length`) — iterates the array 4 times instead of once

### 2.14 `/api/health-trend` — Health Sparkline (120 lines)
Parses `run.log` for lines matching regex `Run summary: {json}`. Returns last 20 health points for the footer sparkline.

**Design observations:**
- Regex-based log parsing (line 56–57) — fragile. Any change to the Python log format breaks this endpoint silently.
- `computeLevel()` (lines 28–32): `"healthy"` (0 failures), `"critical"` (failures >= success), `"warning"` (some failures but fewer than successes)
- Reads `run.log` directly via `fs.readFile` (not through `tailLog`) — inconsistent approach
- Slices last 20 points from all-time data (line 82) — grows slower over time as log accumulates

### 2.15 `/api/competitor-correlation` — Correlation Matrix (125 lines)
Computes an N×N cosine similarity matrix (capped at 12 competitors) from per-competitor rating distributions [1★..5★].

**Design observations:**
- **Uses dynamic `import()`** for `readListings` at line 52: `const { readListings } = await import("@/lib/gbp/server-data")` — intentionally deferred import (avoids loading listings module if not needed, since some competitors may have 0 reviews). This is inconsistent with all other routes which use static imports.
- `cosineSimilarity` (lines 25–36): pure function, correctly implemented
- Self-similarity set to 1.0 (line 93) — correct
- Results rounded to 2 decimal places (line 96)
- Capped at 12 competitors sorted by total reviews descending (line 83–84)
- Competitor names resolved from listings via Map lookups

---

## 3. Consumer Map

| API Route | Consumed by |
|---|---|
| `/api/overview` | `app/page.tsx` (Overview tab) |
| `/api/branches` | `app/page.tsx` (Branches tab), `reviews-section.tsx` |
| `/api/reviews` | `reviews-section.tsx`, `branches-section.tsx`, `competitor-detail-dialog.tsx`, `review-language-distribution.tsx`, `review-word-cloud.tsx`, `top-reviewers.tsx` |
| `/api/reviews/export` | `export-dashboard-dialog.tsx`, `export-buttons.tsx` |
| `/api/history` | `run-comparison-card.tsx`, `run-history-timeline.tsx`, `review-recency-heatmap.tsx` |
| `/api/history/export` | `export-dashboard-dialog.tsx` |
| `/api/logs` | `logs-section.tsx` |
| `/api/scrape/trigger` | `app/page.tsx` (Run button) |
| `/api/config/listings` | `config-section.tsx` |
| `/api/config/selectors` | `app/page.tsx` (selector verification section) |
| `/api/reviews-over-time` | `reviews-over-time-card.tsx` |
| `/api/review-lengths` | `review-lengths-card.tsx` |
| `/api/health-trend` | `health-sparkline.tsx` |
| `/api/competitor-correlation` | `competitor-correlation.tsx`, `competitor-rating-dist-comparison.tsx` |
| `/api` | None (dead code) |

---

## 4. Pattern Analysis

### 4.1 Common Patterns (Present in All Routes)

1. **`export const dynamic = "force-dynamic"`** — 14/15 routes (all except root `/api`)
2. **`export const revalidate = 0`** — 14/15 routes
3. **`{"Cache-Control": "no-store"}`** — 14/15 routes include this header
4. **try/catch → `{ error, detail }` on 500** — 11/15 data-fetching routes
5. **All routes are async** — App Router convention
6. **No auth guards** — 0/15 routes have authentication

### 4.2 Notable Deviations

| Route | Deviation from common pattern |
|---|---|
| `/api/scrape/trigger` | POST method, no `NextResponse.json()` try/catch — uses `NextResponse.json(body, { status })` directly |
| `/api/competitor-correlation` | Dynamic `import()` for listings reader (deferred) |
| `/api/config/selectors` | Returns 404 on missing file (inconsistent with other routes) |
| `/api` | No `force-dynamic`, no `revalidate`, no cache header — dead code |

### 4.3 Duplication Hotspots

| Duplicated logic | Files | Lines duplicated |
|---|---|---|
| Review filtering (rating, text search, competitor filter construction) | `reviews/route.ts`, `reviews/export/route.ts` | ~50 lines |
| History group-by-run-timestamp | `history/route.ts`, `history/export/route.ts` | ~40 lines |
| CSV escaping function | `reviews/export/route.ts` (line 138), `history/export/route.ts` (line 109) | ~8 lines each (different implementations) |
| Average rating computation | `overview/route.ts` (line 73), `branches/route.ts` (line 37) | ~8 lines each |
| Per-competitor stats loop | `overview/route.ts` (line 69), `branches/route.ts` (line 29) | ~30 lines structured similarly |

---

## 5. Cross-Cutting Concerns

### 5.1 No Authentication
Zero routes implement authentication, authorization, or rate limiting. The `/api/scrape/trigger` POST endpoint is particularly concerning — anyone with network access can trigger arbitrary Python subprocess execution.

### 5.2 No Request Validation
Zero routes use Zod, Valibot, or any schema validation library. Query parameters are parsed manually with `parseInt()` + `||` coalescing (e.g., `parseInt(...) || 1`), which masks `NaN` values but also masks legitimate `0` values.

### 5.3 No Caching
All routes set `Cache-Control: no-store`. Every request reads from disk. Next.js ISR, incremental cache, or even a 10-second in-memory cache would reduce filesystem load.

### 5.4 Error Response Inconsistency

| Route | Error status | Error shape |
|---|---|---|
| Data routes (overview, branches, reviews, etc.) | 500 | `{ error: string, detail: string }` |
| `/api/scrape/trigger` | 500 | `{ ok: false, error: string, stderr: string }` |
| `/api/config/selectors` (missing file) | 404 | `{ error: string }` |
| `/api/config/listings` (missing file) | 200 | Returns `{ branches: [] }` (from readListings fallback) |

### 5.5 File I/O Per Request

| Route | Files read per request |
|---|---|
| `/api/overview` | 4 + N (where N = competitors, for readLatestDelta) |
| `/api/branches` | 2 + N (snapshots + listings + per-competitor deltas) |
| `/api/reviews` | 2 (all snapshots + listings) |
| `/api/history` | 2 (all deltas + listings) |
| `/api/reviews-over-time` | 1 (all snapshots) |
| `/api/review-lengths` | 1 (all snapshots) |
| `/api/competitor-correlation` | 2 (all snapshots + listings) |
| `/api/health-trend` | 1 (run.log) |
| `/api/scrape/trigger` | 1 (run_summary.json after subprocess) |

---

## 6. Strengths

### S1. Uniform error handling pattern
11 of 13 data routes use the identical try/catch → `{ error, detail }` on 500 pattern. Easy to refactor or wrap.

### S2. Inline request documentation
Every route has a JSDoc comment explaining its purpose, parameters, and response shape.

### S3. Capped page size and log lines
`pageSize` capped at 100 (`/api/reviews`), `lines` capped at 2000 (`/api/logs`). Prevents accidental runaway responses.

### S4. Scrape trigger deliberately restricted to `--fixtures`
The comment at `/api/scrape/trigger:34–35` explicitly documents why live mode is blocked from the dashboard.

### S5. CSV export uses RFC 4180 quoting
Both CSV export routes implement proper comma/quote/newline escaping, producing standards-compliant CSV.

### S6. No external API dependencies
All routes read from the local filesystem only. No external HTTP calls, no database connections, no third-party API calls.

---

## 7. Weaknesses

### W1. [HIGH] No authentication on any route
The `/api/scrape/trigger` POST endpoint executes a subprocess. Any network-accessible client can trigger it. For a local-only dashboard this is acceptable; exposed to the internet it is a critical vulnerability.

### W2. [HIGH] Zero input validation
Query parameters are parsed with ad-hoc `parseInt()` + `||` patterns that mask `NaN` to defaults. No Zod schema, no type coercion, no bounds checking beyond `Math.min(Math.max(...))`. A malformed `rating` parameter like `"abc"` silently returns all results (the `filter(Boolean).filter(...)` chain drops all invalid values, producing an empty filter set, which matches everything).

### W3. [HIGH] Significant logic duplication
~120 lines of code are duplicated across `/api/reviews` ↔ `/api/reviews/export` and `/api/history` ↔ `/api/history/export`. The CSV escaping function exists in two files as separate inline implementations. Any bug fix or feature addition must be applied in multiple places.

### W4. [MEDIUM] `readLatestDelta()` called serially per competitor in overview and branches
`/api/overview` line 82 and `/api/branches` line 51 call `readLatestDelta()` inside a `for` loop — each call triggers `readdir + filter + sort + reverse + readFile`. These should be batched or called in parallel via `Promise.all()`.

### W5. [MEDIUM] `health-trend` route reimplements log reading
Uses `fs.readFile(GBP_RUN_LOG_PATH)` directly instead of calling `tailLog()` from server-data.ts. If `tailLog()` is optimized later (e.g., to reverse-seek), this route won't benefit.

### W6. [MEDIUM] Regex-based log parsing in health-trend
The summary line regex (health-trend/route.ts:56–57) is tightly coupled to the Python logger output format. Any change to `logging` configuration, module name, or line format silently breaks health trend data.

### W7. [MEDIUM] Inconsistent error response for missing selectors
`/api/config/selectors` returns 404 on missing file; `/api/config/listings` returns 200 with `{ branches: [] }`. The consumer (`config-section.tsx`) must handle both patterns differently.

### W8. [MEDIUM] `/api/scrape/trigger` blocks the event loop
`spawnSync()` blocks the Node.js event loop for the entire scraper runtime (up to 60s). For Next.js on Vercel, this ties up a serverless function. For a production dashboard, this blocks all concurrent requests during a scrape.

### W9. [LOW] Dead code: `/api` route
The root API route returns `"Hello, world!"` and is never consumed.

### W10. [LOW] `competitor-correlation` uses dynamic import inconsistently
All other routes use static `import` for `readListings`; this route uses `await import()`. The comment implies it's intentional (deferred loading), but the performance benefit is negligible (a few KB of JS).

### W11. [LOW] Review lengths bucket counting iterates array 4 times
`lengths.filter(l => l >= 1 && l <= 80)` etc. — a single pass with `reduce()` would compute all buckets in one iteration.

### W12. [LOW] No `HEAD` or `OPTIONS` methods
No route supports `HEAD` (for cache validation) or `OPTIONS` (for CORS preflight).

---

## 8. Technical Debt Register

| ID | Description | Module | Severity | Effort |
|---|---|---|---|---|
| TD-06-01 | No authentication on any route | All routes | High | 4 hours |
| TD-06-02 | Zero input validation (no Zod) | All routes with params | High | 4 hours |
| TD-06-03 | Logic duplication in review routes | `reviews/route.ts` + `reviews/export/route.ts` | High | 2 hours |
| TD-06-04 | Logic duplication in history routes | `history/route.ts` + `history/export/route.ts` | High | 2 hours |
| TD-06-05 | `readLatestDelta` serial I/O in overview + branches | `overview/route.ts:82`, `branches/route.ts:51` | Medium | 1 hour |
| TD-06-06 | `health-trend` bypasses `tailLog()` | `health-trend/route.ts:46` | Low | 30 min |
| TD-06-07 | Regex-coupled log parsing | `health-trend/route.ts:56` | Medium | 1 hour |
| TD-06-08 | Inconsistent 404 vs 200 for missing config | `config/selectors/route.ts:11` vs `config/listings/route.ts:10` | Low | 15 min |
| TD-06-09 | `spawnSync` blocks event loop | `scrape/trigger/route.ts:38` | Medium | 2 hours |
| TD-06-10 | Dead `/api` route | `route.ts` | Low | 5 min |
| TD-06-11 | Bucket counting iterates 4× | `review-lengths/route.ts:47–73` | Low | 15 min |

---

## 9. Risks

### R1. Unauthenticated scraper trigger
`POST /api/scrape/trigger` executes `python3 -m orchestration.run_all --fixtures` with no access control. If exposed to the internet, this is an arbitrary-code-execution vector via compromised `orchestration/` or dependency code.

### R2. Sync subprocess blocks server
`spawnSync()` blocks the event loop. On serverless platforms (Vercel), a 60s scraper run ties up a function slot and blocks other requests to the same instance.

### R3. Regex-coupled log parsing
The health-trend regex is tightly coupled to Python logging output. A format change (different logger name, timestamp format, log level) silently breaks the sparkline with no error.

### R4. Schema drift across duplicated logic
Since review filtering logic is duplicated in two files, a bug fix or feature addition (e.g., adding a `date_from` filter) must be applied in both files. High risk of inconsistency.

---

## 10. Missing Documentation

1. **API reference:** No OpenAPI/Swagger spec, no Postman collection, no human-readable API reference
2. **Authentication:** No documentation about whether routes should be protected
3. **Deployment timeout:** No documentation about `maxDuration` requirement for scrape/trigger
4. **Error codes:** No documented list of possible error responses per route

---

## 11. Open Questions

1. **Q1:** Should API routes have authentication? If so, what mechanism (API key, next-auth session, IP whitelist)?
2. **Q2:** Should `readLatestDelta` calls in overview/branches be parallelized with `Promise.all()`?
3. **Q3:** Should `/api/reviews/export` and `/api/reviews` share a common filtering module?
4. **Q4:** Should `/api/history/export` and `/api/history` share a common grouping module?
5. **Q5:** Should `spawnSync` be replaced with `spawn` + async wait to avoid blocking?
6. **Q6:** Should `/api` root return a health-check response instead of "Hello, world!"?
7. **Q7:** Should `/api/config/selectors` return 200 with fallback like other routes, or keep 404?
8. **Q8:** Should there be a shared CSV utility module instead of inline escaping functions?
9. **Q9:** Should all routes accept Zod-schema validation for query parameters?
10. **Q10:** Should the health-trend regex be replaced with a structured log format (e.g., JSON log lines)?

---

## 12. Test Coverage

| Route | Test files | Lines tested | Coverage estimate |
|---|---|---|---|
| All 15 routes | None | 0 / 1,420 | 0% |

**Total: 0 test files, 0% coverage.** No Jest/Vitest/Playwright configuration for API route testing.

### Recommended test targets (by priority):
1. `/api/reviews` — query parameter parsing, filter logic, pagination edge cases
2. `/api/overview` — aggregation logic, alert computation, edge cases (empty listings, missing snapshots)
3. `/api/scrape/trigger` — subprocess error handling, summary reading edge cases
4. `/api/history` — delta grouping logic, timestamp sorting
5. `/api/health-trend` — regex matching edge cases, malformed log lines
6. `/api/review-lengths` — bucket counting, median calculation, empty data
7. `/api/competitor-correlation` — cosine similarity math, matrix symmetry
