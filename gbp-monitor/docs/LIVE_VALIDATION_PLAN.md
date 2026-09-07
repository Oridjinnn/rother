# LIVE Validation Plan — GBP Monitor

**Author:** Senior QA Engineer (automated)
**Date:** 2026-07-30
**Status:** BLOCKED (see §5)

---

## 1. Modes Overview

| Mode | CLI Flag | Browser | Outputs | Use Case |
|---|---|---|---|---|
| **Fixtures** | `--fixtures` | No | Snapshots, deltas, run_summary.json | Developer CI, pipeline testing |
| **Live** | *(default)* | Yes (Playwright Chromium) | Snapshots, deltas, run_summary.json, selector_report.json | Production daily scrape |
| **Verify** | `--verify` | Yes | `data/verify/{ts}/` (screenshots + HTML + report) | Pre-production dry-run; safe to run alongside live |
| **Validate Config** | `--validate-config` | No | stdout validation report | Syntax/structural config check |

### Key architectural difference between Live and Verify

| Aspect | Live (`run()`) | Verify (`run_verify()`) |
|---|---|---|
| Modifies snapshots | Yes | **No** |
| Modifies run_summary.json | Yes | **No** |
| Writes deltas to `reviews_new/` | Yes | **No** |
| Captures screenshots | No | Yes (`page.png`) |
| Saves raw HTML evidence | No | Yes (`page.html`) |
| Lock file acquired | Yes (`data/.run.lock`) | **No** |
| Exit code | Always 0 | 0 if all pass, 1 if any fail |
| Override URL | No | Yes (`--url`) |

---

## 2. Fixture vs. Live — How `run_all.py` Selects Mode

The decision tree at `orchestration/run_all.py:1440-1486`:

```
if args.verify:
    run_verify(url_override=args.url)        # safe evidence capture
elif args.fixtures:
    run(fixtures_mode=True)                   # no browser, static HTML
else:
    run(fixtures_mode=False)                  # real Playwright capture
```

### Fixtures mode path:
1. `_preflight_checks(fixtures_mode=True)` — checks fixture file coverage
2. For each competitor: reads `tests/fixtures/{competitor_id}.html`
3. If fixture file missing → SKIPPED (not a failure)
4. Skips browser entirely — no Playwright launched
5. Only 3 of 12 competitors have fixtures: `comp-seminyak-01`, `comp-canggu-01`, `comp-ubud-01`

### Live mode path:
1. `_preflight_checks(fixtures_mode=False)` — checks Playwright binary, detects mock vs. real `place_id`
2. Launches Playwright Chromium via `get_browser_context()` from `harness/browser.py`
3. For each competitor:
   a. `_resolve_url(comp)` — uses `place_id` if valid (starts with `ChIJ`, ≥25 chars), else falls back to `gmaps_url` (mock URL)
   b. `validate_listing(url)` in `discovery/validate_listing.py` — HTTP HEAD/GET pre-check (10s timeout)
   c. `_capture_with_retries(context, url, selectors, ...)` — Playwright capture with up to 2 retries
   d. Parsing, delta computation, snapshot save
4. Polite delay between listings: random 5.0–10.0 seconds
5. Total per-listing capture timeout: 90 seconds

### Verify mode path:
- Same as Live but captures evidence to `data/verify/{ts}/{competitor_id}/` without modifying production data
- Can use `--url` to test a single URL against all competitors (useful for debugging)

---

## 3. Live Scraping Pipeline (detailed)

