# Product Readiness Report — Rother (GBP Monitor)

**Date:** 2026-07-24
**Version:** 0.0.1
**Milestone:** M7 — Production Validation Audit
**Status:** PRE-PRODUCTION — Not ready for v1.0

---

## Executive Summary

Rother (GBP Competitor Review Monitor) has a solid, well-tested core architecture.
The scraper pipeline (capture → parse → store → delta → dashboard) works correctly
for fixture data. 67/67 baseline tests pass. The dashboard renders 20 reviews across
3 competitors with correct metrics.

**However, the product is not ready for v1.0.** Three critical blockers exist:

1. **11/12 competitors are mock** — only `comp-canggu-01` has a real Google Maps
   `place_id`. The system cannot be validated against real data for 91% of configured
   competitors.
2. **Live capture is untested** — all verification is in `--fixtures` mode. The
   anti-bot hardening, scroll logic, cookie banner dismissal, and Playwright capture
   pipeline have never been tested against real Google Maps for most competitors.
3. **Test coverage is 25%** — only 3/12 competitors have HTML fixtures.

---

## Section 1: Current Maturity

| Domain | Maturity | Evidence |
|--------|----------|----------|
| Scraper (fixtures) | **PRODUCTION** | 67/67 tests pass, 3 successful fixture runs |
| Scraper (live) | **ALPHA** | Never tested with real Google Maps for 11/12 competitors |
| Parser | **PRODUCTION** | 100% extraction on real capture (M5), golden dataset certified |
| Snapshot storage | **PRODUCTION** | Versioned with atomic writes, legacy fallback |
| Delta detection | **PRODUCTION** | First-run=all reviews, subsequent=0 correct |
| Dashboard API | **PRODUCTION** | 19 routes, all return valid JSON with correct data |
| Dashboard UI | **BETA** | Renders correctly but missing loading/empty states |
| Exports | **PRODUCTION** | CSV/JSON for all 4 export endpoints |
| Alerts | **PRODUCTION** | 4 alert types generated correctly |
| Selector tracking | **PRODUCTION** | 11/11 selectors verified, history with drift detection |
| Operational hardening | **PRODUCTION** | Lock file, signal handlers, atomic writes everywhere |
| CI/CD (GitHub Actions) | **UNVERIFIED** | Workflow exists but never executed in production |

---

## Section 2: Critical Blockers

### B1 — 11/12 Competitors Use Mock URLs

**Evidence:** `gbp-monitor/config/listings.json` contains `ChIJmock_*` place_ids
for all except `comp-canggu-01`.

```json
"gmaps_url": "https://www.google.com/maps/place/?q=place_id:ChIJmock_revolver_seminyak"
```

**Impact:** 91% of configured competitors never return real data. The dashboard
shows "0 reviews" without explaining that the competitor URL is mock. A real user
would think the scraper is broken.

**Fix:** Replace mock `place_id` values with real Google Maps `place_id` values
for all 12 competitors.

### B2 — Live Capture Never Tested

**Evidence:** All verification (M1–M7) performed in `--fixtures` mode. The
Playwright capture pipeline (`capture.py`, `scroll.py`, `browser.py`) has never
been tested end-to-end against real Google Maps for most competitors.

**Impact:** The following are unverified:
- Anti-bot hardening (3-layer Client Hints override)
- Cookie banner dismissal
- Reviews tab click
- Review container scroll (40 scrolls, stability detection)
- "More" button expansion for truncated reviews
- Network timeout handling in live mode
- Playwright Chromium download and launch

**Fix:** Perform a live capture run against all 12 competitors with real place_ids.
Document any failures.

### B3 — TypeScript Errors Ignored

**Evidence:** `next.config.ts`:
```typescript
typescript: { ignoreBuildErrors: true }
```

**Impact:** Type errors exist in the codebase but produce no build failures.
Runtime errors may surface in production that would have been caught at build time.

**Fix:** Run `npx tsc --noEmit` and fix all type errors. Remove
`ignoreBuildErrors: true`.

### B4 — React Strict Mode Disabled

**Evidence:** `next.config.ts`:
```typescript
reactStrictMode: false
```

**Impact:** Double-render checks in development are disabled. Side-effect bugs
and stale closure issues may go unnoticed.

**Fix:** Set `reactStrictMode: true` and fix any issues that surface.

### B5 — 25% Test Coverage

**Evidence:** Only 3/12 competitors have fixture files in `gbp-monitor/tests/fixtures/`.

