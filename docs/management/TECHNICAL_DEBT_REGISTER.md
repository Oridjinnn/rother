# Technical Debt Register — Rother

**Date:** 2026-07-22
**Source:** Architecture Audits AUDIT-01 through AUDIT-07
**Total Items:** 51

---

## Critical Debt (6 items)

### TD-C01: Empty Parser Output Overwrites Snapshot With `[]`

| Field | Value |
|---|---|
| **Description** | `save_snapshot(comp_id, parsed_dicts)` is called unconditionally. If parser returns `[]` (corrupt HTML, wrong selectors, transient error), the prior snapshot is replaced with empty array. All reviews permanently lost. |
| **Location** | `gbp-monitor/orchestration/run_all.py:282` (AUDIT-04) |
| **Impact** | Critical — permanent data loss on any failed parse |
| **Suggested work** | Add guard: if `len(parsed_dicts) == 0` and prior snapshot had reviews, skip save, log ERROR. Add minimum-review threshold for overwrite. |
| **Dependencies** | None |

### TD-C02: Hardcoded `GBP_ROOT` Sandbox Path

| Field | Value |
|---|---|
| **Description** | `"/home/z/my-project/gbp-monitor"` hardcoded in paths.ts. No env var override. Dashboard cannot find data on any other machine. |
| **Location** | `src/lib/gbp/paths.ts:11` (AUDIT-05) |
| **Impact** | Critical — system non-functional outside sandbox |
| **Suggested work** | Add `process.env.GBP_ROOT` as primary source, hardcoded path as fallback. Add startup validation. |
| **Dependencies** | None |

### TD-C03: No Runtime Schema Validation at Python↔TypeScript Boundary

| Field | Value |
|---|---|
| **Description** | `readJsonFile<T>()` casts JSON with `as T`. A schema change in Python produces silent `undefined` access in TypeScript. No Zod, no JSON Schema, no validation. |
| **Location** | `src/lib/gbp/server-data.ts:34` (AUDIT-05) |
| **Impact** | Critical — silent data corruption on schema drift |
| **Suggested work** | Add Zod schema validation for all JSON file reads. Log warnings on schema mismatch. |
| **Dependencies** | Zod already in package.json |

### TD-C04: Delta and Summary Files Lack Atomic Write Protection

| Field | Value |
|---|---|
| **Description** | Delta files and `run_summary.json` use `path.write_text()` directly (no `.tmp`+rename). A crash mid-write leaves partial/truncated JSON files. Dashboard silently discards unparseable files. |
| **Location** | `gbp-monitor/orchestration/run_all.py:351,384` (AUDIT-04) |
| **Impact** | High — silent data loss on crash during write |
| **Suggested work** | Apply `.tmp` + `Path.replace()` atomic pattern to delta and summary writes (same as snapshots). |
| **Dependencies** | None |

### TD-C05: Anti-Bot Hardening Never Verified Against Real Google Maps

| Field | Value |
|---|---|
| **Description** | 3-layer Client Hints override (Fix A, arXiv:2606.14525) is applied but never tested against a real Google Maps page. The only smoke test (pre-fix) confirmed `SelectorNotFoundError`. |
| **Location** | `gbp-monitor/harness/browser.py:21-62` (AUDIT-02) |
| **Impact** | Critical — live scraper may be immediately blocked |
| **Suggested work** | Test against detection test page and real Google Maps URL. Verify all 3 layers produce consistent fingerprint. |
| **Dependencies** | Real competitor URLs |

### TD-C06: No Screenshot/DOM Evidence Captured on Capture Failure

| Field | Value |
|---|---|
| **Description** | When `capture_listing_html()` fails, no screenshot, HTML, or console logs are saved. Operator has no evidence of page state at failure time. |
| **Location** | `gbp-monitor/harness/capture.py` (AUDIT-02) |
| **Impact** | High — debugging capture failures is extremely difficult |
| **Suggested work** | Add `page.screenshot()` and `page.content()` on failure path. Save to `data/debug/` with timestamp and competitor_id. |
| **Dependencies** | None |

---

## High Debt (15 items)

### TD-H01: No Automated Tests

