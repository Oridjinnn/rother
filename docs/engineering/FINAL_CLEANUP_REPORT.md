# Final Cleanup Report — v0.2.0

**Date:** 2026-07-26
**Scope:** TOCTOU race fix, competitor_id validation, Vitest config, validation suite

---

## Files Changed

| File | Change | Reason |
|------|--------|--------|
| `src/lib/gbp/scrape-runner.ts` | Added `starting` mutex to `ScrapeRunManager`; extracted `startInner()`; `start()` returns `string \| null` | Eliminate TOCTOU race between `hasActiveRun()` check and process spawn |
| `src/app/api/scrape/trigger/route.ts` | Removed `hasActiveRun()` check; `start()` result replaces pre-flight check | Route now relies on atomic check inside `start()` |
| `src/lib/gbp/validate.ts` | **New file** — `validateCompetitorId()` with `ValidationError` | TypeScript equivalent of Python `_sanitize_competitor_id()` |
| `src/lib/gbp/server-data.ts` | Added `validateCompetitorId()` calls in `readLatestSnapshot()`, `listSnapshots()`, `readSnapshotAt()` | Prevent path traversal via `competitor_id` |
| `vitest.config.mjs` | **New file** — excludes `.next/`, `coverage/`, `dist/`, `node_modules/` | Prevent doubled test counts from build output |

---

## Why Each Change Was Necessary

### 1. TOCTOU Race (`scrape-runner.ts`, `trigger/route.ts`)

**Problem:** Two concurrent `POST /api/scrape/trigger` requests could both see `hasActiveRun() === false` before either reached `start()`, allowing two Python processes to spawn. The Python lock file mitigated data corruption but left a zombie process.

**Fix:** Added a `starting` boolean flag to `ScrapeRunManager`. The `start()` method now atomically checks both `hasActiveRun()` and `starting` in one synchronous block before any `await`. A `try/finally` ensures the flag is released even on error. Returns `null` on conflict instead of throwing, so the route can produce the same 409 response.

**Before:** `hasActiveRun()` check in route → async gap → `start()` call
**After:** `start()` performs check-and-start atomically; route calls `start()` once

### 2. Competitor ID Validation (`validate.ts`, `server-data.ts`)

**Problem:** User-supplied `competitor_id` was used directly in `path.join()` without validation. No sanitization existed on the TypeScript side.

**Fix:** Created `validateCompetitorId()` matching Python's `_sanitize_competitor_id()`:
- Rejects null bytes, `..`, `/`, `\`, leading/trailing hyphens, empty strings, >64 chars, non-alphanumeric characters
- Throws `ValidationError` with descriptive message (rejects, does not silently mutate)

Validation is applied in every `server-data.ts` function that takes `competitorId` and uses it in filesystem operations.

### 3. Vitest Config (`vitest.config.mjs`)

**Problem:** Vitest discovered test files in both `src/` and `.next/standalone/src/` (build output copy), inflating results from "34 tests across 2 files" to "68 tests across 4 files".

**Fix:** Added `vitest.config.mjs` with explicit `exclude` covering `.next/`, `coverage/`, `dist/`, and `node_modules/`.

---

## Test Results

```
npm test       → Test Files 2 passed (2), Tests 34 passed (34)
npx tsc --noEmit → 0 errors
eslint .       → 0 errors, 0 warnings
npm run build  → Compiled successfully (12.8s turbopack)
```

No regressions. All 34 tests pass with the correct file count (2).

---

## Build Results

```
Build complete — standalone output ready at .next/standalone
```

21 API routes + middleware compiled successfully. One pre-existing Turbopack warning about `fs` operations in `scrape-runner.ts` (expected for server-side file I/O, not a regression).

---

## Behaviour Preservation

| Behaviour | Before | After | Changed? |
|-----------|--------|-------|----------|
| 409 on concurrent trigger | `hasActiveRun()` returns true, route returns 409 | `start()` returns null, route returns 409 | No |
| 500 on python missing | `start()` throws, route catches → 500 | Same | No |
| 200 on successful trigger | `start()` returns runId → 200 | Same | No |
| Invalid competitor_id in history/compare | `readSnapshotAt()` returns `[]` silently | `validateCompetitorId()` throws → 500 | **Intentional** — user gets error instead of silent empty results |
| Valid competitor_id in history/compare | Works normally | Same | No |
| Directory listing in `readAllSnapshots()` | Reads all subdirectories | Same (filesystem-sourced IDs pass validation) | No |
| Test count | 68 from 4 files (duplicated) | 34 from 2 files (correct) | **Intentional** — false count eliminated |

---

## Remaining Deferred Items

| Item | Reason |
|------|--------|
| `execSync` in `killProcessTree()` blocks event loop | Error/cleanup path only —defer to post-release hardening |
| `SCRAPER_TIMEOUT_MS` parsed at module load | Acceptable —env change requires restart anyway |
| Snapshot O(n) reads per request | Fine at current scale (~3 competitors, ~20 reviews) |
| Live mode end-to-end verification | Requires real `place_id` values and Playwright Chromium |

---

## Confirmation

All changes are minimal and targeted. No unrelated formatting, no broad refactoring, no dependency upgrades. Backwards compatibility is preserved: API response shapes, status codes, and behaviour are identical except where invalid input is now explicitly rejected instead of silently accepted.