```powershell
comp-canggu-01.html   (6 reviews)
comp-seminyak-01.html (7 reviews)
comp-ubud-01.html     (7 reviews)
```

**Impact:** 9/12 competitors are never tested. A parser regression affecting
any of the 9 untested competitors would go undetected.

**Fix:** Create fixture files for all 12 competitors.

---

## Section 3: High Priority Improvements

### H1 — Log Growth Unbounded

**File:** `gbp-monitor/data/run.log`

**Issue:** `run.log` is append-only with no rotation or size limit. After 10+
daily runs, this file will grow unbounded.

**Current size:** ~5 KB (7 runs)

**Fix:** Add log rotation in `run_all.py` (e.g., rotate at 1 MB, keep 5 backups).
Or add a cleanup step in the GitHub Actions workflow.

### H2 — No Health Check Endpoint

**File:** `src/app/api/`

**Issue:** No dedicated `/api/health` endpoint for monitoring tools (UptimeRobot,
cronitor, K8s probes). The root API (`/api/`) returns `{ "message": "Hello, world!" }`
but does not verify data accessibility.

**Fix:** Add `/api/health` that checks:
- `run_summary.json` exists and is recent (< 48h)
- `run.log` is accessible
- Selector report exists
- Returns 200/503 with detail

### H3 — Scrape Trigger Blocks API for 60 Seconds

**File:** `src/app/api/scrape/trigger/route.ts`

**Issue:** The POST handler spawns `python -m orchestration.run_all --fixtures`
synchronously and waits up to 60 seconds. This blocks the API route and may
cause timeout on the dashboard.

**Fix:** Use async subprocess with immediate HTTP 202 response. Poll for completion
via `/api/overview` or a dedicated `/api/scrape/status` endpoint.

### H4 — Prisma Schema Not Used by Dashboard

**File:** `prisma/schema.prisma`

**Issue:** The schema defines `User` and `Post` models (default Prisma scaffold).
The dashboard reads all data from JSON files, not the database. Prisma is a
dependency with no runtime value.

**Impact:** Confusing for new developers. `npx prisma db push` runs but creates
an unused SQLite database.

**Fix:** Either:
- Remove Prisma entirely (but check if next-auth needs it), OR
- Add a meaningful schema that stores scraper metadata/runs

### H5 — TanStack Query Available but Unused

**File:** `src/components/providers/query-provider.tsx`

**Issue:** `QueryProvider` wraps the app but all dashboard sections use manual
`fetch()` + `useState()` + `useEffect()` patterns. No caching, deduplication,
or stale-while-revalidate.

**Fix:** Replace manual fetch patterns with TanStack Query hooks. Start with
the Overview section (most complex data dependencies).

---

## Section 4: Medium Priority Improvements

### M1 — Missing Loading/Skeleton States

**Files:** `src/components/dashboard/*.tsx`

**Issue:** Most sections render "waiting for data..." text or blank states while
loading. No shimmer/skeleton components.

**Evidence:** `overview-section.tsx` shows "Loading overview..." during fetch.
The `Skeleton` UI component exists but is not used.

**Fix:** Add skeleton/shimmer loading states to all sections.

### M2 — Empty States Lack Explanation

**Issue:** 9/12 competitors show "0 reviews" with no explanation. A first-time
customer would not know these competitors use mock URLs.

**Fix:** In empty states, distinguish between:
- "No data yet (run scraper first)"
- "Competitor configured but not yet scraped"
- "Mock competitor (no real place_id configured)"

### M3 — TanStack Query Provider Unnecessary

**File:** `src/components/providers/query-provider.tsx`

**Issue:** `QueryProvider` is rendered in `layout.tsx` but no component uses
`useQuery` or `useMutation`. This adds bundle size with zero benefit.

**Fix:** Either remove QueryProvider or migrate to useQuery patterns (H5).

### M4 — Dashboard Uses Client-Side Rendering Exclusively

**Issue:** All API routes use `force-dynamic + no-store` and all data fetching
is client-side. The initial page load shows loading states for everything.

**Fix:** Use React Server Components or Next.js `fetch` cache for initial data
on the Overview section. Reserve client-side fetching for live updates.

### M5 — Dashboard Header Has Irrelevant UI

**File:** `src/components/dashboard/header.tsx`

**Issue:** "Add Branch", "Add Competitor" buttons exist but the only way to
configure competitors is via `config/listings.json` (JSON editor in Config tab)
or the Config API.

**Fix:** Remove non-functional buttons or hook them to the Config API.

