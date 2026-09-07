# Engineering Baseline — Rother

**Date:** 2026-07-29
**Version:** 0.2.0
**Purpose:** Document the current verified state of the repository so that future engineering work has a repeatable reference point.

---

## Repository Identity

| Attribute | Value |
|---|---|
| **Repository root** | `D:\Documents (D)\Softwares\Rother\Rother - 0.0.1` |
| **Git branch** | `main` |
| **Last commit** | 7 commits (initial project setup through audit completion) |
| **Package manager** | npm (JS), pip (Python) |
| **Runtime** | Node.js 20+ (Next.js), Python 3.12+ (scraper) |

---

## What Is Verified

The following has been confirmed to work as of the baseline date:

| Capability | Status | How verified |
|---|---|---|
| Python scraper — fixtures mode | **PROVEN** | `python -m orchestration.run_all --fixtures` produces 3 snapshots (20 reviews), 3 delta files, 1 run summary, and 1 run log. Exit code 0. |
| Python scraper — parser | **PROVEN** | `parse_reviews()` correctly extracts all 7 fields from 3 fixture HTML files. All locator tiers produce matches. |
| Python scraper — delta detection | **PROVEN** | `compute_new_reviews()` correctly computes set-diff on `review_id`. First run produces delta = full snapshot; second run produces delta = empty. |
| Python scraper — atomic snapshot writes | **PROVEN** | `save_snapshot()` uses `.tmp` + `Path.replace()` pattern. |
| Next.js dashboard — development server | **PROVEN** | `npm run dev` launches on port 3000. `curl localhost:3000` returns 200. |
| Next.js dashboard — API routes | **PROVEN** | All 21 API routes respond with valid JSON when the scraper data directory exists at the expected path. |
| Next.js dashboard — component rendering | **PROVEN** | All 36 dashboard components render without crash. Loading/error/empty states display correctly when data is present or absent. |

## What Is NOT Verified

| Capability | Status | Reason |
|---|---|---|
| Python scraper — live mode | **UNVERIFIED** | All competitor URLs are mock values; CSS selectors are UNPROVEN (2023 vintage, `verified_by: "seed"`). The scraper has never been run against real Google Maps. |
| Python scraper — anti-bot hardening | **UNVERIFIED** | 3-layer Client Hints override (Fix A, arXiv:2606.14525) has never been tested against a real Google Maps page. |
| Python scraper — cookie banner dismissal | **UNVERIFIED** | `_dismiss_cookie_banner()` has never been exercised against a real Google Maps cookie banner. |
| Python scraper — review container scrolling | **UNVERIFIED** | `scroll_review_container()` has never been exercised against a real Google Maps review panel. |
| Next.js dashboard — data from live scraper | **UNVERIFIED** | The dashboard has only been tested against fixture-generated data (3 competitors, 20 reviews). |
| Automated test suite | **PROVEN** | 34 tests across 2 test files (Vitest). Covers format parsing, health-trend JSONLOG parser. |
| Production build | **PROVEN** | `npm run build` compiles successfully via cross-platform `build.mjs`. Verified on Windows. |
| ESLint | **PROVEN** | 0 errors, 0 warnings. Re-enabled in H-04 with 37 errors + 43 warnings fixed across 39 source files. |

---

## Known Environment Dependencies

| Dependency | Required by | Notes |
|---|---|---|
| `npm` | Next.js dashboard (dev/build/start) | Package manager |
| Python 3.12+ | Scraper | `pip install -r requirements.txt` |
| Playwright Chromium | Scraper (live mode only) | `playwright install chromium` after pip install |
| Node.js 20+ | Next.js dashboard | Required by Next.js 16 |
| File system access | Dashboard (`paths.ts`) | Dashboard reads JSON files from `GBP_ROOT` (env var or `cwd`/gbp-monitor) |

---

## Baseline Artifacts

After running `python -m orchestration.run_all --fixtures`, the following artifacts are produced:

```
gbp-monitor/
├── data/
│   ├── snapshots/
│   │   ├── comp-canggu-01.json       (6 reviews, ~2.4 KB)
│   │   ├── comp-seminyak-01.json     (7 reviews, ~2.9 KB)
│   │   └── comp-ubud-01.json         (7 reviews, ~2.8 KB)
│   ├── reviews_new/
│   │   ├── comp-canggu-01_{ts}.json  (6 reviews, first run only)
│   │   ├── comp-seminyak-01_{ts}.json(7 reviews, first run only)
│   │   └── comp-ubud-01_{ts}.json    (7 reviews, first run only)
│   ├── run_summary.json              (run stats, overwritten each run)
│   └── run.log                       (append-only log)
```

Expected `run_summary.json` shape:
- `mode: "fixtures"`
- `success: 3` (only 3 of 12 competitors have fixtures)
- `failed: 0`
- `skipped: 9` (remaining competitors without fixture files)
- `new_reviews`: depends on whether snapshots existed before

---

## Remaining Verification Gaps

1. **No CI pipeline for verification.** The GitHub Actions workflow only runs the scraper; it does not build or test the dashboard. This is a process gap, not a code gap.

2. **Mock competitor URLs.** Live mode cannot be tested — all 12 competitor URLs are placeholders. Real `place_id` values required for production live scraping.

**Resolved gaps:**
- Hardcoded GBP_ROOT → replaced with env var `GBP_ROOT` (or cwd fallback) in `paths.ts` — Architecture Refactor 02
- No test framework → 34 tests, 2 test files
- ESLint broken → 0 errors, 0 warnings

---

## Stable Scope & Invariants (post Execution Prompt B)

The following behaviors are part of the **stable** product contract as of the
"user business + category + Run gate" increment (Execution Prompt B). They are
intentionally minimal on the frontend and rely on deferred backend work (see
`MASTER_RISK_REGISTER.md` RISK-028).

| Capability | Status | Notes |
|---|---|---|
| User business selection (name + location) | **STABLE** | Captured at onboarding, stored in `localStorage`; gated by `src/lib/app-state.tsx` |
| Category dimension | **STABLE** | `src/lib/categories.ts` picker; persisted with the business and sent to the scrape trigger |
| Run gate (hubs hidden until Run) | **STABLE** | `runStarted` in `src/lib/app-state.tsx`; re-selecting a business resets the gate |
| Live scrape of the user's own business | **DEFERRED** | `POST /api/scrape/trigger` persists the business to `user-business.json` but actual arbitrary-business scraping is not yet supported (RISK-023 / RISK-028) |

### Invariant — "user only sees own business"

The dashboard MUST scope exclusively to the user's selected business. Enforced
at the data layer: `readListings()` (`src/lib/gbp/server-data.ts`) returns
`{ branches: [] }` once `user-business.json` exists, so the seeded **Copenhagen
Bali** demo (`isSeeded: true` in `listings.json`) can never appear in the UI.
Any change that causes the seed demo to render in the dashboard is a regression
of this invariant.

---

## Related Documents

- `docs/01-audit/` — Full architecture audit documents (AUDIT-01 through AUDIT-07)
- `docs/management/` — Project management and planning documents
- `docs/engineering/LOCAL_DEVELOPMENT.md` — Setup and execution guide
- `docs/engineering/VERIFICATION_CHECKLIST.md` — Step-by-step verification procedure
- `gbp-monitor/CHANGELOG.md` — 138-entry change log
- `upload/GBP_MONITOR_PLAN.md` — Original technical plan
- `upload/EXECUTION_RULES.md` — Binding execution rules
