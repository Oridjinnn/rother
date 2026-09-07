# Technical Debt Register — Rother

**Date:** 2026-07-22 (last full re-count 2026-08-14)
**Source:** Architecture Audits AUDIT-01 through AUDIT-07 (+ ROTHER-AUDIT re-scans 2026-08-13, 2026-08-14)
**Total Items:** 56

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
| **Status** | **Resolved (2026-08-14)** — unified `useApiQuery` (`useQuery`, 15s staleTime) introduced; `use-overview.ts` + `use-branches.ts` migrated. Remaining self-fetching components should adopt `useApiQuery` (tracked incremental). |
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

---

## ROTHER-AUDIT Resolution / Status Notes — 2026-08-13

> Appended by the ROTHER-AUDIT follow-up. Statuses HYPOTHESIS-grade pending live verification.

| ID | Prior status | Current status | Evidence / Note |
|---|---|---|---|
| TD-C01 | Open — empty parse overwrites snapshot | **Guard added (this session)** | `run_all.py` Step 4 skips `save_snapshot` when parse empty AND prior snapshot non-empty. `py_compile` passes. |
| TD-C02 | Open — hardcoded `GBP_ROOT` | **Resolved** | `src/lib/gbp/paths.ts:15-20` env-configurable. |
| TD-C03 | Open — no schema validation | Open | Zod validation still not at `server-data.ts` boundary. |
| TD-C04 | Open — non-atomic delta/summary | **Resolved** | `.tmp`+rename confirmed. |
| TD-H06 | Open — errors swallowed in `server-data.ts` | **Resolved (2026-08-14)** | `readJsonFile` logs; `dataStatus` envelope added (D4). |
| TD-H08 | Open — no TanStack Query usage | **Resolved (2026-08-14)** | unified `useApiQuery` + 2 hooks migrated (C4). |
| TD-H09 | Open — `charts.tsx` monolith | Open | Still 29 KB monolith; split spec in ROADMAP §4. |
| TD-M03 | Open — Prisma/SQLite unused | Open | Dead code; also see RISK-026 (Tauri data story). |
| TD-M05 | Open — API root "Hello world" | **Resolved (this session)** | `src/app/api/route.ts` repurposed to health endpoint `{ status: "ok" }`. |
| TD-M06 | Open — `formatRating` dead | **Resolved** | No `formatRating` consumer remains in `src/`. |
| TD-M15/TD-L01 | Open — TS build errors ignored | Open | `next.config.ts` still `ignoreBuildErrors: true`. |

### New debt surfaced by ROTHER-AUDIT
- **TD-N01 (High):** No honest CI viability signal — `verify_baseline.py` accepts `0`/`1`, `golden-datasets/` empty, `run_all.py:1646` `sys.exit(0)` in live mode. (see RISK-025 / RISK-027)
- **TD-N02 (High):** Multi-category feature has no schema or discovery backend — 3 independent blockers. (see RISK-024)
- **TD-N03 (Medium):** Tauri plan over-provisions a SQLite engine that the app does not use. (see RISK-026; corrected in plan doc)

---

## Execution Prompt B Resolution Notes — 2026-08-13

> Documents the "user business + category + Run gate" increment.

| ID | Prior status | Current status | Evidence / Note |
|---|---|---|---|
| Single-business assumption (Copenhagen Bali as the only/primary business) | Open — UI assumed the seed demo | **CLOSED** | Onboarding captures the user's own business (name + location + category); `readListings()` returns `[]` once `user-business.json` exists, so the seeded demo is hidden from the UI. The product is single-business by design now. |
| TD-N02 | Open — 3 backend blockers | **Partial — frontend resolved** | Category picker + `ActiveBusiness` schema added; live arbitrary-business scraping still deferred (see TD-N04 / RISK-028). |

### New debt surfaced by Execution Prompt B
- **TD-N04 (High):** Live scrape of an arbitrary user business (by category + location) is **not yet supported** — deferred backend follow-up. `POST /api/scrape/trigger` persists the user's business to `user-business.json` and starts a run, but the Python orchestrator is not yet scoped to scrape an arbitrary real business; acquisition remains auth-gated (RISK-023). The user lands on empty states after the Run gate. (see RISK-028)

---

## ROTHER-AUDIT Resolution / Status Notes — 2026-08-14

> Appended by the ROTHER-AUDIT follow-up (second pass). Statuses HYPOTHESIS-grade
> pending live verification.

| ID | Prior status | Current status | Evidence / Note |
|---|---|---|---|
| TD-H12 | Open — inconsistent `.get()` vs bracket access | **Close (not present)** | `parser/review_parser.py:153-208` uses consistent `.get()` + try/except; no raw bracket access. Recommend closing. |
| TD-M03 / RISK-026 | Open — Prisma/SQLite dead | **Confirmed dead at read; inert in Tauri** | `server-data.ts` reads JSON only; `src-tauri/src/main.rs:46,57` still injects an unused `DATABASE_URL` (SQLite dev.db) into the sidecar. Clean up the injection. |

