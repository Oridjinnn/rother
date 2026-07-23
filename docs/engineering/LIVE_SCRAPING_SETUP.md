# Live Scraping Setup Guide

Configure and run the GBP Monitor against real Google Maps listings.

## Architecture

```
User adds place_id → listings.json → live mode → Playwright Chromium
                                                         ↓
                                              Google Maps page
                                                         ↓
                                              Cookie dismiss (best-effort)
                                              Reviews tab click
                                              Scroll container
                                              Expand truncated text
                                                         ↓
                                              page.content() → raw HTML
                                                         ↓
                                              parse_reviews() → list[Review]
                                                         ↓
                                              Delta vs snapshot → new_reviews
                                                         ↓
                                              save_snapshot() + _append_new_reviews()
```

No authentication is added. The scraper works with publicly visible Google Maps data only.

## Prerequisites

| Item | Requirement | Check |
|---|---|---|
| Python 3.14+ | `python --version` | 3.14.4 |
| Playwright | `pip show playwright` → 1.61.0 | playwright, parsel, requests |
| Chromium binary | `playwright install chromium` | ~150MB download |
| Internet | `ping google.com` | No proxy blocks |
| Git | `git --version` | For repo management |

## How to Configure place_id

### Step 1: Find a real Google Maps place ID

1. Open https://www.google.com/maps in your browser
2. Search for the competitor (e.g., "Revolver Espresso Seminyak")
3. The URL bar will show something like:
   ```
   https://www.google.com/maps/place/Revolver+Espresso/@-8.1234,115.1234,17z
   ```
4. Extract the place ID using one of these methods:

   **Method A — URL inspection:** Look for `?q=place_id:` in the address bar after clicking "Share" → "Copy link". The URL will be:
   ```
   https://www.google.com/maps/place/?q=place_id:ChIJ9fhCoBBH0i0R4h17JYdA484
   ```
   
   **Method B — Place ID Finder:** Use Google's official tool at
   https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder

### Step 2: Edit config/listings.json

```json
{
  "competitor_id": "comp-seminyak-01",
  "name": "Revolver Espresso Seminyak",
  "gmaps_url": "https://www.google.com/maps/place/?q=place_id:ChIJmock_revolver_seminyak",
  "place_id": "ChIJ9fhCoBBH0i0R4h17JYdA484"
}
```

- `place_id`: The real Google Maps place ID (optional, null = use gmaps_url fallback)
- `gmaps_url`: The mock URL used in fixture mode (not reached when place_id is set)

> **Important:** The `gmaps_url` is preserved as a documentation reference for fixture
> mode. When `place_id` is set, the live mode constructs a real URL automatically.

### Step 3: Run live mode

```powershell
cd gbp-monitor
python -m orchestration.run_all
```

The pre-flight check will warn about remaining mock URLs but proceed with the one
configured competitor.

## Running Modes

### Live mode (default)
```powershell
python -m orchestration.run_all
```
- Launches Playwright Chromium
- Captures real Google Maps HTML for competitors with a `place_id`
- Skips competitors without `place_id` or with unreachable URLs
- Runs parser, delta, and saves snapshots
- Writes `data/run_summary.json` and `data/selector_report.json`

### Fixture mode (no browser needed)
```powershell
python -m orchestration.run_all --fixtures
```
- Reads HTML from `tests/fixtures/{competitor_id}.html`
- Skips competitors without a fixture file
- Same parse → delta → save pipeline
- Does NOT require Playwright or network

### Verify mode (diagnostic only)
```powershell
python -m orchestration.run_all --verify --url "https://www.google.com/maps/place/?q=place_id:..."
```
- Captures screenshots + raw HTML without modifying production data
- Evidence in `data/verify/{timestamp}/`
- Exits non-zero on any failure
- Best for testing selectors against real Google Maps DOM

## Output Files

| File | Contents |
|---|---|
| `data/run_summary.json` | Success/failure counts, durations, errors |
| `data/selector_report.json` | Per-selector health, confidence scores, per-competitor outcomes |
| `data/snapshots/{comp_id}.json` | Full review list per competitor |
| `data/reviews_new/{comp_id}_{ts}.json` | Delta (new reviews since last snapshot) |
| `data/run.log` | Full log with structured key=value lines |

## Manual Verification Checklist

### Before first live run

- [ ] `playwright install chromium` has been run
- [ ] `pip install -r requirements.txt` is up to date
- [ ] At least one competitor has a real `place_id` in `config/listings.json`
- [ ] The network can reach `google.com` (no proxy/VPN interference)
- [ ] `python -m tests.verify_baseline` passes (fixture mode baseline)

### Running live mode

- [ ] `python -m orchestration.run_all` exits without unhandled exceptions
- [ ] `data/run_summary.json` shows `mode: "live"` and expected success/skipped counts
- [ ] Competitors with `place_id` are processed (not skipped)
- [ ] Competitors without `place_id` are skipped with clear log messages
- [ ] `data/selector_report.json` exists with per-selector health data

### Inspecting results

- [ ] Snapshot files exist in `data/snapshots/` for processed competitors
- [ ] Reviews have valid `review_id` values (not null/empty)
- [ ] Ratings are in range 1.0–5.0
- [ ] `run.log` shows no ERROR lines for processed competitors
- [ ] Dashboard shows updated data after `/api/scrape/trigger`

## Known Limitations

### 1. No authentication
The scraper works with publicly visible Google Maps data only. The Google Maps
preview page (`/maps/preview/log204`) served to unauthenticated clients has NO
review components (proved in B1 Live Verification, 2026-07-22). Live mode will
open the full Google Maps page but may encounter:

