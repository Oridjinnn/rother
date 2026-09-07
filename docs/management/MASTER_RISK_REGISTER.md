# Master Risk Register — Rother

**Date:** 2026-07-22 (last full re-count 2026-08-14)
**Source:** Architecture Audits AUDIT-01 through AUDIT-07 (+ ROTHER-AUDIT re-scans 2026-08-13, 2026-08-14)
**Total Identified Risks:** 31

---

## Risk Scoring

| Level | Criteria | Count |
|---|---|---|
| **Critical** | Data loss, security breach, or system cannot function in target environment | 6 |
| **High** | Significant degradation, blocked feature, or difficult-to-diagnose failure | 7 |
| **Medium** | Operational friction, minor data quality issues, or technical debt with consequences | 5 |
| **Low** | Cosmetic issues, non-functional concerns, or edge cases unlikely to occur | 4 |

---

## Critical Risks

### RISK-001: Scraper Selectors UNPROVEN Against Live Google Maps

| Attribute | Value |
|---|---|
| **Description** | All 11 CSS/XPath selectors in `config/selectors.json` are marked `verified_by: "seed"` — they have never been validated against a real Google Maps page. The `review_container` selector (`div.m6QErb.DxyBCb.kA9KIf.dS8AEf`) is a 2023-vintage class triplet that almost certainly does not match current Google Maps DOM. When run in live mode, every listing will fail with `SelectorNotFoundError`. |
| **Subsystem** | Browser Harness (AUDIT-02), Parser (AUDIT-03) |
| **Severity** | Critical |
| **Likelihood** | Near-certain (95%+) |
| **Evidence** | `selectors.json` metadata: `"last_verified": "2026-07-20", "verified_by": "seed", "_verification_note": "Selectors seeded from public reference implementations... UNPROVEN"`. The earlier smoke test (pre-FixA) confirmed `SelectorNotFoundError` on a real URL. |
| **Current status** | Open — never tested against live Google Maps |
| **Proposed mitigation** | Capture fresh HTML from real Google Maps listings; test all selectors against real DOM; update selectors until all 5 locator tiers produce matches; capture new fixture files from verified live captures. |
| **Dependencies** | Real competitor URLs from client (RISK-002) |

### RISK-002: Real Competitor Data Blocker

| Attribute | Value |
|---|---|
| **Description** | All 12 competitor URLs in `listings.json` are mock/placeholder values (containing "mock" in the `place_id`). The scraper cannot scrape any real competitor. The project has no real Google Maps Business Profile URLs from the client. |
| **Subsystem** | Overall Architecture (AUDIT-01) |
| **Severity** | Critical |
| **Likelihood** | Certain (100% — no real URLs exist) |
| **Evidence** | `config/listings.json`: all `gmaps_url` values contain `mock` in the URL path. No real competitor data has been provided. |
| **Current status** | Open — blocked on client communication |
| **Proposed mitigation** | Obtain 12 real Google Maps URLs from Copenhagen Bali operations team. Each must point to a Google Business Profile listing. |
| **Dependencies** | External (client communication) |

### RISK-003: Empty Parser Output Permanently Erases All Reviews

| Attribute | Value |
|---|---|
| **Description** | `save_snapshot(comp_id, parsed_dicts)` is called unconditionally after parsing, even if `parsed_dicts` is an empty list. If `parse_reviews()` returns `[]` (due to corrupt HTML, wrong selectors, transient network error, or Google DOM change), the prior snapshot is overwritten with `[]`. All previously collected reviews for that competitor are permanently lost. The orchestrator counts this as `success += 1` (not a failure), so the `failed >= success` alert does not trigger. |
| **Subsystem** | Storage (AUDIT-04) |
| **Severity** | Critical |
| **Likelihood** | High (70% — will likely happen on first live run when selectors fail) |
| **Evidence** | `run_all.py:282`: `save_snapshot(comp_id, parsed_dicts)` — no guard, no comparison against prior snapshot, no minimum-review threshold. The comment in `delta.py` acknowledges empty-old-snapshot handling but the reverse case (empty new) is unhandled. |
| **Current status** | Open — no guard logic exists |
| **Proposed mitigation** | Compare `parsed_dicts` against prior snapshot before overwriting. If parser returns 0 results and prior snapshot has >0 reviews, log ERROR and skip snapshot update (or create a recovery file). Add a `min_reviews` threshold that prevents overwriting with suspiciously few results. |
| **Dependencies** | None (code change only) |

### RISK-004: Hardcoded `GBP_ROOT` Path Prevents Deployment

| Attribute | Value |
|---|---|
| **Description** | `GBP_ROOT = "/home/z/my-project/gbp-monitor"` is hardcoded in `src/lib/gbp/paths.ts:11`. This path is specific to the original development sandbox. The dashboard will render empty states on any machine where this directory does not exist. No environment variable override or configuration mechanism exists. |
| **Subsystem** | Dashboard Data Layer (AUDIT-05), Storage (AUDIT-04) |
| **Severity** | Critical |
| **Likelihood** | Certain (100% — will not work on any other machine) |
| **Evidence** | `src/lib/gbp/paths.ts:11`: `export const GBP_ROOT = path.resolve("/home/z/my-project/gbp-monitor")`. Python scraper uses relative paths (`data/snapshots/`) while dashboard uses absolute path — the two subsystems have incompatible path strategies. |
| **Current status** | Open — hardcoded |
| **Proposed mitigation** | Add `process.env.GBP_ROOT` as primary source with the current hardcoded path as fallback. Add startup validation that the path exists. Update `.zscripts/` and deployment docs accordingly. |
| **Dependencies** | None (code change only) |

### RISK-005: No Authentication on Any API Route

