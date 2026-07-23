# Architecture Audit 05 — Dashboard Data Layer

**Date:** 2026-07-22
**Subsystem:** `src/lib/gbp/` (types.ts, server-data.ts, format.ts, paths.ts)
**Repository root:** `D:\Documents (D)\Softwares\Rother\Rother - 0.0.1`

---

## Executive Summary

The Dashboard Data Layer is the **TypeScript-side bridge** between the Next.js dashboard and the Python scraper's JSON files on disk. It consists of 4 modules (466 lines total):

| Module | Lines | Role |
|---|---|---|
| `types.ts` | 217 | All TypeScript type definitions — mirrors Python Review schema, API request/response shapes |
| `server-data.ts` | 161 | Server-side JSON file readers with defensive fallbacks (runs via `"server-only"` guard) |
| `format.ts` | 66 | Pure formatting helpers — reviewer name cleaning, date formatting, rating math |
| `paths.ts` | 22 | Absolute filesystem path constants to Python scraper data/config directories |

**Maturity: Pre-Alpha / Prototype.** All 4 modules are functional but exhibit significant design issues: hardcoded sandbox-specific paths, no test coverage, no schema validation at the boundary, no caching layer, no offline fallback beyond empty defaults.

**Risk score: High** — the subsystem is directly exposed to filesystem I/O failures and path misconfiguration at runtime, with zero automated verification.

---

## 1. Types Module (`types.ts`)

### 1.1 Overview
217 lines exporting 19 named type definitions. Serves as the **single TypeScript source of truth** for all JSON shapes crossing the Python↔TypeScript boundary plus all API request/response contracts.

### 1.2 Type Catalog

| Interface/Type | Lines | Purpose |
|---|---|---|
| `Review` | 10–22 | Mirror of Python `Review` dataclass (7 fields: `review_id`, `competitor_id`, `branch_id`, `reviewer_name`, `rating`, `text`, `relative_date`, `scraped_at`) |
| `RunSummary` | 29–39 | Mirror of Python `run_summary.json` (started_at, finished_at, mode, success/failed/skipped/new/total counts, errors array) |
| `RunSummaryError` | 24–27 | Error entry within a run summary |
| `CompetitorConfig` | 41–45 | Mirror of `listings.json` per-competitor config |
| `BranchConfig` | 47–51 | Mirror of `listings.json` per-branch config |
| `ListingsConfig` | 53–56 | Mirror of full `listings.json` |
| `VerifiedBy` | 58 | Union type: `"seed" \| "browser_agent" \| "manual_human"` |
| `SelectorsConfig` | 60–65 | Mirror of `selectors.json` |
| `CompetitorStats` | 68–78 | Computed per-competitor aggregate (total_reviews, avg_rating, last_scraped_at, new_reviews_count) |
| `BranchWithStats` | 81–87 | Branch tree enriched with `CompetitorStats[]` |
| `RatingDistribution` | 89–92 | `{ rating: number; count: number }` |
| `OverviewResponse` | 94–120 | Return type for `GET /api/overview` — 12 fields including run summary, selector verification, stats, alerts |
| `BranchesResponse` | 122–126 | Return type for `GET /api/branches` |
| `ReviewsQuery` | 128–135 | Query parameter shape for `GET /api/reviews` — supports branch/competitor/rating/page/q filters |
| `ReviewsResponse` | 137–142 | Paginated reviews response |
| `LogsResponse` | 144–148 | Log tail response |
| `ScrapeTriggerResponse` | 150–153 | Success response for scrape trigger |
| `ScrapeTriggerErrorResponse` | 155–159 | Error response for scrape trigger |
| `HistoryRunBreakdownItem` | 163–169 | Per-competitor delta breakdown in history |
| `HistoryRun` | 171–177 | One run's worth of delta data |
| `HistoryResponse` | 179–182 | Multiple runs of history data |
| `ReviewsOverTimePoint` | 186–190 | Time-series data point |
| `ReviewsOverTimeResponse` | 192–196 | Time-series response wrapper |
| `ReviewLengthBucket` | 200–205 | Text-length distribution bucket |
| `ReviewLengthsResponse` | 207–217 | Text-length distribution response with stats |

