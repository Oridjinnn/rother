# Milestone Plan — Rother

**Date:** 2026-07-22
**Source:** Architecture Audits AUDIT-01 through AUDIT-07
**Total Milestones:** 6

---

## Overview

| Milestone | Name | Focus | Tasks | Estimated Effort |
|---|---|---|---|---|
| **M1** | Safe Foundation | Data integrity + configuration | T-001, T-002, T-003 | ~1 week |
| **M2** | Verified Browser Capture | Live scraping against real Google Maps | T-004, T-005, T-006, T-012 | ~3–5 weeks |
| **M3** | Test-Protected Codebase | Automated testing | T-007, T-015, T-019 | ~2–3 weeks |
| **M4** | Reliable API | Robust server-side layer | T-008, T-009, T-010, T-011, T-021, T-023 | ~2–3 weeks |
| **M5** | Dashboard Quality | Client-side architecture cleanup | T-013, T-014, T-020, T-025, T-026, T-027 | ~2–3 weeks |
| **M6** | Production Candidate | Polish, docs, deployment readiness | T-016, T-017, T-018, T-022, T-024, T-028 | ~2–3 weeks |

**Total estimated effort: ~12–18 weeks (3–4 engineering months)** for a single full-time developer working sequentially through milestones. Milestones M1–M3 are blocking; M4–M6 can be reordered or parallelized.

---

## Milestone 1: Safe Foundation

**Goal:** Eliminate immediate data-loss and configuration risks. Make the system safe to run and deploy.

**Estimated effort:** ~1 week

| Task | ID | Description |
|---|---|---|
| Prevent snapshot overwrite on empty parse | **T-001** | Guard `save_snapshot()` against empty parser output overwriting non-empty snapshots |
| Make `GBP_ROOT` configurable via env var | **T-002** | Replace hardcoded path with `process.env.GBP_ROOT` + fallback |
| Add atomic write protection to delta/summary files | **T-003** | Apply `.tmp` + `Path.replace()` pattern to all file writes |

**Definition of done:**
1. `python -m orchestration.run_all --fixtures` does not lose data even with simulated empty parser.
2. Dashboard works with `GBP_ROOT=/path/to/gbp-monitor` environment variable set.
3. A simulated crash during delta/summary write does not corrupt the target file.
4. All 3 changes are reviewed and merged.

**Blocking for:** Milestone 2 (M2 requires path configuration to work on a test machine).

---

## Milestone 2: Verified Browser Capture

**Goal:** Prove the scraper works against real Google Maps. Obtain real competitor data and verified selectors.

**Estimated effort:** ~3–5 weeks (dependent on client communication and selector tuning difficulty)

| Task | ID | Description |
|---|---|---|
| Verify selectors against live Google Maps DOM | **T-004** | Test all 11 selectors, update `selectors.json`, capture live fixture files |
| Implement authentication on all API routes | **T-005** | Configure auth before any deployment (security gate) |
| Verify anti-bot hardening against real Google Maps | **T-006** | Test 3-layer Client Hints override against detection pages and real URLs |
| Add screenshot/DOM capture on failure | **T-012** | Capture evidence when a listing fails |

**Pre-requisites:**
- Real competitor Google Maps URLs from client (external dependency)
- Milestone 1 complete (paths work, data is safe)

**Risk factors:**
- Selectors may require multiple rounds of tuning (1–2 weeks)
- Anti-bot hardening may require additional measures (adds 1–2 weeks)
- Client may not provide URLs promptly (external risk)

**Definition of done:**
1. Scraper runs against a real Google Maps URL and successfully captures reviews.
2. All 11 selectors verified against live DOM, `verified_by` updated to `"browser_agent"` or `"manual_human"`.
3. Anti-bot hardening confirmed working (no block, no CAPTCHA for test runs).
4. New fixture files captured from live runs and committed to repository.
5. Authentication active on all API routes.
6. Failure captures produce screenshot + HTML evidence in `data/debug/`.

**Blocking for:** Milestone 3 (M3 tests need verified fixture files for meaningful assertions about real-world behavior).

---

## Milestone 3: Test-Protected Codebase

**Goal:** Establish automated testing infrastructure and write meaningful tests for all subsystems.

**Estimated effort:** ~2–3 weeks

| Task | ID | Description |
|---|---|---|
| Install test infrastructure and write unit tests | **T-007** | pytest + vitest, tests for `format.ts`, `delta.py`, `schema.py` |
| Add comprehensive fixture files | **T-015** | Edge case fixtures (nulls, empty, malformed, non-English, etc.) |
| Fix ESLint and TypeScript config | **T-019** | Remove `ignoreBuildErrors`, re-enable lint rules |

**Pre-requisites:**
- Milestone 2 complete (verified fixtures from live captures)

**Key design decisions:**
- Python tests: pytest, run from `gbp-monitor/tests/`
- TypeScript tests: vitest, run from project root
- CI integration: GitHub Actions workflow runs both test suites on push

**Definition of done:**
1. `pytest` passes with test suite for `delta.py`, `schema.py`, `capture.py`, `scroll.py`.
2. `vitest` passes with test suite for `format.ts`, `server-data.ts` (pure functions).
3. At least 10 fixture files covering happy path and edge cases.
4. `bun run lint` passes with meaningful TypeScript/ESLint rules.
5. `bun run build` fails on TypeScript errors.
6. CI workflow runs all tests on every push.

