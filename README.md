# Rother — GBP Competitor Review Monitor

Automated monitoring of competitor Google Business Profile reviews for
**Copenhagen Bali** (6 branches). Two subsystems:

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

## Quickstart (Windows — verified)

```powershell
# 1. Install Node dependencies
npm install

# 2. Push Prisma schema to SQLite
npx prisma db push

# 3. Start the development server
npm run dev
```

Open http://localhost:3000 in your browser.

### First-boot evidence

| Check | Result |
|---|---|
| `npm install` | 669 packages, 447ms |
| `npx prisma db push` | Database already in sync, client generated (567ms) |
| `npm run dev` | Next.js 16.2.11, Turbopack, ready in 512ms |
| `curl http://localhost:3000` | HTTP 200, 40 KB HTML, `<title>GBP Monitor - Copenhagen Bali</title>` |
| `npm run lint` | 24 pre-existing warnings (no startup blockers) |

---

## Startup Matrix

| Command | npm | Bun | Windows | Linux | Notes |
|---|---|---|---|---|---|
| `npm install` / `bun install` | ✓ | ✓ | ✓ | ✓ | Works on both |
| `npx prisma db push` | ✓ | ✓ | ✓ | ✓ | Use `npx` or `bun run db:push` |
| `npm run dev` / `bun run dev` | ✓ | ✓ | ✓ | ✓ | Fixed: removed `tee` dependency |
| `npm run build` | ✓ | ✓ | ✓ | ✓ | Cross-platform via `.zscripts/build.mjs` |
| `npm run start` | ✓ | ✓ | ✓ | ✓ | Uses Node.js; production uses `start.sh` |
| `npm run lint` | ✓ | ✓ | ✓ | ✓ | ESLint — passes on both |

### Production deployment scripts (`.zscripts/*.sh`)

The shell scripts under `.zscripts/` require a **Unix shell** (bash/sh) and are
used for production deployment only. They are not needed for local development
on Windows. Use the npm scripts above instead.

| Script | Requires | Purpose |
|---|---|---|
| `dev.sh` | bash, bun, curl | Full dev environment (Linux/macOS) |
| `build.sh` | bash, bun, perl, tar | Production build with self-healing |
| `start.sh` | sh, bun, Caddy | Production service start |
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

## Scraper (gbp-monitor/)

See `gbp-monitor/README.md` for scraper-specific setup:

```powershell
cd gbp-monitor
pip install -r requirements.txt
playwright install chromium
python -m orchestration.run_all --fixtures
```