### 1.3 Schema Mapping

**Python → TypeScript field parity:**

| Python `Review` field | TS `Review` field | Type change? |
|---|---|---|
| `review_id` | `review_id: string` | None |
| `competitor_id` | `competitor_id: string` | None |
| `branch_id` | `branch_id: string` | None |
| `reviewer_name` | `reviewer_name: string \| null` | None |
| `rating` | `rating: number \| null` | None |
| `text` | `text: string \| null` | None |
| `relative_date` | `relative_date: string \| null` | None |
| `scraped_at` | `scraped_at: string` | None |

**No drift detected** between the Python `Review` dataclass (schema.py:10–17) and the TS `Review` interface (types.ts:9–22). Fields, types, and optionality are consistent.

**Config/Summary parity:**
- `RunSummary` mirrors `run_summary.json` shape produced by `run_all.py` → `snapshot_store.py` `write_run_summary()`
- `ListingsConfig` / `BranchConfig` / `CompetitorConfig` mirror `listings.json` shape
- `SelectorsConfig` mirrors `selectors.json` shape

### 1.4 Design Observations

1. **`Review` field `reviewer_name` has a client-side processing comment** (line 14: `"May contain the suffix ', original' from the Google Maps aria-label — strip it client-side before display."`). This means the Python parser intentionally preserves the raw Google Maps label and delegates sanitization to the frontend via `format.cleanReviewerName()`. This is a valid architectural choice (raw data preserved, formatting deferred) but it is undocumented in the Python parser.

2. **No Zod schemas or runtime validation.** All types are compile-time-only. JSON files from disk are cast with `as T` assertions in `server-data.ts` — a mismatch between on-disk shape and TypeScript type produces silent `undefined` access at runtime.

3. **`SelectorsConfig` uses an index signature `[key: string]: string`** (line 64) which precludes type-safe access to known selector keys. Any string-valued key is accepted.

4. **`ScrapeTriggerResponse` and `ScrapeTriggerErrorResponse`** are disjoint types (one has `ok: true`, the other `ok: false`) but there is no TypeScript discriminated union — callers must manually check `ok`.

5. **`ReviewsQuery.page` is optional `number`** but the API route may receive string query parameters — there is no parsing/coercion layer demonstrated in the types.

6. **Four API response shapes** (`OverviewResponse`, `BranchesResponse`, `ReviewsResponse`, `LogsResponse`) include fields that duplicate data available elsewhere, suggesting either convenience denormalization or API drift.

---

## 2. Paths Module (`paths.ts`)

### 2.1 Overview
22 lines defining 10 constant path exports. Thin wrapper around `node:path.join()` with a single root.

### 2.2 Exported Constants

| Constant | Derived path | Purpose |
|---|---|---|
| `GBP_ROOT` | `/home/z/my-project/gbp-monitor` | Scraper project root |
| `GBP_DATA_DIR` | `<root>/data` | All scraper output |
| `GBP_CONFIG_DIR` | `<root>/config` | All scraper config |
| `GBP_SNAPSHOTS_DIR` | `<data>/snapshots` | Snapshot JSON files |
| `GBP_REVIEWS_NEW_DIR` | `<data>/reviews_new` | Delta JSON files |
| `GBP_RAW_HTML_DIR` | `<data>/raw_html` | Raw HTML dumps (not yet written) |
| `GBP_RUN_LOG_PATH` | `<data>/run.log` | Run log file |
| `GBP_RUN_SUMMARY_PATH` | `<data>/run_summary.json` | Run summary JSON |
| `GBP_LISTINGS_PATH` | `<config>/listings.json` | Competitor listing config |
| `GBP_SELECTORS_PATH` | `<config>/selectors.json` | CSS selector config |

### 2.3 Critical Issues

1. **Hardcoded sandbox path** — `GBP_ROOT = path.resolve("/home/z/my-project/gbp-monitor")` is specific to the original development environment. This will not exist on any other machine. This is the most pressing configuration problem in the entire repository.

2. **`path.resolve()` with an absolute path** — `path.resolve("/home/z/...")` simply returns the absolute path unchanged. The `resolve` call is a no-op.

