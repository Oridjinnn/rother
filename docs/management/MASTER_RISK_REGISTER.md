# Master Risk Register — Rother (GBP Monitor)

**Date:** 2026-07-22
**Source:** Architecture Audits AUDIT-01 through AUDIT-07
**Total Identified Risks:** 22

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
| **Proposed mitigation** | Remove the hardcoded path from the UI. Derive the display path from configuration or omit it entirely. |
