# M15.2 Production Readiness Audit

**Project:** Rother  
**Version:** 0.2.0  
**Audit Date:** 2026-07-26  
**Auditor:** Production Readiness Engineering  
**Status:** Alpha — Not Production Ready

---

## Executive Summary

Rother has completed M15.1 (product identity foundation, async scraper execution, progress UI, export improvements, and comprehensive documentation). The product vision, architecture documentation, and component system are well-articulated. However, the system is **not ready for pilot production deployment**.

The audit identified **49 distinct issues** across six categories:

| Category | Critical | High | Medium | Low | Total |
|---|---|---|---|---|---|
| Repository Hygiene | 4 | 3 | 4 | 3 | 14 |
| Production Readiness | 2 | 4 | 2 | 1 | 9 |
| Error Handling | 2 | 3 | 4 | 1 | 10 |
| Security | 1 | 3 | 2 | 0 | 6 |
| Maintainability | 0 | 2 | 3 | 2 | 7 |
| User Experience | 1 | 2 | 2 | 1 | 6 |

The most critical blockers are:
1. **No authentication on any API endpoint** — the entire system is publicly accessible
2. **No error boundaries** — a single render crash blanks the entire page
3. **Runtime data tracked in git** — `.env`, SQLite database, 6 MB log files, and a 3 MB binary artifact are version-controlled
4. **No deployment documentation for the dashboard** — only the Python scraper has deployment guidance
5. **No disaster recovery plan** exists anywhere in the project

**Overall Readiness Score: 2.5 / 10**

---

## Critical Issues (Must Fix Before Pilot)

### C-01: Zero Authentication on All API Endpoints
**Category:** Security  
**Files:** All `src/app/api/*/route.ts` (20 route files)  
**Risk:** An attacker can spawn unlimited Python subprocesses (`POST /api/scrape/trigger`), mutate competitor configuration (`PATCH /api/config/listings`), and export all scraped data (`GET /api/export/*`) without any credentials.  
**Evidence:** No `getServerSession()`, no API key check, no middleware, no auth guard exists anywhere. `next-auth` is listed in `package.json` dependencies but is never imported or used. No `middleware.ts` file exists.  
**Effort to fix:** 3-5 days

### C-02: No React Error Boundaries
**Category:** Error Handling  
**Files:** `src/app/` (missing `error.tsx`, `global-error.tsx`)  
**Risk:** If any component throws during rendering, Next.js unmounts the entire React tree and the user sees a blank white screen. There is no fallback UI, no "something went wrong" message, and no recovery path.  
**Evidence:** No `error.tsx` or `global-error.tsx` exists at any route segment. No class-based `ErrorBoundary` component exists.  
**Effort to fix:** 0.5 days

### C-03: Runtime and Artifact Files Tracked in Git
**Category:** Repository Hygiene  
**Files:** `.env`, `db/custom.db`, `data/run.log`, `gbp-monitor/data/run.log` (6.35 MB), `Rother - 0.0.1` (3.27 MB nested-git artifact), `tool-results/`, `_audit_reviews_output.json`, `.zscripts/dev.pid`, `gbp-monitor/data/backups/*.zip`  
**Risk:** `.env` file (containing `DATABASE_URL`) is committed despite `.gitignore` having `.env*` — the file was tracked before the gitignore rule was added. A 6 MB log file and 3 MB binary artifact bloat the repository. Runtime state (SQLite database) is version-controlled, making it impossible to have clean production/staging database separation.  
**Evidence:** `git ls-files` shows all these files tracked. `git rm --cached` has never been run.  
**Effort to fix:** 0.5 days

### C-04: No Dashboard Deployment Documentation
**Category:** Production Readiness  
**Files:** `docs/engineering/` (all), `gbp-monitor/docs/deployment/DEPLOYMENT_GUIDE.md`  
**Risk:** Only the Python scraper subsystem has deployment documentation. The Next.js dashboard deployment (standalone build, Caddy reverse proxy, environment configuration, startup, shutdown, process management) has no documented procedure. A team member must reverse-engineer the build scripts and configuration to deploy.  
**Evidence:** All deployment guides live under `gbp-monitor/docs/deployment/` and only cover the scraper. The root `README.md` has a 3-line build/start section insufficient for production.  
**Effort to fix:** 2-3 days