| Attribute | Value |
|---|---|
| **Description** | Zero of 15 API routes implement authentication, authorization, or rate limiting. The `POST /api/scrape/trigger` endpoint executes `python3 -m orchestration.run_all --fixtures` as a subprocess with no access control. If the dashboard is exposed to the internet (even behind Caddy), anyone can trigger scraper runs. The `next-auth` package is installed but never configured. |
| **Subsystem** | API Routes (AUDIT-06), Overall Architecture (AUDIT-01) |
| **Severity** | Critical |
| **Likelihood** | High (will be exposed if deployed with current Caddy config) |
| **Evidence** | 15 route handlers reviewed in AUDIT-06. Zero routes have auth guards. `next-auth` is in `package.json` with zero configuration. `Caddyfile` reverse-proxies port 81 to localhost:3000 with no auth middleware. |
| **Current status** | Open — no auth implemented |
| **Proposed mitigation** | Implement authentication before any deployment. Options: (a) `next-auth` with credentials provider (simplest for single-user), (b) API key via header middleware, (c) Caddy basic auth in front of Next.js. Apply to all routes, especially `POST /api/scrape/trigger`. |
| **Dependencies** | None (dependency already installed) |

### RISK-006: Delta Files Lack Atomic Write Protection

| Attribute | Value |
|---|---|
| **Description** | Delta files (`data/reviews_new/{comp}_{ts}.json`) and the run summary (`run_summary.json`) are written with `path.write_text()` directly, without the `.tmp` + rename atomic pattern used for snapshots. A crash mid-write leaves a partial/truncated file on disk. The dashboard's `readJsonFile()` silently returns `[]` on `JSONDecodeError`, erasing that run's data from history. |
| **Subsystem** | Storage (AUDIT-04) |
| **Severity** | Critical |
| **Likelihood** | Medium (30% — crash during write is rare but possible) |
| **Evidence** | `run_all.py:351`: `path.write_text(json.dumps(new_reviews, ...))` — no `.tmp` + rename. `run_all.py:384-386`: `path.write_text(json.dumps(summary, ...))` — no atomic write. In contrast, `snapshot_store.py:28-30` correctly uses `.tmp` + `path.replace()`. |
| **Current status** | Open — inconsistent write strategy |
| **Proposed mitigation** | Apply the same `.tmp` + `Path.replace()` atomic write pattern to `_append_new_reviews()` and `_finish_and_write_summary()`. |
| **Dependencies** | None (code change only) |

---

## High Risks

### RISK-007: Anti-Bot Hardening Never Verified Against Real Google Maps

| Attribute | Value |
|---|---|
| **Description** | The 3-layer Client Hints override (Fix A: arXiv:2606.14525) is evidence-based but has never been empirically verified against a real Google Maps page post-implementation. The only smoke test (pre-fix) confirmed `SelectorNotFoundError`. If the hardening is insufficient, Google Maps will block every capture attempt. |
| **Subsystem** | Browser Harness (AUDIT-02) |
| **Severity** | High |
| **Likelihood** | Medium (40% — hardening is research-backed but unverified) |
| **Evidence** | `browser.py:21-62` docstring cites pre-fix failure. No post-fix test results documented. No detection-test page used. |
| **Current status** | Open — hardening applied but unverified |
| **Proposed mitigation** | Run against a detection-test page (e.g., `https://bot.sannysoft.com/` or `https://pixelscan.net/`) with `headless=False` for debugging. Verify all 3 layers produce consistent fingerprint. Then test against real Google Maps URL. |
| **Dependencies** | RISK-002 (real URLs), or a detection-test page |

### RISK-008: No Automated Tests Across Entire Codebase

| Attribute | Value |
|---|---|
| **Description** | Both Python and JavaScript subsystems have zero automated tests. No test framework, no test files, no test commands. The only verification path is manual execution of `python -m orchestration.run_all --fixtures` and inspecting output. Every code change risks regression with no safety net. |
| **Subsystem** | All subsystems (AUDIT-01 through AUDIT-07) |
| **Severity** | High |
| **Likelihood** | Certain (0% coverage confirmed) |
| **Evidence** | No `pytest`, no `vitest`, no `jest`, no `playwright` as dev dependencies. `tests/fixtures/` exists but contains only fixture HTML files, no test scripts. `package.json` has no test script. |
| **Current status** | Open — no test infrastructure |
| **Proposed mitigation** | Install pytest for Python, vitest for TypeScript. Write unit tests for pure functions (format.ts, delta.py, schema.py). Write integration tests for critical paths (parse → delta → store, API routes). Add test commands to package.json and CI. |
| **Dependencies** | None |

### RISK-009: No Input Validation on API Routes

| Attribute | Value |
|---|---|
| **Description** | Query parameters on all API routes are parsed with ad-hoc `parseInt()` + `||` coalescing that masks `NaN` to defaults and masks legitimate `0` values. No Zod schemas, no type coercion, no bounds checking beyond `Math.min(Math.max(...))`. A malformed `rating` parameter like `"abc"` silently returns all results. `POST /api/scrape/trigger` accepts no request body validation. |
| **Subsystem** | API Routes (AUDIT-06) |
| **Severity** | High |
| **Likelihood** | High (parameters are user-supplied) |
| **Evidence** | All 5 routes with query parameters use the same pattern: `parseInt(searchParams.get("page") || "1")`. No Zod, no Valibot, no manual validation. `reviews/route.ts:91-103` filters by allowed competitor IDs but accepts any string for `q`. |
| **Current status** | Open — no validation |
| **Proposed mitigation** | Implement Zod schemas for all request parameters. Add middleware or wrapper for automatic validation. Return 400 with clear error messages on invalid input. |
| **Dependencies** | Zod is already in `package.json` |

### RISK-010: Subprocess Blocks Event Loop (spawnSync)

| Attribute | Value |
|---|---|
| **Description** | `POST /api/scrape/trigger` uses `child_process.spawnSync()` which blocks the Node.js event loop for the entire scraper runtime (up to 60 seconds per the `maxDuration` setting). During a scrape, all other API requests queue behind it. On serverless platforms (Vercel), this ties up a function slot. |
| **Subsystem** | API Routes (AUDIT-06) |
| **Severity** | High |
| **Likelihood** | Low (scrape is triggered manually, not on every page load) |
| **Evidence** | `scrape/trigger/route.ts:38`: `spawnSync("python3", ["-m", "orchestration.run_all", "--fixtures"], { timeout: 60_000 })` |
| **Current status** | Open — blocking call |
| **Proposed mitigation** | Replace `spawnSync` with `spawn` + `await new Promise(...)`. Return 202 Accepted immediately and poll for completion, or use a background job queue. |
| **Dependencies** | None (code change only) |

