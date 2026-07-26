# Deployment Strategy

**Document ID:** PADR-004
**Date:** 2026-07-24
**Status:** DRAFT — for review

---

## Current Deployment

```
┌──────────────────────────────────┐
│         GitHub Actions           │
│  ubuntu-latest, Python 3.11      │
│  Cron: 05:00 WITA daily          │
│  Timeout: 30 min                 │
│  Playwright Chromium + deps      │
│  Commits results back to repo    │
└──────────────────────────────────┘
```

**Current limitations:**
- No local/runtime-only deployment option
- CI timeout (30 min) limits scalability
- Committing data to git repo is not ideal at scale
- No dashboard access without filesystem

---

## Deployment Options

### Option 1: Windows Desktop (Current + Task Scheduler)

**How:** Run `python -m orchestration.run_all` via Windows Task Scheduler daily.

**Pros:**
- No infrastructure changes
- Existing Windows machines can run it
- Task Scheduler is built-in

**Cons:**
- Requires Python + Playwright installed on every machine
- No auto-restart on crash
- No monitoring
- Screen session needed for interactive debugging
- Windows file locking can interfere with Playwright

**Evidence:** No Windows-specific deployment tooling exists (`audit/` has no `.ps1` or `.bat` files).

### Option 2: Windows Service

**How:** Wrap the scraper as a Windows service using NSSM (Non-Sucking Service Manager) or Python's `win32serviceutil`.

**Pros:**
- Auto-start on boot
- Auto-restart on crash
- Runs in background (no login session needed)
- Centralized logging via Event Viewer

**Cons:**
- Playwright headless in Windows service mode has known issues (session 0 isolation)
- Requires NSSM or pywin32 dependency
- Debugging is harder than interactive mode
- Windows updates can interrupt scheduled runs

**Evidence:** `orchestration/run_all.py:199-210` — SIGINT/SIGTERM handlers exist but no Windows service wrapper.

### Option 3: Linux systemd Service

**How:** systemd service file + timer for daily cron.

```ini
[Unit]
Description=GBP Monitor Scraper
After=network.target

[Service]
Type=oneshot
ExecStart=/opt/gbp-monitor/.venv/bin/python -m orchestration.run_all
WorkingDirectory=/opt/gbp-monitor
User=gbp-monitor
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

**Pros:**
- Auto-start on boot
- Auto-restart on crash (Restart=on-failure)
- systemd timer replaces cron
- Journald for structured logging
- Resource limits (CPU, memory) per service

**Cons:**
- Requires Linux server
- Playwright system dependencies (`--with-deps`)
- No built-in monitoring

**Evidence:** `schedule/.github/workflows/scrape.yml:49-62` — CI uses Linux. No systemd file exists.

### Option 4: Docker (Single Container)

**How:** Dockerfile with Python 3.11-slim + Playwright Chromium.

```dockerfile
FROM python:3.11-slim
RUN apt-get update && apt-get install -y libnss3 libatk1.0 ...
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt && playwright install chromium
COPY . .
CMD ["python", "-m", "orchestration.run_all"]
```

**Pros:**
- Reproducible environment across machines
- No dependency conflicts with host system
- Easy to version and rollback
- Runs on any OS with Docker
- Resource limits via Docker flags

**Cons:**
- Playwright in Docker has known issues (requires `--no-sandbox`, `--disable-gpu` flags)
- Container image is large (~1.5 GB with Chromium)
- Volumes needed for persistent data
- Requires Docker knowledge

**Evidence:** No Dockerfile exists. `harness/browser.py:207` — `p.chromium.launch(headless=True)` — needs `--no-sandbox` for Docker.

### Option 5: Docker Compose (Multi-Service)

**How:** `docker-compose.yml` with scraper service + optional dashboard.

```yaml
version: '3.8'
services:
  scraper:
    build: .
    volumes:
      - ./data:/app/data
      - ./config:/app/config
    environment:
      - TZ=Asia/Makassar
  dashboard:
    image: nginx:alpine
    ports:
      - "8080:80"
    volumes:
      - ./dashboard/html:/usr/share/nginx/html