### C-05: No Disaster Recovery Plan
**Category:** Production Readiness  
**Files:** Entirely missing from repository  
**Risk:** There is no documented procedure for recovering from: hardcoded path failures, snapshot data corruption, database corruption, Google Maps DOM change breaking the scraper, filesystem corruption, or complete system rebuild. The backup/restore guide only covers the scraper data and references scripts that do not exist.  
**Evidence:** No DR document exists in `docs/` or `gbp-monitor/docs/`.  
**Effort to fix:** 2-3 days

---

## High Priority Issues

### H-01: No Rate Limiting
**Category:** Security  
**Files:** All API routes, no middleware  
**Risk:** `POST /api/scrape/trigger` can be called unlimited times, spawning unbounded Python/Playwright browser processes and exhausting server resources. `PATCH /api/config/listings` can mutate configuration without restriction.  
**Effort to fix:** 0.5 days

### H-02: Missing Security Headers
**Category:** Security  
**Files:** `src/app/layout.tsx`, `next.config.ts`  
**Risk:** No `Content-Security-Policy` (XSS vulnerable), no `Strict-Transport-Security` (no HSTS), no `X-Frame-Options` (clickjacking), no `X-Content-Type-Options` (MIME sniffing), no `Referrer-Policy`, no `Permissions-Policy`. Zero security headers on any response.  
**Effort to fix:** 0.5 days

### H-03: Dangerous Next.js Configuration Defaults
**Category:** Production Readiness  
**File:** `next.config.ts`  
**Issues:**
- `typescript: { ignoreBuildErrors: true }` — production builds ship even with TypeScript errors, bypassing the type system entirely
- `reactStrictMode: false` — suppresses React development warnings that catch bugs early  
**Effort to fix:** 0.5 days (+ time to fix discovered TS errors)

### H-04: ESLint Disables All Rules
**Category:** Maintainability  
**File:** `eslint.config.mjs`  
**Issues:** `no-explicit-any: off`, `no-unused-vars: off`, `no-console: off`, `no-debugger: off`, `react-hooks/exhaustive-deps: off`. Zero code quality enforcement allows dead code, any-typed values, and debugging artifacts to reach production.  
**Effort to fix:** 1 day (re-enable rules + fix violations)

### H-05: No Offline / Network Error Detection
**Category:** User Experience  
**Files:** All `src/components/dashboard/*.tsx`, `src/app/page.tsx`  
**Risk:** No `navigator.onLine` checks, no `online`/`offline` event listeners, no fetch timeouts (`AbortSignal.timeout`). If the user's network drops, all fetch calls fail with unhelpful generic errors. No "You are offline" messaging.  
**Effort to fix:** 1 day

### H-06: No Dashboard Monitoring or Alerting Documentation
**Category:** Production Readiness  
**Files:** Entirely missing  
**Risk:** No health-check endpoint, no uptime monitoring, no error-rate tracking, no alerting configuration, no documented SLIs/SLOs. Operations staff have no way to detect or diagnose dashboard issues in production.  
**Effort to fix:** 2-3 days

### H-07: Filesystem Paths Exposed via API
**Category:** Security  
**Files:** `src/app/api/scrape/trigger/route.ts` (GET handler, error messages)  
**Risk:** The GET handler of `/api/scrape/trigger` returns `GBP_ROOT` (absolute filesystem path) and `process.platform`. Error messages throughout the route include the full `GBP_ROOT` path. An attacker can learn the server directory layout and OS platform.  
**Effort to fix:** 0.5 days

### H-08: No Timeout on Python Subprocess
**Category:** Error Handling  
**File:** `src/lib/gbp/scrape-runner.ts`  
**Risk:** The spawned Python scraper process has no maximum execution timeout. If the scraper hangs, it runs indefinitely. The `cleanup()` method only removes the entry from an in-memory Map after 5 minutes but does **not** kill the actual child process.  
**Effort to fix:** 0.5 days

### H-09: No Consumer-Facing API Documentation
**Category:** Production Readiness  
**Files:** Entirely missing  
**Risk:** The only API documentation is buried in `docs/01-audit/AUDIT-06-API-Routes.md` (an architecture audit, not consumer docs). No OpenAPI/Swagger spec, no Postman collection, no API reference. Integrators must read source code to understand request/response shapes.  
**Effort to fix:** 2-3 days

