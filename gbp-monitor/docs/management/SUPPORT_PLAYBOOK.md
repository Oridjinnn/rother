# Support Playbook

**Document ID:** OPS-003
**Target Audience:** Support engineers handling GBP Monitor issues

---

## 1. Error Catalog

### 1.1 capture/SelectorNotFoundError

**File:** `harness/scroll.py:57-58`
**Message:** `review_container selector failed — all N fallback(s) exhausted`
**Probable Cause:** Google Maps DOM structure changed — `div.m6QErb[role='region']` no longer matches
**User Impact:** Competitor cannot be scraped
**Resolution:**
1. Run verify mode to capture current HTML
2. Inspect HTML for new container selector
3. Update `config/selectors.json` `review_container` tiers
4. Run `python -m tests.verify_baseline` to confirm non-regression

### 1.2 capture/NavigationError

**File:** `harness/capture.py:68-80`
**Message:** `[dns|timeout|connection_refused|ssl_error]`
**Probable Cause:** Network issue or invalid URL
**User Impact:** Listing skipped
**Resolution:**
1. Verify URL is accessible in regular browser
2. Check network connectivity
3. If DNS error: verify `place_id` is correct

### 1.3 capture/CaptureTimeoutError

**File:** `harness/capture.py:49-65`
**Message:** `capture stage 'X' exceeded Ns total timeout`
**Probable Cause:** Page load is too slow (bot interstitial, captcha, or slow network)
**User Impact:** Listing skipped
**Resolution:**
1. Increase `_CAPTURE_TOTAL_TIMEOUT_S` in `orchestration/run_all.py:114`
2. Check for bot detection (verify mode screenshot)

### 1.4 browser/PageCrashError

**File:** `harness/browser.py:243-249`
**Message:** `page crashed for {comp_id}`
**Probable Cause:** Out of memory or renderer crash
**User Impact:** Listing skipped
**Resolution:**
1. Reduce concurrent pages (if parallelism added)
2. Increase system memory
3. Reduce `MAX_SCROLLS` in `harness/scroll.py:10`

### 1.5 parse/EMPTY_CAPTURE

**File:** `orchestration/run_all.py:601`
**Message:** `EMPTY_CAPTURE[{comp_id}]: HTML is N bytes`
**Probable Cause:** Page loaded but returned empty/error page
**User Impact:** 0 reviews parsed
**Resolution:**
1. Run verify mode to see what HTML was captured
2. Check screenshot for captcha or error page

### 1.6 storage/LOCK_ERROR

**File:** `orchestration/run_all.py:162-164`
**Message:** `Lock file exists (run_id=..., pid=..., age=...s)`
**Probable Cause:** Previous run crashed or overlapping runs
**User Impact:** New run cannot start
**Resolution:**
1. Verify PID is no longer running
2. Delete `data/.run.lock`

### 1.7 storage/CORRUPT_SNAPSHOT

**File:** `storage/snapshot_store.py:82-83`
**Message:** `could not read {path} ({error})`
**Probable Cause:** JSON file corrupted by partial write or disk error
**User Impact:** Snapshot resets to empty — all reviews treated as new
**Resolution:**
1. Check snapshot file manually
2. Restore from backup if available
3. Accept re-scrape (reviews will be re-discovered)

### 1.8 config/INVALID_PLACE_ID

**File:** `orchestration/run_all.py:356-358`
**Message:** `place_id[{comp_id}] does not look like a valid Google Maps place ID`
**Probable Cause:** `place_id` in config does not start with `ChIJ` or is too short
**User Impact:** Listing skipped in live mode
**Resolution:**
1. Verify place_id from Google Maps URL
2. Update `config/listings.json`

---

## 2. Common Support Scenarios

### Scenario 1: "The scraper is not finding any reviews"

**Triage:**
```bash
# 1. Check if HTML was captured at all
cat data/run_summary.json | python -c "import json,sys; s=json.load(sys.stdin); print(f'success={s[\"success\"]}, failed={s[\"failed\"]}')"

# 2. If success=0, check log
grep FAILURE data/run.log

# 3. If success>0 but total_reviews=0, check if fixture mode was used accidentally
grep "mode is" data/run.log
```

**Likely fix:** Run without `--fixtures` flag, or check `place_id` values.

### Scenario 2: "I added a new competitor but it's not being scraped"

**Triage:**
```bash
# 1. Check JSON syntax
python -c "import json; json.load(open('config/listings.json'))"

# 2. Check place_id format (must start with ChIJ)
python -c "
import json
listings = json.load(open('config/listings.json'))
for b in listings['branches']:
    for c in b['competitors']:
        pid = c.get('place_id')
        valid = pid and str(pid).startswith('ChIJ') and len(str(pid)) >= 25
        print(f\"{c['competitor_id']}: place_id={'VALID' if valid else 'INVALID/MISSING'}\")"
```

**Likely fix:** Add valid `place_id`.

### Scenario 3: "All reviews are showing as new every day"

**Triage:**
```bash
# 1. Check latest.json exists
cat data/snapshots/comp-seminyak-01/latest.json

# 2. Check snapshot file exists
ls data/snapshots/comp-seminyak-01/*.json

# 3. Verify snapshot is valid JSON
python -c "import json; json.load(open('data/snapshots/comp-seminyak-01/2026-07-24T14-29-52Z.json'))"
```

**Likely fix:** Corrupt snapshot — point `latest.json` to a valid file, or accept re-scrape.

### Scenario 4: "The scraper ran but I don't see any output"

```bash
# 1. Check run_summary
cat data/run_summary.json

# 2. Check log
tail -20 data/run.log

# 3. Check if --verify mode was used (writes to data/verify/, not data/snapshots/)
```

**Likely fix:** Use `python -m orchestration.run_all` (without `--verify`).

---

## 3. Data Recovery Procedures

### 3.1 Recover from Corrupt latest.json

```bash
# List all available snapshots
ls -t data/snapshots/comp-seminyak-01/*.json | head -5

# Point latest to the newest valid one
echo '"2026-07-24T14-29-52Z.json"' > data/snapshots/comp-seminyak-01/latest.json
```

### 3.2 Recover from Deleted Snapshots

If `data/snapshots/` is deleted:
1. All review history is lost
2. Next run starts fresh — all reviews treated as "new"
3. No recovery possible without backup

### 3.3 Recover from Config Corruption

```bash
# Restore previous config from git
git checkout HEAD~1 -- config/listings.json config/selectors.json

# Or from backup
cp data/config_backups/20260724/listings.json config/listings.json
```

---

## 4. Escalation Matrix

| Priority | Criteria | Response Time | Escalates To |
|---|---|---|---|
| P1 | All competitors failing | 2 hours | Developer |
| P2 | >50% competitors failing | 4 hours | Developer |
| P3 | Single competitor failing | 24 hours | Client (place_id) |
| P4 | Config change needed | 48 hours | Client |
| P5 | Feature request | Next sprint | Product owner |

---

## 5. Known Issues

| ID | Description | Workaround | Fixed In |
|---|---|---|---|
| KNOWN-001 | README says "67 checks pass" — actual is 46 | Ignore; expected count is 46 | M12 |
| KNOWN-002 | 10/12 competitors have no place_id | Use `--fixtures` mode, or provide place_ids | Client data entry |
| KNOWN-003 | No dashboard yet | Read JSON files directly | Future phase |
| KNOWN-004 | Log file grows unbounded on local runs | Manually rotate >5MB | Future phase |
