# Security Audit — GBP Monitor

**Audit Date:** 2026-07-24
**Auditor:** M12 Pipeline
**Version:** 1.0

---

## Overview

GBP Monitor is a **local CLI tool** — no web server, no network services, no user accounts, no authentication. The attack surface is limited to:

1. Local filesystem access (read/write in project directory)
2. Outbound HTTP requests to Google Maps (Playwright browser)
3. Parsing of untrusted HTML (Google Maps responses)
4. CLI arguments

---

## Findings

### S-1: Path traversal via competitor_id [HIGH]

**File:** `orchestration/run_all.py:957`
**Code:**
```python
comp_dir = str(verify_root / comp_id)
```
**Risk:** If `competitor_id` in `config/listings.json` contains `../`, files can be written outside `data/verify/`. Also affects `harness/capture.py:198-201` (screenshot_dir).

**Evidence:** `verify_root = Path("data/verify") / verify_ts` — `verify_ts` is a safe timestamp. But `comp_id` comes from `listings.json` which could be maliciously edited.

**Exploit scenario:** Attacker with filesystem write access to `listings.json` sets `competitor_id: "../../etc/evil"` → files written to `data/verify/20260724/../../etc/evil/`.

**Mitigation:** Reject `competitor_id` containing `..` or path separators. Add validation at config load time.

**Severity:** HIGH — but limited by requirement that attacker already has config write access.

**M13B Mitigation:** `_sanitize_competitor_id()` added at `orchestration/run_all.py:128-175`. Validates every competitor_id against `^[a-zA-Z0-9_-]+$` regex, rejects `..`, `/`, `\`, null bytes, and enforces 64-char max length. Called at `_process_one_listing()` (line ~690) and `run_verify()` (line ~1035) before any filesystem operations. Defense-in-depth: `harness/capture.py:197-210` validates `screenshot_dir` for `..` components. **Status: RESOLVED**

---

### S-2: Unbounded log file growth [MEDIUM]

**File:** `orchestration/run_all.py:86`
**Code:**
```python
logging.FileHandler("data/run.log", encoding="utf-8")
```
**Risk:** Log file is append-only, no rotation in local mode. Grows ~4KB per daily run = ~1.5MB/year for 12 competitors. At 1000 competitors: ~120MB/year.

**Evidence:** CI workflow has 5MB rotation (`scrape.yml:49-62`) but local runs do not.

**Exploit scenario:** No realistic exploit — but logs could fill disk over years of daily use.

**Mitigation:** Add local log rotation to `_finish_and_write_summary()`.

**Severity:** MEDIUM — disk exhaustion risk on long-running deployments.

**M13B Mitigation:** `_rotate_run_log_if_needed()` added at `orchestration/run_all.py:195-213`. Called at the start of every run (before `_preflight_checks`). Rotates `data/run.log` to `data/run.log.YYYYMMDD` when file exceeds 5 MB. Mirrors the CI rotation in `scrape.yml:49-62`. **Status: RESOLVED**

---

### S-3: SSRF via --url flag [LOW]

**File:** `orchestration/run_all.py:1060-1069`
**Code:**
```python
parser.add_argument("--url", type=str, default=None)
...
url = url_override or _resolve_url(comp)
...
_capture_with_retries(context, url, selectors, comp_id, ...)
```
**Risk:** `--url` is passed directly to `page.goto()` then `requests.get()`. An attacker controlling CLI args could make the tool visit arbitrary URLs.

**Evidence:** Tool resolves URL and navigates Playwright browser to it. If `--url "file:///etc/passwd"` is passed, Playwright will attempt to navigate there.

**Exploit scenario:** If run via CI with untrusted input — but `--url` is CLI-only, not environment-controlled.

**Mitigation:** Validate `--url` starts with `https://` and contains `google.com` or `maps.googleapis.com`. Or accept risk (CLI-only).

**Severity:** LOW — CLI-only, no remote input vector.

**M13B Mitigation:** URL validation added at `orchestration/run_all.py:1110-1117` (in `__main__`). Rejects non-`https://` URLs, warns if URL does not contain `google.com/maps` or `maps.googleapis.com`. **Status: RESOLVED**

---

### S-4: JSON injection (theoretical) [LOW]

**File:** `parser/review_parser.py:65-76`
**Code:**
```python
Review(
    text=_safe_parse_text(item, selectors),
    ...
)
```
**Risk:** Malicious review text from Google Maps could contain injection characters. But `json.dumps` automatically escapes all special characters.

**Evidence:** Review text is stored via `json.dumps(indent=2, ensure_ascii=False)` — properly escaped.

**Severity:** LOW — mitigated by standard JSON serialization.

---

### S-5: No authentication [INFO]

**File:** N/A
**Risk:** No access control at all. Any user with filesystem access can read/write all data.

**Evidence:** No login, no API keys, no authorization check anywhere.

**Severity:** INFO — acceptable for a local CLI tool with no sensitive data. If dashboard is added, authentication will be required.

---