```
for each branch:
  for each competitor:
    1. _sanitize_competitor_id(comp_id)           # path traversal check
    2. _resolve_url(comp)                          # place_id → real URL or gmaps_url fallback
    3. validate_listing(url)                       # HTTP HEAD/GET pre-check (10s timeout)
       if unreachable → SKIP (not failure)
    4. capture_listing_html(context, url, ...)      # Playwright (90s total timeout)
       a. page.goto(url, timeout=30s)
       b. _fallback_click("cookie_reject_button")  # 4s timeout per candidate
       c. _fallback_click("reviews_tab_button")     # 4s per candidate, 1.5s settle
       d. scroll_review_container()                # max 40 scrolls, stable=3, 2.5s wait
       e. _fallback_expand("expand_text_button")   # click "More" buttons
       f. page.content() → HTML string
       g. _validate_capture_output()               # size check: <1KB error, <10KB warning
    5. parse_reviews(html, comp_id, ...)            # parsel.Selector, 5-tier locator
    6. load_snapshot(comp_id)                       # read previous baseline
    7. compute_new_reviews(old, parsed)             # diff by review_id
    8. save_snapshot(comp_id, parsed)               # atomic write via .tmp → replace
    9. _append_new_reviews(comp_id, delta)          # write delta JSON
```

---

## 4. Current Configuration State

### 4.1 `place_id` status (from `config/listings.json`)

| # | Competitor | place_id | Status |
|---|---|---|---|
| 1 | comp-seminyak-01 | `ChIJ9fhCoBBH0i0R4h17JYdA484` | **REAL** — verified resolves to Revolver Espresso |
| 2 | comp-seminyak-02 | `null` | **MISSING** — will be skipped in live mode |
| 3 | comp-canggu-01 | `ChIJOaEQDnk40i0Rzhou4NcRx-w` | **REAL** — from Wanderlog MOBX state |
| 4 | comp-canggu-02 | `null` | **MISSING** |
| 5 | comp-ubud-01 | `null` | **MISSING** |
| 6 | comp-ubud-02 | `null` | **MISSING** |
| 7 | comp-uluwatu-01 | `null` | **MISSING** |
| 8 | comp-uluwatu-02 | `null` | **MISSING** |
| 9 | comp-nusadua-01 | `null` | **MISSING** |
| 10 | comp-nusadua-02 | `null` | **MISSING** |
| 11 | comp-sanur-01 | `null` | **MISSING** |
| 12 | comp-sanur-02 | `null` | **MISSING** |

**2 of 12 (17%) have real `place_id` values.** Live mode with current config will process exactly 2 competitors and skip/succeed-with-0 on the other 10.

### 4.2 `gmaps_url` status
All 12 competitors have mock place_id URLs (`ChIJmock_*`) that will fail the `validate_listing` pre-check in live mode (Google will not resolve `ChIJmock_*`). These competitors will be **skipped** with a warning, not failed. This is the intended fallback behavior.

### 4.3 Selectors status
All selectors in `config/selectors.json` were last verified on 2026-07-24 (M10 SelectorAudit) against live Google Maps DOM. Overall status: **live**, confidence **high**. The DOM audit is documented at `docs/engineering/DOM_AUDIT.md`.

### 4.4 Environment configuration

| Variable | Production (`.env.production`) | Development (`.env.development`) |
|---|---|---|
| `TZ` | `Asia/Makassar` | `Asia/Makassar` |
| `GBP_MONITOR_MODE` | `live` | `fixtures` |
| `GBP_MONITOR_NO_SANDBOX` | `true` | `false` |
| `GBP_MONITOR_LOG_LEVEL` | `INFO` | `DEBUG` |

Note: `GBP_MONITOR_MODE` is documented in `.env.example` but is **NOT actually read by `run_all.py`**. Mode selection is purely CLI-based (`--fixtures` flag). The env var is a documentation artifact. The Dockerfile ENTRYPOINT always runs `python -m orchestration.run_all` (default: live mode). Docker Compose does not pass this env var to the entrypoint args.

---

## 5. Blockers

