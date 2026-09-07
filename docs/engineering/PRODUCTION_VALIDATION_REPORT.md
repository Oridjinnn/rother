# Production Validation & Hardening Report

**Date:** 2026-07-26
**Scope:** Python scraper chain audit (run_all.py, capture.py, selector_tracker.py), all 21 API routes review, concurrency/resource-leak analysis, OS-specific hardening

---

## 1. Python Scraper Chain Audit

### 1.1 `run_all.py` — Orchestration (1487 lines)

| Check | Status | Evidence |
|-------|--------|----------|
| Lock file mechanism | **PASS** | `_acquire_lock()` with stale detection (30min threshold), PID/run_id tracking, signal handlers (`SIGINT`/`SIGTERM`), `atexit.register(_release_lock)` |
| Config validation | **PASS** | `_validate_listings_config()` checks duplicate IDs, missing fields, `place_id` format (must start with `ChIJ`, ≥25 chars) |
| Path traversal prevention | **PASS** | `_sanitize_competitor_id()` rejects `..`, `/`, `\`, null bytes, leading/trailing hyphens, length > 64; `_safe_path_within()` resolves and validates containment |
| Pre-flight checks | **PASS** | Python dependencies (playwright, parsel, requests), Playwright Chromium binary, mock URL detection, fixture coverage reporting |
| Failure isolation (Rule 7) | **PASS** | Every listing wrapped in inner `try/except`; `_diagnose_failure()` provides stage-specific probable cause |
| Browser lifecycle | **PASS** | Context/browser/Playwright teardown in `finally` block (line 814-830); each `close()` individually guarded |
| Retry logic | **PASS** | `_capture_with_retries()`: max 2 retries with backoff; `SelectorNotFoundError` and `CaptureTimeoutError` NOT retried |
| Log rotation | **PASS** | Rotates `run.log` at 5MB threshold; `_rotate_run_log_if_needed()` called before each run |
| Disk space check | **PASS** | `_check_disk_space()` warns if <100 MB free |
| Config backup | **PASS** | `_backup_config()` copies listings/selectors to timestamped directory |
| Rate limiter | **PASS** | `RateLimiter` class: per-domain, min interval (5s), max per window (12/60s), rolling window |
| `fixtures_path()` defined | **PASS** | Function at line 1377 wraps `_FIXTURES_DIR / f"{comp_id}.html"` — used at line 918 for fixture read |
| `run_verify()` mode | **PASS** | Captures screenshots + HTML to `data/verify/{ts}/` without modifying production snapshots/deltas |
| `__main__` entry point | **PASS** | Supports `--fixtures`, `--verify`, `--url`, `--validate-config` flags; CI-appropriate exit codes |

### 1.2 `capture.py` — Playwright Harness (300 lines)

| Check | Status | Evidence |
|-------|--------|----------|
| Timeout enforcement | **PASS** | Wall-clock deadline checked after each phase (goto, cookie, reviews_tab, scroll); `CaptureTimeoutError` with stage/elapsed/timeout attributes |
| Navigation error classification | **PASS** | `_classify_navigation_error()` categorizes DNS, timeout, connection_refused, ssl_error, http_error, unknown |
| Fallback selector resolution | **PASS** | `_fallback_click()` iterates candidate selectors; records per-selector outcomes to `SelectorTracker` |
| Page lifecycle | **PASS** | `page.close()` in `finally` block (line 221-225) |
| Screenshot path traversal | **PASS** | `spath.resolve()` checked for `..` artifacts before saving evidence |
| Capture validation | **PASS** | `_validate_capture_output()` warns on <10KB, errors on <1KB |
| Expand truncated reviews | **PASS** | `_fallback_expand()` clicks all "More" buttons; fallback iteration |

### 1.3 `selector_tracker.py` — Selector Health Tracking (202 lines)

| Check | Status | Evidence |
|-------|--------|----------|
| Per-selector recording | **PASS** | Tracks found/not-found/match_count/duration/error per competitor per phase |
| Confidence computation | **PASS** | `effective_found / total_attempts` with `expected_missing` support |
| Status classification | **PASS** | healthy (all found), degraded (partial), broken (none found), not_evaluated |
| Drift analysis | **PASS** | `compare_with_history()`: confidence deltas, newly_broken/degraded, recovered, per-selector alerts |
| History rolling window | **PASS** | Last 50 entries kept; trend computed vs previous entry |

---

## 2. API Route Audit (21 Routes)

### 2.1 Cache Headers

| Route | `force-dynamic` | `Cache-Control: no-store` | Status |
|-------|-----------------|---------------------------|--------|
| `GET /api/health` | Yes | ✓ (implicit via NextResponse) | **PASS** |
| `POST /api/scrape/trigger` | Yes | ✓ explicit `no-store` | **PASS** |
| `GET /api/scrape/status` | Yes | ✓ explicit `no-store` | **PASS** |
| `GET /api/overview` | Yes | ✓ explicit `no-store` | **PASS** |
| `GET /api/branches` | Yes | ✓ explicit `no-store` | **PASS** |
| `GET /api/reviews` | Yes | ✓ explicit `no-store` | **PASS** |
| `GET /api/reviews/export` | Yes | ✓ explicit `no-store` | **PASS** |
| `GET /api/reviews-over-time` | Yes | ✓ explicit `no-store` | **PASS** |
| `GET /api/review-lengths` | Yes | ✓ explicit `no-store` | **PASS** |
| `GET /api/history` | Yes | ✓ explicit `no-store` | **PASS** |
| `GET /api/history/compare` | Yes | ✓ explicit `no-store` | **PASS** |
| `GET /api/history/export` | Yes | ✓ explicit `no-store` | **PASS** |
| `GET /api/alerts` | Yes | ✓ explicit `no-store` | **PASS** |
| `GET /api/logs` | Yes | ✓ explicit `no-store` | **PASS** |
| `GET /api/health-trend` | Yes | ✓ explicit `no-store` | **PASS** |
| `GET /api/competitor-correlation` | Yes | ✓ explicit `no-store` | **PASS** |
| `GET /api/config/listings` | Yes | ✓ explicit `no-store` | **PASS** |
| `PATCH /api/config/listings` | Yes | ✓ implicit | **PASS** |
| `GET /api/config/selectors` | Yes | ✓ explicit `no-store` | **PASS** |
| `GET /api/export/branches` | Yes | ✓ explicit `no-store` (CSV), implicit (JSON) | **PASS** |
| `GET /api/export/competitors` | Yes | ✓ explicit `no-store` (CSV), implicit (JSON) | **PASS** |
| `GET /api/` | **MISSING** | Not set — returns `{message:"Hello, world!"}` | **LOW** |

### 2.2 Input Validation

| Route | Validation | Status |
|-------|-----------|--------|
| `POST /api/scrape/trigger` | Mode validated (`fixtures`/`live` only), 400 on invalid | **PASS** |
| `GET /api/scrape/status` | `runId` required, 400 on missing | **PASS** |
| `GET /api/reviews` | `page` min 1, `pageSize` clamped 1-100, rating filter sanitized (1-5 range, NaN filtered) | **PASS** |
| `GET /api/reviews/export` | rating filter sanitized (same as reviews), q trimmed | **PASS** |
| `GET /api/logs` | `lines` clamped 1-2000 | **PASS** |
| `GET /api/history/compare` | `competitor_id` required (400), optional timestamp params | **PASS** |
| `PATCH /api/config/listings` | Full structural validation: `validateBranchConfig()` checks types, required fields, duplicates, non-empty final guard (422) | **PASS** |
| `GET /api/config/listings` | No validation needed (read-only) | **PASS** |
| `GET /api/config/selectors` | Existence check, 404 if missing | **PASS** |

### 2.3 Error Handling

| Check | Status | Evidence |
|-------|--------|----------|
| `sanitizeError()` in catch blocks | **PASS** | Used in all 16 non-trivial API routes; `sanitize.ts` strips stack traces and paths |
| Consistent error shape | **PASS** | `{error: string, detail?: string}` pattern; 400/404/422/500 as appropriate |
| No sensitive info leaked | **PASS** | File paths, stack traces, environment variables not exposed in error responses |

### 2.4 Stale/Stale Data Risk

| Check | Status | Evidence |
|-------|--------|----------|
| All data routes read from disk on every call | **PASS** | No in-memory caching layer; `readAllSnapshots()` reads `data/snapshots/*/*.json` per request |
| Snapshot directory rescans | **PASS** | `readAllSnapshots()` in `server-data.ts` re-reads directory listing each call |
| `run_summary.json` re-read per request | **PASS** | `readRunSummary()` reads from disk each time |

---

## 3. Concurrency & Resource Leak Analysis

| Check | Status | Evidence |
|-------|--------|----------|
| API-layer concurrent prevention | **PASS** | `scrapeRunManager.hasActiveRun()` returns HTTP 409 when a run is in progress |
| Python lock file (cross-process) | **PASS** | `_acquire_lock()` with stale detection prevents two Python processes |
| Process timeout safety net | **PASS** | `PROCESS_TIMEOUT_MS=600000` (10min); kills process + sets `status=failed` |
| Periodic cleanup sweep | **PASS** | `cleanupTimer` every 60s; kills overlong processes (2× timeout), removes old entries (300s) |
| Buffer memory caps | **PASS** | stdout 10K lines, stderr 5K lines |
| Browser teardown on crash | **PASS** | `try/finally` in `run()` and `run_verify()` ensures `ctx.close() → browser.close() → p.stop()` |
| Page-level cleanup | **PASS** | `page.close()` in `finally` block of `capture_listing_html()` |
| `destroy()` never called | **LOW** | `ScrapeRunManager.destroy()` is defined but never invoked — `cleanupTimer` persists indefinitely. Acceptable for long-running server, but production should register a `SIGTERM` handler. |

---

## 4. OS-Specific Hardening (Windows)

| Check | Status | Evidence |
|-------|--------|----------|
| Python executable discovery | **PASS** | `findPython()` tries `python3` then `python`; `spawnSync` validates with `--version` |
| Process kill (child processes) | **FAIL** | `proc.kill()` on Windows only kills the Python interpreter, NOT child Playwright `chrome.exe` processes. Zombie Chrome processes may accumulate. |
| Lock file advisory only | **WARN** | `_acquire_lock()` uses file-existence check (not `O_CREAT \| O_EXCL` atomic create). On Windows, two processes can pass the `exists()` check in a race window. Low probability but possible. |
| PID recycling risk | **LOW** | Lock file stores PID but doesn't verify process identity. On a server running for weeks, PIDs get recycled — a stale lock could be incorrectly considered fresh if the new process happens to reuse the PID. Mitigated by the 30min stale threshold. |
| Path separator handling | **PASS** | Both `/` and `\\` rejected by `_sanitize_competitor_id()` |

---

## 5. Critical Finding: `health-trend` Regex Mismatch

**Severity: HIGH**

The `GET /api/health-trend` route (`src/app/api/health-trend/route.ts:58-59`) parses `run.log` looking for lines matching:

```
/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),\d+\s+INFO\s+gbp-monitor\.run_all\s+Run summary:\s*(\{.+\})\s*$/
```

This regex expects the string `Run summary:` in the log line. However, the Python orchestrator emits run summaries via `_structured_log()` which produces lines in this format:

```
JSONLOG: {"run_id":"...","stage":"run_summary","success":3,...}
```

The word `Run summary:` never appears in the output. **The regex will never match any line**, causing the health-trend endpoint to always return `{points: [], latest: null, isMultiPoint: false}` regardless of actual run data.

### Root cause
The health-trend endpoint was written against an earlier version of the Python logger output before the JSONLOG format was adopted.

### Fix
The regex should match `JSONLOG:` lines with `"stage":"run_summary"` instead of `Run summary:`. The JSONLOG format is structured and the `run_summary` stage always includes `success`, `failed`, `skipped` fields.

```typescript
// Current (broken):
const summaryLineRegex =
  /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),\d+\s+INFO\s+gbp-monitor\.run_all\s+Run summary:\s*(\{.+\})\s*$/;

// Fix: match JSONLOG stage=run_summary:
const summaryLineRegex =
  /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),\d+\s+INFO\s+gbp-monitor\.run_all\s+JSONLOG:\s*(\{"run_id":".*?"stage":"run_summary".*\})\s*$/;
```

---

## 6. Minor Findings

### 6.1 Root API route has no cache control
`GET /api/route.ts` returns `{message:"Hello, world!"}` without `force-dynamic` or `Cache-Control`. Negligible impact — this route isn't used by the dashboard.

### 6.2 JSON format exports lack download headers
`GET /api/export/branches?format=json` and `GET /api/export/competitors?format=json` use `NextResponse.json()` which doesn't set `Content-Disposition: attachment`. JSON exports are rendered in-browser rather than downloaded. CSV format correctly sets the header. Low severity — the JSON format is a secondary option.

### 6.3 Query parameter length validation
`branch_id`, `competitor_id` from query parameters are not validated for length/special characters before being echoed in responses. These values come from the config file (not user input in most cases), so the risk is low. The Python scraper performs its own validation before filesystem use.

---

## 7. Overall Assessment

| Layer | Verdict | Notes |
|-------|---------|-------|
| Python scraper chain | **PRODUCTION-READY** | Failure isolation, path traversal prevention, browser lifecycle, retry logic, rate limiting, lock file — all solid |
| API endpoints (20/21) | **PRODUCTION-READY** | Cache headers, input validation, error sanitization, no stale data |
| API endpoint (`health-trend`) | **BROKEN** | Regex mismatch — always returns empty results. Fix before relying on this endpoint. |
| Concurrency | **PRODUCTION-READY** | Two-layer guard (API + file lock), timeout safety, periodic cleanup |
| Windows hardening | **PARTIAL** | Zombie Chrome processes from `proc.kill()` are the primary risk. Recommended remediation on page 2. |
| Build integrity | **PASS** | `tsc --noEmit` (0 errors), `npm test` (44/44), `eslint .` (0 errors/warnings), `npm run build` (compiled) |

### Recommended remediation before go-live

1. **Fix `health-trend` regex** (HIGH — ~15 min)
2. **Windows tree-kill** (MEDIUM — ~30 min): Replace `proc.kill()` with Windows `taskkill /T /F` when `process.platform === "win32"`, or use `job objects` via `win32-job` npm package. On non-Windows, `proc.kill('SIGTERM')` followed by `proc.kill('SIGKILL')` after a grace period.
3. **Register SIGTERM handler** (LOW — ~5 min): Call `scrapeRunManager.destroy()` on server shutdown