### H-10: Branch documentation uses old project name across 30+ files
**Category:** Maintainability
**Files:** `docs/research/` (3 files), `docs/management/` (7 files), `docs/01-audit/` (8 files), `docs/engineering/` (most), `gbp-monitor/README.md`, `gbp-monitor/docs/` (all documents), `worklog.md`
**Risk:** Continuing to reference old brand names instead of "Rother" causes confusion for new team members, creates brand inconsistency, and undermines the product identity work completed in M15.1.
**Effort to fix:** 1-2 days

---

## Medium Priority Issues

### M-01: No Prisma Migrations
**Files:** `prisma/schema.prisma`  
**Risk:** Uses `prisma db push` which can silently drop data in production. No `prisma/migrations/` directory exists. Schema changes cannot be version-controlled or reviewed.  
**Effort to fix:** 0.5 days

### M-02: Dual Lock Files Tracked
**Files:** `bun.lock` + `package-lock.json`  
**Risk:** Both Bun and npm lock files tracked. Only one package manager should be used. Dependency resolution conflicts possible.  
**Effort to fix:** 0.25 days

### M-03: No Input Validation on Snapshot Timestamps
**Files:** `src/lib/gbp/server-data.ts` (readSnapshotAt), `src/app/api/history/compare/route.ts`  
**Risk:** Timestamps from URL parameters are used directly in filesystem paths after colon-to-hyphen replacement. No validation against expected format (`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$`). Competitor IDs used in `path.join()` without validation against known competitors.  
**Effort to fix:** 0.5 days

### M-04: Duplicate Data Fetching
**Files:** Multiple components independently fetch `/api/history` (run-history-timeline, review-recency-heatmap, run-comparison-card) and `/api/reviews` (review-word-cloud, review-language-distribution) with identical parameters.  
**Risk:** Wasted bandwidth and increased server load. Could cause rate-limiting issues in production.  
**Effort to fix:** 1 day

### M-05: No Request Caching or Deduplication
**Files:** All components use raw `fetch()` with no caching layer. `QueryProvider` from TanStack Query is configured in layout but never used.  
**Risk:** Every component re-fetches data on every render/mount. No stale-while-revalidate, no request deduplication, no cache invalidation strategy.  
**Effort to fix:** 0.5 days

### M-06: In-Memory Scrape Run State (Lost on Restart)
**Files:** `src/lib/gbp/scrape-runner.ts`  
**Risk:** All running/completed scrape state is held in a module-level Map. Server restart (deployment, crash, scaling) loses all in-progress and completed run state. Frontend status polling breaks.  
**Effort to fix:** 1 day

### M-07: No `.env.example` File
**Files:** Entirely missing  
**Risk:** No documented template for required environment variables. New deployers must read source code to discover `GBP_ROOT`, `DATABASE_URL`, etc.  
**Effort to fix:** 0.25 days

### M-08: `dangerouslySetInnerHTML` with Incomplete Escaping
**Files:** `src/components/dashboard/config-section.tsx`  
**Risk:** JSON syntax highlighting uses `dangerouslySetInnerHTML`. While `&`, `<`, `>` are escaped, single quotes, backticks, and other dangerous characters are not. If config JSON contains attacker-controlled data, this is an XSS vector.  
**Effort to fix:** 0.5 days

### M-09: Prisma SQL Query Logging in Production
**Files:** `src/lib/db.ts`  
**Risk:** `new PrismaClient({ log: ['query'] })` logs all SQL queries to stdout in production, leaking database structure and data values through logs.  
**Effort to fix:** 0.25 days

### M-10: No Accessibility Skip-to-Content Link
**Files:** `src/app/layout.tsx`  
**Risk:** Keyboard and screen-reader users must tab through the entire header before reaching main content. No skip navigation link exists.  
**Effort to fix:** 0.25 days

### M-11: No `prefers-reduced-motion` Support
**Files:** All components using `framer-motion`  
**Risk:** All animations run unconditionally, potentially causing discomfort for users with vestibular disorders.  
**Effort to fix:** 0.5 days

### M-12: Inconsistent Toast Notification Patterns
**Files:** `src/app/page.tsx`  
**Risk:** `fetchBranches` errors do not show a toast while `fetchOverview` errors do. Initial selectors fetch silently swallows errors. Users may not notice silent failures.  
**Effort to fix:** 0.25 days