- **Preview page variant**: Some place URLs redirect to a stripped preview page
  without review tabs or review containers. The scraper logs `SelectorNotFoundError`
  and moves on.
- **Rate limiting**: Google may temporarily block the IP after rapid requests.
  The built-in 5–10s polite delay mitigates this for up to ~12 competitors per run.
- **Bot detection**: Headless Chromium with anti-bot hardening (Fix A) reduces
  detection but does not eliminate it.

### 2. Selectors are unproven
All 11 CSS selectors in `config/selectors.json` are marked `verified_by: null`
and `last_verified: null` — they were seeded from 2023-vintage reference
implementations and have never been confirmed against current Google Maps DOM.
The self-healing locator (5-tier, arXiv:2603.20358) provides resilience against
class-name changes.

### 3. No partial recovery
If a listing fails after the browser has navigated to it, the page is closed
but the browser context is reused. A crashed browser context (rare) would cause
all subsequent listings to fail. The retry logic handles transient errors but
not context corruption.

### 4. Single-threaded
Competitors are processed sequentially. A single hung listing blocks the entire
run until its timeout fires (default 90s). Parallel processing is not implemented.

### 5. No dashboard feedback during run
The `/api/scrape/trigger` endpoint returns only after the full run completes.
There is no progress streaming to the dashboard. Long runs (>5 min for 12
listings) show no intermediate feedback.

## Troubleshooting Guide

### "ALL competitors use mock URLs"

**Problem:** The pre-flight check detected that no competitor has a real `place_id`.
**Fix:** Add real place IDs to `config/listings.json`. See "How to Configure place_id" above.

### "Playwright Chromium binary not installed"

**Problem:** The `playwright install chromium` command has not been run.
**Fix:**
```powershell
pip install playwright
playwright install chromium
```

### Capture results in 0 reviews

**Problem:** `run_summary.json` shows `success: 1` but `total_reviews: 0`.
**Causes:**
1. The page is a preview variant without review components (most likely)
2. Selectors are stale and don't match the current DOM
3. The capture produced empty HTML (page failed to load)

**Diagnosis:**
- Check `data/run.log` for `EMPTY_CAPTURE`, `LOW_CONTENT`, or `NO_REVIEWS` entries
- Run `--verify --url <URL>` to capture a screenshot + HTML for inspection
- Look at the screenshot: does it show a real Google Maps listing?
- Run the parser offline against the captured HTML

### "NavigationError: [timeout]"

**Problem:** `page.goto()` timed out after 30 seconds.
**Causes:**
1. Network is slow or unreliable
2. Google is blocking the IP (rate limiting)
3. The URL is invalid (mock URL, malformed)

**Diagnosis:** Check the URL manually in a regular browser. If it loads fine,
the issue is likely bot detection or network.

### 0 reviews parsed with non-empty HTML

**Problem:** HTML is >10KB but `parse_reviews` returns 0 reviews.
**Causes:**
1. The captured page is an interstitial (consent wall, age verification)
2. The reviews panel was not opened (reviews tab click failed)
3. The review container was not scrolled (selector mismatch)
4. All locator tiers failed to find review items

**Diagnosis:** Run `--verify --url <URL>` to capture the HTML, then inspect:
```powershell
python -c "
from parser.review_parser import parse_reviews
from parser.schema import review_to_dict
import json, sys
html = open('data/verify/latest/comp-canggu-01/page.html').read()
reviews = parse_reviews(html, 'test', 'test', json.load(open('config/selectors.json')))
print(f'{len(reviews)} reviews')
for r in reviews[:3]:
    d = review_to_dict(r)
    print(f'  {d[\"reviewer_name\"]}: {d[\"rating\"]}★')
"
```

### Run timed out (>90s per competitor)

**Problem:** The capture exceeded the total timeout.
**Causes:**
1. Google Maps page is slow to load
2. Scroll loop hit MAX_SCROLLS=40 without stabilizing (page keeps growing)
3. Network is slow

**Tuning:**
- Increase `_CAPTURE_TOTAL_TIMEOUT_S` in `orchestration/run_all.py`
- Increase `MAX_SCROLLS` in `harness/scroll.py`
- Decrease `SCROLL_WAIT_MS` in `harness/scroll.py`

### Browser crashes with "page crashed"

**Problem:** `PageCrashError: page crashed`
**Causes:**
1. Out of memory (too many pages open)
2. GPU/rendering crash in headless mode
3. Chromium bug

**Fix:**
- Ensure no other Playwright processes are running
- Reduce concurrent pages (currently 1 page at a time — should not occur)
- Restart the run

## Selector Health Monitoring

Every production live run now produces `data/selector_report.json` with:

```json
{
  "generated_at": "2026-07-23T12:00:00",
  "selectors_configured": 11,
  "selectors_tested": 4,
  "healthy": 3,
  "degraded": 0,
  "broken": 0,
  "not_evaluated": 6,
  "avg_confidence": 0.917,
  "by_selector": {
    "cookie_reject_button": {
      "status": "healthy",
      "confidence": 1.0,
      "total_lookups": 12,
      "times_found": 0,
      "expected_missing_count": 12
    }
  }
}
```

- **healthy**: Found on every listing (or expected missing on all)
- **degraded**: Found on some listings, not on others (may be normal)
- **broken**: Never found, not expected to be missing
- **not_evaluated**: Parser-only selectors not exercised during capture
- **avg_confidence**: Mean confidence across all evaluated selectors (0.0–1.0)

Run `--verify` for detailed per-competitor selector outcomes.