3. **No environment variable override** — there is no `process.env.GBP_ROOT` or similar mechanism. Changing the scraper location requires editing source code.

4. **No validation** — paths are computed eagerly at module import time. A non-existent directory produces no warning until an I/O operation fails 500ms later.

5. **`GBP_RAW_HTML_DIR` is defined but has no consumer** — `server-data.ts` never imports or uses this path. The Python scraper's `capture.py` defines this directory but never writes to it either.

---

## 3. Server Data Module (`server-data.ts`)

### 3.1 Overview
161 lines exporting 8 async functions plus 1 inline interface. Uses `"server-only"` import guard to prevent accidental client-side usage.

### 3.2 Exported Functions

| Function | Signature | Lines | Reads from |
|---|---|---|---|
| `readJsonFile` | `<T>(filePath, fallback) => Promise<T>` | 28–38 | Generic: any path |
| `readListings` | `() => Promise<ListingsConfig>` | 40–42 | `GBP_LISTINGS_PATH` |
| `readSelectors` | `() => Promise<SelectorsConfig \| null>` | 44–51 | `GBP_SELECTORS_PATH` |
| `readRunSummary` | `() => Promise<RunSummary \| null>` | 53–55 | `GBP_RUN_SUMMARY_PATH` |
| `readAllSnapshots` | `() => Promise<Map<string, Review[]>>` | 58–74 | `GBP_SNAPSHOTS_DIR` |
| `readLatestDelta` | `(competitorId: string) => Promise<Review[]>` | 83–99 | `GBP_REVIEWS_NEW_DIR` |
| `tailLog` | `(lines?: number) => Promise<{lines, totalLines}>` | 102–116 | `GBP_RUN_LOG_PATH` |
| `readAllDeltas` | `() => Promise<DeltaFileEntry[]>` | 133–161 | `GBP_REVIEWS_NEW_DIR` |

### 3.3 Design Observations

1. **Defensive-by-default contract.** Every function swallows I/O errors and returns a safe empty value. A missing `listings.json` returns `{ branches: [] }`, a corrupt snapshot returns `[]`, a missing log file returns `{ lines: [], totalLines: 0 }`. The dashboard always renders, even if all data is missing.

2. **No schema validation.** `readJsonFile<T>` blindly casts the parsed JSON: `JSON.parse(buf) as T`. If the on-disk file has a different shape than the type parameter, no error is raised — callers get `undefined` field access at render time.

3. **`readSelectors` is inconsistent** — it returns `null` on error (custom catch block), while all other readers return empty defaults via `readJsonFile`'s fallback parameter. This is a minor inconsistency in the defensive strategy.

4. **`readAllDeltas` filename parsing** (lines 144–153): uses `base.lastIndexOf("_")` to split competitor_id from timestamp. This will silently produce wrong results if a `competitor_id` contains an underscore (it uses `lastIndexOf`, so if the ID has underscores, it splits at the last one, getting the wrong ID prefix). Example: competitor_id = `"kopi_senopati"` would be split as `"kopi"` + `"senopati_20260722T120000Z"`.

5. **`readAllDeltas` sort** (line 159): `localeCompare()` on ISO-formatted timestamps is correct for the transformed pattern (`2026-07-22T12:00:00Z`) but fragile — localeCompare behavior varies with locale settings for non-ASCII characters (not relevant here, but a latent fragility).

6. **`readLatestDelta` sort** (lines 93–95): uses `.sort().reverse()` on raw filenames like `competitor_id_YYYYMMDDTHHMMSSZ.json`. Lexical sort on these filenames happens to give chronological order (because the date prefix is ISO 8601 basic format), making `.reverse()` give newest-first — correct by coincidence, not by guarantee.

7. **`readAllSnapshots`** returns a `Map<string, Review[]>` keyed by `competitor_id`. The key is derived from the filename (`entry.replace(/\.json$/, "")`). This couples the data model to filesystem naming conventions.

8. **`tailLog`** reads the entire file into memory and then slices. For a multi-MB log file, this is wasteful. It should seek to the end and read backwards.

### 3.4 Inline Interface `DeltaFileEntry`

Lines 126–131 define `DeltaFileEntry` as an inline interface (not exported from `types.ts`). This inconsistency means API routes that return delta data must define their own types or import from `server-data.ts` — a minor organizational fragmentation.

