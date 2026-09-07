# Local Development Guide — Rother

**Date:** 2026-07-29
**Version:** 0.2.0

---

## Prerequisites

| Tool | Version | Verification command | Required by |
|---|---|---|---|
| Python | 3.12+ | `python --version` | Scraper (`gbp-monitor/`) |
| pip | (any) | `pip --version` | Scraper dependencies |
| Node.js | 20+ | `node --version` | Next.js dashboard |
| npm | 10+ | `npm --version` | JS package manager |
| Playwright Chromium | (bundled) | `playwright install --dry-run chromium` | Scraper live mode only |

**Optional:**
- `curl` — for health-checking the dashboard
- `gh` (GitHub CLI) — for workflow management

---

## Setup

### 1. Clone the Repository

```bash
git clone <repo-url> rother
cd rother
```

### 2. Python Scraper Dependencies

```bash
cd gbp-monitor
pip install -r requirements.txt
playwright install chromium    # only needed for live mode
cd ..
```

Expected output:
- `pip install` downloads `playwright`, `parsel`, `requests`
- `playwright install chromium` downloads ~150MB Chromium binary

### 3. JavaScript Dashboard Dependencies

```bash
npm install
```

Expected output:
- `npm install` installs all ~90 npm packages from `package.json`
- `node_modules/` created at project root

### 4. Database (Optional — Not Used by Dashboard)

```bash
npm run db:push
```

This creates `db/custom.db` (SQLite). The dashboard reads JSON files, not the database. This step is only needed if you plan to work with Prisma.

### 5. Environment Variables

Create a `.env` file (or edit the existing one):

```env
# Optional: override scraper data root (defaults to <project>/gbp-monitor)
# GBP_ROOT=C:\path\to\gbp-monitor
```

**Note:** `GBP_ROOT` resolves via:
1. `GBP_ROOT` environment variable, or
2. `process.cwd() + "/gbp-monitor"` (project root in development)

---

## Execution Sequence

### Run the Scraper (Fixtures Mode)

This is the primary way to verify the scraper works without live Google Maps access:

```bash
cd gbp-monitor
python -m orchestration.run_all --fixtures
```

Expected output (JSONLOG format):
```
INFO:gbp-monitor.run_all JSONLOG: {"run_id":"...","stage":"run_start","mode":"fixtures"}
INFO:gbp-monitor.run_all JSONLOG: {"run_id":"...","stage":"listing_start","competitor":"comp-canggu-01"}
INFO:gbp-monitor.run_all NO_REVIEWS[comp-canggu-01]: HTML is N bytes
INFO:gbp-monitor.run_all JSONLOG: {"run_id":"...","stage":"listing_done","competitor":"comp-canggu-01",...}
INFO:gbp-monitor.run_all JSONLOG: {"run_id":"...","stage":"listing_result","progress":"1/12",...}
INFO:gbp-monitor.run_all JSONLOG: {"run_id":"...","stage":"run_summary","success":3,...}
INFO:gbp-monitor.run_all JSONLOG: {"run_id":"...","stage":"summary_written","path":"data/run_summary.json"}
```

Exit code: `0` (always — even on per-listing failures, per Rule 7).

Generated artifacts:
- `data/snapshots/comp-canggu-01.json` — 6 reviews
- `data/snapshots/comp-seminyak-01.json` — 7 reviews
- `data/snapshots/comp-ubud-01.json` — 7 reviews
- `data/reviews_new/comp-*_{timestamp}.json` — delta files (first run only)
- `data/run_summary.json` — run statistics
- `data/run.log` — append-only log

**Note on skipped listings:** Only 3 of 12 competitors have fixture files. The remaining 9 are skipped (not failures). See `gbp-monitor/tests/fixtures/` for the fixture inventory.

### Run the Dashboard (Development Mode)

```bash
npm run dev
```

Expected output:
```
▲ Next.js 16.x
- Local: http://localhost:3000
```

Open `http://localhost:3000` in a browser. The dashboard loads with the Overview tab active.

**If the dashboard shows all empty states:** The Python scraper data directory does not exist at the expected path. Either:
1. Set `GBP_ROOT` in `.env` to point to your `gbp-monitor` directory
2. Ensure a scraper run has completed to generate data files

### Run Both (End-to-End)

```bash
# Terminal 1: Start dashboard
npm run dev

# Terminal 2: Run scraper
cd gbp-monitor && python -m orchestration.run_all --fixtures

# Terminal 3: Verify dashboard sees data
curl http://localhost:3000/api/overview | python -m json.tool
```

### Trigger Scrape from Dashboard

With the dashboard running, POST to:

```bash
curl -X POST http://localhost:3000/api/scrape/trigger
```

This spawns `python -m orchestration.run_all --fixtures` (blocking, up to 60s).

---

## Available Commands

| Command | Location | Purpose |
|---|---|---|
| `python -m orchestration.run_all` | `gbp-monitor/` | Run scraper in live mode |
| `python -m orchestration.run_all --fixtures` | `gbp-monitor/` | Run scraper against fixture files |
| `npm run dev` | Project root | Start Next.js dev server (port 3000) |
| `npm run build` | Project root | Production build (standalone) |
| `npm run start` | Project root | Start production server |
| `npm run lint` | Project root | Run ESLint |
| `npm run db:push` | Project root | Push Prisma schema to SQLite |

---

## Expected Outputs

### Scraper (Fixtures Mode)

| Output | Path | Content |
|---|---|---|
| Snapshots | `gbp-monitor/data/snapshots/{comp_id}.json` | Full list of `Review` dicts per competitor |
| Deltas | `gbp-monitor/data/reviews_new/{comp_id}_{ts}.json` | New reviews only (first run = all reviews) |
| Run summary | `gbp-monitor/data/run_summary.json` | `{ success, failed, skipped, new_reviews, total_reviews, errors }` |
| Run log | `gbp-monitor/data/run.log` | Append-only text log with timestamps |

### Dashboard

| Output | Location | Content |
|---|---|---|
| Dev server | `http://localhost:3000` | Full dashboard UI |
| API overview | `GET /api/overview` | Aggregated KPIs, rating distribution, alerts |
| API branches | `GET /api/branches` | Branch × competitor tree |
| API reviews | `GET /api/reviews?page=1&pageSize=10` | Paginated reviews |

---

## Troubleshooting

| Problem | Likely cause | Solution |
|---|---|---|
| `command not found: npm` | Node.js/npm not installed | Install Node.js from https://nodejs.org |
| `ModuleNotFoundError: playwright` | Python deps not installed | `cd gbp-monitor && pip install -r requirements.txt` |
| `SelectorNotFoundError` in fixtures mode | Fixture file missing for competitor | Check `gbp-monitor/tests/fixtures/{comp_id}.html` exists |
| Dashboard shows empty/zero states | `GBP_ROOT` path mismatch | Edit `src/lib/gbp/paths.ts` or symlink directory |
| Dashboard API returns 500 | Data file corrupt or missing | Check `data/run_summary.json` and `data/snapshots/` exist |
| `Port 3000 already in use` | Another process on port 3000 | Kill the process or edit `package.json` dev port |

---

## Reference

- `docs/01-audit/` — Complete architecture audits (7 documents)
- `docs/management/` — Project management, risk register, milestone plan
- `gbp-monitor/CHANGELOG.md` — Detailed change history (138 entries)
- `upload/GBP_MONITOR_PLAN.md` — Original technical plan
- `upload/EXECUTION_RULES.md` — Binding project rules