### BLOCKER 1: place_id data entry (M1) — HIGH
**10 of 12 competitors lack valid Google Maps place_ids.** Without these, live mode processes only 2 of 12 listings. This is the original M1 blocker identified in the plan. The client must provide:
- Google Maps place IDs for: comp-seminyak-02, comp-canggu-02, comp-ubud-01, comp-ubud-02, comp-uluwatu-01, comp-uluwatu-02, comp-nusadua-01, comp-nusadua-02, comp-sanur-01, comp-sanur-02

### BLOCKER 2: Anti-bot detection — HIGH
The May 2026 live smoke test (`CHANGELOG 2026-07-20T08:30:30`) resulted in `SelectorNotFoundError` on a real Google Maps URL, consistent with either stale selectors OR a bot interstitial. Fix A (Client Hints override, `CHANGELOG 2026-07-20T18:04:00`) closes the arXiv:2606.14525 `sec-ch-ua` leak, but this has **not been re-tested against a real Google Maps URL**. Verdict is deferred until M1 is unblocked.

Risk factors even after Fix A:
- IP-based rate limiting (same IP daily)
- Request pattern detection (5-10s delay between listings)
- TLS fingerprinting (JA4, per arXiv:2606.30119)
- Google's dynamic bot-detection model updates

### BLOCKER 3: Docker deployment not tested — MEDIUM
The Dockerfile and docker-compose.yml exist but have never been built/run against a real Google Maps URL. The health check module (`orchestration/health.py`) is unproven in a real container environment.

### BLOCKER 4: GitHub Actions workflow not executed — MEDIUM
The scrape workflow (`schedule/.github/workflows/scrape.yml`) has never run on GitHub Actions. The commit-and-push step with git identity `gbp-monitor-bot`/`bot@localhost` requires write permissions on the repo. Log rotation (Fix D) is UNPROVEN-by-execution.

---

## 6. Risk Table

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Google Maps DOM changes break selectors | Medium | High — captures produce 0 reviews | Tiered selectors (5 tiers for reviews, 2 for containers); `failed >= success` alert |
| Bot detection serves interstitial/captcha | Medium | High — all live captures fail | Fix A (Client Hints); polite delays 5-10s; manual verification via `--verify` before production |
| Rate limiting after N competitors | Low-Medium | Medium — partial data | 5-10s polite delay; lock prevents concurrent runs; `failed >= success` alerts if partial |
| Disk full during capture | Low | High — snapshot corruption | `_check_disk_space()` pre-check (100 MB min); atomic writes (`.tmp` → replace) |
| Network timeout on specific listing | Medium | Low — isolated failure | 2 retries with backoff (3s, 7s); 90s total timeout; per-listing failure isolation (Rule 7) |
| Stale lock file blocks next cron run | Low | Medium — missed daily scrape | 30-minute stale threshold; lock PID tracking; SIGINT/SIGTERM cleanup |
| place_id resolves to wrong business | Low | High — wrong reviews | Config validation checks `ChIJ` prefix + ≥25 chars; manual verification via `--verify` |
| Browser crash (OOM) mid-run | Low | High — partial run | PageCrashError caught per-listing; `finally` block cleans up browser |
| Cron at 22:00 UTC misses due to long run | Low | Low — overlapping cancelled | `concurrency.cancel-in-progress: false` protects in-flight runs; next day retries |
| ENTRYPOINT runs live instead of verify | Low | Medium — production data overwritten | Verify mode is explicit `--verify` flag; default is live; CI pipeline controls this |

---

## 7. Pre-Production Validation Steps (ordered)

### Phase A: Config validation (5 min)

```bash
cd gbp-monitor

# 1. Validate listings.json structure
python -m orchestration.run_all --validate-config

# 2. Verify selectors.json is parseable and has all required keys
python -c "
import json
sel = json.load(open('config/selectors.json'))
required = ['review_container', 'review_item', 'review_id_attr',
            'reviewer_name_attr', 'review_text_selector',
            'rating_selector', 'rating_attr', 'relative_date_selector',
            'expand_text_button']
for k in required:
    assert k in sel or f'{k}_attr' in sel, f'Missing: {k}'
print('All required selector keys present')
"

# 3. Confirm fixture → live mapping is consistent
python -c "
import json
listings = json.load(open('config/listings.json'))
total = sum(len(b['competitors']) for b in listings['branches'])
real = sum(1 for b in listings['branches']
           for c in b['competitors']
           if c.get('place_id') and c['place_id'].startswith('ChIJ') and len(c['place_id']) >= 25)
print(f'Total: {total}, Real place_ids: {real}, Missing: {total - real}')
"
```

