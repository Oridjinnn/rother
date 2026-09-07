# Verification Checklist — Rother

**Date:** 2026-07-22
**Purpose:** Step-by-step procedure for an engineer to verify the system is working correctly after a clean checkout or code change.

---

## How to Use

1. Start from a **clean checkout** of the repository.
2. Execute each verification step in order.
3. Mark each step as ✅ PASS or ❌ FAIL.
4. If any step fails, see the Troubleshooting section or report the issue.

---

## Phase 1: Repository Setup

### 1.1 Repository Integrity

- [ ] `git status` shows clean working tree (no uncommitted changes)
- [ ] `git log --oneline -5` shows expected commit history

### 1.2 Python Environment

- [ ] `python --version` outputs `Python 3.12.x` or later
- [ ] `pip --version` succeeds

### 1.3 Python Dependencies

```bash
cd gbp-monitor
pip install -r requirements.txt
```

- [ ] Command completes without error
- [ ] `python -c "import playwright; import parsel; import requests"` succeeds

### 1.4 JavaScript Environment

- [ ] `node --version` outputs `20.x` or later
- [ ] `npm --version` outputs `10.x` or later

### 1.5 JavaScript Dependencies

```bash
npm install
```

- [ ] Command completes without error
- [ ] `node_modules/` directory exists at project root
- [ ] `ls node_modules/next/` shows Next.js installed

---

## Phase 2: Scraper — Fixtures Mode

### 2.1 Clean Start (No Prior Data)

```bash
cd gbp-monitor
rm -rf data/snapshots data/reviews_new data/run.log data/run_summary.json
```

- [ ] Data directory cleaned

### 2.2 Run Scraper (First Run)

```bash
python -m orchestration.run_all --fixtures
```

- [ ] Exit code is `0`
- [ ] Log output shows: `=== run_all START mode=fixtures ===`
- [ ] Log output shows 3 listings processed (comp-canggu-01, comp-seminyak-01, comp-ubud-01)
- [ ] Log output shows 9 listings skipped
- [ ] Log output shows: `JSONLOG: {"stage":"run_summary", "mode": "fixtures", "success": 3, "failed": 0, "skipped": 9, ...}`
- [ ] No ERROR or WARNING in log output (ALERT is NOT triggered: `failed=0, success=3, skipped=9`)

### 2.3 Verify Output Artifacts

- [ ] `data/run_summary.json` exists and is valid JSON
- [ ] `data/run.log` exists and has content
- [ ] `data/snapshots/comp-canggu-01.json` exists
- [ ] `data/snapshots/comp-seminyak-01.json` exists
- [ ] `data/snapshots/comp-ubud-01.json` exists
- [ ] `data/reviews_new/` contains 3 delta files (one per competitor)

### 2.4 Verify Snapshot Content

```bash
python -c "
import json
for comp in ['comp-canggu-01', 'comp-seminyak-01', 'comp-ubud-01']:
    with open(f'data/snapshots/{comp}.json') as f:
        reviews = json.load(f)
    print(f'{comp}: {len(reviews)} reviews')
    for r in reviews:
        assert r.get('review_id'), f'Missing review_id in {comp}'
        assert r.get('competitor_id') == comp, f'Wrong competitor_id in {comp}'
        assert r.get('rating') is None or 1.0 <= r['rating'] <= 5.0, f'Invalid rating in {comp}'
    print(f'  All {len(reviews)} reviews validated OK')
print('All snapshots validated')
"
```

- [ ] Script runs without assertion errors
- [ ] Total review count is 20 (6+7+7)

### 2.5 Run Scraper (Second Run — No New Reviews Expected)

```bash
python -m orchestration.run_all --fixtures
```

- [ ] Exit code is `0`
- [ ] Run summary shows `new_reviews: 0`
- [ ] No new delta files created (existing deltas are from first run only)

### 2.6 Run Scraper (Verify Idempotency)

