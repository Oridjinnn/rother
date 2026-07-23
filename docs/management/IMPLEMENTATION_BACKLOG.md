# Implementation Backlog — Rother (GBP Monitor)

**Date:** 2026-07-22
**Source:** Architecture Audits AUDIT-01 through AUDIT-07
**Total Tasks:** 28

---

## Priority Levels

| Level | Definition | Count |
|---|---|---|
| **Critical** | Must fix before any production use. Data loss, security, or system non-functional without this. | 6 |
| **High** | Should fix before general availability. Significant risk or operational friction without this. | 10 |
| **Medium** | Important but not blocking. Can be addressed after initial live verification. | 8 |
| **Low** | Nice-to-have. Cosmetic, minor efficiency, or architectural consistency. | 4 |

---

## Critical Tasks

### T-001: Prevent Snapshot Overwrite on Empty Parse

| Field | Value |
|---|---|
| **Priority** | Critical |
| **Description** | Add guard in `run_all.py` to prevent `save_snapshot()` from overwriting a non-empty snapshot with an empty result from `parse_reviews()`. If parser returns 0 results and prior snapshot has >0 reviews, log an ERROR and skip the snapshot write. |
| **Dependencies** | None |
| **Complexity** | Small |
| **Risk level** | Low |
| **Source** | RISK-003, TD-C01 (AUDIT-04) |
| **Acceptance criteria** | 1. Run with fixture data that produces non-empty snapshot. 2. Inject empty parser result (simulate failure). 3. Verify snapshot is NOT overwritten. 4. Verify ERROR log message is emitted. |

### T-002: Make `GBP_ROOT` Configurable via Environment Variable

| Field | Value |
|---|---|
| **Priority** | Critical |
| **Description** | Replace hardcoded `/home/z/my-project/gbp-monitor` in `paths.ts` with `process.env.GBP_ROOT ?? "/home/z/my-project/gbp-monitor"`. Add startup validation that the configured path exists and is readable. |
| **Dependencies** | None |
| **Complexity** | Small |
| **Risk level** | Low |
| **Source** | RISK-004, TD-C02 (AUDIT-05) |
| **Acceptance criteria** | 1. Without env var, dashboard uses fallback path (backward compatible). 2. With env var set, dashboard uses configured path. 3. Startup logs the effective GBP_ROOT. |

### T-003: Add Atomic Write Protection to Delta and Summary Files

| Field | Value |
|---|---|
| **Priority** | Critical |
| **Description** | Apply the same `.tmp` + `Path.replace()` atomic write pattern used by `save_snapshot()` to `_append_new_reviews()` and `_finish_and_write_summary()`. |
| **Dependencies** | None |
| **Complexity** | Small |
| **Risk level** | Low |
| **Source** | RISK-006, TD-C04 (AUDIT-04) |
| **Acceptance criteria** | 1. Delta and summary files written via `.tmp` + rename. 2. Simulated crash during write leaves no partial file at final path. |

### T-004: Verify Selectors Against Live Google Maps DOM

| Field | Value |
|---|---|
| **Priority** | Critical |
| **Description** | Run the scraper against a real Google Maps listing. Test all 11 CSS/XPath selectors. Update `selectors.json` with verified values. Set `verified_by` to `"browser_agent"` or `"manual_human"`. Capture new fixture files from verified live captures. |
| **Dependencies** | T-002 (paths must work), real competitor URLs |
| **Complexity** | Large |
| **Risk level** | High — selectors may require days of iterative tuning |
| **Source** | RISK-001 (AUDIT-02, AUDIT-03) |
| **Acceptance criteria** | 1. All 5 locator tiers tested against live DOM. 2. At least one tier produces matches for all 11 selectors. 3. `selectors.json` updated with verified values. 4. New fixture files captured from live runs. |

### T-005: Implement Authentication on All API Routes

