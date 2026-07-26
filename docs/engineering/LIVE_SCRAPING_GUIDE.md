# Live Scraping Guide

**Date:** 2026-07-24
**Purpose:** Configure and run live Google Maps review scraping for Rother.

---

## Before You Start

Ensure the Python scraper works in fixtures mode:

```powershell
cd gbp-monitor
python -m orchestration.run_all --fixtures
python -m tests.verify_baseline
```

Both should succeed (exit code 0, 67/67 tests pass).

---

## Obtaining Google Maps Place IDs

Each competitor needs a Google Maps `place_id` — a unique identifier for a
business location on Google Maps. This is NOT the business name or URL — it's
a stable alphanumeric string starting with `ChIJ`.

### Method 1: From Google Maps URL

1. Open https://www.google.com/maps in a browser
2. Search for the business name (e.g., "Revolver Espresso Seminyak")
3. The URL in the address bar will look like:
   ```
   https://www.google.com/maps/place/Revolver+Espresso/@-8.691,115.155,17z/data=!4m8!3m7!1s0x2dcda1545f30fb0f:0xd8e33034acb7a3b!8m2!3d-8.691!4d115.155!...
   ```
4. The part between `!1s0x` and `!8m2` (after the colon) is the place_id:
   ```
   0x2dcda1545f30fb0f:d8e33034acb7a3b
   ```
   The full place_id is `ChIJ` + that hex value. For this example:
   `ChIJL9wPX1Sh2i0Rojf_RIvH-10`

### Method 2: From Google Places API

```powershell
# Requires a Google Cloud API key with Places API enabled
curl "https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=Revolver+Espresso+Seminyak&inputtype=textquery&fields=place_id&key=YOUR_API_KEY"
```

### Method 3: From Client Data Entry

If the client has provided Google Business Profile access, the place_id may
be visible in the GBP dashboard URL or export data.

---

## Configuring Competitors

Edit `gbp-monitor/config/listings.json`:

```json
{
  "competitor_id": "comp-seminyak-01",
  "name": "Revolver Espresso Seminyak",
  "gmaps_url": "https://www.google.com/maps/place/?q=place_id:ChIJmock_revolver_seminyak",
  "place_id": "ChIJL9wPX1Sh2i0Rojf_RIvH-10"
}
```

- `place_id`: Add the real Google Maps place ID (or set to `null` for mock data)
- `gmaps_url`: Keep the mock URL as fallback (used when `place_id` is null)

### Place ID Validation

The scraper validates `place_id` format:
- Must start with `ChIJ`
- Must be at least 25 characters long
- Invalid format → logged as warning, falls back to `gmaps_url`

---

## Running a Live Scrape

### From the Command Line

```powershell
cd gbp-monitor
python -m orchestration.run_all
```

This launches headless Chromium via Playwright and captures each competitor's
Google Maps review page. Expected runtime: 20-45 seconds per competitor.

### From the Dashboard (Live Mode)

```powershell
curl -X POST "http://localhost:3000/api/scrape/trigger?mode=live"
```

Or via the dashboard (requires Codex with live mode support).

### Incremental/Selective Scraping

```powershell
# Scrape only specific competitors
python -m orchestration.run_all --competitor comp-canggu-01

# Scrape only one branch
python -m orchestration.run_all --branch cph-canggu
```

---

## Expected Outputs

On success, the scraper produces:

| Output | Location | Format |
|--------|----------|--------|
| Snapshots | `data/snapshots/{comp_id}/{timestamp}.json` | JSON array of reviews |
| Deltas | `data/reviews_new/{comp_id}_{run_id}.json` | JSON array of new reviews |
| Run summary | `data/run_summary.json` | Run statistics |
| Run log | `data/run.log` | Append-only structured log |
| Selector report | `data/selector_report.json` | Per-selector health |
| Selector history | `data/selector_history.json` | Rolling 50-entry history |

---

## Common Failure Modes

### 1. NavigationError — DNS/Timeout/Connection Refused

**Symptom:**
```
capture[comp-seminyak-01] goto failed: NavigationError: [dns] https://...: ...
```

**Causes:**
- Invalid `place_id` (typo, wrong format)
- URL uses mock `ChIJmock_*` placeholder
- Network is down or blocked

**Fix:**
- Verify the `place_id` by pasting the URL into a browser manually
- Check network connectivity
- Ensure the business exists on Google Maps

### 2. SelectorNotFoundError

**Symptom:**
```
capture[comp-canggu-01] scroll failed: SelectorNotFoundError: ...
```

**Causes:**
- Google Maps DOM structure changed
- Bot detection served a different page (captcha, interstitial)
- Reviews tab label differs by locale (e.g., "Ulasan" vs "Reviews")

**Fix:**
- Run `--verify` mode to capture the actual page HTML + screenshot
- Check the screenshot for bot interstitials or captcha
- Update selectors in `config/selectors.json` if DOM changed
- Verify the anti-bot hardening (Fix A) is working

### 3. CaptureTimeoutError

**Symptom:**
```
process_one_listing: CaptureTimeoutError: ...stage=scroll...
```

**Causes:**
- Page is very large (1000+ reviews)
- Network is slow
- Bot detection is throttling the page load

**Fix:**
- Increase `_CAPTURE_TOTAL_TIMEOUT_S` in `orchestration/run_all.py`
- Reduce `MAX_SCROLLS` in `harness/scroll.py`
- Run during off-peak hours

### 4. Empty Capture (< 1KB HTML)

**Symptom:**
```
EMPTY_CAPTURE[comp-canggu-01]: HTML is 534 bytes
```

**Causes:**
- Full-page captcha or interstitial
- Page redirected to Google login
- URL is invalid (returned blank page)

**Fix:**
- Run `--verify` mode to capture screenshot
- Check if the URL works in a regular browser
- May need to update anti-bot measures

### 5. No Reviews Parsed

**Symptom:**
```
NO_REVIEWS[comp-canggu-01]: HTML is 517534 bytes, but 0 reviews parsed
```

**Causes:**
- Google Maps DOM changed the review element structure
- Reviews tab not clicked (selector didn't match)
- Scroll didn't reach the review container

**Fix:**
- Check `data/verify/{ts}/{comp_id}/page.html` for review elements
- Update review item selectors in `config/selectors.json`
- Verify the `reviews_tab_button` selector matches the current DOM

---

## Verify Mode (Detailed Diagnostics)

Run with `--verify` to capture screenshots and full HTML for every competitor:

```powershell
cd gbp-monitor
python -m orchestration.run_all --verify
```

Output goes to `data/verify/{timestamp}/{competitor_id}/`:
- `page.html` — raw HTML
- `page.png` — full-page screenshot

Use this to:
1. See what the scraper actually rendered
2. Check for captcha/interstitial pages
3. Debug selector issues
4. Generate fixture files for regression testing

---

## Dashboard Integration

After a live scrape, the dashboard reads the new data:

| Endpoint | URL | What it shows |
|----------|-----|---------------|
| Overview | `GET /api/overview` | KPIs, rating distribution, alerts |
| Branches | `GET /api/branches` | Per-competitor stats |
| Reviews | `GET /api/reviews` | Paginated review table |
| Alerts | `GET /api/alerts` | New review alerts, failure alerts |
| Logs | `GET /api/logs` | Live scraper log tail |

The dashboard auto-refreshes every 30 seconds on the Overview tab.