| Field | Value |
|---|---|
| **Description** | Zero test files, zero test frameworks, zero test commands for both Python and JavaScript. The only verification is manual `--fixtures` execution. |
| **Location** | Entire codebase (AUDIT-01 through AUDIT-07) |
| **Impact** | High — every change risks regression |
| **Suggested work** | Install pytest + vitest. Write tests for pure functions first (format.ts, delta.py, schema.py). Add CI test step. |
| **Dependencies** | None |

### TD-H02: No Authentication on Any API Route

| Field | Value |
|---|---|
| **Description** | Zero of 15 API routes have auth. `POST /api/scrape/trigger` executes Python subprocess with no access control. |
| **Location** | All routes in `src/app/api/` (AUDIT-06) |
| **Impact** | High — arbitrary code execution if exposed |
| **Suggested work** | Configure next-auth or add middleware auth guard. Apply to all routes. |
| **Dependencies** | next-auth already in package.json |

### TD-H03: API Logic Duplication (~120 lines)

| Field | Value |
|---|---|
| **Description** | Review filtering logic duplicated in `reviews/route.ts` and `reviews/export/route.ts`. History grouping duplicated in `history/route.ts` and `history/export/route.ts`. CSV escaping duplicated as separate inline implementations. |
| **Location** | `src/app/api/reviews/`, `src/app/api/history/` (AUDIT-06) |
| **Impact** | High — bug fixes must be applied in multiple places |
| **Suggested work** | Extract shared modules: `lib/review-filter.ts`, `lib/history-group.ts`, `lib/csv.ts`. |
| **Dependencies** | None |

### TD-H04: Zero Input Validation on API Routes

| Field | Value |
|---|---|
| **Description** | Query parameters parsed with ad-hoc `parseInt()` + `||` coalescing. No Zod schemas. Malformed parameters silently return full result sets. |
| **Location** | All API routes with params (AUDIT-06) |
| **Impact** | High — unpredictable behavior on invalid input |
| **Suggested work** | Implement Zod validation for all request parameters. |
| **Dependencies** | Zod already in package.json |

### TD-H05: `spawnSync` Blocks Event Loop

| Field | Value |
|---|---|
| **Description** | `POST /api/scrape/trigger` uses `spawnSync()` — blocks Node.js event loop for up to 60s, preventing all concurrent requests. |
| **Location** | `src/app/api/scrape/trigger/route.ts:38` (AUDIT-06) |
| **Impact** | High — blocks all concurrent requests during scrape |
| **Suggested work** | Replace with `spawn` + async/await. Return 202 Accepted. |
| **Dependencies** | None |

### TD-H06: All Errors Silently Swallowed in Data Layer

| Field | Value |
|---|---|
| **Description** | `server-data.ts` catches every I/O error and returns empty fallback. No errors logged, no warnings emitted. A corrupt `listings.json` returns `{ branches: [] }` with no indication of failure. |
| **Location** | `src/lib/gbp/server-data.ts` (AUDIT-05) |
| **Impact** | High — operator cannot detect corrupt or missing files |
| **Suggested work** | Add structured logging on every error path (`console.error` or a logger). Distinguish between "file missing" and "file corrupt" in returned metadata. |
| **Dependencies** | None |

### TD-H07: No Caching Layer

| Field | Value |
|---|---|
| **Description** | Every API request hits filesystem with `no-store` cache. Three components independently fetch `/api/history`. Five fetch `/api/reviews`. No TanStack Query usage despite being installed. |
| **Location** | `server-data.ts`, all API routes, all self-fetching components (AUDIT-05, AUDIT-06, AUDIT-07) |
| **Impact** | Medium — poor performance at scale |
| **Suggested work** | Implement TanStack Query on client side. Add server-side in-memory cache with 30s TTL. |
| **Dependencies** | TanStack Query already in package.json |

### TD-H08: No TanStack Query Usage Despite Being Installed

| Field | Value |
|---|---|
| **Description** | `@tanstack/react-query` is in package.json and `QueryProvider` wraps the app. Zero components use it. All use raw `fetch()` + `useState` + `useEffect`. |
| **Location** | `src/components/dashboard/` (AUDIT-07) |
| **Impact** | Medium — 15KB+ of dead bundle weight, no caching |
| **Suggested work** | Replace all self-fetching boilerplate with `useQuery` hooks. Remove QueryProvider if not used. |
| **Dependencies** | None |

### TD-H09: `charts.tsx` 839-Line Monolith