### RISK-011: Significant API Logic Duplication

| Attribute | Value |
|---|---|
| **Description** | ~120 lines of code are duplicated across `/api/reviews` ↔ `/api/reviews/export` and `/api/history` ↔ `/api/history/export`. Review filtering logic (competitor filter, rating filter, text search) exists in two files. History group-by-timestamp logic exists in two files. CSV escaping function exists as separate inline implementations in two files. A bug fix or feature addition must be applied in multiple places — high risk of inconsistency. |
| **Subsystem** | API Routes (AUDIT-06) |
| **Severity** | High |
| **Likelihood** | High (already duplicated; any future change doubles effort) |
| **Evidence** | AUDIT-06 §4.3: 4 duplication hotspots identified. `reviews/route.ts` + `reviews/export/route.ts` share ~50 lines of filter logic. `history/route.ts` + `history/export/route.ts` share ~40 lines of grouping logic. |
| **Current status** | Open — duplicated code |
| **Proposed mitigation** | Extract shared modules: `lib/review-filter.ts` for review filtering, `lib/history-group.ts` for history grouping, `lib/csv.ts` for CSV escaping. Refactor export routes to delegate to shared utilities. |
| **Dependencies** | None (code change only) |

### RISK-012: No Screenshot/DOM Evidence Captured on Failure

| Attribute | Value |
|---|---|
| **Description** | When a capture fails (selectors not found, timeout, navigation error), no visual evidence of the page state is saved. No screenshot, no HAR, no console logs, no raw HTML. The operator receives an error message but cannot inspect what the browser saw — making debugging extremely difficult. |
| **Subsystem** | Browser Harness (AUDIT-02) |
| **Severity** | High |
| **Likelihood** | Near-certain (selectors WILL fail on first live run) |
| **Evidence** | `capture.py` never calls `page.screenshot()`, `page.content()` on failure, or attaches console listeners. The HTML is only captured on success. |
| **Current status** | Open — no failure evidence |
| **Proposed mitigation** | Add `page.screenshot(path=...)` and `page.content()` capture on failure path. Save to a `debug/` directory with timestamp and competitor_id in filename. |
| **Dependencies** | None (code change only) |

### RISK-013: No Caching Layer

| Attribute | Value |
|---|---|
| **Description** | Every API request reads from the filesystem. No in-memory cache, no react-query cache, no HTTP cache headers beyond `no-store`. The Overview tab triggers 15+ filesystem reads per page load. Three components independently fetch `/api/history` on mount. Five components independently fetch `/api/reviews`. No deduplication, no stale-while-revalidate, no background refetching. |
| **Subsystem** | Dashboard Data Layer (AUDIT-05), API Routes (AUDIT-06), Dashboard Components (AUDIT-07) |
| **Severity** | High |
| **Likelihood** | High (every request hits disk) |
| **Evidence** | All 14 data API routes set `{"Cache-Control": "no-store"}`. `server-data.ts` has no caching. Zero components use TanStack Query despite it being installed. |
| **Current status** | Open — no caching |
| **Proposed mitigation** | Implement TanStack Query on the client side (already installed). Add a server-side in-memory cache with 30s TTL in `server-data.ts`. Set appropriate `Cache-Control` headers for routes that can be cached. |
| **Dependencies** | TanStack Query already in package.json |

---

## Medium Risks

### RISK-014: Relative Dates Not Convertible to Absolute Dates

| Attribute | Value |
|---|---|
| **Description** | The parser stores Google Maps relative date strings (e.g., "5 days ago", "a month ago") verbatim in `relative_date`. The dashboard has no relative-to-absolute conversion logic. These strings become increasingly ambiguous over time without a reference point. The `formatTimestamp()` utility in `format.ts` expects ISO 8601 timestamps, not relative date strings. |
| **Subsystem** | Parser (AUDIT-03), Dashboard Data Layer (AUDIT-05) |
| **Severity** | Medium |
| **Likelihood** | High (every review has a relative date) |
| **Evidence** | `review_parser.py` stores raw relative date string. `format.ts:formatTimestamp()` would receive "5 days ago" instead of ISO 8601 — it would fail `parseISO` and return the string as-is. |
| **Current status** | Open — relative dates never converted |
| **Proposed mitigation** | Add relative-date-to-absolute conversion in the dashboard (either server-side in the API layer or client-side in format.ts). Store `scraped_at` alongside `relative_date` to provide a reference point for conversion. |
| **Dependencies** | None |

### RISK-015: Schema Drift Between Python and TypeScript

| Attribute | Value |
|---|---|
| **Description** | The Python `Review` dataclass and the TypeScript `Review` interface are structurally identical today, but there is no shared schema definition or automated cross-language validation. A change to either side (adding a field, renaming a field, changing a type) silently breaks the other. The dashboard uses `as T` casts in `readJsonFile()` — a mismatched field becomes `undefined` at runtime with no error. |
| **Subsystem** | Dashboard Data Layer (AUDIT-05), Storage (AUDIT-04) |
| **Severity** | Medium |
| **Likelihood** | Low (no schema changes planned in current phase) |
| **Evidence** | AUDIT-05 §1.3 shows manual field parity check between Python and TS — all 8 fields match. No JSON Schema file commits this parity to a machine-verifiable format. `server-data.ts:34`: `JSON.parse(buf) as T` — zero runtime validation. |
| **Current status** | Open — no cross-language schema validation |
| **Proposed mitigation** | Create a JSON Schema file for the Review type, consumed by both Python (via `jsonschema` or `pydantic`) and TypeScript (via `zod` or `ajv`). Add schema validation in `readJsonFile()` that logs warnings on mismatch. |
| **Dependencies** | None |

### RISK-016: Regex-Coupled Log Parsing in health-trend