**Blocking for:** Milestone 4 (M4 involves significant refactoring — tests are the safety net).

---

## Milestone 4: Reliable API

**Goal:** Eliminate duplication, add input validation, fix blocking subprocess, and improve debuggability in the API layer.

**Estimated effort:** ~2–3 weeks

| Task | ID | Description |
|---|---|---|
| Extract shared API logic modules | **T-008** | Review filters, history grouping, CSV escaping |
| Implement input validation on all API routes | **T-009** | Zod schemas for all query parameters |
| Replace `spawnSync` with async subprocess | **T-010** | Non-blocking scrape trigger |
| Add structured logging on error paths | **T-011** | Log all file I/O errors with severity |
| Parallelize `readLatestDelta()` calls | **T-021** | `Promise.all()` for competitor delta reads |
| Replace health-trend regex with structured summary | **T-023** | JSON summary file instead of regex log parsing |

**Pre-requisites:**
- Milestone 3 complete (tests provide regression safety net)

**Definition of done:**
1. Review filter logic exists in one shared module, consumed by both `/api/reviews` and `/api/reviews/export`.
2. History grouping exists in one shared module, consumed by both `/api/history` and `/api/history/export`.
3. All routes return 400 with clear message on invalid query parameters.
4. `POST /api/scrape/trigger` does not block the event loop.
5. Corrupt/missing data files produce log entries warning the operator.
6. `/api/overview` and `/api/branches` read deltas in parallel.

---

## Milestone 5: Dashboard Quality

**Goal:** Improve client-side architecture, eliminate unused code, and reduce bundle size.

**Estimated effort:** ~2–3 weeks

| Task | ID | Description |
|---|---|---|
| Implement TanStack Query in dashboard | **T-013** | Replace raw `fetch()` with `useQuery()` |
| Split `charts.tsx` into one file per chart | **T-014** | 6 individual chart component files |
| Extract inline components | **T-020** | `VerificationBadge`, `RunHealthPanel`, `ChartCard` |
| Remove unused npm packages | **T-025** | Clean up package.json |
| Remove dead code | **T-026** | API root, formatRating, lib/db.ts, use-toast.ts |
| Remove sandbox path from UI | **T-027** | Clean up config-section.tsx |

**Pre-requisites:**
- Milestone 3 complete (tests for the refactored code)

**Definition of done:**
1. All self-fetching components use TanStack Query `useQuery()`.
2. Multiple components fetching the same endpoint share one network request.
3. `charts.tsx` is split into 7 files (6 charts + 1 utils).
4. Inline components extracted to separate files.
5. Unused npm packages removed, bundle size reduced.
6. No dead code references remain.
7. No hardcoded sandbox paths in rendered UI.

---

## Milestone 6: Production Candidate

**Goal:** Final polish, configuration flexibility, and deployment readiness.

**Estimated effort:** ~2–3 weeks

| Task | ID | Description |
|---|---|---|
| Make locator tier selectors configurable | **T-016** | Tiers 1–4 from `selectors.json` |
| Add runtime schema validation with Zod | **T-017** | Validate JSON file shapes at read time |
| Add server-side caching layer | **T-018** | In-memory cache with 30s TTL |
| Add relative-date-to-absolute conversion | **T-022** | Convert "5 days ago" → ISO date using scraped_at |
| Standardize selector key access patterns | **T-024** | `.get()` consistently in all 4 helpers |
| Add log rotation outside GitHub Actions | **T-028** | Rotate run.log at 5 MB |

**Pre-requisites:**
- Milestones 1–5 complete

**Definition of done:**
1. Deployment documentation complete.
2. Environment configuration documented (required env vars, path setup).
3. API reference (OpenAPI or human-readable) published.
4. Scraper data pipeline (capture → parse → delta → store) verified end-to-end with live data.
5. Dashboard authentication tested and documented.
6. All tests pass.
7. Build produces a deployable standalone artifact.

---

## Dependency Graph

```
M1: Safe Foundation
  ├── T-001 (empty parse guard)
  ├── T-002 (configurable path)
  └── T-003 (atomic writes)
        │
        ▼
M2: Verified Browser Capture
  ├── T-004 (verify selectors) ◀── External: real URLs from client
  ├── T-005 (authentication)
  ├── T-006 (verify anti-bot)
  └── T-012 (failure evidence)
        │
        ▼
M3: Test-Protected Codebase
  ├── T-007 (test infrastructure)  ─── Provides tests for M4, M5
  ├── T-015 (fixture files)
  └── T-019 (ESLint + TS config)
        │
        ├──────────────┬──────────────┐
        ▼              ▼              ▼
M4: Reliable API    M5: Dashboard      M6: Production
  T-008, T-009,       T-013, T-014,     T-016, T-017,
  T-010, T-011,       T-020, T-025,     T-018, T-022,
  T-021, T-023        T-026, T-027      T-024, T-028
```

M4, M5, and M6 can be executed in any order or in parallel after M3 is complete.
