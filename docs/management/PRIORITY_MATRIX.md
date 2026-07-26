# Priority Matrix — Rother

**Date:** 2026-07-22
**Source:** Architecture Audits AUDIT-01 through AUDIT-07

---

## Priority Distribution

| Priority | Tasks | Description |
|---|---|---|
| **Critical** | T-001 to T-006 | Must fix before any production deployment. Addresses data loss, security, and system viability. |
| **High** | T-007 to T-016 | Should fix before general availability. Addresses significant risks, operational friction, and code quality. |
| **Medium** | T-017 to T-024 | Important but non-blocking. Can be addressed in parallel with or after initial live verification. |
| **Low** | T-025 to T-028 | Nice-to-have. Cosmetic cleanup, minor efficiency, and dead code removal. |

---

## Critical (6 tasks)

| ID | Task | Why Critical |
|---|---|---|
| **T-001** | Prevent snapshot overwrite on empty parse | **Data loss.** Without this fix, a single transient parse failure (which WILL happen when selectors first fail against live Google Maps) permanently destroys all accumulated reviews for a competitor. No recovery mechanism exists. This is the single most dangerous bug in the system. |
| **T-002** | Make `GBP_ROOT` configurable via env var | **System non-functional outside sandbox.** The dashboard cannot find its data on any machine other than the original development environment. Without this fix, the system cannot be deployed anywhere — including a test server for live verification (T-004). |
| **T-003** | Atomic write protection for delta/summary files | **Data loss.** A crash mid-write silently discards a run's worth of delta data. The inconsistency (atomic for snapshots, non-atomic for deltas) means half the data layer is unprotected. |
| **T-004** | Verify selectors against live Google Maps | **Blocking condition.** The entire purpose of the system depends on the scraper working against real Google Maps. If selectors fail (which they almost certainly will — they are 2023 vintage and UNPROVEN), the system produces zero data. Everything else on the backlog is moot until this is resolved. |
| **T-005** | Implement authentication on all API routes | **Security.** `POST /api/scrape/trigger` executes arbitrary Python code. If the dashboard is accessible on any network (even localhost with port forwarding), this is an unauthenticated code execution vector. `next-auth` is already installed — the fix is configuration-only. |
| **T-006** | Verify anti-bot hardening against real Google Maps | **Blocking condition.** Even if selectors are correct, Google Maps may block headless Chromium. The 3-layer Fix A is research-backed but unverified. If it fails, no data can be collected. Must be tested in conjunction with T-004. |

### Rationale
The 6 critical tasks form an **order-dependent chain**: T-002 and T-003 make the system safe to run. T-001 prevents data loss during the inevitable selector failures. T-005 secures the system before any network exposure. T-004 and T-006 determine whether the project's core function (scraping Google Maps) is viable at all. **Do not deploy to production until all 6 are complete.**

---

## High (10 tasks)

