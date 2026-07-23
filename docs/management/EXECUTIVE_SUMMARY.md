# Executive Summary — Rother (GBP Monitor)

**Date:** 2026-07-22
**Version:** 0.0.1
**Prepared from:** Architecture Audits AUDIT-01 through AUDIT-07

---

## Project Description

Rother (internally "GBP Monitor") is a **zero-cost competitor review monitoring system** built for Copenhagen Bali, a coffee shop chain with 6 branches in Bali. It monitors Google Business Profile reviews for 12 competitor businesses (2 per branch), detects new reviews via daily delta computation, and visualizes results in a rich Next.js dashboard.

The system operates across two independent subsystems connected by JSON files on disk:

- **Python Scraper** (`gbp-monitor/`) — Playwright-based headless browser automation that captures Google Maps review panels, parses them into structured data, detects new reviews against prior snapshots, and persists results as JSON files.
- **Next.js Dashboard** (`src/`) — 15 API routes serving data from JSON files to 36 client-side React components, rendered as a tab-based single-page application with charts, KPIs, tables, and export features.

---

## Current Maturity

| Domain | Rating | Rationale |
|---|---|---|
| **Overall System** | **Alpha (3/10)** | Core pipeline demonstrated with fixtures but never run against live Google Maps. Zero test coverage. Hardcoded paths prevent deployment. No auth. |
| **Browser Harness** | **Alpha (2/10)** | Anti-bot hardening is evidence-based (arXiv) but unverified. All CSS selectors are 2023 vintage, marked UNPROVEN. Headed mode requires source edits. |
| **Parser** | **Alpha (3/10)** | Self-healing 5-tier locator is well-designed. Works against 3 hand-written fixtures. Never tested against real captured Google Maps HTML. 0% test coverage. |
| **Storage** | **Alpha (3/10)** | Atomic writes for snapshots (correct). Non-atomic writes for deltas/summary (risk). Empty-parse-wipes-snapshot vulnerability is a critical data-loss risk. |
| **Data Layer** | **Pre-Alpha (2/10)** | Hardcoded sandbox path prevents deployment. No schema validation at Python↔TS boundary. All errors silently swallowed. |
| **API Routes** | **Alpha (3/10)** | Uniform error handling, functional endpoints, but significant code duplication (~120 lines), no auth, no input validation, blocking subprocess call. |
| **Dashboard Components** | **Prototype (3/10)** | Consistent patterns, good loading/error/empty states. All 36 components are `"use client"` — no server components. TanStack Query installed but unused. |

**Overall: Alpha — 3/10.** The system is demonstrable with fixture data but not production-ready.

---

## Highest-Priority Risks

1. **Scraper selectors are UNPROVEN against live Google Maps** — Every CSS/XPath selector in `selectors.json` is marked `verified_by: "seed"` (never tested). When run in live mode, the scraper will almost certainly fail due to stale selectors (2023 vintage) or headless-bot detection. This is the single greatest risk to the project.

2. **Empty parser output permanently deletes all reviews** — If `parse_reviews()` returns an empty list (due to corrupt HTML, wrong selectors, or transient error), `save_snapshot(comp_id, [])` overwrites the prior snapshot with an empty array. All previously collected reviews for that competitor are permanently lost. There is no undelete, no backup, and no detection of this condition.

3. **Hardcoded sandbox path prevents deployment** — `GBP_ROOT = "/home/z/my-project/gbp-monitor"` is hardcoded in `paths.ts`. The dashboard cannot find data on any machine other than the original development sandbox. No environment variable override exists.

4. **No authentication on any API route** — The dashboard has zero access control. `next-auth` is installed but unconfigured. `POST /api/scrape/trigger` executes a Python subprocess with no authentication — an arbitrary code execution vector if exposed to the internet.

5. **Zero automated tests across entire codebase** — No test framework, no test files, no test commands for either Python or JavaScript subsystems. The only verification path is manual execution of `--fixtures` mode. 81 weaknesses and 51 debt items have been identified but cannot be caught by CI.

6. **Blocking subprocess call** — `spawnSync()` in `/api/scrape/trigger` blocks the Node.js event loop for up to 60 seconds, preventing all concurrent requests during a scrape.

---

## Strengths

1. **Zero-cost architecture** — No paid APIs, no AI/LLM, no database service. Operates entirely on GitHub Actions free tier and a self-hosted Node.js server. The project budget is effectively $0/month.

2. **Defensive error handling** — The dashboard never crashes. Every file read has a safe fallback. Every listing failure is isolated. The scraper exits 0 regardless of per-listing failures.

3. **Clean separation of concerns** — Python scraper and Next.js dashboard are independent subsystems sharing only JSON file formats. Each Python module has exactly one responsibility.

4. **Evidence-based anti-bot strategy** — The 3-layer Client Hints override is backed by arXiv:2606.14525 research, with self-consistent identity across HTTP headers, CDP, and JavaScript.

5. **Self-healing locator hierarchy** — The 5-tier CSS locator (arXiv:2603.20358) uses class-name-independent selectors for tiers 1–4, surviving Google DOM class renames.

6. **Consistent component architecture** — All 36 dashboard components follow the same patterns: loading (Skeleton), error (EmptyState), empty (EmptyState). Comprehensive state coverage throughout.

7. **Rich dashboard experience** — 30+ components, 8+ chart types, keyboard shortcuts, CSV/JSON export, dark mode, auto-refresh, dual dev/client mode — the UI punches well above its "Phase 1" label.

8. **Comprehensive documentation** — 1,300+ line worklog, 138-entry changelog, 7 architecture audit documents. The project has excellent traceability.

---

## Readiness for Implementation

**Not ready for production deployment.** Before the system can serve real competitive intelligence data, the following blocking issues must be resolved:

| # | Condition | Status | Blocking |
|---|---|---|---|
| 1 | Real competitor Google Maps URLs from client | ❌ Not obtained | Live scraper cannot run |
| 2 | CSS selectors verified against live Google Maps DOM | ❌ UNPROVEN | Capture will fail |
| 3 | Anti-bot hardening verified against real Google Maps | ❌ Never tested | Bot detection may block |
| 4 | Hardcoded `GBP_ROOT` path made configurable | ❌ Hardcoded | Dashboard cannot find data |
| 5 | Empty-parse-wipes-snapshot vulnerability fixed | ❌ Unpatched | Data loss risk |
| 6 | Authentication implemented | ❌ Not configured | Security risk |
| 7 | Automated test suite established | ❌ Missing | No regression safety net |

**Recommendation:** Begin with Milestone 1 (Verified Browser Capture) — obtain real competitor URLs, verify selectors against live Google Maps, and validate the anti-bot hardening. Everything else depends on the scraper working in production.
