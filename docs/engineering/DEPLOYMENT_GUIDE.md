# Rother Deployment Guide

**Version:** 0.2.0  
**Audience:** Operations engineers  
**Scope:** Next.js dashboard (this guide) + Python scraper (see `gbp-monitor/docs/deployment/DEPLOYMENT_GUIDE.md`)

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Variables](#environment-variables)
3. [Windows Deployment](#windows-deployment)
4. [Docker Deployment](#docker-deployment)
5. [Startup](#startup)
6. [Shutdown](#shutdown)
7. [Upgrades](#upgrades)
8. [Backup](#backup)
9. [Restore](#restore)
10. [Rollback](#rollback)
11. [Health Checks](#health-checks)
12. [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Dependency | Version | Required For |
|---|---|---|
| Node.js | 20.x LTS or later | Dashboard runtime |
| npm or bun | Latest | Dependency management |
| Python | 3.11+ | Scraper subsystem |
| Playwright Chromium | Installed via pip | Scraper browser automation |
| Disk space | 1 GB minimum | Build output + data |

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | Prisma database connection string (SQLite or PostgreSQL) |
| `API_KEY` | No | (unset) | API key for mutating endpoints. Set for production. |
| `GBP_ROOT` | No | `<cwd>/gbp-monitor` | Absolute path to the Python scraper project |
| `SCRAPER_TIMEOUT_MS` | No | `600000` | Max scraper runtime before forced kill (ms) |

Create a `.env` file in the project root (see `.env.example`).

---

## Windows Deployment

### 1. Build the Dashboard

```powershell
# Install dependencies
npm install

# Build the Next.js standalone output
npm run build
```

The standalone build is written to `.next/standalone/`.

### 2. Configure the Environment

```powershell
# Copy the example env file
copy .env.example .env

# Edit .env with your values
notepad .env
```

### 3. Copy Static Assets

The standalone build does not include `public/` or `node_modules/.pnpm/` by default. Copy them:

```powershell
# Copy public assets (images, icons, robots.txt)
xcopy /E /I public .next\standalone\public

# Copy the gbp-monitor directory (scraper)
xcopy /E /I gbp-monitor .next\standalone\gbp-monitor

# Copy the standalone server dependencies
xcopy /E /I node_modules .next\standalone\node_modules
```

### 4. Start the Server

```powershell
cd .next\standalone
node server.js
```

The dashboard is now available at `http://localhost:3000`.

### 5. (Optional) Configure Reverse Proxy with Caddy

The included `Caddyfile` runs Caddy on port 81 and proxies to port 3000:

```powershell
caddy run
```

### 6. Run as a Windows Service

Use `nssm` (Non-Sucking Service Manager) to run the dashboard as a service:

```powershell
nssm install Rother "C:\Program Files\nodejs\node.exe" "C:\path\to\.next\standalone\server.js"
nssm set Rother AppDirectory "C:\path\to\.next\standalone"
nssm start Rother
```

---

## Docker Deployment

### Dashboard Docker Image

The project currently does not include a root-level Dockerfile for the dashboard. To containerize:

```dockerfile
# Dockerfile (not yet included — add to project root)
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/gbp-monitor ./gbp-monitor
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
```

### Scraper Docker Deployment

The Python scraper has its own Docker support:

```powershell
cd gbp-monitor
docker compose up --build
```

See `gbp-monitor/docs/deployment/DOCKER_GUIDE.md` for details.

---

## Startup

### Manual Start

```powershell
# From the standalone directory
node server.js
```

### Production Process Manager (PM2)

```powershell
npm install -g pm2
pm2 start .next/standalone/server.js --name rother-dashboard
pm2 save
pm2 startup   # Configure auto-start on boot
```

### Verifying Startup

1. Dashboard responds at `http://localhost:3000` → HTTP 200
2. API responds at `http://localhost:3000/api/overview` → JSON with `runSummary`
3. Health endpoint: `http://localhost:3000/api/` → JSON with system info

---

## Shutdown

### Graceful Shutdown

```powershell
# PM2
pm2 stop rother-dashboard

# PowerShell (find and kill the Node process)
Stop-Process -Name "node" -Force
```

### What Happens on Shutdown

- In-flight scraper processes are orphaned (they continue until completion or timeout)
- Run state in memory (`ScrapeRunManager`) is lost
- Data on disk (snapshots, deltas, config) is preserved
- SQLite database is closed cleanly by Prisma

---

## Upgrades

### Standard Upgrade

```powershell
# 1. Pull latest code
git pull origin main

# 2. Install new dependencies
npm install

# 3. Rebuild
npm run build

# 4. Copy assets to standalone
xcopy /E /I public .next\standalone\public
xcopy /E /I gbp-monitor .next\standalone\gbp-monitor
xcopy /E /I node_modules .next\standalone\node_modules

# 5. Restart the server
pm2 restart rother-dashboard
```

### Database Migrations

```powershell
# Run pending Prisma migrations
npx prisma migrate deploy
```

---

## Backup

### What to Back Up

| Path | Description | Frequency |
|---|---|---|
| `gbp-monitor/data/snapshots/` | Review snapshot files | Daily |
| `gbp-monitor/data/reviews_new/` | Delta review files | Daily |
| `gbp-monitor/data/run_summary.json` | Last run summary | After each run |
| `gbp-monitor/config/` | Listings + selectors config | On change |
| `db/custom.db` (or your DB) | Prisma database | Daily |
| `.env` | Environment configuration | On change |

### Automated Backup Script

```powershell
# backup.ps1 — run as a scheduled task
$date = Get-Date -Format "yyyyMMddTHHmmssZ"
$backupDir = "C:\backups\rother\$date"
New-Item -ItemType Directory -Path $backupDir -Force

# Copy data directories
Copy-Item -Recurse "gbp-monitor\data\snapshots" "$backupDir\snapshots"
Copy-Item -Recurse "gbp-monitor\data\reviews_new" "$backupDir\reviews_new"
Copy-Item "gbp-monitor\data\run_summary.json" "$backupDir\run_summary.json"
Copy-Item -Recurse "gbp-monitor\config" "$backupDir\config"
Copy-Item "db\custom.db" "$backupDir\custom.db"
Copy-Item ".env" "$backupDir\.env"

# Compress
Compress-Archive -Path "$backupDir\*" -DestinationPath "$backupDir.zip"
Remove-Item -Recurse $backupDir

# Retention: keep last 30 days
Get-ChildItem "C:\backups\rother" -Filter "*.zip" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
    Remove-Item
```

---

## Restore

### Full Restore

```powershell
# 1. Stop the dashboard
pm2 stop rother-dashboard

# 2. Extract the backup
$backupFile = "C:\backups\rother\20260726T120000Z.zip"
$restoreDir = "C:\restore\rother"
Expand-Archive -Path $backupFile -DestinationPath $restoreDir

# 3. Replace data directories
Remove-Item -Recurse "gbp-monitor\data\snapshots"
Remove-Item -Recurse "gbp-monitor\data\reviews_new"
Copy-Item -Recurse "$restoreDir\snapshots" "gbp-monitor\data\snapshots"
Copy-Item -Recurse "$restoreDir\reviews_new" "gbp-monitor\data\reviews_new"
Copy-Item "$restoreDir\run_summary.json" "gbp-monitor\data\run_summary.json"
Copy-Item "$restoreDir\config\*" "gbp-monitor\config\"
Copy-Item "$restoreDir\custom.db" "db\custom.db"
Copy-Item "$restoreDir\.env" ".env"

# 4. Restart
pm2 start rother-dashboard
```

### Restore Validation

After restore, verify:

```powershell
# 1. Dashboard loads
curl http://localhost:3000

# 2. Overview API returns data
curl http://localhost:3000/api/overview

# 3. Reviews are accessible
curl http://localhost:3000/api/reviews

# 4. Config is intact
curl http://localhost:3000/api/config/listings

# 5. Snapshot count matches expected
curl http://localhost:3000/api/branches
```

---

## Rollback

### Rolling Back a Failed Upgrade

```powershell
# 1. Check out the previous release
git checkout tags/v0.1.0

# 2. Rebuild
npm install && npm run build

# 3. Restore the previous database backup
# (see Restore section above)

# 4. Restart
pm2 restart rother-dashboard
```

---

## Health Checks

The dashboard exposes these endpoints for monitoring:

| Endpoint | Expected Response | Frequency |
|---|---|---|
| `GET /` | HTML page, HTTP 200 | 30s |
| `GET /api/overview` | JSON with `runSummary`, HTTP 200 | 30s |
| `GET /api/` | JSON with system info, HTTP 200 | 60s |

### Monitoring with Uptime Kuma or similar

```yaml
# docker-compose monitoring example
services:
  uptime-kuma:
    image: louislam/uptime-kuma
    ports:
      - "3001:3001"
    volumes:
      - uptime-kuma-data:/app/data
```

Monitor these URLs:
- `http://your-server:3000/` — Dashboard home
- `http://your-server:3000/api/overview` — API response

---

## Troubleshooting

| Symptom | Likely Cause | Resolution |
|---|---|---|
| Dashboard shows blank page | No error boundary caught (check `error.tsx`) | Check browser console; restart server |
| API returns 401 | `API_KEY` set but request missing auth header | Set `Authorization: Bearer <key>` header |
| API returns 429 | Rate limit exceeded | Wait 60 seconds; reduce request frequency |
| Scraper fails silently | `GBP_ROOT` path incorrect | Verify path; check `gbp-monitor/data/run.log` |
| Dashboard can't find scraper | `GBP_ROOT` not set or wrong | Set `GBP_ROOT` env var to full path of `gbp-monitor/` |
| Build fails on Windows | Path length / permission issues | Run as Administrator; use `npm cache clean --force` |
| Port already in use | Another process on 3000 | Change port: `node server.js --port 3001` |

---

## Security Considerations

1. **API Key**: Always set `API_KEY` in production. Without it, anyone can trigger scrapers and modify config.
2. **HTTPS**: Use a reverse proxy (Caddy, nginx) to terminate TLS. The included `Caddyfile` is a starting point.
3. **Network**: Restrict access to port 3000 to trusted networks only. Do not expose directly to the internet.
4. **Backups**: Store backups in a separate location from the running system.
5. **Updates**: Apply Node.js security patches promptly.