### S-6: No CSRF/XSS [INFO]

**File:** N/A
**Risk:** No web forms, no user-generated content rendered in a browser. No XSS or CSRF vectors exist.

**Evidence:** The tool is a Python CLI that writes JSON files. No HTML rendering, no cookies, no sessions.

**Severity:** INFO.

---

### S-7: No secret management [INFO]

**File:** N/A
**Risk:** No credentials stored — but also no mechanism to store them if needed in future.

**Evidence:** No `.env`, no secrets file, no encrypted storage.

**Severity:** INFO — neutral finding.

---

### S-8: Rate limiting [MEDIUM]

**File:** `orchestration/run_all.py:110`
**Code:**
```python
_LIVE_POLITE_DELAY_S = (5.0, 10.0)
```
**Risk:** Random 5-10s delay between listings is minimal. At 12 competitors, ~90s total delay. Could trigger Google rate limiting on fast sequential runs.

**Evidence:** At 5-10s delay, with 12 competitors at ~15s capture each = ~4 min total. Google typically allows this. But if concurrent runs could overlap.

**Severity:** MEDIUM — rate limiting could cause intermittent failures at scale.

**M13B Mitigation:** `RateLimiter` class added at `orchestration/run_all.py:339-378`. Provides per-domain rate tracking with configurable min interval, max requests per rolling window. Available for use but not yet wired into the capture path (would require architectural change). The existing `_LIVE_POLITE_DELAY_S` (5-10s random delay) remains the active mechanism. **Status: MITIGATED (infrastructure available, not active)**

---

### S-9: No disk space check [LOW]

**File:** `orchestration/run_all.py` — no disk space check before capture
**Risk:** If disk is full, snapshot write fails silently — data loss.

**Evidence:** No `shutil.disk_usage()` check before writing.

**Mitigation:** Add preflight check for minimum free disk space.

**Severity:** LOW — unlikely on production systems but no guard.

**M13B Mitigation:** `_check_disk_space()` added at `orchestration/run_all.py:215-231`. Called at run startup, warns if free disk space drops below 100 MB. Uses `shutil.disk_usage()`. **Status: RESOLVED**

---

## Attack Surface Summary

```
┌─────────────────────────────────────────┐
│              CLI Arguments              │
│  --fixtures  --verify  --url            │
│         ↓                ↓              │
│  JSON Config Files     URL (SSRF S-3)   │
│  (S-1: path traversal)                  │
│         ↓                               │
│  Playwright Browser ──→ Google Maps     │
│         ↓                               │
│  HTML Parsing (S-4: injection)          │
│         ↓                               │
│  Filesystem Write (S-1: traversal)      │
│         ↓                               │
│  JSON Snapshots + Logs (S-2: no rot.)   │
└─────────────────────────────────────────┘
```

## Security Score: 8/10 (up from 7/10 in M12)

### What's good:
- No authentication needed (local CLI tool)
- No web server — no XSS/CSRF/RCE vectors from network
- Atomic file writes prevent partial-corruption attacks
- JSON serialization properly escapes content
- All exceptions caught — no crash-to-shell
- Lock file prevents race conditions
- **NEW (M13B):** Path traversal via competitor_id — validation in place
- **NEW (M13B):** Log rotation for local mode — auto-rotates at 5 MB
- **NEW (M13B):** Disk space preflight check — warns below 100 MB
- **NEW (M13B):** URL validation on `--url` flag — rejects non-https://
- **NEW (M13B):** Config validation (`--validate-config`) — detects duplicates, invalid place_ids
- **NEW (M13B):** Config auto-backup — backs up before each run
- **NEW (M13B):** Security regression tests — 17+ checks in verify_baseline

### Remaining (deferred to future):
- **MEDIUM:** Rate limiting — `RateLimiter` class available but not wired into capture path
- **LOW:** No `--url` protocol restriction beyond `https://` prefix check

### M13B Changes Summary

| Finding | Severity | Status | Implementation |
|---|---|---|---|
| S-1: Path traversal | HIGH | **RESOLVED** | `_sanitize_competitor_id()`, `_safe_path_within()` |
| S-2: Unbounded log | MEDIUM | **RESOLVED** | `_rotate_run_log_if_needed()` at 5 MB |
| S-3: SSRF via --url | LOW | **RESOLVED** | URL validation in `__main__` |
| S-4: JSON injection | LOW | No change | Already mitigated by `json.dumps` |
| S-8: Rate limiting | MEDIUM | **MITIGATED** | `RateLimiter` class available |
| S-9: Disk space | LOW | **RESOLVED** | `_check_disk_space()` at startup |
| Config validation | — | **NEW** | `_validate_listings_config()`, `--validate-config` CLI |
| Config backup | — | **NEW** | `_backup_config()` before each run |
| Security tests | — | **NEW** | 17+ checks in verify_baseline Phase 4 |

### Future concerns (when dashboard is added):
- Authentication becomes critical
- API rate limiting needed
- Input validation on all API routes
- Session management
- CORS configuration