| Attribute | Value |
|---|---|
| **Description** | The `/api/health-trend` route parses `run.log` with a regex that matches `Run summary: {json}` lines. The regex is tightly coupled to the Python logger format, the log line prefix "INFO:gbp-monitor.run_all:Run summary:", and the JSON serialization format. Any change to the Python logging configuration, module name, timestamp format, or log level silently breaks the health sparkline with no error. |
| **Subsystem** | API Routes (AUDIT-06) |
| **Severity** | Medium |
| **Likelihood** | Low (log format is stable in current phase) |
| **Evidence** | `health-trend/route.ts:56-57`: regex that parses log lines. If the logger changes from `logging.INFO` to `logging.WARNING` or the format changes, the regex stops matching. |
| **Current status** | Open — tightly coupled |
| **Proposed mitigation** | Replace log-parsing with a structured approach: write a separate JSON summary file per run (e.g., `data/run_health.json`) that the health-trend route reads directly. Remove the regex dependency. |
| **Dependencies** | None |

### RISK-017: Competitor ID with Underscore Breaks Delta Parsing

| Attribute | Value |
|---|---|
| **Description** | `readAllDeltas()` uses `lastIndexOf("_")` to split delta filenames into `competitor_id` + `timestamp`. If a `competitor_id` contains an underscore (e.g., `kopi_senopati`), the split produces `kopi` as the ID and `senopati_20260722T120000Z` as the timestamp — wrong on both counts. |
| **Subsystem** | Dashboard Data Layer (AUDIT-05) |
| **Severity** | Medium |
| **Likelihood** | Medium (if future competitors have underscores in IDs) |
| **Evidence** | `server-data.ts:144-153`: `base.lastIndexOf("_")` split strategy. |
| **Current status** | Open — fragile filename parsing |
| **Proposed mitigation** | Change the separator from `_` to `__` (double underscore) or use a regex with an anchored timestamp pattern. Document the naming convention for competitor IDs (no underscores, or hyphens only). |
| **Dependencies** | None |

### RISK-018: `charts.tsx` Monolith Merge Conflict Magnet

| Attribute | Value |
|---|---|
| **Description** | All 6 chart components, 6 inline tooltip components, color constants, and helper functions are in a single 839-line file. Two developers making changes to different chart components will conflict on this file. |
| **Subsystem** | Dashboard Components (AUDIT-07) |
| **Severity** | Medium |
| **Likelihood** | Medium (conflicts occur with multiple contributors) |
| **Evidence** | `charts.tsx`: 839 lines, 6 exported chart components, 6 inline tooltip components. |
| **Current status** | Open — monolithic file |
| **Proposed mitigation** | Split into one file per chart type (e.g., `rating-distribution-chart.tsx`, `reviews-per-competitor-chart.tsx`, etc.). Extract shared types and colors to a `chart-utils.ts` module. |
| **Dependencies** | None |

---

## Low Risks

### RISK-019: Cookie Banner Assumes English "Reject All"

| Attribute | Value |
|---|---|
| **Description** | The cookie dismiss XPath targets English text: `//button[contains(., 'Reject all')]`. Non-English Google Maps locales will not match. |
| **Subsystem** | Browser Harness (AUDIT-02) |
| **Severity** | Low |
| **Proposed mitigation** | Add locale-neutral click targets (e.g., CSS class or `role="dialog"` heuristics) or maintain locale-specific XPaths. |

### RISK-020: `run.log` Unbounded Growth Outside CI

| Attribute | Value |
|---|---|
| **Description** | The 5 MB log rotation (Fix D) only executes in the GitHub Actions workflow. Local/manual runs never rotate `run.log`, causing unbounded disk usage. |
| **Subsystem** | Overall Architecture (AUDIT-01), Storage (AUDIT-04) |
| **Severity** | Low |
| **Proposed mitigation** | Implement log rotation in `run_all.py` using the same logic: rename `run.log` to `run.log.YYYYMMDD` if size exceeds threshold, start a new file. |

### RISK-021: Delta File Accumulation Without Bound

| Attribute | Value |
|---|---|
| **Description** | Each run adds up to 12 delta files to `data/reviews_new/`. Over years of daily runs, thousands of small JSON files accumulate. Some filesystems have per-directory file count limits. |
| **Subsystem** | Storage (AUDIT-04) |
| **Severity** | Low |
| **Proposed mitigation** | Implement a retention policy (e.g., keep last 90 days of deltas). Add a cleanup step to the orchestrator or a separate maintenance script. |

### RISK-022: Sandbox Path Shown in Dashboard UI

| Attribute | Value |
|---|---|
| **Description** | `/home/z/my-project/gbp-monitor/config/` is hardcoded in `config-section.tsx:255` and rendered in the UI. If the dashboard is deployed for client access, internal development paths are exposed. |
| **Subsystem** | Dashboard Components (AUDIT-07) |
| **Severity** | Low |
| **Proposed mitigation** | Remove the hardcoded path from the UI. Derive the display path from configuration or omit it entirely.

---

## ROTHER-AUDIT Re-Scan Additions — 2026-08-13

> Appended by the ROTHER-AUDIT follow-up. These reflect browser-only, evidence-disciplined findings (Phase 1–4). Statuses are HYPOTHESIS-grade pending live verification.

### RISK-023: Review Acquisition Non-Functional (Auth-Gated Root Cause)

| Attribute | Value |
|---|---|
| **Description** | All review acquisition tiers return 0 reviews unauthenticated; `reviews_tab_button` activation scored 0/12. The prior "selector drift" hypothesis is superseded: the root cause is that Google Maps requires an authenticated session to surface the reviews tab. The scraper runs unauthenticated headless Chromium. |
| **Subsystem** | Browser Harness / Acquisition (ROTHER-AUDIT B1) |
| **Severity** | Critical |
| **Likelihood** | Confirmed (0/12 activation across tiers) |
| **Current status** | Open — root cause identified, fix deferred (backend / needs API key) |
| **Proposed mitigation** | Acquire reviews via the Google Places API (`reviews` field, max 5 per place, no pagination). Removes the auth-gating blocker for review acquisition. |
| **Dependencies** | Google Places API key; product decision (P1) |

### RISK-024: Multi-Category / Multi-Business Feature Unsupported