---

## Low Priority Issues

### L-01: Predictable Run ID (8 hex chars)
**Files:** `src/lib/gbp/scrape-runner.ts`  
**Risk:** `randomUUID().slice(0, 8)` provides only 32 bits of entropy. Trivially brute-forceable (65536 combinations). Combined with no rate limiting, an attacker could enumerate active run IDs.  
**Effort to fix:** 0.1 days

### L-02: Sequential `await` in Loops (Performance)
**Files:** `src/app/api/overview/route.ts`, `src/app/api/branches/route.ts`, `src/app/api/export/competitors/route.ts`, `src/app/api/export/branches/route.ts`  
**Risk:** These routes iterate over competitors sequentially and `await` each `readLatestDelta()` call. I/O is serialized when it could run in parallel via `Promise.all()`. Performance degrades linearly with competitor count.  
**Effort to fix:** 0.25 days

### L-03: Git History with 15 UUID Commits
**Files:** Git log  
**Risk:** Commit messages like `cb0022a9-0851-4b17-aa06-14e03e48c150` make history unreadable. Cannot trace which commits correspond to which features or fixes.  
**Effort to fix:** 0.5 days (squash/rebase)

### L-04: No 404 Page (`not-found.tsx`)
**Files:** Missing from `src/app/`  
**Risk:** Users who navigate to non-existent routes see the default Next.js 404, which is unstyled and inconsistent with the Rother design system.  
**Effort to fix:** 0.25 days

### L-05: File Read Errors Silently Swallowed with No Server-Side Logging
**Files:** `src/lib/gbp/server-data.ts`  
**Risk:** `readJsonFile` catches all read/parse errors and returns the fallback value with no server-side logging. Corrupt data goes undetected. Production debugging is harder.  
**Effort to fix:** 0.25 days

### L-06: `window.history.pushState` Monkey-Patched
**Files:** `src/hooks/use-app-mode.ts`  
**Risk:** Global side-effect intercepting browser history API can conflict with other libraries or Next.js internals. Cleanup restores original but ordering conflicts possible.  
**Effort to fix:** 0.5 days

### L-07: No CORS Configuration
**Files:** All API routes, `Caddyfile`  
**Risk:** If the API is ever accessed cross-origin (separate frontend), all browser requests will be blocked. No `Access-Control-Allow-Origin` header set anywhere.  
**Effort to fix:** 0.25 days

---

## Recommendations by Category

### Repository Hygiene (6 items)
1. **Purge tracked runtime/artifact files** — `git rm --cached .env db/custom.db data/run.log gbp-monitor/data/run.log "Rother - 0.0.1" tool-results/ _audit_reviews_output.json .zscripts/dev.pid` and add them to `.gitignore`
2. **Remove gbp-monitor ZIP backup** from git tracking
3. **Remove nested git artifact** (`Rother - 0.0.1`)
4. **Remove duplicate lock file** — choose Bun or npm, remove the other
5. **Add `.env.example`** with documented environment variables
6. **Fix dual lock files** — commit only one lock file

### Production Readiness (9 items)
1. **Write dashboard deployment guide** covering: standalone build, Caddy config, environment variables, startup/shutdown, process management, health checks, logging
2. **Write disaster recovery plan** covering: snapshot corruption, database corruption, scraper failure, DOM change, filesystem loss, complete rebuild
3. **Add health-check endpoint** (`GET /api/health` returning system status)
4. **Add monitoring documentation** with SLIs/SLOs, alerting thresholds, runbook references
5. **Write upgrade/migration guide** for the dashboard covering cross-version compatibility
6. **Write consumer-facing API documentation** (OpenAPI/Swagger or equivalent)
7. **Fix `next.config.ts`** — remove `ignoreBuildErrors: true`, enable `reactStrictMode: true`
8. **Add `.env.example`** and document `GBP_ROOT` in README
9. **Re-enable ESLint rules** and fix violations

### Error Handling (8 items)
1. **Add `error.tsx` and `global-error.tsx`** to `src/app/`
2. **Add process timeout** to `scrape-runner.ts` — kill hung Python processes after a configurable duration
3. **Add server-side logging** to `readJsonFile` for silent failures
4. **Add input validation** for snapshot timestamps and competitor IDs
5. **Add fetch timeouts** with `AbortSignal.timeout()` on all client-side fetch calls
6. **Add offline detection** with `navigator.onLine` and `online`/`offline` event listeners
7. **Fix inconsistent toast behavior** — ensure all error paths show notifications
8. **Remove `log: ['query']` from PrismaClient** in production

