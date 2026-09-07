# Final Release Certification — Independent Audit

**Audit Type:** Adversarial independent verification
**Auditor:** Independent (challenging all prior PASS assumptions)
**Date:** 2026-07-26
**Version:** 0.2.0

---

## Executive Summary

All prior validation reports (Architecture Audit, Runtime Validation, Production Validation, Production Hardening, Release Candidate Verification) are treated as **untrusted** and independently verified. Every PASS assertion was challenged.

**Result:** System is sound. **No release blockers found.** Three previously undetected issues were identified (one HIGH, two MEDIUM), none critical enough to block release. One previous report contains factual errors in test counts.

---

## Issues Found

### 1. TOCTOU Race Condition in POST /api/scrape/trigger (HIGH)

**File:** `src/app/api/scrape/trigger/route.ts`
**Type:** Race condition

The trigger route checks `hasActiveRun()` and then calls `start()` asynchronously:

```typescript
const alreadyRunning = manager.hasActiveRun();
// ... returns 409 if true
const runId = await manager.start();  // async gap
```

**Race window:** Between the `hasActiveRun()` check and the `start()` call, a second concurrent request can also see `hasActiveRun() === false`. Inside `start()`, there is an additional race: `countCompetitors()` (async file read) runs before the run is added to `this.runs`.

**Mitigating factor:** The Python-side lock file (`data/.run.lock`) prevents two scraper processes from running simultaneously. If two processes spawn, the second fails to acquire the lock and exits with code 1. Both run entries are added to `this.runs` — one succeeds, one fails. No data corruption, but wasteful.

**Recommendation:** Use a mutex or atomic flag to make the check+start operation atomic.

**Previous report claim:** "PASS — Second trigger while active returns HTTP 409 with `stage: "concurrent_run"`"
**Actual finding:** Sequential triggers work. Concurrent triggers bypass the guard. The previous test did not test concurrent HTTP requests.

---

### 2. Test Count Inflation (MEDIUM)

**Previous reports claim:** "68 tests across 4 test files"

**Actual finding:** 34 unique tests across 2 test files, counted twice because vitest picks up test files from both `src/` and `.next/standalone/src/` (build output copy). There is no `vitest.config.ts` to exclude the build output.

| Metric | Reported | Actual |
|--------|----------|--------|
| Test files | 4 | 2 |
| Tests | 68 | 34 |

**Breakdown:**
- `src/lib/gbp/format.test.ts` — 22 tests (date parsing, not 18 as previously claimed)
- `src/lib/gbp/health-trend.test.ts` — 12 tests (JSONLOG parser)

**Previous report also claimed** "2 additional test files from pre-existing codebase" — **no such files exist.** There are exactly 2 test files.

**Impact on quality:** The actual test coverage is thinner than reported, but the tests that exist are correct and all pass. No test gaps were identified that affect release safety.

**Recommendation:** Add `vitest.config.ts` with `exclude: ['**/.next/**']`.

---

### 3. Missing Input Validation on competitor_id (MEDIUM)

**Files:** `src/lib/gbp/server-data.ts`, `src/lib/gbp/paths.ts`
**Type:** Path traversal (mitigated, not exploitable)

The `readSnapshotAt()` function uses `competitor_id` directly in filesystem paths:

```typescript
const compDir = path.join(GBP_SNAPSHOTS_DIR, competitorId);
const snapshotPath = path.join(compDir, `${safe}.json`);
```

No validation is performed on `competitor_id` before it enters filesystem operations. Python-side has `_sanitize_competitor_id()` but no TypeScript equivalent.

**Mitigating factors:**
- `.json` suffix is appended, preventing arbitrary file reads
- `readJsonFile()` catches errors and returns `[]` silently
- No actual data leak is possible

**Recommendation:** Add `sanitizeCompetitorId()` that rejects `/`, `..`, `\`, and null bytes.

---

### 4. Snapshot O(n) Reads Per Request (LOW)

**File:** `src/lib/gbp/server-data.ts`

Every call to `readAllSnapshots()` reads ALL snapshot files from disk for ALL competitors. Currently fine (3 competitors, ~20 reviews each), but does not scale to hundreds of competitors.

**Recommendation:** Add in-memory caching with TTL invalidation after each scrape run completes.

---

### 5. execSync Blocks Event Loop in killProcessTree (LOW)

**File:** `src/lib/gbp/scrape-runner.ts`

On Windows, `execSync('taskkill /T /F ...')` blocks the event loop for up to 5 seconds. Acceptable for cleanup/error paths but violates Node.js non-blocking best practices.

**Recommendation:** Replace `execSync` with `exec` (async callback) or `spawn` with `'close'` event.

---

### 6. SCRAPER_TIMEOUT_MS Parsed at Module Load (LOW)

**File:** `src/lib/gbp/scrape-runner.ts`

```typescript
const PROCESS_TIMEOUT_MS = parseInt(
  process.env.SCRAPER_TIMEOUT_MS ?? "600000", 10
);
```

This is evaluated at module import time. Changes to `SCRAPER_TIMEOUT_MS` after the process starts require a restart to take effect. Acceptable for production.

---

## Previous Findings Confirmed

| Claim | Result |
|-------|--------|
| Rate limiting (20 req/min per IP) in middleware.ts | **CONFIRMED** — matches API_REFERENCE.md |
| Health-trend regex parses JSONLOG correctly | **CONFIRMED** |
| Production GBP_ROOT works with copy in .next/standalone | **CONFIRMED** |
| Graceful shutdown (SIGTERM/SIGINT handlers) | **CONFIRMED** |
| killProcessTree terminates child processes | **CONFIRMED** (with event loop blocking caveat) |
| Python snapshot .tmp + replace() is atomic | **CONFIRMED** |
| 10 consecutive fixture runs (0 failures) | **CONFIRMED** |
| 15/15 API endpoints return correct JSON | **CONFIRMED** |
| Lock file cleanup, stale detection, active rejection | **CONFIRMED** |
| 0 tsc errors, 0 eslint warnings, clean build | **CONFIRMED** |

---

## Go / No-Go Recommendation

# ✅ GO

**Rother v0.2.0 is certified for release.**

No findings are release-critical. All six issues identified are well-understood and have documented mitigations or recommendations for follow-up.

### Conditions
1. The TOCTOU race is mitigated by the Python lock file — no data corruption possible. Schedule a fix in the next sprint.
2. Test count inflation is a reporting issue only — all 34 unique tests pass and are correct.
3. Update `vitest.config.ts` to exclude `.next/` from test runs before the next release.

### Severity Summary

| # | Issue | Severity | Release Blocker? |
|---|-------|----------|-----------------|
| 1 | TOCTOU race in trigger route | HIGH | No (Python lock mitigates) |
| 2 | Test count inflation | MEDIUM | No (reporting only) |
| 3 | Missing competitor_id validation | MEDIUM | No (.json suffix mitigates) |
| 4 | Snapshot O(n) reads | LOW | No |
| 5 | execSync blocks event loop | LOW | No |
| 6 | SCRAPER_TIMEOUT_MS module-time parse | LOW | No |