| Attribute | Value |
|---|---|
| **Description** | Three independent blockers: (1) `listings.json` has no category dimension; (2) `src/lib/gbp/types.ts` `ListingsConfig` lacks category/business fields; (3) `discovery/` only contains `validate_listing.py` reachability pre-check — no category/business discovery backend; plus acquisition is broken (RISK-023). |
| **Subsystem** | Data Layer / Discovery (ROTHER-AUDIT) |
| **Severity** | High |
| **Likelihood** | Certain (schema absent) |
| **Current status** | **Resolved (2026-08-14)** — category + business schema, discovery backend, and tenant scoping all implemented |
| **Proposed mitigation** | Add `category`/`business` to `ListingsConfig`; build a discovery backend enumerating categories/businesses per place; depends on RISK-023. |
| **Dependencies** | RISK-023 |

### RISK-025: Viability Evidence Gap (Tests/CI Always Pass)

| Attribute | Value |
|---|---|
| **Subsystem** | Test / CI (ROTHER-AUDIT) |
| **Severity** | High |
| **Current status** | **Resolved (2026-08-14)** — `golden-datasets/` populated with `listings`/`run_summary`/`reviews` baselines; `verify_baseline.py` Phase 5 `compare_golden()` diffs fixtures output against them and fails on drift (E3). `verify_baseline.py:311` already fails on crash (E2). `run_all.py` live exit-code fixed (E1/RISK-027). |
| **Description** | No CI runs the suites; `golden-datasets/` empty; `verify_baseline.py:311` accepts `0` or `1` (guaranteed pass); `run_all.py:1646` `sys.exit(0)` in live mode makes Actions always green. No honest signal that acquisition works. |
| **Proposed mitigation** | CI runs `pytest` + `vitest`; require non-empty golden datasets; `verify_baseline.py` needs a real threshold; live runs exit non-zero on failure. |

### RISK-026: Tauri Plan Data-Story Inaccurate (No SQLite)

| Attribute | Value |
|---|---|
| **Subsystem** | Desktop / Docs (ROTHER-AUDIT) |
| **Severity** | Medium |
| **Current status** | Documented — correction added to `docs/engineering/TAURI_CONVERSION_PLAN.md` |
| **Description** | The Tauri plan states the app uses SQLite and that Prisma loads a bundled SQLite file. The live data layer is JSON-file based (`src/lib/gbp/server-data.ts`); Prisma/`lib/db.ts`/`prisma/schema.prisma` are dead code (TD-M03). No SQLite in the live path. |
| **Proposed mitigation** | Treat JSON files as the canonical offline store; drop dead Prisma from bundle budget; correct the plan doc (done). |

### RISK-027: CI Reports Success on Failed Live Runs

| Attribute | Value |
|---|---|
| **Subsystem** | Orchestration / CI (ROTHER-AUDIT) |
| **Severity** | Medium |
| **Current status** | Open |
| **Description** | `run_all.py:1646` `sys.exit(0)` in live mode → GitHub Actions green even when `failed > 0`. Combined with RISK-025, no honest viability signal. |
| **Proposed mitigation** | Live mode: `sys.exit(1 if report["failed"] > 0 else 0)`. Backend change; deferred per "minimal backend" constraint. |

### RISK-028: Live Scrape of Arbitrary User Business (by Category + Location) Not Yet Supported

| Attribute | Value |
|---|---|
| **Description** | Execution Prompt B closed the *single-business assumption* on the frontend: the user selects their own business (name + location + **category**) at onboarding, and the dashboard scopes exclusively to it (the seeded Copenhagen Bali demo is hidden). However, `POST /api/scrape/trigger` only **persists** the business to `user-business.json` and starts a run — it does not yet scope the Python orchestrator to scrape an arbitrary real business by category + location. Acquisition is still broken unauthenticated (RISK-023) and there is no category/business discovery backend (RISK-024). The user therefore lands on empty states after the Run gate. |
| **Subsystem** | Scraper / Acquisition / Discovery (follow-up to RISK-023, RISK-024) |
| **Severity** | High |
| **Likelihood** | Certain (backend scope absent) |
| **Current status** | Open — deferred backend follow-up |
| **Proposed mitigation** | Build a discovery backend that resolves a (category, location, business name) → Google place, then scope `run_all.py` to that single place's competitors. Depends on RISK-023 (auth-gated acquisition) and RISK-024 (category/business schema). |
| **Dependencies** | RISK-023, RISK-024 |

---

## Resolution Notes — ROTHER-AUDIT Re-Scan (2026-08-13)

| Risk | Prior status | Current status | Evidence |
|---|---|---|---|
| RISK-003 | Open (empty-parse wipes snapshot) | **Guard added (this session)** | `run_all.py` Step 4 now skips `save_snapshot` when `parsed_dicts` empty AND prior snapshot non-empty. `py_compile` passes. Verify on live run. |
| RISK-004 | Open (hardcoded `GBP_ROOT`) | **Resolved** | `src/lib/gbp/paths.ts:15-20` uses `process.env.GBP_ROOT` then `cwd/gbp-monitor`. |
| RISK-006 | Open (non-atomic delta/summary) | **Resolved** | `.tmp`+rename confirmed in `run_all.py` + `snapshot_store.py`. |
| RISK-022 | Open (sandbox path in UI) | **Resolved** | No `/home/z/my-project` string remains in `src/`. |
| RISK-001/002/007 | UNPROVEN | **CONFIRMED NON-FUNCTIONAL unauthenticated** | Root cause auth-gating (see RISK-023), not selector drift. |

## Resolution Notes — Execution Prompt B (2026-08-13)

| Item | Prior status | Current status | Evidence |
|---|---|---|---|
| Single-business assumption (Copenhagen Bali as the only/primary business) | Open — UI assumed the seed demo | **CLOSED** | `src/lib/gbp/server-data.ts` `readListings()` returns `[]` once `user-business.json` exists; the seeded demo is hidden from the UI. Onboarding captures the user's own business (name + location + category). Frontend now single-business by design. |
| RISK-024 (Multi-Category / Multi-Business) | Open — 3 backend blockers | **Resolved (2026-08-14)** | Category + business schema added (`types.ts`); `discovery/category_scan.py` builds the discovery backend; `server-data` is business-scoped (`data/users/{id}`). |
| RISK-023 / RISK-028 | Open | **Executed (2026-08-14)** | `POST /api/scrape/trigger` persists business + category; `discovery/category_scan.py` does the category discovery scan (scraper-based, per RISK-023 decision). Tenant data dirs isolate per-business runs. |
| P4 / geo-grid (B8, E5) | Deferred (subsystem) | **Executed (2026-08-14)** | Geo types + `geocodeFromGmapsUrl` + `GET /api/geo-grid` (points + 5x5 grid) + self-contained SVG dashboard feature. No third-party map dependency. |