Expected output:
```
Config validation PASSED — config/listings.json is valid
All required selector keys present
Total: 12, Real place_ids: 2, Missing: 10
```

### Phase B: Fixtures baseline verification (2 min)

```bash
cd gbp-monitor
python -m tests.verify_baseline
```

Expected result: 0 failures, all 3 fixtures parse correctly with 20 total reviews.

### Phase C: Verify mode dry-run (15-30 min, requires Playwright + network)

Run against the 2 competitors with real place_ids:

```bash
cd gbp-monitor
python -m orchestration.run_all --verify
```

This will:
- Launch Playwright Chromium
- Navigate to real Google Maps URLs for comp-seminyak-01 and comp-canggu-01
- Capture screenshots and raw HTML to `data/verify/{timestamp}/`
- NOT modify production snapshots or deltas
- Exit 0 if both pass

**Inspect evidence:**
```bash
# Find latest verify run
ls -lt data/verify/ | head -3

# Check report
cat data/verify/*/report.json | python -m json.tool

# Check screenshots exist (manual inspection)
ls data/verify/*/comp-seminyak-01/page.png
ls data/verify/*/comp-canggu-01/page.png

# Check captured HTML has reviews
grep -c 'data-review-id' data/verify/*/comp-seminyak-01/page.html
```

**Acceptance criteria:**
- Both competitors show `"status": "PASS"`
- `page.png` is a valid screenshot (not a blank page or error page)
- Captured HTML contains `data-review-id` attributes (reviews were rendered)
- Selector report shows all selectors as `"status": "live"`

### Phase D: Single-listing verify with URL override (5 min)

Test a specific Google Maps URL to verify the capture pipeline end-to-end:

```bash
cd gbp-monitor
python -m orchestration.run_all --verify --url "https://www.google.com/maps/place/?q=place_id:ChIJ9fhCoBBH0i0R4h17JYdA484"
```

This overrides ALL competitor URLs with the given URL (useful for testing one well-known listing). Inspect the resulting evidence.

### Phase E: Live mode smoke test (15-30 min, **production data will be written**)

⚠️ Only after Phase C passes AND client approves:

```bash
cd gbp-monitor
python -m orchestration.run_all
```

This will:
- Process all 12 competitors (2 real URLs, 10 skipped for missing place IDs)
- Write snapshots, deltas, and run_summary.json
- Exit 0 regardless of individual failures

**Inspect results:**
```bash
cat data/run_summary.json | python -m json.tool
```

**Acceptance criteria:**
- `success >= 2` (both real place_ids succeeded)
- `failed` should be 0 (10 missings should be counted as `skipped`, not `failed`)
- Wait — actually check: without a real place_id, `_resolve_url()` returns `gmaps_url` (mock URL), then `validate_listing()` returns False → listing is **skipped**, not failed. So `skipped` should be 10, `failed` should be 0.
- `new_reviews > 0` (at least some new reviews detected on first run)
- Snapshot files written for both real competitors
- Delta files written for both real competitors
- `data/run.log` contains INFO lines for all stages

### Phase F: Docker build + run (30 min)

```bash
cd gbp-monitor
docker build -t gbp-monitor:latest .
docker compose run --rm scraper
```

Verify the container exits cleanly and data volume contains expected artifacts.

---

## 8. Live Run Monitoring Checklist

### First live run