---

## 4. Format Module (`format.ts`)

### 4.1 Overview
66 lines exporting 6 pure formatting functions with zero dependencies beyond `date-fns`.

### 4.2 Exported Functions

| Function | Signature | Purpose |
|---|---|---|
| `cleanReviewerName` | `(name: string \| null \| undefined) => string` | Strip `", original"` suffix, fallback to `"Anonymous"` |
| `formatTimestamp` | `(iso: string \| null \| undefined) => { relative, absolute }` | ISO → relative ("3 hours ago") + absolute formatted string |
| `truncate` | `(text: string \| null \| undefined, max?: number) => string` | Truncate with ellipsis |
| `averageRating` | `(ratings: (number \| null)[]) => number \| null` | Mean of non-null ratings, 2-decimal precision |
| `formatRating` | `(rating: number \| null \| undefined) => string` | 1-decimal formatting, fallback `"—"` |
| `ratingColor` | `(rating: number \| null \| undefined) => string` | Tailwind color class for rating badges |

### 4.3 Design Observations

1. **No external dependencies beyond `date-fns`** (well-known, light library). Imports: `formatDistanceToNow`, `format`, `parseISO` — all tree-shakeable.

2. **Clean separation:** all functions are pure (no side effects, no I/O, no state), making them trivially testable.

3. **`cleanReviewerName`** handles the `", original"` suffix documented in `types.ts`. The regex `/,\s*original$/i` is case-insensitive, which is defensive but may strip legitimate uses of the word "original" at the end of a name.

4. **`averageRating`** uses `(number | null)[]` as input but a narrower type `number[]` would be more type-safe. The `filter((r): r is number => ...)` type guard is correct but verbose.

5. **`formatTimestamp` error handling** (line 33): on `parseISO` failure, it falls through to `catch` and returns the raw ISO string for both `relative` and `absolute`. This is better than crashing but silently masks data quality issues.

6. **`ratingColor` uses `text-destructive`** for ratings below 2.5 — this is a Tailwind semantic color that maps to red/danger. Hardcoding semantic colors in a formatting utility couples presentation logic to a specific UI framework, reducing reusability.

7. **`formatRating` is referenced nowhere** in `src/components/` (confirmed by grep). It is defined but unused.

---

## 5. Dependency Graph

```
paths.ts ─────────────────────────────────────┐
  │                                            │
  ├── used by: server-data.ts                  │
  └── used by: 3 API routes                    │
       (scrape/trigger, health-trend)           │
                                               │
server-data.ts ────────────────────────────────┤
  │                                            │
  ├── depends on: paths.ts, types.ts           │
  ├── imported by: 11 API routes               │
  │    (overview, branches, reviews,            │
  │     history, logs, config/*,                │
  │     scrape/trigger, reviews-over-time,      │
  │     review-lengths, competitor-correlation, │
  │     history/export, reviews/export)         │
  └── exports: readJsonFile, readListings,     │
       readSelectors, readRunSummary,          │
       readAllSnapshots, readLatestDelta,       │
       tailLog, readAllDeltas                  │
                                               │
types.ts ──────────────────────────────────────┤
  │                                            │
  ├── consumed by: server-data.ts              │
  ├── consumed by: all 14 API routes           │
  └── consumed by: 20 dashboard components     │
                                               │
format.ts ─────────────────────────────────────┘
  │
  ├── consumed by: 8+ dashboard components
  │    (overview, branches, reviews,
  │     run-comparison, run-history-timeline,
  │     competitor-detail, branch-comparison,
  │     top-reviewers)
  └── formatRating: UNUSED (no consumers found)
```

**Consumer count (aggregate):**
| Export | Consumer modules |
|---|---|
| `types.ts` (all types) | 34+ modules (14 API routes + 20 components) |
| `server-data.ts` | 11 API route modules |
| `paths.ts` | 1 module (server-data.ts) + 3 direct API routes |
| `format.ts` | 8+ dashboard component modules |

---

## 6. Data Flow

