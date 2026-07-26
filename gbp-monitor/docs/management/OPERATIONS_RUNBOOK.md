# Operations Runbook

**Document ID:** OPS-002
**Target Audience:** Operations team running GBP Monitor in production

---

## 1. Daily Operations

### 1.1 Check Daily Scrape Status

```bash
# View latest run summary
cat data/run_summary.json

# Key fields to check:
#   "success": number of successfully scraped competitors
#   "failed": number of failed competitors
#   "skipped": number of skipped (no place_id/fixture)
#   "new_reviews": new reviews found this run
```

**Healthy output:**
```json
{"success": 12, "failed": 0, "skipped": 0, "new_reviews": 0}
```

**Warning signs:**
- `failed > 0`: Review `data/run.log` for ERROR lines
- `failed >= success`: Alert — likely selector breakage
- `success == 0`: All listings failed — check Google Maps accessibility

### 1.2 View New Reviews

```bash
# List new review files
ls data/reviews_new/

# View new reviews for a specific competitor
cat data/reviews_new/comp-seminyak-01_*.json
```

### 1.3 View Logs

```bash
# Tail recent log entries
tail -50 data/run.log

# Search for errors
grep ERROR data/run.log

# Search for delta (new reviews found)
grep delta data/run.log
```

---

## 2. Routine Maintenance

### 2.1 Weekly: Verify Selectors Still Work

```bash
python -m tests.verify_baseline
# Expected: 46 passed, 0 failed

# Check selector health report
cat data/selector_report.json | python -c "import json,sys; r=json.load(sys.stdin); print(f'healthy={r[\"healthy\"]}, degraded={r[\"degraded\"]}, broken={r[\"broken\"]}')"
```

### 2.2 Monthly: Prune Old Snapshots

```bash
# List snapshot timestamps for a competitor
ls data/snapshots/comp-seminyak-01/*.json | head

# Manual cleanup (keep last 90 days)
# (When implemented: python -m storage.prune --keep 90)
```

### 2.3 Monthly: Rotate Log (local runs only)

```bash
# Rotate if run.log exceeds 5MB
if (( $(stat -c%s data/run.log) > 5242880 )); then
    mv data/run.log "data/run.log.$(date -u +%Y%m%d)"
    echo "Rotated"
fi
```

### 2.4 Monthly: Check Disk Usage

```bash
du -sh data/
# Expected: < 500 MB for 12 competitors
```

---

## 3. Incident Response

### 3.1 "Lock file exists" Error

**Symptom:** `RuntimeError: Lock file exists (run_id=..., pid=..., age=...s). Another run is in progress.`

**Causes:**
- Previous run crashed without cleanup
- Two runs started simultaneously

**Resolution:**
```bash
# Check if process is still running (replace PID)
ps -p <PID>   # Linux
Get-Process -Id <PID>   # Windows

# If process is dead, remove lock file
rm data/.run.lock
```

### 3.2 All Listings Failed

**Symptom:** `success=0, failed=N`

**Causes:**
1. Google Maps blocking (bot detection)
2. Network outage
3. All place_ids invalid
4. Playwright Chromium binary missing

**Diagnosis:**
```bash
# Check run log for errors
grep FAILURE data/run.log

# Test with --verify mode (single listing)
python -m orchestration.run_all --verify --url "https://www.google.com/maps/place/?q=place_id:KNOWN_GOOD_ID"

# Check Playwright
playwright install --check chromium
```

**Resolution:**
- If bot detection: Check `sec-ch-ua` headers, verify Fix A is still active
- If network: Wait and retry
- If missing binary: `playwright install chromium`

### 3.3 SelectorNotFoundError

**Symptom:** `FAILURE[...] stage=capture url=... SelectorNotFoundError: review_container selector failed`

**Cause:** Google Maps DOM structure changed.

**Resolution:**
```bash
# Capture current HTML for analysis
python -m orchestration.run_all --verify --url "https://www.google.com/maps/place/?q=place_id:KNOWN_GOOD_ID"

# Inspect captured HTML for container changes
python data/_inspect_html.py data/verify/latest/comp-name/page.html
```

### 3.4 Corrupt Snapshot

**Symptom:** All reviews re-appear as "new" (unexpected delta spike)

**Cause:** `data/snapshots/{comp_id}/latest.json` points to missing/corrupt file

**Resolution:**
```bash
# Check latest pointer
cat data/snapshots/comp-seminyak-01/latest.json

# List available snapshots
ls data/snapshots/comp-seminyak-01/*.json

# Manually point to latest valid snapshot
echo '"2026-07-24T14-29-52Z.json"' > data/snapshots/comp-seminyak-01/latest.json
```

### 3.5 Place ID Invalid

**Symptom:** `WARNING: place_id[...] does not look like a valid Google Maps place ID`

**Cause:** `place_id` in `config/listings.json` is not a valid Google Maps place ID.

**Resolution:**
```bash
# Find correct place_id:
# 1. Open https://www.google.com/maps
# 2. Search for the business
# 3. Extract place_id from the URL (search for ChIJ...)
# 4. Update config/listings.json
```

---

## 4. Configuration Reference

### 4.1 listings.json Schema

```json
{
  "branches": [
    {
      "branch_id": "cph-seminyak",      // Unique branch identifier
      "branch_name": "Copenhagen Bali - Seminyak",  // Display name
      "competitors": [
        {
          "competitor_id": "comp-seminyak-01",  // Unique competitor ID
          "name": "Revolver Espresso Seminyak",  // Business name
          "gmaps_url": "https://...",  // Fallback URL (mock or real)
          "place_id": "ChIJ..."  // Google Maps place ID (null = skip live)
        }
      ]
    }
  ]
}
```

### 4.2 selectors.json Schema

```json
{
  "review_container": ["div.m6QErb[role='region']", "..."],
  "review_item": "div.jftiEf.fontBodyMedium",
  "review_id_attr": "data-review-id",
  "reviewer_name_attr": "aria-label",
  "review_text_selector": "span.wiI7pd",
  "rating_selector": "span.kvMYJc",
  "rating_attr": "aria-label",
  "relative_date_selector": "span.rsqaWe",
  "expand_text_button": ["button.w8nwRe.kyuRq", "button:has-text('More')"]
}
```

---

## 5. Key Files and Directories

| Path | Purpose | Backup? |
|---|---|---|
| `config/listings.json` | Competitor configuration | Yes |
| `config/selectors.json` | DOM selectors for parsing | Yes |
| `data/snapshots/{comp_id}/` | Versioned review snapshots | Yes |
| `data/reviews_new/` | New review delta files | Yes |
| `data/run.log` | Append-only structured log | Rotated |
| `data/run_summary.json` | Latest run summary | No (replaced each run) |
| `data/.run.lock` | Lock file | No (ephemeral) |
| `data/selector_report.json` | Per-selector health report | No (replaced each run) |
| `data/selector_history.json` | Historical selector health | Yes (last 50 entries) |
| `data/verify/` | Verify-mode evidence | No (large, transient) |
| `tests/fixtures/*.html` | Static test fixtures | Yes |

---

## 6. Escalation Path

| Issue | First Response | Escalation |
|---|---|---|
| All listings fail | Check network + Playwright | Developer (selector breakage) |
| Partial failures | Check individual URLs | Client (place_id validity) |
| Bot detection | Check logs for captcha/interstitial | Developer (anti-bot hardening) |
| Missing place_ids | Check config | Client (data entry) |
| Dashboard not loading | N/A (dashboard not yet deployed) | Developer |