| Field | Value |
|---|---|
| **Description** | All 6 chart components + 6 tooltip components + color constants in one file. Merge conflicts and maintenance burden. |
| **Location** | `src/components/dashboard/charts.tsx` (AUDIT-07) |
| **Impact** | Medium — merge conflicts, poor maintainability |
| **Suggested work** | Split into one file per chart type. Extract shared utilities. |
| **Dependencies** | None |

### TD-H10: Fixtures Only Cover Happy Path

| Field | Value |
|---|---|
| **Description** | The 3 fixture files are hand-written with idealized structure: all fields present, all class names match, no nulls, no edge cases, no structural variation. |
| **Location** | `gbp-monitor/tests/fixtures/*.html` (AUDIT-03) |
| **Impact** | High — untested error paths will fail silently in production |
| **Suggested work** | Add fixture files for: empty reviews, missing fields, non-English locale, corrupt HTML, CAPTCHA page, cookie overlay. |
| **Dependencies** | None |

### TD-H11: Locator Tier Selectors Hardcoded

| Field | Value |
|---|---|
| **Description** | Tiers 1–4 CSS selectors are hardcoded string literals in `locator.py`. Only tier 5 (seed selector) is configurable. If Google changes `data-review-id` or `role="article"`, all tiers fail simultaneously. |
| **Location** | `gbp-monitor/harness/locator.py:76-86` (AUDIT-03) |
| **Impact** | High — locator cannot be reconfigured without code changes |
| **Suggested work** | Make tier 1–4 selectors configurable via `selectors.json`. Add tier-specific override keys. |
| **Dependencies** | None |

### TD-H12: Selector Keys Use Inconsistent Access Patterns

| Field | Value |
|---|---|
| **Description** | Three of four `_safe_parse_*` helpers use `selectors["key"]` (bracket access, raises `KeyError`). Only `reviewer_name` uses `.get()`. Missing selector keys silently produce `None` fields. |
| **Location** | `gbp-monitor/parser/review_parser.py:178,179,199,220` (AUDIT-03) |
| **Impact** | Medium — inconsistent behavior on missing config keys |
| **Suggested work** | Standardize all four helpers to use `.get()` with appropriate defaults. |
| **Dependencies** | None |

### TD-H13: All 36 Dashboard Components Are `"use client"`

| Field | Value |
|---|---|
| **Description** | Zero server components exist. Entire component tree is client-rendered. No React Server Components, no Partial Prerendering, no streaming SSR. |
| **Location** | `src/components/dashboard/` (AUDIT-07) |
| **Impact** | Medium — larger bundles, slower initial load |
| **Suggested work** | Move data-fetching to server components where possible. Use client components only for interactive sections. |
| **Dependencies** | TanStack Query adoption (to decouple fetch from component) |

### TD-H14: 9 Unused npm Packages

| Field | Value |
|---|---|
| **Description** | `next-intl`, `zustand`, `react-hook-form`, `next-auth`, `@dnd-kit/*`, `@mdxeditor/editor`, `react-markdown` — all in package.json with zero usage. |
| **Location** | `package.json` (AUDIT-01, AUDIT-07) |
| **Impact** | Low — unnecessary bundle size, dependency audit noise |
| **Suggested work** | Remove unused packages after confirming no planned usage. |
| **Dependencies** | None |

### TD-H15: TypeScript Build Errors Ignored

| Field | Value |
|---|---|
| **Description** | `next.config.ts` has `ignoreBuildErrors: true`. TypeScript errors do not block builds, allowing type bugs into production. |
| **Location** | `next.config.ts` (AUDIT-01) |
| **Impact** | Medium — type errors pass CI |
| **Suggested work** | Remove `ignoreBuildErrors`. Fix all existing TS errors first. |
| **Dependencies** | None |

---

## Medium Debt (16 items)