| Field | Value |
|---|---|
| **Priority** | Critical |
| **Description** | Configure authentication on all 15 API routes. Either: (a) configure `next-auth` with credentials provider, (b) implement API key via middleware, or (c) add Caddy basic auth. Apply to all routes, especially `POST /api/scrape/trigger`. |
| **Dependencies** | None (next-auth already in package.json) |
| **Complexity** | Medium |
| **Risk level** | Low |
| **Source** | RISK-005 (AUDIT-01, AUDIT-06) |
| **Acceptance criteria** | 1. Unauthenticated requests to any API route receive 401/403. 2. Authenticated requests succeed. 3. Auth bypass is tested and confirmed blocked. |

### T-006: Verify Anti-Bot Hardening Against Real Google Maps

| Field | Value |
|---|---|
| **Priority** | Critical |
| **Description** | Test the 3-layer Client Hints override (Fix A) against a detection-test page and real Google Maps URL. Verify that all 3 layers (extra_http_headers, CDP override, init script) produce consistent, self-identical browser fingerprint. |
| **Dependencies** | T-004 (real Google Maps access), real competitor URLs |
| **Complexity** | Medium |
| **Risk level** | Medium — detection test may reveal fingerprint gaps |
| **Source** | TD-C05 (AUDIT-02) |
| **Acceptance criteria** | 1. Detection-test page confirms headless Chromium passes as real browser. 2. Real Google Maps page renders without blocking. 3. `SelectorNotFoundError` is NOT raised for anti-bot reasons. |

---

## High Tasks

### T-007: Install Test Infrastructure and Write Unit Tests for Pure Functions

| Field | Value |
|---|---|
| **Priority** | High |
| **Description** | Install pytest for Python, vitest for TypeScript. Write unit tests for all pure functions: `format.ts` (6 functions), `delta.py` (`compute_new_reviews`), `schema.py` (`review_to_dict`), `format.ts` formatting helpers. |
| **Dependencies** | None |
| **Complexity** | Medium |
| **Risk level** | Low |
| **Source** | TD-H01 (AUDIT-01 through AUDIT-07) |
| **Acceptance criteria** | 1. `pytest ... tests/` passes. 2. `vitest run` passes. 3. All pure functions have at least one test case. 4. Test commands exist in `package.json`. |

### T-008: Extract Shared API Logic Modules (Review Filters, History Grouping, CSV)

| Field | Value |
|---|---|
| **Priority** | High |
| **Description** | Extract ~120 lines of duplicated logic into shared modules: `lib/review-filter.ts`, `lib/history-group.ts`, `lib/csv.ts`. Refactor export routes to delegate to shared utilities. |
| **Dependencies** | T-007 (test safety net) |
| **Complexity** | Medium |
| **Risk level** | Medium — refactoring without tests is risky |
| **Source** | TD-H03 (AUDIT-06) |
| **Acceptance criteria** | 1. `reviews/route.ts` and `reviews/export/route.ts` share filter logic via import. 2. `history/route.ts` and `history/export/route.ts` share grouping logic via import. 3. All existing API responses are identical before and after refactor. |

### T-009: Implement Input Validation on All API Routes

| Field | Value |
|---|---|
| **Priority** | High |
| **Description** | Create Zod schemas for all query parameters on all 5 routes that accept them (`/api/reviews`, `/api/reviews/export`, `/api/logs`, `/api/history`, `/api/history/export`). Return 400 with clear error messages on invalid input. |
| **Dependencies** | None (Zod already in package.json) |
| **Complexity** | Small |
| **Risk level** | Low |
| **Source** | TD-H04 (AUDIT-06) |
| **Acceptance criteria** | 1. Valid requests succeed. 2. Invalid `page` parameter returns 400. 3. Invalid `rating` returns 400. 4. Missing required parameters return 400. |

### T-010: Replace `spawnSync` with Async Subprocess Execution

| Field | Value |
|---|---|
| **Priority** | High |
| **Description** | Replace `child_process.spawnSync()` in `/api/scrape/trigger` with `spawn()` + `await new Promise()`. Return 202 Accepted with a job ID, or simply wait asynchronously without blocking the event loop. |
| **Dependencies** | None |
| **Complexity** | Small |
| **Risk level** | Low |
| **Source** | TD-H05 (AUDIT-06) |
| **Acceptance criteria** | 1. Trigger endpoint does not block other API requests during scrape. 2. Scrape completes successfully. 3. Response includes same data as before. |