- [ ] `--validate-config` passes
- [ ] `--verify` passes for all competitors with real place_ids
- [ ] Screenshots show actual Google Maps page with reviews visible
- [ ] Captured HTML contains `data-review-id` attributes
- [ ] Selector report shows all selectors green (`"status": "live"`)
- [ ] Client has confirmed all 12 place_ids
- [ ] All 12 place_ids added to `config/listings.json`
- [ ] `--verify` passes for all 12 competitors
- [ ] Client approves production run
- [ ] GitHub Actions workflow enabled for the repo

### Post-first-live-run

- [ ] `run_summary.json` has `success >= 10` (at least 10 of 12 succeeded)
- [ ] `failed == 0` or individual failures diagnosed
- [ ] Snapshot files written for all competitors
- [ ] Delta files written for all competitors with new reviews
- [ ] `run.log` rotated if >5 MB
- [ ] Data committed by `gbp-monitor-bot`
- [ ] Verify next cron day: run completes and data is committed

### Ongoing monitoring

- [ ] Check `selector_report.json` daily for degraded/broken selectors
- [ ] Check `run_summary.json["failed"]` trend (0 is normal; spikes indicate breakage)
- [ ] Check `run.log` for `ALERT: failed >= success` (signals selector breakage)
- [ ] Verify data volume disk usage weekly (<100 MB free triggers health check failure)

---

## 9. Dependencies for Production Readiness

| Dependency | Owner | Status | Notes |
|---|---|---|---|
| All 12 place_ids from client | Client | **BLOCKED** (10 missing) | Minimal viable: 2 exist |
| Playwright Chromium on production | Ops | Ready | In Docker image |
| GitHub Actions write token | Ops | UNKNOWN | `schedule/.github/workflows/scrape.yml:87` uses `bot@localhost` — may need a repo secret |
| Docker host with network access | Ops | UNKNOWN | Requires internet access to Google Maps + GitHub |
| Monitoring alert for `failed >= 0` | Dev | Not implemented | Dashboard reads `run_summary.json` but no external alerting |
| place_id verification tooling | Dev | Not requested | `--verify` mode serves this purpose |
| Rate limit / IP rotation | Dev | **WONTFIX** | Single daily run at 5-10s delays should stay under Google's threshold; escalate if hit |

---

## 10. Rollback Plan

If the live run produces corrupted data or triggers a bot block:

1. **Immediate:** Stop the GitHub Actions workflow (disable schedule or cancel in-progress run)
2. **Data recovery:** Snapshots are versioned (`data/snapshots/{competitor_id}/{timestamp}.json`); restore from pre-run snapshot
3. **Revert config:** `git revert` the last scraper commit to restore previous `run_summary.json`, snapshots, and deltas
4. **Diagnose:** Run `--verify` to capture fresh evidence; inspect `page.png` for bot interstitials
5. **Remediate:** If bot detection — update anti-bot measures (Fix A is first line; next step may be residential proxy or reduced frequency)
6. **Resume:** After fix, run `--verify` against a known-good place_id, then re-enable schedule

---

## 11. Known Gaps (UNPROVEN items from CHANGELOG)

| Gap | References | Impact |
|---|---|---|
| Fix A (Client Hints) not tested against real Google Maps URL | CHANGELOG 2026-07-20T18:04:00, lines 49-51 | Bot detection may still block live captures |
| GitHub Actions workflow never executed | CHANGELOG 2026-07-20T08:32:00, lines 64-67 | Cron schedule, commit step, push step all unproven |
| Log rotation (Fix D) never tested in CI | CHANGELOG 2026-07-20T18:02:00, lines 57-59 | Rotation shell script unproven |
| No regression test for "all tiers failed" in locator | CHANGELOG 2026-07-20T18:06:00, line 38 | `resolve_review_items` returning `None` path uncovered |
| 10 of 12 competitors lack real place_ids | config/listings.json | Live mode processes only 17% of intended targets |
