# AUDIT-09 — Product Readiness Audit

**Audit Date:** 2026-07-24
**Auditor:** M12 pipeline (automated)
**Scope:** Full product readiness assessment across 8 phases
**Status:** COMPLETE

---

## Executive Summary

| Category | Score (0–10) | Key Limitation |
|---|---|---|
| Production Readiness | 4/10 | Core pipeline works but 10/12 place_ids missing; no deployment automation |
| Deployment Readiness | 2/10 | No Docker, no service files, no packaging, no env template |
| Maintainability | 5/10 | Well-structured code, thorough CHANGELOG, but no test framework, no CONTRIBUTING |
| Security | 7/10 | Local CLI only — limited surface. No auth, no web server, no credentials stored |
| Scalability | 4/10 | Sequential only, no parallelism, unbounded snapshot growth, no retention policy |
| Client Usability | 3/10 | CLI-only, manual JSON config, no validation tool, no progress feedback |

**Overall Score: 4.2 / 10**

---

## Phase 1 — Installation Audit

### Finding I-1: No Python version documented
- **Evidence:** `README.md:13-16` shows `pip install -r requirements.txt` but no `python --version` requirement
- **Impact:** User may have incompatible Python. CI uses 3.11 (`schedule/.github/workflows/scrape.yml:36`)
- **Fix:** Add `python_version >= "3.10"` to `requirements.txt` (PEP 508) and document minimum version in README

### Finding I-2: No environment setup script
- **Evidence:** No `.env`, `.env.example`, `setup.py`, `Makefile`, `scripts/`, or any install automation
- **Impact:** 7 manual steps to get running (clone, cd, install python, pip install, playwright install, verify chromium, run)
- **Fix:** Provide `setup.ps1` (Windows) and `setup.sh` (Linux) that automate: venv creation, pip install, playwright install

### Finding I-3: Playwright install differs between local and CI
- **Evidence:**
  - `README.md:15`: `playwright install chromium`
  - `schedule/.github/workflows/scrape.yml:43`: `playwright install --with-deps chromium`
- **Impact:** Local install misses system deps (`--with-deps`) — Chromium may fail on Linux without `libnss3`, `libatk1.0`, etc.
- **Fix:** Document both commands; recommend `--with-deps` for Linux

### Finding I-4: requirements.txt does not pin sub-dependencies
- **Evidence:** `requirements.txt:1-8`: three loose pins (`>=1.40.0`, `>=1.8.1`, `>=2.31.0`)
- **Impact:** Non-reproducible installs — `pip install` may resolve different versions tomorrow
- **Fix:** Add `pip freeze > requirements-locked.txt` to setup; pin exact versions for release

### Finding I-5: No Chromium install verification
- **Evidence:** `README.md:15-16`: "playwright install chromium" then "run --fixtures"
- **Impact:** User installs Playwright but never verifies Chromium works until first live run (which fails inscrutably)
- **Fix:** Add `playwright install --check chromium` step to setup script

### Finding I-6: No failure recovery documentation
- **Evidence:** `README.md:10-69`: no troubleshooting section
- **Impact:** User hitting `ModuleNotFoundError` or `playwright install` failure has no guidance
- **Fix:** Add "Troubleshooting" section with `ModuleNotFoundError`, `playwright command not found`, `Chromium not installed`

### Finding I-7: Stale README content
- **Evidence:** `README.md:39`: "Expected output: 67 checks pass" — actual is 46 (updated in M11 Phase 5)
- **Impact:** Users verifying installation get confused when output differs
- **Fix:** Update README to `46 checks pass`

---

## Phase 2 — Configuration Management Audit

### Finding C-1: No CLI for config operations
- **Evidence:** `config/listings.json` is edited manually; no `add-branch`, `add-competitor`, `set-place-id` commands
- **Impact:** Non-developer cannot safely add a competitor without understanding JSON syntax
- **Severity:** Critical for client adoption
- **Fix:** Implement `python -m config.cli add-competitor --branch cph-canggu --name "Cafe Name" --place_id ChIJ...`