### M6 — Stale `latest.tmp` Files

**Issue:** During M6 testing, a `latest.tmp` file was found in
`data/snapshots/comp-canggu-01/`. The atomic write pattern should clean up
these temp files.

**Fix:** In `_write_latest_pointer()`, cleanup any existing `.tmp` files in
the directory before writing.

### M7 — Pre-M5 Delta Files May Contain Duplicates

**Issue:** Delta files created before the M3.1 dedup fix may contain 33 entries
instead of 3 for comp-canggu-01. The dashboard reads deltas and may show
inflated counts.

**Fix:** Run a one-time dedup migration on all delta files in `data/reviews_new/`.

---

## Section 5: Low Priority Improvements

### L1 — No Rate Limiting on Scrape Trigger

**Issue:** POST to `/api/scrape/trigger` can be called arbitrarily. No rate
limiting or cooldown.

**Fix:** Add a 60-second cooldown between triggers (check lock file or in-memory
timestamp).

### L2 — No SEO / Metadata

**Files:** `src/app/layout.tsx`

**Issue:** No Open Graph tags, no meta description, no canonical URL.

### L3 — No Error Boundary

**Issue:** No React error boundary wrapping dashboard sections. A crash in one
section could take down the entire dashboard.

### L4 — ESLint Config Has Relaxed Rules

**File:** `eslint.config.mjs`

**Issue:** Many rules disabled or set to warn. Consider tightening for
production.

### L5 — `.env` Has Hardcoded Absolute Path

**File:** `.env`

**Content:** `DATABASE_URL=file:../db/custom.db`

**Issue:** The Prisma DATABASE_URL uses a relative path which may break
depending on working directory. Not a runtime issue since Prisma is unused.

---

## Section 6: Technical Debt

| Debt | Location | Impact |
|------|----------|--------|
| Manual fetch patterns | All dashboard sections | No caching, race conditions, duplicate requests |
| Hardcoded `--fixtures` in scrape trigger | `src/app/api/scrape/trigger/route.ts` | Cannot trigger live scrape from dashboard |
| Selector health computed in API route | `src/app/api/config/selectors/route.ts` | Should be computed at scrape time |
| `SelectorReport` interface duplicated | `src/app/api/alerts/route.ts:23-29` | Same type exists in `types.ts` |
| `page.tsx` is very large | ~400 lines, 7 tabs, keyboard shortcuts, timers | Should be split into smaller components |
| Fixture HTML uses `aria-label` for names | `tests/fixtures/*.html` | Real Google Maps may use different attribute |
| No delta file schema versioning | `data/reviews_new/*.json` | Cannot detect legacy formats |
| run_summary.json overwritten, not versioned | `data/run_summary.json` | Only latest run is stored |

---

## Section 7: Operational Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Real Google Maps changes DOM | Medium | High | Self-healing locator (5 tiers) + selector drift detection |
| Live Playwright capture fails | High | High | Only 3/12 competitors ever tested in live mode |
| GitHub Actions workflow broken | Medium | High | Never been executed in production |
| Anti-bot bypass fails | Medium | High | 3-layer hardening untested against real Google Maps |
| Chromium binary not available | Low | Medium | `playwright install chromium` step may fail |
| Log fills disk | Low (daily runs) | Low | No rotation — minor risk for daily cron |
| Lock file stale on Windows | Medium | Low | 30-minute stale detection handles this |
| Concurrent dashboard triggers | Low | Low | Lock file prevents but dash triggers is fixture-only |

---

## Section 8: Customer-Facing Risks

| Risk | Scenario | Impact | Mitigation |
|------|----------|--------|------------|
| Empty data distrust | User sees all zeros, thinks product broken | Churn | Add explanation text for empty states |
| Stale data shown as fresh | Run fails silently, old data persists | Misleading decisions | Add `freshness_badge` to overview (exists) |
| Mock data presented as real | 9/12 competitors show zero without explanation | Mistrust | Add mock indicator to competitor cards |
| Dashboard shows incorrect counts | Duplicate delta files inflate review counts | Wrong decisions | Run dedup migration on delta files |
| Scrape button gives no feedback | User clicks "Update Now", 60s wait, no progress indicator | Frustration | Return 202 immediately, add polling progress |

---

## Section 9: Roadmap Toward v1.0

### Phase 1: Live Data Validation (estimated: 1-2 days)
1. Obtain real Google Maps `place_id` for all 12 competitors
2. Run live capture against all 12
3. Document and fix any capture failures
4. Create fixture HTML from real captures for all 12

