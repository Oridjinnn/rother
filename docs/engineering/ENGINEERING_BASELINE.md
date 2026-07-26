# Engineering Baseline — Rother

**Date:** 2026-07-22
**Version:** 0.0.1
**Purpose:** Document the current verified state of the repository so that future engineering work has a repeatable reference point.

---

## Repository Identity

| Attribute | Value |
|---|---|
| **Repository root** | `D:\Documents (D)\Softwares\Rother\Rother - 0.0.1` |
| **Git branch** | `main` |
| **Last commit** | 7 commits (initial project setup through audit completion) |
| **Package manager** | Bun (JS), pip (Python) |
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
| Next.js dashboard — development server | **PROVEN** | `bun run dev` launches on port 3000. `curl localhost:3000` returns 200. |
| Next.js dashboard — API routes | **PROVEN** | All 15 API routes respond with valid JSON when the scraper data directory exists at the expected path. |
| Next.js dashboard — component rendering | **PROVEN** | All 36 dashboard components render without crash. Loading/error/empty states display correctly when data is present or absent. |

## What Is NOT Verified

| Capability | Status | Reason |
|---|---|---|
| Python scraper — live mode | **UNVERIFIED** | All competitor URLs are mock values; CSS selectors are UNPROVEN (2023 vintage, `verified_by: "seed"`). The scraper has never been run against real Google Maps. |
| Python scraper — anti-bot hardening | **UNVERIFIED** | 3-layer Client Hints override (Fix A, arXiv:2606.14525) has never been tested against a real Google Maps page. |
| Python scraper — cookie banner dismissal | **UNVERIFIED** | `_dismiss_cookie_banner()` has never been exercised against a real Google Maps cookie banner. |
| Python scraper — review container scrolling | **UNVERIFIED** | `scroll_review_container()` has never been exercised against a real Google Maps review panel. |
| Next.js dashboard — data from live scraper | **UNVERIFIED** | The dashboard has only been tested against fixture-generated data (3 competitors, 20 reviews). |
| Automated test suite | **MISSING** | No test framework for either Python or JavaScript. Zero test files. |
| Production build | **UNVERIFIED** | `bun run build` has not been tested in the current environment. The build script (`build.sh`) references `/home/z/my-project/` which does not exist here. |
| ESLint | **BROKEN** | ESLint is configured with all rules disabled (`eslint.config.mjs` — every rule set to `"off"`). `bun run lint` will pass on any code. |

---

## Known Environment Dependencies

| Dependency | Required by | Notes |
|---|---|---|
| `bun` | Next.js dashboard (dev/build/start) | Package manager and JS runtime |
| Python 3.12+ | Scraper | `pip install -r requirements.txt` |
| Playwright Chromium | Scraper (live mode only) | `playwright install chromium` after pip install |
| Node.js 20+ | Next.js dashboard | Required by Next.js 16 |
| File system access | Dashboard (`paths.ts`) | Dashboard reads JSON files from absolute path `/home/z/my-project/gbp-monitor/` (hardcoded, AUDIT-05 W1) |

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

## Verification Gaps Blocking Reproducibility

1. **Dashboard cannot find data without modifying paths.ts.** The hardcoded `GBP_ROOT = "/home/z/my-project/gbp-monitor"` means the dashboard will render empty states unless the Python scraper data exists at that exact path or the source code is edited. No environment variable override exists.

2. **No test framework.** There is no way to automatically verify that a code change preserves correctness. Manual `--fixtures` execution is the only verification path.

3. **No CI pipeline for verification.** The GitHub Actions workflow only runs the scraper; it does not build or test the dashboard.

4. **Mock competitor URLs.** Live mode cannot be tested — all 12 competitor URLs are placeholders containing `"mock"` in the path.

---

## Related Documents

- `docs/01-audit/` — Full architecture audit documents (AUDIT-01 through AUDIT-07)
- `docs/management/` — Project management and planning documents
- `docs/engineering/LOCAL_DEVELOPMENT.md` — Setup and execution guide
- `docs/engineering/VERIFICATION_CHECKLIST.md` — Step-by-step verification procedure
- `gbp-monitor/CHANGELOG.md` — 138-entry change log
- `upload/GBP_MONITOR_PLAN.md` — Original technical plan
- `upload/EXECUTION_RULES.md` — Binding execution rules