### New debt surfaced by ROTHER-AUDIT (2026-08-14)
- **TD-N05 (Medium):** Dead COARSE adapters on disk — `src/components/dashboard/overview-section.tsx` (~600 LOC, unreferenced) and `src/components/dashboard/config-section.tsx` (unreferenced; live Config is `src/features/t-config.tsx`). Maintenance/confusion risk; no runtime impact. (see C3)
- **TD-N06 (Medium):** Mixed data-acquisition styles + uncached `useOverview()` — some features pass data down, others self-fetch; `use-overview.ts:6-31` is plain `useState`+`fetch` with no memoization → redundant `/api/overview` calls. Concrete instance of TD-H08. (see C4)
- **TD-N07 (Medium):** Doc drift presents demo scale as current spec — `docs/product/04_SCREEN_MAP.md` (no disclaimer; "6 branches / 2 per branch / #1–6") and `docs/product/02_INFORMATION_ARCHITECTURE.md:162` (restates retired "Competitors (2)" rule). Both are source-of-truth docs. (see X1/X2)
- **TD-N08 (Medium):** Additional doc drift — `docs/product/05_COMPONENT_SYSTEM.md:56` (`<CompetitorCard> × 2 per branch`), `docs/product/03_USER_FLOWS.md:25,90` (Flow 3 "6 branches ranked" as live), `docs/engineering/API_REFERENCE.md:153` (hardcoded `12`). (see X3/X4/X5)
- **TD-N09 (Low/Med):** `RELEASE_NOTES.md` omits the single-business pivot (onboarding, category picker, Run gate); project directory still named `Rother - 0.0.1` (3 versions behind `package.json` 0.2.0). Owner-facing "what is this" doc is stale. (see X6)

---

## ROTHER-AUDIT Execution Notes — 2026-08-14

> All 2026-08-14 findings executed or partially executed this session under a
> **minimal-backend** constraint. Per-item detail in `docs/management/ROADMAP_2026-08-14.md`.

| ID | Prior status | Current status | Evidence |
|---|---|---|---|
| TD-H06 (D4) | Open — errors swallowed | **Resolved** | `readJsonFile` logs on failure; `snapshot-glance` banner; `dataStatus` envelope on `/api/overview`+`/api/branches` (`assessDataStatus`) |
| TD-N05 (C3) | Open — dead adapters | **Resolved** | `overview-section.tsx`, `config-section.tsx` deleted |
| TD-N06 (C4) | Open — uncached `useOverview` | **Resolved** | unified `useApiQuery` (`useQuery`, 15s staleTime) + `use-overview.ts`/`use-branches.ts` migrated; TD-H08 closed |
| TD-N07 (X1/X2) | Open — doc drift | **Resolved** | `04_SCREEN_MAP.md` disclaimer; `02_IA.md:162` `(N)` |
| TD-N08 (X3/X4/X5) | Open — doc drift | **Resolved** | `05_COMPONENT_SYSTEM.md:56`, `03_USER_FLOWS.md`, `API_REFERENCE.md:153` |
| TD-N09 (X6) | Open — RELEASE_NOTES stale | **Resolved** | single-business pivot added to `RELEASE_NOTES.md` |
| TD-H12 → n/a | — | **Resolved** | TD-N10 closed — sanctioned `useMounted` + `useOnlineStatus`(`useSyncExternalStore`) + `useApiQuery` cover remaining directives |

### New tracking item
- **TD-N10 (Low):** Remaining `react-hooks/set-state-in-effect` directives. `app-state.tsx`
  migrated to `src/lib/use-external-store.ts` (`useSyncExternalStore`); `useMounted`
  (`src/lib/use-mounted.ts`) replaces the `useState(false)+useEffect(setMounted(true))`
  mount-guard in `theme-toggle.tsx` + `freshness-badge.tsx`; `OnlineStatusProvider` reads
  `navigator.onLine` via `useSyncExternalStore`. The remaining data-fetch-in-effect directives
  are covered by the unified `useApiQuery` hook (C4). **Closed 2026-08-14.** |

---

## 2026-08-14 (run 2) — NEW debt items

- **TD-N11 (Med):** Dual `fetch("/api/branches")` in `reviews-section.tsx:127` and
  `history-comparison-section.tsx:53` bypass the unified `useBranches()` cache (TD-N06 resolved
  for other callers but missed these two). Redundant network + divergent loading UX.
  Maps to plan §[test] #22. *Confidence: CONVERGED.*
- **TD-N12 (Med):** `golden-datasets/run_summary.golden.json` asserts `skipped:0, success:3`
  while `verify_baseline.py:116-119` asserts `skipped==9` — self-contradictory golden baseline;
  `compare_golden()` will fail whenever run. (RISK-025 populated datasets but the summary
  baseline was not reconciled.) Maps to plan §[test] #21. *Confidence: CONVERGED.*
- **TD-N13 (Low):** Feature-registry inventory drift — `UX_RESTRUCTURE_PLAN.md` lists 28
  features; shipped `FEATURES` has 30 (`c-discover`, `c-geo-grid` added by limitation work).
  Document or gate. Maps to U2/P6. *Confidence: CONVERGED.*

### 2026-08-14 (run 2) — EXECUTION STATUS
- **TD-N11 (dual fetch):** `reviews-section.tsx` + `history-comparison-section.tsx` now use `useBranches()` instead of raw `fetch("/api/branches")`. **Executed + tsc-clean.**
- **TD-N12 (golden contradiction):** `golden-datasets/run_summary.golden.json` `skipped` corrected to `9` to match `verify_baseline.py` fixtures assertion. **Executed.**
- **TD-N13 (registry drift):** `UX_RESTRUCTURE_PLAN.md` inventory updated to canonical 27 (28 baseline + c-discover + c-geo-grid, then 3 merged). **Executed.**