### Phase 2: Code Quality (estimated: 0.5 day)
1. Fix TypeScript errors (`npx tsc --noEmit`)
2. Enable React strict mode
3. Remove `ignoreBuildErrors: true`

### Phase 3: Operational Readiness (estimated: 1 day)
1. Add log rotation (max 1 MB, keep 5)
2. Add `/api/health` endpoint
3. Make scrape trigger async (HTTP 202 + polling)
4. Clean up pre-M5 delta duplicates

### Phase 4: UX Polish (estimated: 1 day)
1. Add skeleton loading states to all sections
2. Add empty state explanations for mock competitors
3. Migrate to TanStack Query for Overview section
4. Add error boundaries

### Phase 5: Documentation (estimated: 0.5 day)
1. Update VERIFICATION_CHECKLIST.md
2. Update LOCAL_DEVELOPMENT.md
3. Update README.md with accurate path info

### Phase 6: CI/CD Validation (estimated: 0.5 day)
1. Push GH workflow to a test branch
2. Verify cron trigger works
3. Verify concurrency control works

---

## Section 10: Verification Performed (M7)

### Phase 1 — E2E Workflow Validation

| Stage | Status | Evidence |
|-------|--------|----------|
| Application startup | ✅ | `npx next dev` — Compiled successfully in 4.8s |
| Scrape trigger | ✅ | POST `/api/scrape/trigger` — returns `ok: true`, 0.8s |
| HTML capture (fixtures) | ✅ | 3 competitors processed, 0 failures |
| Parsing | ✅ | 20 reviews from 3 fixtures, 100% extraction rate |
| Snapshot storage | ✅ | 3 versioned snapshots written atomically |
| Delta generation | ✅ | 3 delta files, first-run = all reviews |
| Dashboard refresh | ✅ | All API endpoints return current data |
| Historical comparison | ✅ | `/api/history` returns 1 run |
| Export | ✅ | CSV/JSON for reviews, competitors, branches, history |
| Alerts | ✅ | 4 alerts: 3 new_reviews + 1 selector_degradation |
| Shutdown | ✅ | Lock released, no stale tmp files |

### Phase 2 — Production Data Validation

| Metric | Source | Value | Status |
|--------|--------|-------|--------|
| Total reviews | `readAllSnapshots()` | 20 | ✅ |
| Avg rating | Computed from snapshots | 4.35 (20 reviews) | ✅ |
| Rating distribution | Computed from snapshots | 5:10, 4:7, 3:3 | ✅ |
| Branches | `listings.json` | 6 | ✅ |
| Competitors | `listings.json` | 12 | ✅ |
| New reviews (last run) | Delta files | 20 (first run) | ✅ |
| Run health | `run_summary.json` | 3 success, 0 failed | ✅ |
| Alerts | Computed from deltas | 4 active | ✅ |
| Selector health | `selector_report.json` | 2 healthy, 2 degraded, 7 not_evaluated | ✅ |
| Reviews/new reviews/timestamps | End-to-end trace | All consistent | ✅ |

### Phase 3 — Reliability Audit

| Check | Status | Detail |
|-------|--------|--------|
| Browser cleanup | ✅ (fixtures) | Browser not launched in fixtures mode |
| Memory leaks | ⚠️ (untested) | No profile taken during live capture |
| Temp file cleanup | ✅ | No stale `.tmp` files found |
| Log growth | ⚠️ (no rotation) | Unbounded — see H1 |
| Snapshot growth | ✅ | 3 snapshots, ~2 KB each |
| Retry behavior | ✅ | PageCrashError retried, timeout not retried |
| Interrupted execution | ✅ | SIGINT/TERM + atexit cleanup |
| Stale locks | ✅ | 30-minute threshold with WARNING |
| Consecutive runs | ✅ | Second run: 0 new reviews (correct) |

### Phase 4 — User Workflow Audit

| Check | Status | Notes |
|-------|--------|-------|
| First load | ⚠️ | Shows loading text, no skeleton |
| Overview KPIs | ✅ | 3 KPI cards render with correct data |
| Charts | ✅ | Rating distribution, new reviews per branch |
| Branches tab | ✅ | Accordion with competitor rows |
| Reviews tab | ✅ | Paginated table with filters |
| Alerts tab | ✅ | Color-coded severity |
| Export dialog | ✅ | 4 download options |
| Dark mode | ✅ | Theme toggle works |
| Auto-refresh | ✅ | 30s interval, pauses when hidden |
| Empty competitor | ⚠️ | Shows "0 reviews" without explanation |
| Error state | ⚠️ | Basic error message, no recovery action |

