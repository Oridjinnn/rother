# Rother — Competitor Review Monitor

Automated monitoring of competitor Google Business Profile reviews. Two subsystems:

- **gbp-monitor/** — Python scraper (Playwright + Parsel)
- **src/** — Next.js dashboard (App Router, shadcn/ui, Recharts)

---

## Prerequisites

| Requirement | Version (verified) | Notes |
|---|---|---|
| **Node.js** | >= 18 (v22.11.0) | `node --version` |
| **npm** | >= 9 (10.9.0) | `npm --version` |
| **Bun** | Not required | Optional; see matrix below |
| **Python** | 3.12+ (3.14.4) | Needed only for scraper (`gbp-monitor/`) |
| **Playwright** | 1.61.0 | `playwright install chromium` from `gbp-monitor/` |

---

## Quickstart

Rother ships as a native desktop app on **Windows, macOS, and Linux** via Tauri
(see [Release artifacts](#release-artifacts)). The dashboard itself is a
Next.js app that also runs standalone on any platform with Node 18+.

### Option A — Desktop app (recommended)

Download the prebuilt bundle for your OS from the
[Releases](https://github.com/rother/rother/releases) page:

| OS | Bundle | Install |
|---|---|---|
| Windows | `Rother_0.4.2_x64-setup.exe` (NSIS) / `.msi` | Double-click, Next |
| macOS | `Rother_0.4.2_aarch64.dmg` / `x86_64.dmg` | Drag to Applications |
| Linux | `Rother_0.4.2_amd64.AppImage` (portable) or `.deb` | Run, or `dpkg -i *.deb` |

No runtime dependencies — Node.js is bundled inside the package.

### Option B — Standalone Next.js server (dev / self-host)

```bash
npm install
npm run build
npm start
```

Open http://localhost:3000 in your browser.

### First-boot evidence

| Check | Result |
|---|---|
| `npm install` | 669 packages, 447ms |
| `npx prisma db push` | Database already in sync, client generated (567ms) |
| `npm run dev` | Next.js 16.2.11, Turbopack, ready in 512ms |
| `curl http://localhost:3000` | HTTP 200, 40 KB HTML, `<title>Rother — Dashboard</title>` |
| `npm run lint` | 24 pre-existing warnings (no startup blockers) |

---

## Release artifacts

Rother is a **Tauri v2 desktop app**. The shell (`src-tauri/`) wraps the
standalone Next.js server as a bundled Node.js sidecar, so every platform gets
a self-contained binary with no runtime dependencies.

| Platform | Bundles | Produced by |
|---|---|---|
| **Linux** | `*.AppImage` (portable), `*.deb` (Debian/Ubuntu) | `npx tauri build -b appimage,deb` — verified |
| **macOS** | `*.dmg` (intel + Apple Silicon) | `npx tauri build -b dmg` |
| **Windows** | `*.exe` (NSIS), `*.msi` | `npx tauri build -b msi` |

The Node.js sidecar is fetched per-platform by
[`.zscripts/setup-node-sidecar.sh`](.zscripts/setup-node-sidecar.sh) before
build; the CI matrix in [`.github/workflows/release.yml`](.github/workflows/release.yml)
builds all three platforms on every tag.

### Building the desktop app

```bash
# 1. Prepare the platform-matched Node.js sidecar
bash .zscripts/setup-node-sidecar.sh

# 2. Build bundles for the current platform
npm run tauri build -b appimage,deb    # Linux
npm run tauri build -b dmg             # macOS
npm run tauri build -b msi             # Windows
```

Artifacts land in `src-tauri/target/release/bundle/<platform>/`.

---

## Startup Matrix

| Command | npm | Bun | Windows | Linux | macOS | Notes |
|---|---|---|---|---|---|---|
| `npm install` / `bun install` | ✓ | ✓ | ✓ | ✓ | ✓ | Works on all three |
| `npx prisma db push` | ✓ | ✓ | ✓ | ✓ | ✓ | Use `npx` or `bun run db:push` |
| `npm run dev` / `bun run dev` | ✓ | ✓ | ✓ | ✓ | ✓ | Fixed: removed `tee` dependency |
| `npm run build` | ✓ | ✓ | ✓ | ✓ | ✓ | Cross-platform via `.zscripts/build.mjs` |
| `npm run start` | ✓ | ✓ | ✓ | ✓ | ✓ | Uses Node.js; production uses `start.sh` |
| `npm run lint` | ✓ | ✓ | ✓ | ✓ | ✓ | ESLint — passes on all |
| `npm run tauri build` | ✓ | — | ✓ | ✓ | ✓ | Desktop bundles (msi/dmg/appimage) |

### Production deployment scripts (`.zscripts/*.sh`)

The shell scripts under `.zscripts/` require a **Unix shell** (bash/sh) and are
used for production deployment only. They are not needed for local development
on Windows. Use the npm scripts above instead.

| Script | Requires | Purpose |
|---|---|---|
| `dev.sh` | bash, bun, curl | Full dev environment (Linux/macOS) |
| `build.sh` | bash, bun, perl, tar | Production build with self-healing |
| `start.sh` | sh, bun, Caddy | Production service start |
| `setup-node-sidecar.sh` | bash, curl, tar | Fetch platform-matched Node.js sidecar for Tauri |
| `mini-services-*.sh` | bash/sh, bun | Mini-service lifecycle |

---

## Runtime Prerequisites Detail

### Node.js — Required
- **Minimum version:** 18
- **Verified version:** 22.11.0
- **Engine:** Any (npm, yarn, pnpm, bun all work for installing)

### npm — Required (for Windows dev)
- **Minimum version:** 9
- **Verified version:** 10.9.0
- Bundled with Node.js

### Bun — Optional
- **Required for:** `.zscripts/*.sh` scripts (production deployment)
- **Not required for:** Local development on Windows
- `bun-types` in devDependencies is only for type checking
- All npm scripts work without Bun

### Prisma — Required
- **Installed via:** `npm install` (included in dependencies)
- **Schema:** `prisma/schema.prisma`
- **Database:** SQLite at `db/custom.db` (auto-created by `db:push`)
- **Not used** by the dashboard runtime — scaffold only

---

## Environment Variables

| Variable | Default | Required | Purpose |
|---|---|---|---|
| `DATABASE_URL` | `file:../db/custom.db` | Yes | Prisma SQLite path (relative to `prisma/`) |

Copy `.env` from the repository — the default path works for both Windows and Linux.

---

## Scripts Reference (npm)

| Script | Command | Purpose |
|---|---|---|
| `dev` | `next dev -p 3000` | Start development server (port 3000) |
| `build` | `node .zscripts/build.mjs` | Production build (cross-platform) |
| `start` | `node .next/standalone/server.js` | Start production server (set `NODE_ENV=production` first) |
| `lint` | `eslint .` | Run ESLint |
| `db:push` | `prisma db push` | Push schema to SQLite database |
| `db:generate` | `prisma generate` | Regenerate Prisma client |
| `db:migrate` | `prisma migrate dev` | Create/apply Prisma migrations |
| `db:reset` | `prisma migrate reset` | Reset database (destructive) |

---

## Project Structure

```
.
├── .env                   # DATABASE_URL (SQLite)
├── .zscripts/             # Dev/build/start shell scripts + build.mjs
├── Caddyfile              # Reverse proxy config (port 81)
├── gbp-monitor/           # Python scraper subsystem
├── src/                   # Next.js dashboard
├── prisma/                # Database schema (scaffold only)
├── db/                    # SQLite database file
├── public/                # Static assets
└── docs/                  # Engineering docs, audit reports, research
```

---

## Features (M3)

| Feature | Description | API | UI |
|---------|-------------|-----|-----|
| **Overview** | KPIs, rating distribution, review trends, run history | `GET /api/overview` | Overview tab |
| **Branches** | 6 branches x 2 competitors with per-competitor intelligence | `GET /api/branches` | Branches tab |
| **Compare** | Side-by-side branch comparison + historical snapshot diff | `GET /api/branches`, `GET /api/history/compare` | Compare tab |
| **Review Explorer** | Searchable, filterable, paginated review table with export | `GET /api/reviews`, `GET /api/reviews/export` | Reviews tab |
| **Alerts** | Dashboard alerts for scrapes, new reviews, selector issues | `GET /api/alerts` | Alerts tab |
| **Configuration** | Edit branches/competitors via inline JSON editor | `GET/PATCH /api/config/listings` | Config tab |
| **Export** | CSV/JSON export for reviews, competitors, branches, history | `GET /api/reviews/export`, `GET /api/export/competitors`, `GET /api/export/branches`, `GET /api/history/export` | Export dialog |

## Scraper (gbp-monitor/)

See `gbp-monitor/README.md` for scraper-specific setup:

```powershell
cd gbp-monitor
pip install -r requirements.txt
playwright install chromium
python -m orchestration.run_all --fixtures
```

### Category discovery scan — three modes

The P1 / RISK-024 category scan (`python -m discovery.category_scan`, surfaced
via the Discover tab's `POST /api/category-scan`) supports three acquisition
paths:

| Mode | Flag | Requires | Notes |
|------|------|----------|-------|
| **fixtures** | `--fixtures` | nothing | Default. Reads `tests/fixtures/category_scan.html`; no browser/network. CI + offline dev. |
| **cached** | `--cached` | a prior live run | Offline replay of the raw HTML captured by the most recent **live** run (`<data-dir>/category_scan/_last_capture.html`). Run a live scan once first. |
| **live** | *(no flag)* | `playwright install chromium` + network | Launches headless Chromium against Google Maps; persists the raw HTML for later `--cached` replay. |

`GET /api/health` reports `browserAvailable: boolean` (a cheap headless
Chromium launch probe). The Discover UI uses it to gate the **live** toggle —
if `false`, live is disabled with a "Install Chromium to enable live scans"
hint.