### Finding C-2: No config validation command
- **Evidence:** Schema validation exists only inside `_resolve_url()` at `orchestration/run_all.py:349-361` and `_preflight_checks()` at `run_all.py:278-306`
- **Impact:** User must run full scrape to discover validation errors
- **Fix:** Expose `python -m orchestration.run_all --validate-config` that checks listings.json + selectors.json without scraping

### Finding C-3: No place_id lookup wizard
- **Evidence:** User must manually find place_ids from Google Maps (referenced in `README.md:23` pointing to `LIVE_SCRAPING_GUIDE.md` which doesn't exist)
- **Impact:** Finding place_ids requires browser devtools knowledge — non-trivial for non-developers
- **Fix:** Implement `python -m discovery.find_place_id "Crate Cafe Canggu"` using Google Maps search API

### Finding C-4: Mock URLs never expire
- **Evidence:** `config/listings.json:12`: 10 of 12 competitors still have mock `place_id: null`
- **Impact:** Live run silently skips 10/12 competitors — user may not notice
- **Fix:** Add preflight warning count; require explicit `"skip": true` for intentionally-skipped listings

### Finding C-5: No config rollback
- **Evidence:** No `--backup`, `--restore`, or git-integrated config recovery
- **Impact:** Accidental JSON syntax error breaks the entire run
- **Fix:** Auto-backup config before each run (`data/config_backups/{ts}/listings.json`)

### Finding C-6: No "dry-run" mode
- **Evidence:** `_resolve_url()` constructs URL but no mode exists to print what URLs *would* be visited
- **Impact:** Non-developer cannot verify config changes without triggering real captures
- **Fix:** Add `--dry-run` to print resolved URLs and skip capture

---

## Phase 3 — Recovery Audit

### Finding R-1: Lock recovery works but undocumented
- **Evidence:** `orchestration/run_all.py:142-196`: lock file with stale detection (30 min threshold)
- **Impact:** Operator seeing "Lock file exists" error has no guidance on what to do
- **Fix:** Document recovery in runbook: remove `data/.run.lock` if previous process crashed

### Finding R-2: Corrupt snapshot returns empty — silent data loss risk
- **Evidence:** `storage/snapshot_store.py:75-84`: `_load_json_array` logs WARNING and returns `[]` on corrupt JSON
- **Impact:** A corrupt snapshot silently resets baseline — all previously-seen reviews become "new" again on next run
- **Fix:** Move corrupt files to `data/snapshots/{competitor_id}/corrupt/` for investigation instead of silently ignoring

### Finding R-3: No recovery after partial write
- **Evidence:** `storage/snapshot_store.py:117-125`: atomic write via `.tmp` + `replace()` — partial write cannot corrupt existing file
- **Impact:** Atomic writes prevent corruption but the `.tmp` file may be left behind if process crashes mid-write
- **Fix:** Clean stale `.tmp` files at startup (preflight check)

### Finding R-4: No data integrity checker
- **Evidence:** No `python -m storage.integrity_check` exists
- **Impact:** Operator cannot validate snapshot integrity without reading raw JSON
- **Fix:** Add integrity check tool that verifies: all latest.json pointers resolve, all JSON is valid, reviews have required fields

### Finding R-5: Missing file recovery not tested
- **Evidence:** `storage/snapshot_store.py:87-104`: `load_snapshot` handles missing files gracefully (returns `[]`)
- **Impact:** If `latest.json` is deleted but snapshot dir exists, the old flat-file fallback may not match
- **Fix:** Add fallback: scan directory for newest `.json` if `latest.json` is missing

---

## Phase 4 — Security Audit

### Finding S-1: CRITICAL — No input validation on --url flag
- **Evidence:** `orchestration/run_all.py:1060-1069`: `--url` is passed directly to `_resolve_url()` → `validate_listing()` → `requests.get(url)`
- **Impact:** SSRF via `--url` if attacker controls CLI arguments (mitigated: CLI-only tool, no remote input)
- **Classification:** Low (local CLI only)

### Finding S-2: CRITICAL — Arbitrary file write in verify mode
- **Evidence:** `orchestration/run_all.py:957`: `comp_dir = str(verify_root / comp_id)` where `comp_id` comes from `listings.json`
- **Impact:** If `competitor_id` contains `../`, files can be written outside `data/verify/`
- **Classification:** High in shared environments — fix: reject `competitor_id` containing `..` or `/`

### Finding S-3: HIGH — Unbounded log file growth
- **Evidence:** `orchestration/run_all.py:86`: `logging.FileHandler("data/run.log")` — append-only, no rotation
- **Impact:** Log file grows forever (mitigation: CI workflow has 5MB rotation at `scrape.yml:49-62` but local runs do not)
- **Classification:** Medium — disk exhaustion risk on long-running deployments

### Finding S-4: MEDIUM — No rate limiting on capture
- **Evidence:** `orchestration/run_all.py:110`: `_LIVE_POLITE_DELAY_S = (5.0, 10.0)` — random delay between listings
- **Impact:** Google may rate-limit if run too frequently (tunable but not enforced per-domain)
- **Classification:** Medium — could trigger bot detection on fast sequential runs

### Finding S-5: MEDIUM — Secret management absent
- **Evidence:** No `.env`, no secrets file, no credentials stored anywhere
- **Impact:** No secrets to leak — neutral finding. But no mechanism to store API keys if ever needed
- **Classification:** Info

### Finding S-6: LOW — Path traversal in screenshot_dir
- **Evidence:** `harness/capture.py:198-201`: `spath = Path(screenshot_dir); spath.mkdir(parents=True, exist_ok=True)`
- **Impact:** Same as S-2 — `screenshot_dir` comes from `comp_id` which could contain `../`
- **Classification:** High (same as S-2)

### Finding S-7: LOW — JSON injection via review content
- **Evidence:** `parser/review_parser.py:65-76`: review text is extracted from HTML and stored in JSON
- **Impact:** Malicious review text could contain JSON-injection characters — but `json.dumps` escapes automatically
- **Classification:** Low

### Finding S-8: INFO — No authentication
- **Evidence:** No login, no API keys, no access control
- **Impact:** Anyone with filesystem access can run/read everything. Acceptable for a local CLI tool
- **Classification:** Info

### Finding S-9: INFO — No CSRF/XSS vectors
- **Evidence:** No web UI, no forms, no user-generated content rendered in a browser
- **Impact:** No risk
- **Classification:** Info

### Security Summary

| Severity | Count | Key Issues |
|---|---|---|
| Critical | 0 | — |
| High | 2 | S-2 (path traversal via comp_id), S-6 (same vector) |
| Medium | 2 | S-3 (unbounded log), S-4 (rate limiting) |
| Low | 1 | S-1 (SSRF via --url, CLI-only) |
| Info | 3 | S-5, S-8, S-9 |

---

## Phase 5 — Scalability Audit

### Scale Estimates (sequential, single-threaded)

| Competitors | Est. Run Time | Snapshot Storage/yr | Memory |
|---|---|---|---|
| 12 (current) | ~2 min | ~50 MB | ~200 MB |
| 50 | ~8 min | ~200 MB | ~500 MB |
| 100 | ~17 min | ~400 MB | ~800 MB |
| 500 | ~83 min | ~2 GB | ~4 GB |
| 1000 | ~167 min (2.8 hr) | ~4 GB | ~8 GB |

### Finding SC-1: No parallelism
- **Evidence:** `orchestration/run_all.py:458-488`: sequential `for` loop over branches × competitors
- **Impact:** At 1000 competitors, runtime exceeds practical window. No batching or concurrency
- **Recommendation:** Add `ThreadPoolExecutor(max_workers=3)` with per-worker browser context for 3x throughput

### Finding SC-2: Snapshot storage grows unbounded
- **Evidence:** `storage/snapshot_store.py:107-125`: every run creates a new timestamped file; no retention/cleanup
- **Impact:** At 365 runs/year × 1000 competitors = 365,000 files. Disk fills, file system metadata performance degrades
- **Recommendation:** Add retention policy: keep last 90 days; archive older snapshots to compressed storage

### Finding SC-3: No dashboard for large-scale data
- **Evidence:** No web dashboard implemented — data consumed only via raw JSON files
- **Impact:** At 500+ competitors, raw JSON browsing is infeasible. Need aggregation/indexing
- **Recommendation:** Implement simple SQLite-backed dashboard for scalable querying

### Finding SC-4: Memory scales linearly with HTML size
- **Evidence:** `harness/capture.py:192`: `html = page.content()` — full HTML loaded into memory per competitor
- **Impact:** Each competitor's HTML (~500KB) is held in memory during parse. At 1000 competitors, worst-case concurrency would need >500MB just for HTML
- **Recommendation:** Stream parsing where possible; release HTML after parse completes

### Finding SC-5: No caching of Google Maps pages
- **Evidence:** Every live run re-downloads all competitor pages
- **Impact:** Wastes bandwidth and increases rate-limit risk
- **Recommendation:** Cache identical responses for 1 hour within a run session

---

## Phase 6 — Deployment Readiness Audit

### Finding D-1: No Docker support
- **Evidence:** No `Dockerfile` or `docker-compose.yml` in repository
- **Impact:** Cannot deploy in containerized environments. Each deployment must install Python + Playwright manually
- **Fix:** Create Dockerfile with Python 3.11-slim + Playwright Chromium

### Finding D-2: No systemd service file
- **Evidence:** No `.service` file for Linux or Windows Service wrapper
- **Impact:** Cannot run as a managed service. No auto-restart on crash. No logging to journald
- **Fix:** Create `deploy/gbp-monitor.service` for systemd

### Finding D-3: No Windows service support
- **Evidence:** No `nssm` config or Windows Task Scheduler template
- **Impact:** Windows deployments require manual Task Scheduler setup — non-trivial for non-admin users
- **Fix:** Provide `deploy/install-service.ps1` script

### Finding D-4: No release packaging
- **Evidence:** No `setup.py`/`pyproject.toml`/`setup.cfg` — project runs as `python -m orchestration.run_all` from repo root
- **Impact:** Cannot `pip install gbp-monitor`. No version pinning. No entry-point scripts
- **Fix:** Add `pyproject.toml` with `[project.scripts]` entry point

### Finding D-5: No backup strategy
- **Evidence:** No backup script or documented procedure
- **Impact:** Accidental `rm -rf data/snapshots` loses all historical data permanently
- **Fix:** Add `python -m storage.backup` that archives `data/` to timestamped zip

### Finding D-6: No upgrade strategy
- **Evidence:** No migration framework. No CHANGELOG indicates breaking/upgrade path
- **Impact:** `git pull` may break without warning if JSON schema changes
- **Fix:** Add schema version to snapshots; implement auto-migration on version mismatch

### Finding D-7: No rollback strategy
- **Evidence:** No documented rollback procedure
- **Impact:** Bad config change requires manual revert from git history
- **Fix:** Document `git checkout HEAD~1 -- config/ listings.json` rollback command

---

## Phase 7 — Support Readiness Audit

### Finding SU-1: No troubleshooting guide
- **Evidence:** `README.md` has no "Troubleshooting" section
- **Missing:** `docs/management/TROUBLESHOOTING.md`

### Finding SU-2: No error catalog
- **Evidence:** Errors like `SelectorNotFoundError`, `CaptureTimeoutError`, `NavigationError` are logged but not documented in a central catalog
- **Missing:** `docs/management/ERROR_CATALOG.md` with each error's cause, remediation, and example

### Finding SU-3: No recovery guide
- **Evidence:** No document explaining how to recover from: lock file, corrupt snapshot, missing config, failed install
- **Missing:** `docs/management/RECOVERY_GUIDE.md`

### Finding SU-4: No maintenance checklist
- **Evidence:** No periodic maintenance tasks documented
- **Missing:** `docs/management/MAINTENANCE_CHECKLIST.md` (rotate log, verify selectors, prune old snapshots)

### Finding SU-5: No CONTRIBUTING.md
- **Evidence:** No file at `CONTRIBUTING.md`
- **Impact:** New developers don't know: coding style, PR workflow, test expectations, commit message format

### Finding SU-6: No architectural overview
- **Evidence:** `README.md:53-65` shows directory tree but no data flow diagram or architecture doc
- **Impact:** New engineer must read 1088-line `run_all.py` to understand pipeline

---

## Phase 8 — End User UX Audit

### Finding UX-1: First-run experience is silent failure
- **Evidence:** `python -m orchestration.run_all` (no args) runs live mode with no place_ids → skips everything silently. Only WARNING-level log visible
- **Impact:** New user runs the tool and sees no output — thinks it's broken
- **Fix:** Print prominent message: "No valid place_ids found. Use --fixtures for offline testing"

### Finding UX-2: --fixtures mode unclear
- **Evidence:** `README.md:16`: "python -m orchestration.run_all --fixtures" without explaining what "fixtures" are
- **Impact:** Non-developer doesn't know what fixtures are or where they come from
- **Fix:** Document: "uses pre-recorded test data from tests/fixtures/"

### Finding UX-3: No progress indicator
- **Evidence:** `orchestration/run_all.py:468-488`: per-listing log lines but no running progress bar
- **Impact:** On 100+ listings, user sees nothing for minutes between log lines
- **Fix:** Add `tqdm` progress bar or periodic summary prints

### Finding UX-4: No "summary of changes" after run
- **Evidence:** `_finish_and_write_summary` writes to JSON file and logs — not prominently displayed
- **Impact:** User must open `run_summary.json` to see what happened
- **Fix:** Print bullet-point summary to stdout after each run

### Finding UX-5: Config errors discovered late
- **Evidence:** `_preflight_checks` runs warnings but doesn't fail on invalid config
- **Impact:** User makes JSON syntax error → run silently skips listing → user thinks scrape worked
- **Fix:** Validate JSON syntax before starting scrape; display errors prominently

### Finding UX-6: No "what's new" detection
- **Evidence:** Delta detection exists (`storage/delta.py`) but not surfaced to user
- **Impact:** User doesn't know which competitors have new reviews after a run
- **Fix:** Print "New reviews: comp-canggu-01 (2 new), comp-seminyak-01 (0 new)" prominently

### Finding UX-7: place_id lookup is developer-only
- **Evidence:** `README.md:23` references `LIVE_SCRAPING_GUIDE.md` which does not exist
- **Impact:** Non-developer cannot configure live scraping
- **Fix:** Write the referenced guide; add search-by-name tool

### Finding UX-8: No offline help
- **Evidence:** `python -m orchestration.run_all --help` outputs argparse help text only
- **Impact:** No examples, no usage patterns, no troubleshooting
- **Fix:** Add `python -m orchestration.run_all --examples` flag

---

## Findings Summary

| Phase | Findings | Critical | High | Medium | Low | Info |
|---|---|---|---|---|---|---|
| 1 — Installation | 7 | 0 | 1 (I-6) | 3 (I-1, I-3, I-4) | 3 (I-2, I-5, I-7) | 0 |
| 2 — Config Mgmt | 6 | 0 | 1 (C-1) | 3 (C-2, C-3, C-6) | 2 (C-4, C-5) | 0 |
| 3 — Recovery | 5 | 0 | 2 (R-2, R-5) | 2 (R-1, R-3) | 1 (R-4) | 0 |
| 4 — Security | 9 | 0 | 2 (S-2, S-6) | 2 (S-3, S-4) | 1 (S-1) | 4 (S-5, S-7, S-8, S-9) |
| 5 — Scalability | 5 | 0 | 2 (SC-1, SC-2) | 2 (SC-3, SC-5) | 1 (SC-4) | 0 |
| 6 — Deployment | 7 | 0 | 3 (D-1, D-2, D-4) | 3 (D-3, D-5, D-6) | 1 (D-7) | 0 |
| 7 — Support | 6 | 0 | 1 (SU-1) | 3 (SU-2, SU-3, SU-4) | 2 (SU-5, SU-6) | 0 |
| 8 — UX | 8 | 0 | 2 (UX-1, UX-5) | 4 (UX-2, UX-3, UX-6, UX-8) | 2 (UX-4, UX-7) | 0 |
| **Total** | **53** | **0** | **14** | **22** | **13** | **4** |

---

## Scoring Methodology

Each phase scored 0–10 based on:
- **0–3:** Major deficiencies exist that block deployment
- **4–6:** Functional but requires developer intervention for routine operations
- **7–9:** Production-quality with minor gaps
- **10:** Enterprise-ready

**Overall Score: 4.2 / 10**