```
Python scraper                    Dashboard (Next.js)
─────────────────                 ────────────────────
                                  1. Request arrives at API route
                                     (e.g. GET /api/branches)
                                  2. Route handler calls server-data.ts
                                     function (e.g. readAllSnapshots())
                                  3. Function reads file from disk
                                     using paths.ts constant
                                  4. JSON.parse() with `as T` cast
                                  5. Route handler transforms data
                                     (computes stats, filters, paginates)
                                  6. Response sent to client component
                                  7. Client component uses format.ts
                                     helpers for display formatting

No caching layer. No database.
Every request = filesystem I/O.
```

---

## 7. Boundaries & Interfaces

### 7.1 Python ↔ TypeScript Boundary
- **Interface:** JSON files on disk (snapshots, deltas, config, summary)
- **Validation:** None — `JSON.parse` → `as T` cast, no schema check
- **Error handling:** 100% defensive — missing/corrupt files → empty defaults
- **Observability:** No schema drift detection, no versioning

### 7.2 Server-side ↔ Client-side Boundary
- **Interface:** API response JSON (typed via `*Response` interfaces)
- **Authentication:** Not verified in this audit (see AUDIT-06)
- **Validation:** TypeScript compile-time only

### 7.3 Format Layer Interface
- **Interface:** Pure functions accepting `string | null | undefined`
- **Error handling:** Every function returns gracefully for null/undefined inputs
- **Framework coupling:** `ratingColor()` returns Tailwind CSS class names

---

## 8. Error Handling

### 8.1 `server-data.ts` Error Strategy
Every I/O operation is wrapped in try/catch. The error handling is uniform:

| Scenario | Behavior |
|---|---|
| File does not exist | Return fallback value |
| File is corrupt (invalid JSON) | Return fallback value |
| Directory does not exist | Return empty map/array |
| Permission denied | Return fallback value (catch covers all errors) |

**Loss of observability:** All errors are swallowed. A corrupt `selectors.json` returns `null`. A corrupt `listings.json` returns `{ branches: [] }`. The API route has no way to distinguish "genuinely empty config" from "broken config file". No errors are logged, no warning is emitted, no metric is incremented.

### 8.2 `format.ts` Error Strategy
All functions are pure and return safe values for null/undefined:

| Function | Null input | Invalid input |
|---|---|---|
| `cleanReviewerName` | `"Anonymous"` | Regex silent fallthrough |
| `formatTimestamp` | `{ relative: "—", absolute: "—" }` | Raw string returned (catch block) |
| `truncate` | `""` | N/A (pure string op) |
| `averageRating` | `null` | Filters NaN |
| `formatRating` | `"—"` | N/A (pure numeric) |
| `ratingColor` | `"text-muted-foreground"` | Falls to lowest tier |

---

## 9. Cross-Cutting Concerns

### 9.1 Configuration & Environment

| Aspect | Current state |
|---|---|
| Scraper root path | Hardcoded in `paths.ts:11` |
| Environment override | None |
| Validation at startup | None |
| Required env vars | None documented |

### 9.2 Performance

| Concern | Impact |
|---|---|
| Every request reads from disk | No in-memory caching; repeated API calls re-read same files |
| `tailLog()` reads entire file | O(n) where n = log file size, even for 200-line tail |
| `readAllDeltas()` opens every delta file | O(n) file I/O per request, grows with each run |
| `readAllSnapshots()` opens every snapshot | O(n) file I/O per request, grows with each competitor |

For the current scale (6 branches × 2 competitors = 12 competitors, < 30 reviews) this is negligible. At 100+ competitors or 10,000+ reviews, it becomes a problem.

### 9.3 Security

| Concern | Notes |
|---|---|
| `"server-only"` guard | Prevents accidental client import of `fs` module |
| Path traversal | Paths are hardcoded constants, no user input used in path construction |
| File content exposure | Files are on local filesystem only — no remote access path exists |

### 9.4 Observability

- **Zero logging** — I/O errors are silently swallowed
- **Zero metrics** — no request timing, no cache hit/miss, no file read count
- **Zero health checks** — no startup validation that paths exist or files are readable

---

## 10. Strengths

### S1. Pure function design in format.ts
All 6 formatting functions are pure, null-safe, and dependency-light. This is the most production-ready module in the entire dashboard data layer.

