# Docker Guide — GBP Monitor

**Document ID:** DEPLOY-001
**Date:** 2026-07-25
**Target Audience:** Engineers deploying GBP Monitor via Docker

---

## Prerequisites

- Docker Engine 24+ or Docker Desktop 4.25+
- Git (to clone the repository)

---

## Quick Start

```bash
# 1. Clone the repository
git clone <repo-url>
cd gbp-monitor

# 2. Configure environment
cp .env.production .env
# Edit .env if needed (see Environment Reference below)

# 3. Build and run
docker compose up --build

# 4. Verify health
docker compose run --rm scraper python -m orchestration.health
```

---

## Building the Image

```bash
# Build with default tag
docker build -t gbp-monitor:latest .

# Build with version tag
docker build -t gbp-monitor:v1.0.0 .

# Build using docker compose
docker compose build
```

### Multi-stage Build

The `Dockerfile` uses a multi-stage build:

| Stage | Base | Purpose |
|---|---|---|
| `builder` | `python:3.11-slim` | Installs pip dependencies |
| `runtime` | `python:3.11-slim` | Runs the scraper (non-root user) |

Final image size: ~1.5 GB (includes Chromium browser).

---

## Running

### One-off scrape

```bash
# Live mode (default)
docker compose run --rm scraper

# Fixtures mode (test data)
docker compose run --rm -e GBP_MONITOR_MODE=fixtures scraper
```

### Daily scrape (detached)

```bash
# Run once and exit
docker compose up -d
docker compose logs -f scraper
```

### Scheduled daily runs

For daily automated runs, use the host's cron/systemd to invoke:

```bash
# Every day at 05:00 WITA (21:00 UTC)
0 21 * * * cd /opt/gbp-monitor && docker compose run --rm scraper >> /var/log/gbp-monitor.log 2>&1
```

Or use the GitHub Actions workflow (recommended): see `schedule/.github/workflows/scrape.yml`.

---

## Volumes

| Volume | Container Path | Purpose |
|---|---|---|
| `gbp-monitor-data` | `/app/data` | Snapshots, deltas, logs, config backups |
| `./config` | `/app/config` (ro) | Competitor and selector configuration |
| `./tests/fixtures` | `/app/tests/fixtures` (ro) | Test fixtures for `--fixtures` mode |

---

## Health Check

```bash
# Check scraper health (returns JSON)
docker compose run --rm scraper python -m orchestration.health

# Compact output for monitoring systems
docker compose run --rm scraper python -m orchestration.health --compact
```

The Docker HEALTHCHECK runs every 30 seconds and verifies:
- Configuration files exist and are valid JSON
- Data directory is writable
- Disk space is above threshold (default 100 MB)
- Snapshots are accessible (if any exist)
- Playwright Chromium is installed

---

## Environment Reference

| Variable | Default | Description |
|---|---|---|
| `TZ` | `Asia/Makassar` | Timezone for log timestamps |
| `GBP_MONITOR_MODE` | `live` | Run mode: `live` or `fixtures` |
| `GBP_MONITOR_NO_SANDBOX` | `true` | Disable Chromium sandbox (required in Docker) |
| `GBP_MONITOR_LOG_LEVEL` | `INFO` | Log level: DEBUG, INFO, WARNING, ERROR |
| `GBP_MONITOR_MIN_DISK_BYTES` | `104857600` | Minimum free disk for health check (bytes) |

---

## Troubleshooting

### Chromium crashes with "Failed to move to new namespace"

**Cause:** Chromium sandbox is incompatible with Docker's default seccomp profile.

**Fix:** Ensure `GBP_MONITOR_NO_SANDBOX=true` in `.env`.

### "No usable sandbox" error

```bash
# Add --no-sandbox launch argument (already configured via environment)
docker compose run --rm -e GBP_MONITOR_NO_SANDBOX=true scraper
```

### Permission denied when writing data

**Cause:** Container runs as `gbp-monitor` (uid 1001) but volume was created by root.

**Fix:**
```bash
# On the host, fix volume permissions
docker run --rm -v gbp-monitor-data:/data alpine chown -R 1001:1001 /data
```

### Image too large (~1.5 GB)

The image includes Chromium browser (~500 MB). To reduce size:
- Use a slimmer base image (not recommended — Playwright's Chromium requires system libraries)
- Remove Chromium altogether (run in `--fixtures` mode only)