```bash
python -c "
import json
with open('data/run_summary.json') as f:
    s = json.load(f)
assert s['success'] == 3, f'Expected 3 successes, got {s[\"success\"]}'
assert s['failed'] == 0, f'Expected 0 failures, got {s[\"failed\"]}'
print(f'Run summary OK: {s[\"success\"]} success, {s[\"failed\"]} failed, {s[\"skipped\"]} skipped')
"
```

- [ ] Run summary shows consistent counts across runs

---

## Phase 3: Scraper — Delta Detection

### 3.1 Verify Delta Files Are Valid JSON

```bash
python -c "
import json
from pathlib import Path
for f in Path('data/reviews_new').glob('*.json'):
    reviews = json.loads(f.read_text())
    assert isinstance(reviews, list), f'{f.name} is not a list'
    print(f'{f.name}: {len(reviews)} reviews')
print(f'Total delta files: {len(list(Path(\"data/reviews_new\").glob(\"*.json\")))}')
"
```

- [ ] Each delta file is a valid JSON array
- [ ] Delta files contain correct competitor_id

### 3.2 Verify Delta Content Matches Snapshots (First Run)

On the first run, delta = full snapshot (old was empty). Verify one:

```bash
python -c "
import json
delta = sorted(Path('data/reviews_new').glob('comp-canggu-01_*.json'))
if delta:
    d = json.loads(delta[0].read_text())
    s = json.loads(Path('data/snapshots/comp-canggu-01.json').read_text())
    assert len(d) == len(s), f'Delta/snapshot size mismatch: {len(d)} vs {len(s)}'
    print('First-run delta matches snapshot size')
else:
    print('No delta file (second run has no new reviews)')
"
```

- [ ] First-run delta matches snapshot (or correctly empty on subsequent runs)

---

## Phase 4: Dashboard — Development Server

### 4.1 Start Dev Server

```bash
npm run dev
```

Wait for: `▲ Next.js 16.x` and `- Local: http://localhost:3000`

- [ ] Dev server starts without error
- [ ] No compilation errors in terminal output

### 4.2 Health Check

```bash
curl -fsS http://localhost:3000/ | head -5
```

- [ ] Returns HTTP 200
- [ ] Response contains HTML (not empty)

### 4.3 API Routes — Health

```bash
curl -s http://localhost:3000/api/ | python -m json.tool
```

- [ ] Returns `{ "message": "Hello, world!" }` (or the actual response)

### 4.4 API Routes — Overview

```bash
curl -s http://localhost:3000/api/overview | python -m json.tool
```

**Expected (if scraper data is accessible):**
```json
{
  "totalBranches": 6,
  "total_reviews": 20,
  "reviews_today": 0,
  ...
}
```

**Expected (if scraper data is NOT accessible — paths mismatch):**
```json
{
  "totalBranches": 0,
  "total_reviews": 0,
  ...
}
```

- [ ] API responds with valid JSON
- [ ] Status code is 200 (not 500)

### 4.5 API Routes — Branches

```bash
curl -s http://localhost:3000/api/branches | python -m json.tool
```

- [ ] Returns valid JSON array

### 4.6 API Routes — Reviews

```bash
curl -s 'http://localhost:3000/api/reviews?page=1&pageSize=10' | python -m json.tool
```

- [ ] Returns paginated reviews array

### 4.7 API Routes — History

```bash
curl -s http://localhost:3000/api/history | python -m json.tool
```

- [ ] Returns run history array (may be empty if no delta files with data)

### 4.8 API Routes — Logs

```bash
curl -s 'http://localhost:3000/api/logs?lines=10' | python -m json.tool
```

- [ ] Returns last 10 lines of run.log

### 4.9 API Routes — Config

```bash
curl -s http://localhost:3000/api/config/listings | python -m json.tool
curl -s http://localhost:3000/api/config/selectors | python -m json.tool
```

- [ ] Both return valid JSON

### 4.10 Stop Dev Server