| ID | Description | Location | Impact | Suggested work |
|---|---|---|---|---|
| TD-M01 | ESLint effectively disabled (all rules off) | `eslint.config.mjs` | Low — code quality not enforced | Re-enable rules incrementally |
| TD-M02 | React strict mode disabled | `next.config.ts` | Low — dev bugs may go unnoticed | Enable `reactStrictMode: true` |
| TD-M03 | Prisma/SQLite unused overhead | `prisma/`, `lib/db.ts` | Low — dead code/dead deps | Remove or repurpose |
| TD-M04 | Mini-services directory empty | `mini-services/` | Low — dead scaffolding | Remove or implement |
| TD-M05 | API root returns "Hello, world!" | `src/app/api/route.ts` | Low — dead endpoint | Remove or repurpose as health check |
| TD-M06 | `formatRating` dead code (no consumers) | `src/lib/gbp/format.ts:54` | Low — unused export | Remove or add consumers |
| TD-M07 | `readLatestDelta` called serially in overview+branches loops | `overview/route.ts:82`, `branches/route.ts:51` | Medium — N sequential I/O operations | Parallelize with `Promise.all()` |
| TD-M08 | `health-trend` bypasses `tailLog()` | `health-trend/route.ts:46` | Low — inconsistent file reading | Refactor to use `tailLog()` |
| TD-M09 | Regex-coupled log parsing in health-trend | `health-trend/route.ts:56-57` | Medium — brittle against log format changes | Replace with structured JSON summary file |
| TD-M10 | Inconsistent 404 vs 200 for missing config | `config/selectors/route.ts:11` vs `config/listings/route.ts:10` | Low — inconsistent API contract | Standardize on 200 with null body |
| TD-M11 | Bucket counting iterates array 4 times | `review-lengths/route.ts:47-73` | Low — minor inefficiency | Use single `reduce()` pass |
| TD-M12 | 3 components independently fetch `/api/history` | Overview tab cards | Medium — 3× duplicate requests | TanStack Query deduplication |
| TD-M13 | 5 components independently fetch `/api/reviews` | Various components | Medium — 5× duplicate requests | TanStack Query deduplication |
| TD-M14 | Inline components prevent reuse/testing | `overview-section.tsx` (VerificationBadge, RunHealthPanel, ChartCard) | Medium — cannot test independently | Extract to separate files |
| TD-M15 | Cookie consent assumes English "Reject all" | `config/selectors.json` | Low — non-English locales broken | Add locale-neutral or multi-locale XPaths |
| TD-M16 | `ratingColor` coupled to Tailwind classes | `src/lib/gbp/format.ts:60` | Low — framework coupling | Return semantic constants, map in component |

---

## Low Debt (14 items)

| ID | Description | Location | Impact | Suggested work |
|---|---|---|---|---|
| TD-L01 | `noImplicitAny: false` in tsconfig | `tsconfig.json` | Low — weakens type safety | Enable `noImplicitAny` |
| TD-L02 | `verify=False` in locator (assumes `review_id_attr` exists) | `locator.py:137-138` | Low — no fallback | Add attribute-existence check |
| TD-L03 | No `--headed` CLI flag for Playwright debugging | `run_all.py:401-419` | Low — must edit source for headed mode | Add `--headed` CLI arg |
| TD-L04 | Selector metadata not consumed by code | `selectors.json` | Low — unused fields | Consume or remove |
| TD-L05 | Expand button selector assumes class names | `selectors.json` | Low — vulnerable to class renames | Add self-healing equivalent |
| TD-L06 | `scraped_at` set at parse time, not capture time | `review_parser.py:76` | Low — timestamp skew | Move to capture step |
| TD-L07 | `items_success_tier` assigned but never read (`# noqa: F841`) | `review_parser.py:107` | Low — unused variable | Remove or use |
| TD-L08 | No snapshot deletion/orphan cleanup | `snapshot_store.py` | Low — orphaned files on disk | Add cleanup function |
| TD-L09 | Delta file timestamp collision risk | `run_all.py:344-346` | Low — two runs in same second | Add UUID or counter suffix |
| TD-L10 | No golden-file integrity check on snapshots | `snapshot_store.py` | Low — schema drift undetected | Add checksum or schema version field |
| TD-L11 | `load_snapshot()` does not create snapshots directory | `snapshot_store.py:48-49` | Low — first load returns [] | Create directory on load |
| TD-L12 | Delta file JSON indented (waste of space) | `run_all.py:351-352` | Low — larger file sizes | Omit indent for production |
| TD-L13 | Duplicated branch name shortening regex | 3 components | Low — copy-paste code | Extract to shared utility |
| TD-L14 | `scrape-schedule.tsx` 1h timezone discrepancy in comments | `scrape-schedule.tsx:58-66` | Low — documentation vs code mismatch | Fix cron time or comment |