### Phase 5 — Deployment Audit

| Platform | Status | Evidence |
|----------|--------|----------|
| Windows (dev) | ✅ | Verified on Windows 10/11 |
| Linux (dev) | ⚠️ | Configuration references `start.sh`/`build.sh` |
| Clean clone | ⚠️ | `npm install` + `playwright install chromium` needed |
| Python setup | ✅ | `pip install -r requirements.txt` |
| Node setup | ✅ | `npm install` |
| Environment variables | ✅ | `.env` provided, `GBP_ROOT` env var available |
| Startup | ✅ | `npm run dev` |
| Shutdown | ✅ | Ctrl+C, lock released |

### Phase 6 — Documentation Audit

| Document | Status | Issues |
|----------|--------|--------|
| `README.md` (root) | ⚠️ | Outdated: references M3 features, no M5/M6 updates |
| `gbp-monitor/README.md` | ✅ | Accurate |
| `VERIFICATION_CHECKLIST.md` | ❌ | Stale: flat-file snapshots, AUDIT-01/02 refs, bun commands |
| `LOCAL_DEVELOPMENT.md` | ❌ | Stale: `/home/z/...` path, flat-file refs, bun commands |
| `ENGINEERING_BASELINE.md` | ⚠️ | Date 2026-07-22, likely outdated |
| `CHANGELOG.md` (gbp-monitor) | ✅ | Well-maintained, 138 entries |
| `certification_report.md` | ✅ | M5 report, still accurate |
| `operational_readiness_report.md` | ✅ | M6 report, still accurate |

---

## Section 11: Architecture Decisions

All architecture decisions from M1–M6 remain valid:

1. **File-based storage** (no database) — correct for single-instance deployment
2. **Versioned snapshots** — enables historical comparison
3. **Atomic writes** — prevents partial writes on crash
4. **Self-healing locator** — 5-tier fallback for DOM changes
5. **Failure isolation** — per-listing try/except, one failure cannot crash run
6. **File-based lock** — zero dependencies, PID + stale detection
7. **Structured JSON logging** — machine-parseable with human-readable fallback
8. **Golden dataset** — regression anchor for parser changes

No architecture changes are recommended at this time.

---

## Section 12: Files That Need Changes

| File | Change Needed | Priority | Reference |
|------|---------------|----------|-----------|
| `config/listings.json` | Real place_ids for 11/12 competitors | CRITICAL | B1 |
| `next.config.ts` | Remove `ignoreBuildErrors: true`, enable `reactStrictMode` | CRITICAL | B3, B4 |
| `tests/fixtures/*.html` | Create fixtures for all 12 competitors | CRITICAL | B5 |
| `orchestration/run_all.py` | Add log rotation | HIGH | H1 |
| `src/app/api/` | Add `/api/health` endpoint | HIGH | H2 |
| `src/app/api/scrape/trigger/route.ts` | Make async (HTTP 202) | HIGH | H3 |
| `prisma/schema.prisma` | Remove or add meaningful schema | HIGH | H4 |
| `src/components/dashboard/*.tsx` | Add skeleton loading states | MEDIUM | M1 |
| `src/app/api/overview/route.ts` | Distinguish empty states (mock vs real) | MEDIUM | M2 |
| `src/lib/gbp/paths.ts` | Ensure `GBP_ROOT` env var works on Windows | MEDIUM | docs |
| `storage/snapshot_store.py` | Clean stale `.tmp` files | MEDIUM | M6 |
| `docs/engineering/VERIFICATION_CHECKLIST.md` | Full rewrite for versioned layout | MEDIUM | docs |
| `docs/engineering/LOCAL_DEVELOPMENT.md` | Remove `/home/z/...` references, update paths | MEDIUM | docs |
| `README.md` (root) | Add M5/M6 feature references | LOW | docs |

---

## Section 13: Final Recommendation

**Rother v0.0.1 is VERIFIED in fixtures mode only.**

Do NOT ship v1.0 until:
1. All 12 competitors have real place_ids (B1)
2. Live capture is tested and passing (B2)
3. TypeScript strict mode is enabled (B3, B4)
4. Test coverage reaches 100% of competitors (B5)

Recommended next milestone: **M8 — Live Data Validation**

Focus:
- Obtain real Google Maps place_ids for all competitors
- Run and debug live capture
- Create fixtures from real captures
- Validate anti-bot hardening
- Document live capture results
