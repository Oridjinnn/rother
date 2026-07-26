# Project Status — Rother

**Date:** 2026-07-22
**Version:** 0.0.1

---

## Current Phase

**Phase: Alpha — Architecture Audit Complete, Pre-Implementation**

The system has undergone comprehensive architecture audit across all 7 subsystems. The next phase is triaging findings and implementing critical fixes before live-mode verification.

---

## Overall Completion Estimate

| Dimension | Progress | Notes |
|---|---|---|
| Architecture audit | 100% (7/7) | All subsystems audited and documented |
| Critical risk mitigation | 0% | None of the 6 critical risks have been addressed |
| High-priority fixes | 0% | None of the identified high-priority items have been implemented |
| Production readiness | 0% | Cannot deploy until hardcoded path, data-loss bug, and selectors are resolved |
| Test coverage | 0% | No test framework installed or configured |

**Remaining work estimate: ~3–4 engineering months** (assuming a single full-time developer working through 6 milestones sequentially).

---

## Audit Completion Status

| Audit ID | Subsystem | Status | Findings | Debt Items | Risk Score |
|---|---|---|---|---|---|
| AUDIT-01 | Overall Architecture | ✅ Complete | 11 weaknesses, 15 debt items | 15 | High |
| AUDIT-02 | Browser Harness | ✅ Complete | 18 findings, 26 debt items | 18 plus risks | Critical |
| AUDIT-03 | Parser | ✅ Complete | 14 findings, 20 debt items | 14 | Critical |
| AUDIT-04 | Storage | ✅ Complete | 11 findings, 17 debt items | 13 | Critical |
| AUDIT-05 | Dashboard Data Layer | ✅ Complete | 12 findings, 12 debt items | 12 | High |
| AUDIT-06 | API Routes | ✅ Complete | 12 findings, 11 debt items | 11 | High |
| AUDIT-07 | Dashboard Components | ✅ Complete | 12 findings, 9 debt items | 9 | Medium |

**Totals:** 81 documented weaknesses, 51 technical debt items across 7 documents, 28+ open questions.

---

## Remaining Engineering Phases

| Phase | Description | Prerequisites |
|---|---|---|
| **1. Critical Fixes** | Patch data-loss vulnerability (empty parse wipes snapshot). Make `GBP_ROOT` configurable. Add atomic writes to delta/summary files. | None (immediate) |
| **2. Verified Browser Capture** | Obtain real competitor URLs. Run scraper against live Google Maps. Verify/update selectors. Validate anti-bot hardening. Capture real fixture files. | Phase 1 (paths must work) |
| **3. Test Infrastructure** | Install test frameworks (pytest, vitest). Write unit tests for pure functions (format.ts, delta.py, schema.py). Write integration tests for critical paths (parse→delta→store, API routes). | None |
| **4. Security Hardening** | Implement authentication on API routes. Rate-limit scrape trigger. Evaluate input validation (Zod schemas). Remove unused dependencies. | None |
| **5. Architecture Cleanup** | Refactor duplicated API logic. Implement TanStack Query. Extract inline components. Split charts.tsx. Remove dead code. Prune unused npm packages. | Phase 3 (tests for safety net) |
| **6. Production Readiness** | Documentation (deployment guide, API reference). Monitoring integration. Log rotation outside CI. CI pipeline hardening. Performance optimization. | Phases 1–5 |

---

## Known Blockers

| Blocker | Severity | Impact | Depends On |
|---|---|---|---|
| No real competitor URLs from client | Critical | Scraper cannot run in live mode. All development is against 3 synthetic fixture files. | Client communication (external) |
| CSS selectors UNPROVEN against live Google Maps | Critical | The scraper will likely fail on first live run. Selectors may need days/weeks of iterative tuning. | Real URLs, live test access |
| Hardcoded `GBP_ROOT` path | Critical | Dashboard cannot find data on any production machine. | Implementation of env var config |
| Empty-parse-wipes-snapshot bug | Critical | Any transient parse failure destroys all accumulated reviews. | Implementation of guard logic |
| No automated tests | High | Every code change risks regression. No CI safety net. | Test framework setup |
| No authentication | High | Dashboard is publicly accessible if deployed. | Implementation of auth |
| `spawnSync` blocks event loop | Medium | Scrape trigger blocks all concurrent requests for up to 60s. | Implementation of async spawn |

---

## Current Recommendation

**Do not deploy to production in the current state.** The system is functional for demonstration against fixture data but has critical data-loss, security, and configuration issues that prevent safe production use.

**Immediate next steps (in order):**
1. Fix the empty-parse-wipes-snapshot data-loss vulnerability in `run_all.py:282`
2. Add environment variable override for `GBP_ROOT` in `paths.ts`
3. Add atomic write protection to delta and summary files
4. Obtain real competitor URLs from the client
5. Run the scraper against live Google Maps in a controlled test environment
6. Verify and update all CSS selectors
7. Validate the anti-bot hardening (3-layer Client Hints override)

After steps 1–3, the system is safe to run. After steps 4–7, it can produce real data.