### S2. Consistent defensive strategy
Every server-data function returns a safe fallback on failure. The dashboard never crashes due to missing or corrupt data files.

### S3. Single source of truth for paths
All filesystem paths are centralized in `paths.ts` rather than scattered across route handlers.

### S4. "server-only" guard
Using `import "server-only"` prevents Next.js from bundling `node:fs` code into client bundles — a common pitfall.

### S5. Comprehensive type definitions
217 lines of types covering all API request/response contracts, config shapes, and computed aggregates. Types are consistent with Python-side schemas.

### S6. No dependency creep beyond stdlib + date-fns
`server-data.ts` and `paths.ts` use only Node.js built-in modules. `format.ts` adds only `date-fns` (tree-shakeable, well-maintained).

---

## 11. Weaknesses

### W1. [CRITICAL] Hardcoded sandbox-specific path
`paths.ts:11` (`GBP_ROOT = "/home/z/my-project/gbp-monitor"`) makes the entire dashboard non-functional outside the original development environment. No environment variable fallback exists. See also AUDIT-04-W1.

### W2. [CRITICAL] No runtime schema validation at Python↔TypeScript boundary
`readJsonFile<T>` casts JSON with `as T` — zero runtime validation. A schema change in the Python scraper produces silent `undefined` access in TypeScript.

### W3. [HIGH] Underscore in competitor_id breaks delta filename parsing
`readAllDeltas()` uses `lastIndexOf("_")` to split filename into competitor_id + timestamp. A competitor_id containing `_` (e.g., `kopi_senopati`) will be split at the wrong position, yielding incorrect competitor_id and unparseable timestamp.

### W4. [HIGH] All errors silently swallowed
No I/O error is ever logged, reported, or exposed. A corrupt `selectors.json` returns `null` — the operator has no way to know the file is corrupt versus absent.

### W5. [HIGH] No caching layer
Every API request hits the filesystem. For a dashboard served via Next.js static generation or ISR this is wasteful. No `Map` in-memory cache, no `react-query` persistent cache on the client.

### W6. [HIGH] `formatRating` is dead code
Exported from `format.ts` but referenced by zero components. Either it was planned but not used, or it became orphaned during a refactor.

### W7. [MEDIUM] `ratingColor()` couples format layer to Tailwind
A pure formatting function returns framework-specific CSS class names (`text-amber-500`, `text-destructive`). Renaming Tailwind classes or switching UI frameworks requires changes here.

### W8. [MEDIUM] Inline `DeltaFileEntry` interface in server-data.ts
Rather than exporting from `types.ts`, the interface is defined inline. This scatters type definitions across the codebase.

### W9. [MEDIUM] `readSelectors` returns `null` while siblings return empty defaults
Minor inconsistency: `readListings()` returns `{ branches: [] }`, `readRunSummary()` returns `null` (via `readJsonFile` fallback param), but `readSelectors()` uses a custom catch that returns `null`. The pattern should be uniform.

### W10. [LOW] `readJsonFile` uses `as T` for both success and error paths
The catch block returns `fallback` (which is `T`), but the try block casts `JSON.parse(buf) as T`. On the error path, the actual error information is discarded.

### W11. [LOW] No startup validation
Paths are resolved at import time but never checked for existence. A non-existent `GBP_ROOT` produces no error until the first API call, which then produces a silent empty response.

### W12. [LOW] `tailLog` reads entire file
For a 50 MB log file, tailing the last 200 lines reads 50 MB into memory. Should use `fs.open()` + seek + reverse read.

---

## 12. Technical Debt Register