| ID | Task | Why High |
|---|---|---|
| **T-007** | Install test infrastructure and write unit tests | **No safety net.** Every code change risks regression. Tests for pure functions are fast to write and provide immediate confidence. Without tests, the refactoring tasks (T-008, T-013, T-014) are high-risk. |
| **T-008** | Extract shared API logic modules | **Duplicate code will cause bugs.** ~120 lines of duplicated filter/grouping/CSV logic means any future change must be applied in multiple places. One of the duplicates will inevitably be missed. |
| **T-009** | Implement input validation on all API routes | **Unpredictable behavior.** Malformed parameters are silently accepted and produce confusing results (e.g., `rating=abc` returns all reviews instead of erroring). This degrades debugging and user experience. |
| **T-010** | Replace `spawnSync` with async subprocess | **Blocks event loop.** The current `spawnSync` blocks all concurrent requests for up to 60 seconds. In a dashboard context, this means the dashboard freezes during a scrape trigger. |
| **T-011** | Add structured logging on error paths | **Operator blindness.** Currently, corrupt files produce no warning. Missing files produce no warning. The operator only discovers data problems when the dashboard shows empty states with no explanation. |
| **T-012** | Add screenshot/DOM capture on failure | **Debugging blindness.** When a capture fails, there is zero evidence of what the browser saw. The operator has only an error message. For a system that runs unattended (GitHub Actions cron), this makes failure diagnosis nearly impossible. |
| **T-013** | Implement TanStack Query in dashboard | **Poor performance.** 9+ components reimplement raw fetch logic. Three components independently fetch `/api/history`. Five fetch `/api/reviews`. TanStack Query is already installed and `QueryProvider` wraps the app — the infrastructure exists but is unused. |
| **T-014** | Split `charts.tsx` | **Maintenance bottleneck.** An 839-line monolith with 6 chart components creates merge conflicts and makes parallel development impossible. Every chart change requires scrolling past all 6 charts. |
| **T-015** | Add comprehensive fixture files | **Untested edge cases.** The parser has only been tested against 3 hand-written happy-path fixtures. Every real-world edge case (null fields, missing elements, non-English locale, corrupt HTML) is untested. |
| **T-016** | Make locator tier selectors configurable | **Inflexible.** The self-healing locator's tiers 1–4 are hardcoded. If Google changes attribute names, the locator cannot be reconfigured without editing Python source code. |

### Rationale
High-priority tasks are those that cause **significant operational friction or risk** but do not block initial live verification. T-007 should be prioritized early because it enables safe refactoring of all other tasks. T-008 through T-011 directly improve debuggability and reliability. T-013 and T-014 address the most impactful code-quality issues in the dashboard.

---

## Medium (8 tasks)

| ID | Task | Why Medium |
|---|---|---|
| **T-017** | Add runtime schema validation with Zod | Catches schema drift early but drift is unlikely before production use. Dependencies: T-007 (test infrastructure). |
| **T-018** | Add server-side caching layer | Performance optimization. Current scale (12 competitors, ~30 reviews) does not justify caching overhead. Revisit when scale increases 10×. |
| **T-019** | Fix ESLint and TypeScript config | Important for code quality but does not affect functionality. May surface many existing errors that need fixing first. |
| **T-020** | Extract inline components from overview-section.tsx | Improves testability and maintainability of the largest component (807 lines). Not blocking any feature. |
| **T-021** | Parallelize `readLatestDelta()` calls | Performance optimization. Current 12 competitors finish in <100ms — serial overhead is negligible. Revisit with more competitors. |
| **T-022** | Add relative-date-to-absolute conversion | Data quality improvement. "5 days ago" is informative for recent reviews but becomes ambiguous over time. Low urgency because `scraped_at` provides an absolute reference. |
| **T-023** | Replace health-trend regex with structured summary file | Improves robustness. Current regex works and is stable — the log format has not changed. Low urgency. |
| **T-024** | Standardize selector key access patterns | Code consistency. The `.get()` vs `[]` inconsistency is cosmetic but could cause bugs if new selector keys are added. |

### Rationale
Medium tasks are **important but not urgent**. They should be scheduled after critical and high tasks are complete. Many are performance or code-quality improvements that only matter at larger scale or with multiple developers.

---

## Low (4 tasks)

| ID | Task | Why Low |
|---|---|---|
| **T-025** | Remove unused npm packages | Reduces bundle size by ~50KB+ and dependency audit noise. No functional impact. |
| **T-026** | Remove dead code (API root, formatRating, lib/db.ts, use-toast.ts) | Housekeeping. Dead code does not affect functionality but creates confusion for new developers. |
| **T-027** | Remove sandbox path from UI | Information disclosure. Low risk because the dashboard is not yet deployed to clients. |
| **T-028** | Add log rotation outside GitHub Actions | Prevents unbounded disk growth for local runs. Not urgent because local runs are infrequent. |

### Rationale
Low tasks are **housekeeping and polish**. They should be addressed opportunistically or during a dedicated cleanup phase. They have no impact on system functionality or data integrity.