### T-011: Add Structured Logging on All Error Paths in server-data.ts

| Field | Value |
|---|---|
| **Priority** | High |
| **Description** | Add `console.error()` or a logger to every catch block in `server-data.ts`. Distinguish between "file missing" (expected) and "file corrupt" (unexpected). Consider returning a metadata wrapper `{ data, error }` instead of bare fallback. |
| **Dependencies** | None |
| **Complexity** | Small |
| **Risk level** | Low |
| **Source** | TD-H06 (AUDIT-05) |
| **Acceptance criteria** | 1. Corrupt JSON file produces error log. 2. Missing file produces info/debug log. 3. API routes can distinguish empty data from corrupt data. |

### T-012: Add Screenshot/DOM Capture on Failure

| Field | Value |
|---|---|
| **Priority** | High |
| **Description** | Add `page.screenshot()` and `page.content()` capture in `capture_listing_html()` when an exception occurs. Save to `data/debug/{competitor_id}_{timestamp}/` with screenshot + HTML + console log. |
| **Dependencies** | None |
| **Complexity** | Small |
| **Risk level** | Low |
| **Source** | TD-C06 (AUDIT-02) |
| **Acceptance criteria** | 1. When capture fails, a screenshot image is written to disk. 2. When capture fails, the raw HTML at failure time is written to disk. 3. Files include competitor_id and timestamp in name. |

### T-013: Implement TanStack Query in Dashboard Components

| Field | Value |
|---|---|
| **Priority** | High |
| **Description** | Replace raw `fetch()` + `useState` + `useEffect` boilerplate in all self-fetching components with `useQuery` hooks. Enable stale-while-revalidate, deduplication, and automatic retry. Remove unused `QueryProvider` if TanStack Query is not adopted. |
| **Dependencies** | None |
| **Complexity** | Large |
| **Risk level** | Medium — requires refactoring 9+ components |
| **Source** | TD-H08 (AUDIT-07) |
| **Acceptance criteria** | 1. All self-fetching components use `useQuery` instead of raw `fetch` + `useState`. 2. Multiple components fetching the same endpoint share one network request. 3. `refreshKey` mechanism still triggers re-fetch. |

### T-014: Split `charts.tsx` Into One File Per Chart Type

| Field | Value |
|---|---|
| **Priority** | High |
| **Description** | Split the 839-line `charts.tsx` into individual files: `rating-distribution-chart.tsx`, `reviews-per-competitor-chart.tsx`, `new-reviews-per-branch-chart.tsx`, `sentiment-distribution-chart.tsx`, `reviews-over-time-chart.tsx`, `competitor-radar-chart.tsx`. Extract shared types and utilities to `chart-utils.ts`. |
| **Dependencies** | None |
| **Complexity** | Medium |
| **Risk level** | Low |
| **Source** | TD-H09 (AUDIT-07) |
| **Acceptance criteria** | 1. All 6 chart components are importable from their own files. 2. All existing imports resolve correctly. 3. Shared utilities are in one `chart-utils.ts` module. |

### T-015: Add Comprehensive Fixture Files

| Field | Value |
|---|---|
| **Priority** | High |
| **Description** | Create fixture files for all edge cases: empty reviews panel, rating-only reviews (no text), anonymous reviewers (no aria-label), null/missing ratings, truncated text with "…More", very long text, non-English locale, missing `data-review-id`, malformed HTML, cookie-overlay HTML, CAPTCHA/bot-block page, zero-reviews page. |
| **Dependencies** | T-004 (live captures for real fixture generation) |
| **Complexity** | Medium |
| **Risk level** | Low |
| **Source** | TD-H10 (AUDIT-03) |
| **Acceptance criteria** | 1. All edge cases have fixture files. 2. Parser produces expected output for each fixture. 3. Edge cases that should return errors actually return errors. |

### T-016: Make Locator Tier Selectors Configurable

