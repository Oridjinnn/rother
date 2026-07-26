# Deployment Guide — GBP Monitor

**Document ID:** DEPLOY-002
**Date:** 2026-07-25
**Target Audience:** Operations team deploying GBP Monitor to production

---

## Deployment Options

| Option | Use Case | Complexity | Recommended |
|---|---|---|---|
| Docker Compose | Primary deployment model | Low | **Yes** |
| GitHub Actions | CI/CD, scheduled runs | Low | Yes (daily cron) |
| Local CLI | Development, testing | Low | Yes |
| Manual Linux service | Production without Docker | Medium | Fallback |
| Windows Task Scheduler | Windows-only deployment | Medium | Fallback |

---

## Production Checklist

### Before Deploying

- [ ] **All 12 place_ids are configured** in `config/listings.json`
- [ ] **Baseline verification passes**: `python -m tests.verify_baseline` → 63/63
- [ ] **Live verify passes**: `python -m orchestration.run_all --verify` → 12/12
- [ ] **Docker image builds**: `docker build -t gbp-monitor:latest .`
- [ ] **Config backup tested**: `python scripts/backup.py --dry-run`
- [ ] **Restore tested**: `python scripts/restore.py <backup-file> --dry-run`

### Deployment Steps

#### Docker Compose (Recommended)

```bash
# 1. Clone
git clone <repo-url> /opt/gbp-monitor
cd /opt/gbp-monitor

# 2. Configure
cp .env.production .env
# Edit .env: set TZ, verify GBP_MONITOR_MODE=live

# 3. Build
docker compose build

# 4. Verify health
docker compose run --rm scraper python -m orchestration.health

# 5. Run initial scrape
docker compose run --rm scraper

# 6. Verify output
docker compose run --rm scraper python -m orchestration.health
docker compose run --rm scraper cat /app/data/run_summary.json
```

#### GitHub Actions

```bash
# 1. Push to GitHub
git remote add origin <github-repo-url>
git push -u origin main

# 2. Go to GitHub Actions tab
# 3. Click "GBP Review Monitor" workflow
# 4. Click "Run workflow" (workflow_dispatch)
# 5. Verify the run completes successfully
```

#### Manual (No Docker)

```bash
# 1. Clone
git clone <repo-url> /opt/gbp-monitor
cd /opt/gbp-monitor/gbp-monitor

# 2. Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt
playwright install --with-deps chromium

# 4. Configure
cp .env.production .env

# 5. Set up systemd timer (see below)
```

### systemd Timer Setup

```ini
# /etc/systemd/system/gbp-monitor.service
[Unit]
Description=GBP Monitor Scraper
After=network.target

[Service]
Type=oneshot
ExecStart=/opt/gbp-monitor/.venv/bin/python -m orchestration.run_all
WorkingDirectory=/opt/gbp-monitor/gbp-monitor
User=gbp-monitor
EnvironmentFile=/opt/gbp-monitor/gbp-monitor/.env
```

```ini
# /etc/systemd/system/gbp-monitor.timer
[Unit]
Description=Daily GBP Monitor scrape at 05:00 WITA

[Timer]
OnCalendar=*-*-* 22:00:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
```

---

## Post-Deployment

### Verify Data Flow

```bash
# 1. Check run summary
docker compose run --rm scraper cat /app/data/run_summary.json

# 2. Check for errors
docker compose run --rm scraper grep ERROR /app/data/run.log

# 3. Check snapshots created
docker compose run --rm scraper ls -la /app/data/snapshots/

# 4. Check deltas
docker compose run --rm scraper ls -la /app/data/reviews_new/
```

### Monitoring

```bash
# Scheduled via cron (runs daily at 05:00 WITA = 21:00 UTC)
0 21 * * * cd /opt/gbp-monitor && docker compose run --rm scraper
```

---

## Production Architecture

```
┌─────────────────────────────────────────────────┐
│                   Docker Host                    │
│                                                   │
│  ┌─────────────────────────────────────────┐     │
│  │         gbp-monitor-scraper             │     │
│  │  ┌──────────┐  ┌──────────┐            │     │
│  │  │  Config   │  │   Data   │            │     │
│  │  │ (ro bind) │  │ (volume) │            │     │
│  │  └──────────┘  └──────────┘            │     │
│  │  Mode: oneshot (run and exit)          │     │
│  └─────────────────────────────────────────┘     │
│                                                   │
│  Cron/systemd runs daily at 05:00 WITA            │
│  Health check every 30s (--interval=30)           │
└─────────────────────────────────────────────────┘
```

---

## Security

- Container runs as **non-root user** (`gbp-monitor`, uid 1001)
- Config files mounted **read-only** (`:ro`)
- Chromium sandbox disabled only when `GBP_MONITOR_NO_SANDBOX=true` (Docker)
- Health check does not expose ports — CLI-only output
- No secrets stored (no API keys, no passwords)