```

**Pros:**
- Single-command deployment: `docker compose up`
- Dashboard can read data from shared volume
- Easy to add services (dashboard, database)
- Portable across developer machines, staging, production

**Cons:**
- More complex than single Docker
- Volume permissions issues on some hosts
- Backup requires volume snapshots

**Evidence:** No `docker-compose.yml` exists.

### Option 6: Cloud Deployment

**How:** Run on AWS EC2 / Azure VM / GCP Compute Engine.

**Pros:**
- Scalable infrastructure
- Managed services (CloudWatch, etc.)
- High availability possible
- Professional monitoring

**Cons:**
- Monthly cost ($10-50/mo for small instance)
- Requires cloud expertise
- Overkill for 12 competitors
- Network latency to Google Maps may affect timing

### Option 7: Hybrid (Docker + GitHub Actions)

**How:** Package as Docker image; deploy via GitHub Actions to self-hosted runner.

**Pros:**
- CI/CD pipeline already exists
- Self-hosted runner = no 30-min CI timeout
- Docker ensures environment consistency
- Gradual migration path

**Cons:**
- Requires maintaining self-hosted runner
- More moving parts than pure GitHub Actions

---

## Recommendation: Docker Compose (Option 5)

**Primary Deployment Model: Docker Compose**
**Secondary (current): GitHub Actions**

### Decision Rationale

1. **Reproducibility:** Docker ensures every deployment uses the same environment. Currently, each install requires `pip install` + `playwright install chromium` with potential version drift.

2. **Portability:** Docker Compose works on Linux, Windows (WSL2), and macOS. The same `docker compose up` command works everywhere.

3. **Dashboard integration:** When the dashboard is built, Docker Compose can add it as a second service without changing the scraper deployment.

4. **Backup simplicity:** `docker compose down` + backup `./data/` volume is trivial.

5. **CI alignment:** GitHub Actions can use the same Docker image, eliminating the `pip install` + `playwright install` steps in CI.

### Migration Path

**Phase 1 — Dockerfile for the scraper (M14):**

```dockerfile
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libnspr4 libatk1.0-0t64 libatk-bridge2.0-0t64 \
    libcups2t64 libdrm2 libdbus-1-3 libexpat1 libxcb1 \
    libxkbcommon0 libx11-6 libxcomposite1 libxdamage1 \
    libxext6 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libegl1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && playwright install chromium
COPY . .
RUN useradd -m -u 1001 gbp-monitor && chown -R gbp-monitor:gbp-monitor /app
USER gbp-monitor
CMD ["python", "-m", "orchestration.run_all"]
```

**Phase 2 — Docker Compose with dashboard (M16+):**

```yaml
version: '3.8'
services:
  scraper:
    build: .
    volumes:
      - gbp-data:/app/data
      - ./config:/app/config:ro
    environment:
      - TZ=Asia/Makassar
    restart: unless-stopped
  dashboard:
    build: ./dashboard
    ports:
      - "8080:80"
    volumes:
      - gbp-data:/data:ro
    depends_on:
      - scraper
volumes:
  gbp-data:
```

**Phase 3 — GitHub Actions uses Docker image (M16+):**

```yaml
jobs:
  scrape:
    runs-on: ubuntu-latest
    container:
      image: gbp-monitor:latest
    steps:
      - uses: actions/checkout@v4
      - run: python -m orchestration.run_all
```

---

## Comparison Summary

| Criterion | GitHub Actions | Windows Service | Linux systemd | Docker | Docker Compose | Cloud |
|---|---|---|---|---|---|---|
| Setup time | 5 min | 30 min | 30 min | 1 hr | 2 hr | 1 day |
| Maintenance effort | Low | Medium | Low | Medium | Low | High |
| Portability | GitHub only | Windows only | Linux only | All | All | Cloud only |
| Dashboard ready | No | No | No | No | Yes | Yes |
| Production grade | No | No | Yes | Yes | Yes | Yes |
| Cost | $0 | $0 (existing HW) | $0 (existing HW) | $0 (existing HW) | $0 | $10-50/mo |
| Scalability | 30 min limit | Manual | Manual | Docker flags | Docker Compose | Auto-scaling |
| **Recommended** | Secondary | No | If Linux-only | Almost | **Yes** | Overkill |