| Field | Value |
|---|---|
| **Priority** | High |
| **Description** | Add configuration keys in `selectors.json` for locator tiers 1–4 (currently hardcoded). Allow operator to override `[data-review-id]`, `[role="article"]`, etc. without modifying Python source code. |
| **Dependencies** | None |
| **Complexity** | Small |
| **Risk level** | Low |
| **Source** | TD-H11 (AUDIT-03) |
| **Acceptance criteria** | 1. Tiers 1–4 selectors are read from `selectors.json`. 2. Fall back to hardcoded values if config keys are absent. 3. Documentation updated for selector configuration. |

---

## Medium Tasks

### T-017: Add Runtime Schema Validation with Zod

| Field | Value |
|---|---|
| **Priority** | Medium |
| **Description** | Create Zod schemas for all JSON file formats (Review, RunSummary, ListingsConfig, SelectorsConfig). Add validation in `readJsonFile()` that logs warnings on schema mismatch. |
| **Dependencies** | T-007 (test infrastructure) |
| **Complexity** | Medium |
| **Risk level** | Low |
| **Source** | TD-C03 (AUDIT-05) |
| **Acceptance criteria** | 1. Valid JSON files parse and validate successfully. 2. Mismatched files produce warning log. 3. Zod schemas are the single source of truth for file formats. |

### T-018: Add Server-Side Caching Layer

| Field | Value |
|---|---|
| **Priority** | Medium |
| **Description** | Add an in-memory cache with 30s TTL in `server-data.ts`. Cache read results keyed by file path. Invalidate on write. Keep `no-store` on API routes but cache at the data layer. |
| **Dependencies** | T-013 (client-side TanStack Query) or independent |
| **Complexity** | Medium |
| **Risk level** | Low |
| **Source** | TD-H07 (AUDIT-05) |
| **Acceptance criteria** | 1. Repeated reads of same file within TTL return cached result. 2. Cache is invalidated after TTL expiry. 3. No stale data is served beyond TTL. |

### T-019: Fix ESLint and TypeScript Config

| Field | Value |
|---|---|
| **Priority** | Medium |
| **Description** | Remove `ignoreBuildErrors: true` from next.config.ts. Enable `noImplicitAny: true` in tsconfig. Re-enable ESLint rules incrementally. Fix all existing errors. |
| **Dependencies** | None |
| **Complexity** | Medium |
| **Risk level** | Medium — may surface many existing errors |
| **Source** | TD-H15, TD-L01 (AUDIT-01) |
| **Acceptance criteria** | 1. `bun run lint` passes with meaningful rules. 2. `bun run build` fails on TypeScript errors. 3. All current TypeScript errors fixed. |

### T-020: Extract Inline Components from overview-section.tsx

| Field | Value |
|---|---|
| **Priority** | Medium |
| **Description** | Extract `VerificationBadge`, `RunHealthPanel`, and `ChartCard` from `overview-section.tsx` (807 lines) into separate component files. |
| **Dependencies** | None |
| **Complexity** | Small |
| **Risk level** | Low |
| **Source** | TD-M14 (AUDIT-07) |
| **Acceptance criteria** | 1. Each inline component is a separate file. 2. `overview-section.tsx` imports them. 3. Visual output is identical. |

### T-021: Parallelize `readLatestDelta()` Calls in Overview and Branches

| Field | Value |
|---|---|
| **Priority** | Medium |
| **Description** | Replace serial `for...of` loop with `Promise.all()` for `readLatestDelta()` calls in `/api/overview` and `/api/branches`. |
| **Dependencies** | None |
| **Complexity** | Small |
| **Risk level** | Low |
| **Source** | TD-M07 (AUDIT-06) |
| **Acceptance criteria** | 1. All delta reads happen concurrently. 2. Response data is identical. |

### T-022: Add Relative-Date-to-Absolute Conversion

