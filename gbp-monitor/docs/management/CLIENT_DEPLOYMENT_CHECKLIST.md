# Client Deployment Checklist

**Document ID:** OPS-001
**Target Audience:** Client operations team deploying GBP Monitor
**Prerequisites:** Git, Python 3.10+, administrative access on target machine

---

## Pre-Deployment

- [ ] **Verify system requirements**
  - [ ] Python 3.10+ installed (`python --version`)
  - [ ] Git installed (`git --version`)
  - [ ] 1 GB free disk space minimum
  - [ ] Internet access (for initial `pip install`)

---

## Installation

- [ ] **Clone repository**
  ```bash
  git clone <repo-url> gbp-monitor
  cd gbp-monitor/gbp-monitor
  ```

- [ ] **Create virtual environment (recommended)**
  ```bash
  python -m venv .venv
  # Windows:
  .venv\Scripts\activate
  # Linux/Mac:
  source .venv/bin/activate
  ```

- [ ] **Install Python dependencies**
  ```bash
  pip install -r requirements.txt
  ```

- [ ] **Install Playwright Chromium**
  ```bash
  # Windows:
  playwright install chromium
  # Linux (with system deps):
  playwright install --with-deps chromium
  ```

- [ ] **Verify Playwright installation**
  ```bash
  playwright install --check chromium
  ```

- [ ] **Verify scraper with fixtures mode**
  ```bash
  python -m orchestration.run_all --fixtures
  ```
  Expected: `success=3, failed=0, skipped=9`

- [ ] **Run baseline verification**
  ```bash
  python -m tests.verify_baseline
  ```
  Expected: `46 passed, 0 failed`

---

## Configuration

- [ ] **Obtain Google Maps place_ids for all competitors**
  - [ ] Open Google Maps → search for business → URL contains `?q=place_id:ChIJ...`
  - [ ] Or use: `https://www.google.com/maps/place/?q=place_id:ChIJ...`
  - [ ] Record each place_id

- [ ] **Update config/listings.json**
  - [ ] Set `place_id` for each competitor
  - [ ] Verify no JSON syntax errors (use `python -c "import json; json.load(open('config/listings.json'))"`)
  - [ ] Run dry-run validation: (no command yet — see Finding C-2)

- [ ] **Verify live mode works with a single competitor**
  ```bash
  python -m orchestration.run_all --verify --url "https://www.google.com/maps/place/?q=place_id:ChIJ..."
  ```

- [ ] **Run full live scrape**
  ```bash
  python -m orchestration.run_all
  ```

---

## Production Setup

- [ ] **Choose deployment mode**
  - [ ] **GitHub Actions (recommended):** Push to GitHub — workflow at `.github/workflows/scrape.yml`
    - [ ] Ensure bot identity has write access to repo
    - [ ] Verify cron schedule: 05:00 WITA daily (`0 22 * * *` UTC)
    - [ ] Test `workflow_dispatch` trigger manually
  - [ ] **Linux systemd service:**
    - [ ] Copy `deploy/gbp-monitor.service` (when created) to `/etc/systemd/system/`
    - [ ] `systemctl daemon-reload && systemctl enable gbp-monitor.timer`
  - [ ] **Windows Task Scheduler:**
    - [ ] Create task: daily at 05:00, run `python -m orchestration.run_all`

- [ ] **Set up log rotation**
  - [ ] Verify CI log rotation (5MB threshold)
  - [ ] For local runs: add `logrotate` config or manual rotation

- [ ] **Set up backup**
  - [ ] Schedule weekly backup of `data/snapshots/`
  - [ ] Document backup location and retention policy

---

## Post-Deployment Verification

- [ ] **Verify first scheduled run completes**
  - [ ] Check `data/run_summary.json` — `success > 0`
  - [ ] Check `data/run.log` — no ERROR lines

- [ ] **Verify delta detection**
  - [ ] Check `data/reviews_new/` for new review files

- [ ] **Verify alerting**
  - [ ] Confirm `failed >= success` warning appears in logs when expected

- [ ] **Handover documentation**
  - [ ] Share passwords/credentials (if any — currently none)
  - [ ] Document contact for support
  - [ ] Provide link to `docs/management/OPERATIONS_RUNBOOK.md`

---

## Rollback Plan

If deployment fails:
1. **Git revert:** `git revert HEAD` and push
2. **Config revert:** `git checkout HEAD~1 -- config/listings.json`
3. **Data restore:** Restore `data/snapshots/` from backup
4. **Playwright downgrade:** `pip install playwright==1.40.0`