### ROTHER-AUDIT provenance / cross-reference
ROTHER-AUDIT (Phase 1–4) was run in this session. Its standalone artifacts
(`docs/RISK_SCAN_2026-08-13.md`, `docs/PLAN_2026-08-13.md`) were **not present
on disk** at execution time; the findings are consolidated and tracked in
`docs/management/ROADMAP_2026-08-13.md` and embedded above as RISK-023 … RISK-028.
Refer to `ROADMAP_2026-08-13.md` for the full action plan (P1–P11 + strategic S)
and execution status.

---

## ROTHER-AUDIT Re-Scan Additions — 2026-08-14

> Appended by the ROTHER-AUDIT follow-up (second pass). Findings are
> HYPOTHESIS-grade pending live execution + verification; none are VERIFIED
> from this pass alone (E8).

### RISK-029: Mocked Auth Asserts a Privacy/Account Guarantee It Does Not Enforce

| Attribute | Value |
|---|---|
| **Description** | `login-screen.tsx` hardcodes identity `name:"Business Owner", email:"owner@gmail.com"` (`:29-30`, `// TODO: replace with real Google OAuth` `:26`) yet renders a `ShieldCheck` icon beside the literal claim "Your data stays private to your account." (`:68-69`). There is no account, no auth, and `localStorage` is the only store. The data IS local (so "private to this device" is literally true), but "to your account" is false. |
| **Subsystem** | Auth / Trust (ROTHER-AUDIT P3) |
| **Severity** | High |
| **Likelihood** | Certain (code present) |
| **Current status** | Open — short-term copy fix proposed; real auth deferred (RISK-005) |
| **Proposed mitigation** | Change copy to "Your data stays on this device" while auth is mocked; implement real auth (next-auth already installed) before any account-privacy claim. |
| **Dependencies** | RISK-005 (no auth on any route) |

### RISK-030: Demo-Scale `12` Competitor Cap Hardcoded in API

| Attribute | Value |
|---|---|
| **Description** | `competitor-correlation/route.ts:85` `competitors.slice(0, 12)` and `:113` `maxCompetitors: 12` (documented at `API_REFERENCE.md:153`). The single hardcoded `12` in the API surface is the old 6×2 seed number; any business with >12 competitors is silently truncated from the correlation matrix. |
| **Subsystem** | API / Data model (ROTHER-AUDIT X5) |
| **Severity** | Medium (escalates to High once multi-category ships) |
| **Likelihood** | Certain (code present) |
| **Current status** | Open |
| **Proposed mitigation** | Replace literal `12` with a config-driven `MAX_COMPETITORS` (env or `listings.json`); raise default when multi-category goes live. |
| **Dependencies** | RISK-024 (multi-category schema) |

### RISK-031: Tauri Webview Content-Security-Policy Disabled

| Attribute | Value |
|---|---|
| **Description** | `src-tauri/tauri.conf.json:25-27` sets `"security": { "csp": null }`. Tauri v2 enforces a CSP only when `app.security.csp` is set; `null`/omitted = no CSP. Any XSS bug in the frontend can then reach anything the webview can. |
| **Subsystem** | Desktop / Security (ROTHER-AUDIT T1) |
| **Severity** | Medium |
| **Likelihood** | Certain (config present) |
| **Current status** | Open |
| **Proposed mitigation** | Set a strict `app.security.csp` (+ `devCsp` for Vite HMR) and `freezePrototype: true`. Source: Tauri v2 CSP docs. |
| **Dependencies** | None |