| Field | Value |
|---|---|
| **Priority** | Medium |
| **Description** | Add a function in `format.ts` that converts Google Maps relative date strings (e.g., "5 days ago", "a month ago") to absolute ISO 8601 dates using `scraped_at` as the reference point. |
| **Dependencies** | None |
| **Complexity** | Small |
| **Risk level** | Low |
| **Source** | RISK-014 (AUDIT-03) |
| **Acceptance criteria** | 1. "5 days ago" with known scraped_at produces correct absolute date. 2. "a month ago" produces correct approximate date. 3. Unparseable strings return null. |

### T-023: Replace Health-Trend Regex with Structured Summary File

| Field | Value |
|---|---|
| **Priority** | Medium |
| **Description** | Write a separate JSON summary file per run (e.g., `data/run_health.json`) that the health-trend route reads directly. Remove the regex-based log parsing. |
| **Dependencies** | None |
| **Complexity** | Small |
| **Risk level** | Low |
| **Source** | RISK-016, TD-M09 (AUDIT-06) |
| **Acceptance criteria** | 1. Each scraper run writes a health summary JSON file. 2. `/api/health-trend` reads from this file. 3. Old log-parsing code is removed. |

### T-024: Standardize Selector Key Access Patterns

| Field | Value |
|---|---|
| **Priority** | Medium |
| **Description** | Change all four `_safe_parse_*` helpers in `review_parser.py` to use `selectors.get()` with appropriate defaults instead of bracket access. |
| **Dependencies** | None |
| **Complexity** | Small |
| **Risk level** | Low |
| **Source** | TD-H12 (AUDIT-03) |
| **Acceptance criteria** | 1. All four helpers use `.get()` consistently. 2. Missing selector keys produce defaults, not KeyError. |

---

## Low Tasks

### T-025: Remove Unused npm Packages

| Field | Value |
|---|---|
| **Priority** | Low |
| **Description** | Remove `next-intl`, `zustand`, `react-hook-form`, `@dnd-kit/*`, `@mdxeditor/editor`, `react-markdown` from dependencies after confirming no planned usage. |
| **Dependencies** | None |
| **Complexity** | Small |
| **Risk level** | Low |
| **Source** | TD-H14 (AUDIT-01, AUDIT-07) |
| **Acceptance criteria** | 1. All removed packages confirmed unused via grep. 2. `bun install` succeeds. 3. Build passes. |

### T-026: Remove Dead Code (API Root, formatRating, lib/db.ts, use-toast.ts)

| Field | Value |
|---|---|
| **Priority** | Low |
| **Description** | Remove or repurpose: `/api` route (dead), `formatRating` (unused), `lib/db.ts` (unused Prisma client), `hooks/use-toast.ts` (unused — sonner used instead). |
| **Dependencies** | None |
| **Complexity** | Small |
| **Risk level** | Low |
| **Source** | AUDIT-01, AUDIT-05 |
| **Acceptance criteria** | 1. All listed dead code removed. 2. Build passes. 3. No runtime impact. |

### T-027: Remove Sandbox Path from UI

| Field | Value |
|---|---|
| **Priority** | Low |
| **Description** | Remove the hardcoded `/home/z/my-project/gbp-monitor/config/` string from `config-section.tsx:255`. Derive path display from configuration or omit. |
| **Dependencies** | T-002 (path configuration) |
| **Complexity** | Small |
| **Risk level** | Low |
| **Source** | RISK-022 (AUDIT-07) |
| **Acceptance criteria** | 1. No hardcoded sandbox paths in rendered UI. 2. Config path display uses runtime values. |

### T-028: Add Log Rotation Outside GitHub Actions

| Field | Value |
|---|---|
| **Priority** | Low |
| **Description** | Implement log rotation in `run_all.py`: rename `run.log` to `run.log.YYYYMMDD` if file size exceeds 5 MB, start a new file. |
| **Dependencies** | None |
| **Complexity** | Small |
| **Risk level** | Low |
| **Source** | RISK-020 (AUDIT-01, AUDIT-04) |
| **Acceptance criteria** | 1. `run.log` is rotated when exceeding 5 MB threshold. 2. Old logs are preserved with dated filenames. 3. Dashboard reads the current (unrotated) log file correctly. |