| ID | Description | Module | Severity | Estimated effort |
|---|---|---|---|---|
| TD-05-01 | Hardcoded sandbox path to scraper root | paths.ts:11 | Critical | 30 min |
| TD-05-02 | No schema validation at JSON boundary | server-data.ts:34 | Critical | 4 hours |
| TD-05-03 | Underscore in competitor_id breaks filename parsing | server-data.ts:145 | High | 1 hour |
| TD-05-04 | Silent error swallowing | server-data.ts:35 | High | 2 hours |
| TD-05-05 | No caching layer | server-data.ts (all) | High | 4 hours |
| TD-05-06 | Dead code: `formatRating` | format.ts:54 | Low | 5 min |
| TD-05-07 | `ratingColor` coupled to Tailwind | format.ts:60 | Low | 30 min |
| TD-05-08 | Inline `DeltaFileEntry` type | server-data.ts:126 | Low | 5 min |
| TD-05-09 | `readSelectors` inconsistent null return | server-data.ts:44 | Low | 10 min |
| TD-05-10 | `tailLog` reads entire file | server-data.ts:107 | Low | 1 hour |
| TD-05-11 | `path.resolve()` is a no-op for absolute paths | paths.ts:11 | Info | 2 min |
| TD-05-12 | No startup path validation | paths.ts (all) | Low | 1 hour |

---

## 13. Risks

### R1. Schema drift between Python and TypeScript
Without a shared schema definition or automated cross-language validation, a change to the Python `Review` dataclass or any JSON output shape can silently break the dashboard. Mitigation: integration tests or a JSON Schema file consumed by both sides.

### R2. Path configuration failure in production
If `GBP_ROOT` does not exist on the deployment target, all dashboard data reads return empty/zero states. The dashboard renders without error — operators may not notice stale data. Mitigation: environment variable override, startup health check.

### R3. Competitor ID with underscore silently misrouted
If a teammate adds a competitor with ID `"kopi_senopati"`, `readAllDeltas()` will misparse all delta filenames for that competitor. Deltas will be attributed to the wrong ID or discarded. Mitigation: change separator from `_` to `-` or use a delimiter like `__`.

### R4. File I/O under concurrency
Next.js serverless functions or multiple concurrent dashboard users could trigger overlapping reads. Node.js `fs.promises` handles concurrent reads safely, but high I/O load could saturate the disk. Mitigation: caching layer.

---

## 14. Missing Documentation

1. **Deployment configuration:** no documentation describes how to set `GBP_ROOT` for a production deployment
2. **File format contract:** no document defines the expected JSON shapes and field semantics for the Python↔TypeScript boundary
3. **Dependency graph:** no module-level README or architecture diagram for `src/lib/gbp/`
4. **Error behavior:** no documentation of the defensive fallback contract (which functions return what on failure)

---

## 15. Open Questions

1. **Q1:** Should paths.ts receive `process.env.GBP_ROOT` as an override, or should the path be a build-time configuration?
2. **Q2:** Should `server-data.ts` use a JSON Schema validator (Zod, Ajv) for runtime type checking?
3. **Q3:** Should `server-data.ts` implement an in-memory cache with a TTL (e.g., 30s)?
4. **Q4:** Should `readAllDeltas` use a more robust filename parsing strategy (e.g., `split('_').slice(...)` or a regex with named groups)?
5. **Q5:** Should `formatRating` be removed or should it be adopted by components?
6. **Q6:** Should `ratingColor` be moved to a component-level constant or CSS module?
7. **Q7:** Should `tailLog` be optimized to use reverse file seeking?
8. **Q8:** Should `DeltaFileEntry` be moved to `types.ts` for consistency?
9. **Q9:** Should a startup health check verify that `GBP_ROOT` exists and contains expected subdirectories?
10. **Q10:** Should `readSelectors` follow the same fallback pattern as other readers (return `{ last_verified: "", verified_by: "seed" }` instead of `null`)?

---

## 16. Test Coverage

| Module | Test files | Lines tested | Coverage estimate |
|---|---|---|---|
| types.ts | None | 0 / 217 | 0% |
| server-data.ts | None | 0 / 161 | 0% |
| paths.ts | None | 0 / 22 | 0% |
| format.ts | None | 0 / 66 | 0% |

**Total: 0 test files, 0% coverage.** No Jest/Vitest configuration was found in the repository. No test command exists in package.json.

### Recommended test targets (by priority):
1. `format.ts` — pure functions, easiest to test, 6 functions with clear I/O contract
2. `server-data.ts readAllDeltas` — filename parsing logic (critical for W3)
3. `server-data.ts readLatestDelta` — sort-then-reverse correctness
4. `paths.ts` — path construction correctness with different root values
5. `types.ts` — compile-time only, no runtime test needed (schema validation tests would go in a shared test suite)