```bash
kill $(lsof -ti:3000) 2>/dev/null || echo "Server not running"
```

- [ ] Server stops cleanly (port 3000 freed)

---

## Phase 5: Dashboard — Scrape Trigger

### 5.1 Start Dev Server (if not running)

```bash
npm run dev &
sleep 10
```

### 5.2 POST to Trigger

```bash
curl -s -X POST http://localhost:3000/api/scrape/trigger | python -m json.tool
```

Expected output:
```json
{
  "ok": true,
  "summary": {
    "mode": "fixtures",
    "success": 3,
    ...
  }
}
```

- [ ] Returns 200 with `{ "ok": true, ... }`
- [ ] Run summary shows expected stats

---

## Phase 6: Full Pipeline End-to-End

### 6.1 Clean State

```bash
cd gbp-monitor
rm -rf data/snapshots data/reviews_new data/run.log data/run_summary.json
```

- [ ] No prior data exists

### 6.2 Run Scraper

```bash
python -m orchestration.run_all --fixtures
```

- [ ] Exit code 0
- [ ] 20 total reviews across 3 snapshots

### 6.3 Verify Dashboard Reads Data

```bash
curl -s http://localhost:3000/api/overview | python -c "import sys,json; d=json.load(sys.stdin); print(f'Reviews: {d.get(\"total_reviews\", \"N/A\")}')"
```

- [ ] Dashboard shows non-zero review counts

### 6.4 Verify UI Loads

Open `http://localhost:3000` in browser:

- [ ] Overview tab renders with 3 KPI cards (Total Reviews, Branches, Avg Rating)
- [ ] Charts render (rating distribution, reviews per competitor, etc.)
- [ ] No visual errors or broken components
- [ ] Footer shows run health information

---

## Phase 7: Verification Summary

### 7.1 Overall Status

| Phase | Steps | Passed | Failed | Skipped |
|---|---|---|---|---|
| Repository Setup | 5 | _ | _ | _ |
| Scraper Fixtures | 6 | _ | _ | _ |
| Delta Detection | 2 | _ | _ | _ |
| Dashboard Dev Server | 10 | _ | _ | _ |
| Scrape Trigger | 2 | _ | _ | _ |
| End-to-End | 4 | _ | _ | _ |
| **Total** | **29** | **_** | **_** | **_** |

### 7.2 Known Verification Limitations

| Area | Limitation | Reference |
|---|---|---|
| Live scraper steps | All competitor URLs are mock values — real place_ids not configured | AUDIT-01 §Risks |
| Selector verification | CSS selectors are UNPROVEN (2023 vintage) against real Google Maps DOM | AUDIT-02 §Critical |
| Anti-bot verification | 3-layer hardening never tested against real Google Maps | AUDIT-02 §Critical |

**Resolved blockers (previously documented, now fixed):**
- Hardcoded `GBP_ROOT` path → replaced with environment variable + cwd fallback (Architecture Refactor 02)
- ESLint disabled → re-enabled with 0 errors, 0 warnings (H-04)
- No test suite → 68 tests across 4 test files (H-04 + Production Hardening Pass 03)
- `build.sh` references → replaced with cross-platform `build.mjs`

---

## Troubleshooting

| Failure | Likely cause | Check |
|---|---|---|
| `python: command not found` | Python not in PATH | `python3` instead; or install Python 3.12+ |
| `ModuleNotFoundError` | pip dependencies not installed | `cd gbp-monitor && pip install -r requirements.txt` |
| `curl: (7) Failed to connect` | Dev server not running | Run `bun run dev` in another terminal |
| Dashboard shows all zeros | Paths don't match | Verify `src/lib/gbp/paths.ts` points to your scraper data |
| `data/snapshots/` has 0 files | Scraper hasn't been run | `cd gbp-monitor && python -m orchestration.run_all --fixtures` |
| `data/run_summary.json` shows `success: 0` | Fixtures mode but no fixtures | Check `gbp-monitor/tests/fixtures/` has HTML files |