### Security (5 items)
1. **Implement authentication** — NextAuth.js or API key guard on all routes
2. **Add rate limiting** — at minimum on `/api/scrape/trigger` and `/api/config/listings`
3. **Add security headers** — CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy via `next.config.ts` `async headers()`
4. **Strip filesystem paths** from API responses and error messages
5. **Replace `dangerouslySetInnerHTML`** with safe rendering or complete escaping

### Maintainability (5 items)
1. **Fix branch documentation** — rename "GBP Monitor" → "Rother" across all 30+ documents
2. **Add Prisma migrations** — initialize with `prisma migrate dev`
3. **Parallelize I/O** — replace sequential `await` loops with `Promise.all()`
4. **Add React strict mode** and fix any double-render issues
5. **Remove monkey-patched `pushState`** — find alternative approach for URL parameter management

### User Experience (4 items)
1. **Add skip-to-main-content link** for accessibility
2. **Add `prefers-reduced-motion`** support to all framer-motion animations
3. **Add `loading.tsx`** for route-level loading state
4. **Add `not-found.tsx`** for custom 404 page

---

## Estimated Total Effort

| Category | Effort (days) |
|---|---|
| Repository Hygiene | 1 |
| Production Readiness | 8 |
| Error Handling | 3 |
| Security | 5 |
| Maintainability | 2 |
| User Experience | 1 |
| **Total** | **~20 days** |

---

## Recommended Implementation Order

### Phase 1 — Safety Gates (Days 1-3)
These are non-negotiable for any production deployment:

1. **C-03**: Purge tracked runtime/artifact files from git (0.5 day)
2. **C-01**: Implement authentication on all API endpoints (3 days)
3. **H-01**: Add rate limiting (0.5 day)
4. **H-02**: Add security headers (0.5 day)
5. **H-03**: Fix `next.config.ts` dangerous defaults (0.5 day)
6. **C-02**: Add React error boundaries (0.5 day)
7. **H-08**: Add process timeout to scraper runner (0.5 day)

### Phase 2 — Operational Foundations (Days 3-8)
8. **C-04**: Write dashboard deployment guide (2-3 days)
9. **C-05**: Write disaster recovery plan (2-3 days)
10. **H-06**: Add dashboard monitoring + alerting documentation (2-3 days)

### Phase 3 — Hardening (Days 8-13)
11. **H-04**: Re-enable ESLint rules + fix violations (1 day)
12. **M-03**: Add input validation for timestamps and competitor IDs (0.5 day)
13. **M-08**: Fix `dangerouslySetInnerHTML` XSS vector (0.5 day)
14. **M-09**: Remove Prisma SQL query logging in production (0.25 day)
15. **H-05**: Add offline detection + fetch timeouts (1 day)
16. **M-05**: Implement request caching/deduplication (0.5 day)
17. **M-01**: Initialize Prisma migrations (0.5 day)

### Phase 4 — Polish (Days 13-17)
18. **H-07**: Strip filesystem paths from API responses (0.5 day)
19. **H-10**: Rename "GBP Monitor" → "Rother" across 30+ documents (1-2 days)
20. **M-02**: Remove duplicate lock file (0.25 day)
21. **M-04**: Eliminate duplicate data fetching (1 day)
22. **M-06**: Persist scrape run state (1 day)
23. **M-10, M-11, M-12**: Accessibility + toast consistency (1 day)

### Phase 5 — Housekeeping (Days 17-20)
24. **L-01 through L-07**: All low-priority items (2 days)
25. **M-07**: Add `.env.example` (0.25 day)
26. **H-09**: Write consumer-facing API documentation (2-3 days)

---

## Summary

Rother has strong foundations — excellent architecture documentation, a consistent component system, comprehensive loading/empty/error states in the UI, and a well-structured codebase. However, it is missing critical production requirements: authentication, error boundaries, operational documentation, disaster recovery planning, and basic security hardening. The estimated 20 days of work across 5 phases will bring the system from its current Alpha/2.5 readiness to a state suitable for pilot deployment with real users.