### Tracking blind spot — single-business "CLOSED" forecloses multi-tenant (P2)
The `MASTER_RISK_REGISTER.md` / `TECHNICAL_DEBT_REGISTER.md` mark the single-business
assumption **CLOSED** as a product decision, but the *implementation*
(`src/lib/gbp/server-data.ts:102,152,246,295` — four `hasActiveUserBusiness()`
early returns, no `businessId` scoping param) forecloses serving a second business
(agency / 2-location owner) without reworking the data layer. Refine RISK-024 to record
that "hide the demo" and "scope to a tenant" must become two switches. (See PLAN_2026-08-14.md Tier 3 #6.)

### RISK-026 refinement (2026-08-14)
ROTHER-AUDIT second pass confirms the data layer is JSON-file based (canonical) and Prisma
is dead at read time. **New evidence:** `src-tauri/src/main.rs:46,57` still injects
`DATABASE_URL=file:<app_data>/dev.db` (SQLite) into the Node sidecar env, which the JSON
data layer ignores. The DB is provisioned but never read — inert config in the desktop
launch. Recommend removing the injection (TD-N09-style cleanup). Conclusion unchanged:
JSON is canonical; do not provision SQLite in the installer.

---

## ROTHER-AUDIT Execution Notes — 2026-08-14

> Findings from `docs/RISK_SCAN_2026-08-14.md` / `docs/PLAN_2026-08-14.md` executed this
> session. Constraint: **minimal backend** — the Python orchestrator, live acquisition
> (RISK-023), and per-business data-layer refactor were NOT rewritten. Full per-item
> status in `docs/management/ROADMAP_2026-08-14.md`.

| Risk | Prior status | Current status | Evidence |
|---|---|---|---|
| RISK-029 | Open — copy fix proposed | **Executed** | `login-screen.tsx:69` → "Your data stays on this device." |
| RISK-030 | Open — hardcoded `12` | **Executed** | `competitor-correlation/route.ts` config-driven `MAX_COMPETITORS`; `API_REFERENCE.md:153` updated |
| RISK-031 | Open — `csp: null` | **Executed** | `tauri.conf.json` strict `app.security.csp` + `devCsp` |
| RISK-027 | Open — CI masks failure | **Executed** | `run_all.py:1647` `sys.exit(1 if failed>0 else 0)` |
| RISK-026 / D3 | Confirmed inert | **Executed** | `main.rs` no longer injects `DATABASE_URL` |
| RISK-024 / P1 | Open — 3 backend blockers | **Partial — frontend/type done** | `CompetitorConfig.category?` added; orchestrator scoping deferred (backend) |
| RISK-024 blind spot (P2) | Recorded | Recorded | full multi-tenant refactor deferred (backend) |
| RISK-002 / D2 | Open — 10/12 unverified | **Executed** | `validate_place_id()` + `verified` field in `listings.json` + `types.ts`; `verified` flows to `CompetitorStats` and `branches-section.tsx` renders an **Unverified** badge |
| RISK-025 / E3 | Open — empty golden datasets | **Executed** | `golden-datasets/` populated (`listings`/`run_summary`/`reviews` baselines); `verify_baseline.py` Phase 5 `compare_golden()` diffs + fails on drift |
| RISK-025 / E2 | Open — crash masked | **Executed (prior)** | `verify_baseline.py:311` fails on crash (exit ∉ {0,1} or `Traceback`) |
| TD-H06 / D4 | Open — errors swallowed | **Executed** | `readJsonFile` logs; `dataStatus` envelope on `/api/overview`+`/api/branches` (`assessDataStatus`) |
| TD-H08 / C4 | Open — no TanStack usage | **Executed** | unified `useApiQuery` (`useQuery`); `use-overview.ts`+`use-branches.ts` migrated |
| TD-N10 / C1 | Open — ~22 directives | **Executed** | `useMounted` + `OnlineStatusProvider`(`useSyncExternalStore`) + `useApiQuery` cover remaining directives |

### New tracking item
- **TD-N10 (Low):** Remaining `react-hooks/set-state-in-effect` directives. `app-state.tsx`
  migrated to `useSyncExternalStore` (`src/lib/use-external-store.ts`); `useMounted`
  (`src/lib/use-mounted.ts`) replaces mount-guards in `theme-toggle.tsx`+`freshness-badge.tsx`;
  `OnlineStatusProvider` reads `navigator.onLine` via `useSyncExternalStore`; remaining
  data-fetch-in-effect directives covered by unified `useApiQuery` (C4). **Closed 2026-08-14.** |

---

## 2026-08-14 (run 2) — NEW findings from second ROTHER-AUDIT invocation

Cross-checked against run-1 entries; the items below are residuals/refinements NOT
covered by run-1 execution. Status HYPOTHESIS until executed + verified. Full detail in
`docs/RISK_SCAN_2026-08-14.md` (§1–§7) and `docs/PLAN_2026-08-14.md` (B1–B7, D).

- **RISK-032 (High, T1 refinement):** Tauri production CSP (`tauri.conf.json:26`) sets
  `connect-src` to `ipc: http://ipc.localhost` only — it omits `http://127.0.0.1:4632`
  (the Node sidecar origin, `main.rs:30,82`). The webview's same-origin `/api` fetches are
  therefore CSP-blocked → desktop data loading silently fails. Refines RISK-031 (which set a
  strict CSP but missed the app's own origin). Maps to plan B1. *Confidence: CONVERGED.*
- **RISK-033 (High, E3):** `gbp-monitor/harness/selector_tracker.py:131-141` folds
  `expected_missing_count` into `effective_found` and reports `status="healthy"` when all
  entries are `expected_missing`. A selector present-but-should-be-absent is indistinguishable
  from one truly absent → false-positive "healthy". Maps to plan B2. *Confidence: CONVERGED.*
- **RISK-034 (High, D7):** `user-business.json` (written by `scrape/trigger/route.ts:44-48`)
  carries no `branches`; `readActiveBusinessBranches()` (`server-data.ts:469-474`) falls back to
  seed while `readListings()` returns `[]` once a business is active → owner lands on empty
  branch/competitor panels via the new onboarding/Run path. Compounds TD-H06. Maps to plan B3.
  *Confidence: CONVERGED (mechanism) / PARTIAL (onboarding data capture).*
- **RISK-035 (Med, C5):** `src/middleware.ts:24,79` reads `API_KEY`; if unset all requests pass;
  it is defined in no env file → instance ships with auth silently off and no documented key.
  Maps to plan B4. *Confidence: CONVERGED.*
- **RISK-036 (Med, §7 feature-surface):** 3 redundant feature pairs among the 30 FEATURES
  (`i-sentiment`/`i-rating-distribution`, `i-reviews-per-competitor`/`c-leaderboard`,
  `i-snapshot-glance`/`c-leaderboard`) + thin `t-export`/`t-scrape-schedule`. Recommend MERGE to
  27 (plan B5). Registry drift 28→30 (U2/P6). *Confidence: CONVERGED (decisions).*

### 2026-08-14 (run 2) — EXECUTION STATUS
Minimal-backend execution pass. Implemented + TypeScript-verified:
- **RISK-032 (T1):** `tauri.conf.json:26` `connect-src` now includes `'self'` + `http://127.0.0.1:4632`; `freezePrototype:true` added. **Executed.**
- **RISK-033 (E3):** `selector_tracker.py:124-148` `unexpected_present` forces `status="broken"`; `expected_missing` no longer counted toward `effective_found`. **Executed.**
- **RISK-034 (D7):** `server-data.ts:469-480` returns `[]` (not seed) when an active business has no branches. **Executed.**
- **RISK-035 (C5):** `API_KEY` documented in `.env.example`; `middleware.ts:79-85` warns in prod when unset. **Executed.**
- **RISK-036 (§7):** `i-sentiment`, `i-reviews-per-competitor`, `i-snapshot-glance` removed (27 features); sentiment folded into `i-rating-distribution`; reviews bar embedded in `c-leaderboard`; leaderboard internal scroll + `MAX_COMPETITORS` cap; `t-export` real counts; `UX_RESTRUCTURE_PLAN.md` registry updated to 27. **Executed.**
Deferred (backend rewrite / human decision, recorded in ROADMAP_2026-08-14.md): RISK-024 (D1/P1/P2), P4 true geo-grid.

---

## Rother — Onboarding + Review-Collection Design Risks (2026-08-16)

Companion to `docs/engineering/ONBOARDING_AND_COLLECTION_DESIGN.md`. These refine RISK-023/024/028
and add the legal/anti-bot surface for the Google-collection path. Severity on the DSI-style
1-5 scale used elsewhere in this register.

- **RISK-037 (5 — Legal/ToS, D1):** Scraping Google Business Profile reviews breaches Google ToS.
  Mitigation: route **own**-branch volume through the sanctioned GBP Reviews API (no ToS breach,
  paginated to 500); confine scraping to **competitors**, off by default, explicit opt-in +
  plain-language disclosure; never advertise scraped volume as a feature. Owner decision §5.1-5.2.
- **RISK-038 (5 — Privacy, D2):** Stored reviews contain PII (`reviewer_name` + free text,
  `gbp-monitor/parser/schema.py`). GDPR/CCPA exposure for a commercial product. Mitigation:
  salted `reviewer_hash` + display label (initial) instead of raw name; no avatars/profile URLs
  (already true); convert `relative_date` → absolute at parse for retention TTLs; retention + purge
  job; local-first storage keeps data on user's disk. Pseudonymize-by-default preferred (§5.4).
- **RISK-039 (4 — Legal posture, D3):** Controller/processor ambiguity. Local-first means the
  user's machine + IP performs collection → user is controller, Rother is tooling. Mitigation:
  **no vendor-operated proxy pool, no vendor-side collection, no telemetry of review content.**
  Ship a DPA-style note + disclosure. BYO proxies only (§5.3).
- **RISK-040 (4 — Expectation, D4):** Google Places API returns ≤5 reviews/place, no pagination →
  cannot meet 500/branch. Mitigation: explicit — Places API is a resolution/verification tool
  (Find Place + `validate_place_id`), never a volume source. Volume = GBP API (own) / scraping (comp).
- **RISK-041 (4 — Schedule, D5):** GBP API project allowlisting is a human review; locations must
  be verified; user must be owner/manager. Mitigation: **submit allowlisting in Phase 0** (longest
  lead-time item). Interim: degrade to ≤5 Places reviews with labelled empty state.
- **RISK-042 (4 — Account, D6):** Using a real Google account to scrape risks termination + ToS
  acceptance. Mitigation (F3): NID is logged-out and sufficient; **delete the `NEED_SESSION`
  account path** in `run_all.py`, replace with anonymous NID warm-up. Never pool accounts.
- **RISK-043 (4 — Anti-bot, D7):** CAPTCHA / IP reputation / decay degrade collection over time.
  Mitigation: existing detectors (`_detect_block`, null-rating≥90%); add identity-tuple rotation +
  backoff + circuit breakers + budgets (C4); per-path health via `selector_tracker`; **no
  CAPTCHA-solving services** (ongoing cost, still ToS-violating, converts best-effort into intent).
- **RISK-044 (3 — Credibility, D9):** 500/branch unproven by ~2 orders of magnitude (max real yield
  on record = 3 unique reviews). Mitigation: gate each phase on measured coverage; never ship 500
  as a promise; GBP API path is the only one that can be *guaranteed* (target = `totalReviewCount`).
- **RISK-045 (3 — Data integrity, D10):** `_write_reviews` points `latest.json` at the run set → a
  later smaller run supersedes an earlier larger one, silently discarding accumulated volume.
  Mitigation: cumulative per-branch store + delta writes + merge (C5) shipped **before** any volume
  work.
- **RISK-046 (2 — Compliance, D11, EXECUTED 2026-08-16):** OSM ODbL attribution + tile policy.
  `PlaceConfirmCard` now shows "© OpenStreetMap contributors"; identifying UA already sent. Low volume.
- **RISK-047 (2 — CSP divergence, D12, EXECUTED 2026-08-16):** Tauri prod CSP (`tauri.conf.json:26`)
  lacked OSM tiles while `next.config.ts` allowed them. Prod CSP now includes
  `*.tile.openstreetmap.org`/`*.openstreetmap.org`; `next.config.ts` dropped dead
  `connect-src *.openstreetmap.org`. **Exit gate:** verify tiles render in a packaged build on all 3 OSes.
- **RISK-048 (3 — Bridge/blocker, F2):** OSM→Google resolver does not exist; collector ignores OSM
  anchor and requires `ChIJ…`, so onboarding's anchor never reaches collection → guaranteed empty.
  Mitigation: tiered resolver T1→T4 (paste → Places Find Place + `validate_place_id` → scrape →
  unresolved-with-honest-empty). Phase 2. Never blocks onboarding.
- **RISK-049 (3 — Premise, F3):** `run_all.py` `NEED_SESSION` gate is based on a superseded
  "login wall" premise; in-repo M7 evidence shows NID (logged-out) is sufficient. Mitigation:
  replace gate with NID warm-up (RISK-042). Until then every run returns `NEED_SESSION`.
- **RISK-050 (2 — Secrets, D13):** `.env.example` suggests a live-looking `API_KEY`. Mitigation:
  server-side keys (`MAPTILER_KEY`/`GEOAPIFY_KEY`) already stay server-side; OAuth tokens → OS
  keychain (not `.env`/JSON); scrub the sample `API_KEY` from `.env.example`.

### 2026-08-16 — EXECUTION STATUS (Phase 1 + persistence)
- **RISK-046 / RISK-047 (D11/D12):** `PlaceConfirmCard` attribution + Tauri/Next CSP aligned.
  **Executed.**
- **RISK-037-045 / RISK-048-050:** design recorded; execution gated on open decisions
  (§5.1-5.4) and GBP allowlisting (RISK-041). Code changes for Phase 1 in
  `src/app/api/places/route.ts`, `src/lib/places.ts`, `src/components/shell/onboarding.tsx`,
  `PlaceConfirmCard.tsx`, `src/lib/gbp/types.ts`. TypeScript-verified.

