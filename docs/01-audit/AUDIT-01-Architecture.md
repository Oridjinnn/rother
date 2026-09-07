# Architecture Audit 01 — Rother 0.0.1

**Date:** 2026-07-22
**Scope:** Full repository audit
**Repository path:** `D:\Documents (D)\Softwares\Rother\Rother - 0.0.1`

---

## Executive Summary

Rother is a **zero-cost competitor review monitoring system** built for Copenhagen Bali, a coffee shop chain with 6 branches in Bali. It consists of two independent subsystems that share data via JSON files:

> **Context:** This audit was performed against the bundled **seed demo** ("Copenhagen Bali", 6 branches × 2 competitors = 12 competitors) used for local development. The shipped product now scopes to a **single user-provided business** entered at onboarding (name, location, category) and revealed after a Run — the seed demo is hidden from the UI once a user business is active. The "Copenhagen Bali / 6 branches / 12 competitors" figures below describe the demo dataset, not a fixed product model.

1. **gbp-monitor** — a Python scraper that uses Playwright (headless Chromium) to scrape Google Business Profile reviews from competitor listings, detects new reviews via delta-computation against the last snapshot, and is triggered daily via GitHub Actions cron.
2. **Next.js Dashboard** — a feature-rich React dashboard that reads the JSON files produced by the scraper and visualizes KPIs, charts, branch comparisons, review tables, run history, and scrape health.

The project name "Rother" appears to be the client-facing brand; internally it is also referred to as "GBP Monitor."

The system is built entirely with free/open-source tools and explicitly avoids paid APIs or AI/LLM features. It was developed incrementally across many AI-agent sessions with strict execution rules. It is currently in a **stable, demonstrable** state, though the scraper selectors are **UNPROVEN** against live Google Maps DOM (only exercised against static HTML fixtures in development).

---

## Repository Overview

| Attribute | Value |
|---|---|
| **Purpose** | Monitor competitor Google Business Profile reviews for a multi-branch coffee shop chain |
| **Project type** | Two-package system: Python scraper + Next.js dashboard |
| **Current maturity** | Stable/feature-complete for Phase 1; `selectors.json` is UNPROVEN against live Google Maps |
| **Domain** | Competitive intelligence, review monitoring, data visualization |
| **Target users** | Internal operations team at Copenhagen Bali |
| **Deployment model** | Standalone Next.js server behind Caddy reverse proxy on port 81 |
| **Schedule** | GitHub Actions cron daily at 22:00 UTC |

---

## Technology Stack

### Frontend
- **Next.js** 16.1.1 (App Router, RSC, standalone output)
- **React** 19.0.0
- **TypeScript** 5.x
- **Tailwind CSS** 4.x (with `tailwindcss-animate`, `tw-animate-css`)
- **shadcn/ui** (New York style, 40+ UI components from Radix)
- **Framer Motion** (page/component animations)
- **Recharts** 2.15 (8+ chart types)
- **Lucide React** (icons)
- **next-themes** (dark/light mode)
- **Sonner** (toast notifications)

### State & Data
- **TanStack React Query** 5.82 (wired in QueryProvider but dashboard uses raw `fetch` + `useState` instead)
- **TanStack React Table** 8.21 (Reviews section)
- **Zustand** 5.0 (available in deps, usage unclear)
- **React Hook Form** 7.60 + **Zod** 4.0 (available in deps)

### Backend (Dashboard)
- **Next.js API Routes** (15 routes, App Router)
- **Prisma** 6.11 with SQLite (User + Post models — scaffold only, not used by dashboard)
- **Node.js `fs` module** (all dashboard data is read from JSON files on disk)

### Backend (Scraper)
- **Python** 3.12
- **Playwright** 1.57+ (headless Chromium)
- **Parsel** 1.11 (HTML parsing, Scrapy's standalone selector library)
- **Requests** (URL reachability pre-check)
- **No paid APIs** — zero-cost constraint per Rule 4

### Build tools
- **Bun** (package manager, runtime for build/start scripts)
- **Next.js built-in build** (standalone mode)

### Package manager
- **Bun** (`bun.lock`)

### Testing
- **ESLint** 9.x (flat config, many rules disabled)
- No test framework detected (Jest, Vitest, etc.) — Python scraper has `tests/fixtures/` but no test runner

### Deployment
- **GitHub Actions** (cron-based daily scrape)
- **Caddy** reverse proxy (port 81 → localhost:3000)
- **Standalone Next.js output** (`.next/standalone/`)

### Automation
- **Bash scripts** in `.zscripts/` (dev, build, start, mini-services lifecycle)
- **GitHub Actions workflow** (`.github/workflows/scrape.yml`)

### Third-party services
- None paid. Only GitHub Actions free tier.

---

## Repository Structure

```
Rother - 0.0.1/
├── .env                              # DATABASE_URL (SQLite)
├── .gitignore
├── .zscripts/                        # Dev/build/start shell scripts
│   ├── dev.sh                        # Development launch (install, db:push, dev server)
│   ├── build.sh                      # Production build (standalone + package)
│   ├── start.sh                      # Production start (Caddy + Next.js)
│   ├── mini-services-install.sh
│   ├── mini-services-build.sh
│   ├── mini-services-start.sh
│   └── dev.pid
├── Caddyfile                         # Reverse proxy config (port 81)
├── components.json                   # shadcn/ui config
├── db/                               # SQLite database
│   └── custom.db
├── download/                         # Generated downloadable files
├── eslint.config.mjs                 # Flat ESLint config (most rules disabled)
├── examples/                         # WebSocket examples
│   └── websocket/
├── gbp-monitor/                      # PYTHON SCRAPER SUBSYSTEM
│   ├── README.md
│   ├── CHANGELOG.md                  # 138-entry change log
│   ├── requirements.txt
│   ├── config/
│   │   ├── listings.json             # 6 branches × 2 competitors (MOCK data)
│   │   └── selectors.json            # 2023-vintage CSS selectors (UNPROVEN)
│   ├── data/
│   │   ├── snapshots/                # Full review snapshots per competitor
│   │   ├── reviews_new/              # Delta review files per run
│   │   ├── run_summary.json          # Latest run summary
│   │   └── run.log                   # Append-only log
│   ├── discovery/
│   │   └── validate_listing.py       # URL reachability pre-check
│   ├── harness/
│   │   ├── browser.py                # Playwright lifecycle + anti-bot hardening
│   │   ├── capture.py                # Full page capture orchestration
│   │   ├── locator.py                # 5-tier self-healing locator hierarchy
│   │   └── scroll.py                 # Review container scrolling
│   ├── orchestration/
│   │   └── run_all.py                # Main loop (fixtures + live mode)
│   ├── parser/
│   │   ├── schema.py                 # Review dataclass
│   │   └── review_parser.py          # HTML → Review objects
│   ├── schedule/
│   │   └── .github/workflows/
│   │       └── scrape.yml            # Daily cron workflow
│   ├── storage/
│   │   ├── snapshot_store.py         # JSON read/write with atomic writes
│   │   └── delta.py                  # Delta computation
│   └── tests/
│       └── fixtures/                 # Static HTML test fixtures (3 competitors)
├── mini-services/                    # Micro-services directory (empty, .gitkeep)
├── next.config.ts                    # Standalone output, ignore TS errors, no strict mode
├── package.json                      # 81 runtime + 9 dev dependencies
├── postcss.config.mjs
├── prisma/
│   └── schema.prisma                 # User + Post models (scaffold, unused)
├── public/
│   ├── logo.svg
│   └── robots.txt
├── src/                              # NEXT.JS DASHBOARD SUBSYSTEM
│   ├── app/
│   │   ├── globals.css               # Bali-inspired palette (OKLCH colors)
│   │   ├── layout.tsx                # Root layout with ThemeProvider + QueryProvider
│   │   ├── page.tsx                  # Main dashboard page (6 tabs, client mode)
│   │   └── api/                      # 15 API routes
│   │       ├── route.ts              # Health check ("Hello, world!")
│   │       ├── overview/route.ts     # Aggregated KPIs, charts, alerts
│   │       ├── branches/route.ts     # Branches × competitors tree with stats
│   │       ├── reviews/route.ts      # Filtered, paginated review table
│   │       ├── reviews/export/route.ts  # CSV/JSON export
│   │       ├── logs/route.ts         # Tail of run.log
│   │       ├── config/listings/route.ts # Raw listings.json
│   │       ├── config/selectors/route.ts # Raw selectors.json
│   │       ├── scrape/trigger/route.ts   # POST: spawn Python scraper (fixtures)
│   │       ├── history/route.ts      # Run history timeline
│   │       ├── history/export/route.ts   # CSV/JSON export
│   │       ├── reviews-over-time/route.ts
│   │       ├── review-lengths/route.ts
│   │       ├── health-trend/route.ts
│   │       └── competitor-correlation/route.ts  # Cosine similarity matrix
│   ├── components/
│   │   ├── dashboard/                # 30+ dashboard components
│   │   ├── providers/                # ThemeProvider, QueryProvider
│   │   └── ui/                       # 40+ shadcn/ui primitives
│   ├── hooks/
│   │   ├── use-app-mode.ts           # Client/Dev mode hook
│   │   ├── use-mobile.ts
│   │   └── use-toast.ts
│   └── lib/
│       ├── db.ts                     # Prisma client singleton
│       ├── utils.ts                  # cn() helper
│       ├── app-mode.ts               # App mode types + text mappings
│       └── gbp/
│           ├── types.ts              # TypeScript types (mirrors Python schema)
│           ├── server-data.ts        # Server-side JSON file readers
│           ├── paths.ts              # Absolute paths to gbp-monitor data files
│           └── format.ts             # Formatting utilities
├── tailwind.config.ts
├── tool-results/                     # LLM tool execution artifacts
├── tsconfig.json                     # ES2017, bundler module resolution, @/* alias
├── upload/                           # Planning documents
│   ├── CHANGELOG.md
│   ├── EXECUTION_RULES.md
│   └── GBP_MONITOR_PLAN.md
└── worklog.md                        # 1300+ line handover document (15+ sessions)
```

---

### Top-Level Directory Explanations

#### `.zscripts/` — Development and Deployment Scripts
**Purpose:** Shell scripts for dev, build, and production start workflows.
**Key files:**
- `dev.sh` — Installs deps, runs `db:push`, starts Next.js dev server, launches mini-services
- `build.sh` — Full production build pipeline (Next.js standalone, mini-services, packages into tar.gz). Includes self-healing logic for missing `output: "standalone"` in next.config
- `start.sh` — Production entrypoint: starts Next.js server, mini-services, then Caddy as foreground

#### `gbp-monitor/` — Python Scraper Subsystem
**Purpose:** The data-collection backend. Scrapes Google Maps reviews, detects new reviews, and writes JSON files consumed by the dashboard.
**Responsibilities:**
- Browser automation (Playwright)
- HTML parsing (Parsel)
- Delta detection (new vs known reviews)
- Per-listing failure isolation
- Fixtures mode for development without live Google Maps

#### `src/` — Next.js Dashboard Subsystem
**Purpose:** The visualization frontend. Reads JSON files produced by the scraper and renders a rich dashboard.
**Responsibilities:**
- 15 REST API endpoints (all read-only except scrape trigger)
- Tab-based UI (Overview, Branches, Compare, Reviews, Logs, Config)
- Data export (CSV/JSON)
- Client/Dev mode separation via URL query parameter
- Auto-refresh with Page Visibility API

#### `prisma/` — Database Schema
**Purpose:** Prisma ORM schema with SQLite. **Not actively used by the dashboard** — the dashboard reads JSON files instead. The User + Post models are a scaffold that were part of the initial Next.js project setup.

#### `db/` — SQLite Database
**Purpose:** The actual SQLite database file (`custom.db`) created by `prisma db push`.

#### `upload/` — Planning Documents
**Purpose:** Governing project documents that define the technical plan and execution rules. These are the "constitution" of the project — all AI agents were required to read them before working.

#### `mini-services/` — Micro-services Directory
**Status:** Empty (contains only `.gitkeep`). The build/start scripts support launching mini-services, but none exist yet.

---

## Entry Points

### Application Entry Points

| Entry Point | Path | Type | Description |
|---|---|---|---|
| **Main page** | `src/app/page.tsx` | Next.js App Router | The full dashboard SPA. All 6 tabs rendered client-side with `"use client"` |
| **Root layout** | `src/app/layout.tsx` | Next.js App Router | Wraps app in ThemeProvider + QueryProvider + Sonner toaster |
| **Dashboard components** | `src/components/dashboard/*` | React components | 30+ components organized by dashboard section |

### API Entry Points

All API routes are in `src/app/api/` (15 routes total, all `force-dynamic` + `revalidate: 0`):

| Method | Route | Purpose |
|---|---|---|
| GET | `/api` | Health check |
| GET | `/api/overview` | Aggregated KPIs, rating distribution, alerts |
| GET | `/api/branches` | Branch × competitor tree with per-competitor stats |
| GET | `/api/reviews` | Filtered, paginated reviews |
| GET | `/api/reviews/export` | CSV/JSON download of reviews |
| GET | `/api/logs` | Tail of run.log (configurable line count) |
| GET | `/api/history` | Run history timeline |
| GET | `/api/history/export` | CSV/JSON download of run history |
| GET | `/api/reviews-over-time` | Cumulative review count time series |
| GET | `/api/review-lengths` | Review text length distribution |
| GET | `/api/health-trend` | Scraper health over time (from run.log) |
| GET | `/api/competitor-correlation` | Cosine similarity matrix of rating distributions |
| GET | `/api/config/listings` | Raw listings.json |
| GET | `/api/config/selectors` | Raw selectors.json |
| POST | `/api/scrape/trigger` | Trigger fixtures-mode scrape run (spawns Python) |

### CLI Entry Points

| Command | Path | Description |
|---|---|---|
| `python -m orchestration.run_all` | `gbp-monitor/orchestration/run_all.py` | Run scraper (default: live mode) |
| `python -m orchestration.run_all --fixtures` | Same | Run scraper against HTML fixtures |
| `bun run dev` | Root package.json | Start Next.js dev server on port 3000 |
| `bun run build` | Root package.json | Production build |
| `NODE_ENV=production bun .next/standalone/server.js` | Root package.json | Production start |
| `bun run lint` | Root package.json | ESLint |
| `bun run db:push` | Root package.json | Push Prisma schema to SQLite |

### Background Jobs / Cron

| Job | Trigger | Description |
|---|---|---|
| Daily scrape | GitHub Actions cron (`0 22 * * *`) | Runs live Playwright scrape, commits results |
| Manual scrape trigger | POST `/api/scrape/trigger` | Spawns `--fixtures` mode from dashboard button |
| Dashboard auto-refresh | 30s interval (opt-in, Page Visibility API) | Polls `/api/overview` when on Overview tab |

### Scripts

| Script | Path | Description |
|---|---|---|
| `dev.sh` | `.zscripts/dev.sh` | Full dev environment setup and start |
| `build.sh` | `.zscripts/build.sh` | Production build and packaging |
| `start.sh` | `.zscripts/start.sh` | Production service start |
| Mini-service scripts | `.zscripts/mini-services-*.sh` | Mini-service lifecycle |

---

## Configuration

### Important Configuration Files

| File | Purpose |
|---|---|
| `next.config.ts` | Next.js config: `output: "standalone"`, TypeScript errors ignored, React strict mode disabled |
| `tsconfig.json` | TypeScript: ES2017 target, bundler module resolution, `@/*` path alias to `./src/*` |
| `tailwind.config.ts` | Tailwind CSS v4 config with Bali-inspired theme variables |
| `postcss.config.mjs` | PostCSS with `@tailwindcss/postcss` plugin |
| `eslint.config.mjs` | Flat config: nearly all rules disabled (TypeScript, React, Next.js, general JS) |
| `components.json` | shadcn/ui config: New York style, RSC, lucide icons, `@/` aliases |
| `Caddyfile` | Reverse proxy on port 81 → localhost:3000, dynamic port via `XTransformPort` query param |
| `prisma/schema.prisma` | SQLite schema: User + Post models (scaffold, unused) |
| `gbp-monitor/config/listings.json` | 6 branches × 2 competitors — **MOCK DATA** (URLs are fake) |
| `gbp-monitor/config/selectors.json` | Google Maps CSS selectors — **UNPROVEN** against live DOM (2023 vintage, marked `verified_by: "seed"`) |
| `gbp-monitor/requirements.txt` | Python dependencies (Playwright, Parsel, Requests) |
| `gbp-monitor/schedule/.github/workflows/scrape.yml` | GitHub Actions daily cron workflow |
| `package.json` | 81 runtime + 9 dev deps, npm scripts |

### Key Configuration Details

- **Typescript strict mode** is enabled in `tsconfig.json` but `noImplicitAny` is explicitly set to `false`.
- **React strict mode** is disabled (`reactStrictMode: false` in next.config.ts).
- **TypeScript build errors are ignored** (`ignoreBuildErrors: true` in next.config.ts).
- **ESLint** has nearly all rules disabled — it will pass regardless of code quality.

---

## Environment Variables

| Variable | Defined In | Purpose | Used In |
|---|---|---|---|
| `DATABASE_URL` | `.env` | SQLite connection string (`file:/home/z/my-project/db/custom.db`) | Prisma, `start.sh`, `build.sh` |
| `NODE_ENV` | `.zscripts/start.sh` | Set to `production` at runtime | Next.js production server |
| `PORT` | `.zscripts/start.sh` | Server port (default 3000) | Next.js production server |
| `HOSTNAME` | `.zscripts/start.sh` | Server hostname (default 0.0.0.0) | Next.js production server |
| `NEXT_TELEMETRY_DISABLED` | `.zscripts/build.sh` | Disables Next.js telemetry | Build process |

Only `DATABASE_URL` is stored in `.env`. The rest are runtime-only environment variables.

---

## Major Modules

### Module 1: Python Scraper (`gbp-monitor/`)

**Purpose:** Automated collection of Google Business Profile reviews.

**Packages:**

| Package | Purpose | Dependencies | Implementation Status |
|---|---|---|---|
| `harness/browser.py` | Playwright browser lifecycle with anti-bot hardening | Playwright | **Complete** — 3-layer Client Hints override (arXiv:2606.14525) |
| `harness/capture.py` | Page navigation, cookie dismissal, scroll, HTML capture | `harness/scroll.py` | **Complete** — handles optional UI states gracefully |
| `harness/scroll.py` | Review container infinite-scroll | Playwright | **Complete** — `SelectorNotFoundError` for DOM-change detection |
| `harness/locator.py` | 5-tier self-healing locator hierarchy | Parsel | **Complete** — arXiv:2603.20358 based, class-name-independent tiers 1-4 |
| `parser/review_parser.py` | HTML → `Review` dataclass instances | Parsel, `parser/schema.py`, `harness/locator.py` | **Complete** — deterministic, unit-testable against fixtures |
| `parser/schema.py` | `Review` dataclass + `review_to_dict()` | None | **Complete** |
| `storage/snapshot_store.py` | JSON read/write with atomic rename | None | **Complete** — atomic writes via `.tmp` + replace |
| `storage/delta.py` | New-vs-old review dedup | None | **Complete** — pure function, `review_id` set membership |
| `discovery/validate_listing.py` | HTTP HEAD/GET reachability pre-check | `requests` | **Complete** — HEAD fallback to streaming GET |
| `orchestration/run_all.py` | Main loop: branches × competitors, error isolation | All above | **Complete** — failure isolation per Rule 7, exits 0 always |

**Consumers:** Next.js dashboard (reads JSON output), GitHub Actions cron (triggers runs)

---

### Module 2: Next.js Dashboard (`src/`)

**Purpose:** Visualization and management UI for scraped review data.

**Sub-modules:**

| Module | Purpose | Dependencies | Files |
|---|---|---|---|
| **API Layer** | 15 REST endpoints reading JSON from disk | `lib/gbp/server-data.ts`, `lib/gbp/paths.ts` | `src/app/api/*/route.ts` |
| **Dashboard Page** | Tab-based SPA with 6 views | All dashboard components | `src/app/page.tsx` |
| **Dashboard Components** | 30+ React components for each section | shadcn/ui, recharts, framer-motion, lucide-react | `src/components/dashboard/*` |
| **UI Primitives** | 40+ shadcn/ui components | Radix primitives | `src/components/ui/*` |
| **Data Layer** | JSON file readers with safe fallbacks | Node.js `fs` | `src/lib/gbp/server-data.ts` |
| **Type Definitions** | TypeScript types matching Python schema | None | `src/lib/gbp/types.ts` |
| **App Mode** | Client/Dev mode text switching | None | `src/lib/app-mode.ts`, `src/hooks/use-app-mode.ts` |

**Consumers:** End users (client mode), developers (dev mode)

**Implementation Status:** Complete for Phase 1. TanStack Query provider is wired but unused (dashboard uses raw `fetch`).

---

### Module 3: Build & Deployment (`db/`, `.zscripts/`, `Caddyfile`)

**Purpose:** Development tooling and production deployment automation.

| Sub-module | Purpose | Implementation Status |
|---|---|---|
| `dev.sh` | Dev environment bootstrap | **Complete** |
| `build.sh` | Production build pipeline | **Complete** — includes self-healing for missing standalone output |
| `start.sh` | Production service start | **Complete** — Caddy foreground with graceful shutdown |
| `Caddyfile` | Reverse proxy | **Complete** — supports dynamic port routing |
| `Mini-services` | Micro-service framework | **Incomplete** — directory exists but empty |
| `Prisma` | Database ORM | **Scaffold only** — models defined but not used by application logic |

---

## Data Flow

### Scraper Data Flow (Python)

```
listings.json ──┐
selectors.json ──┤
                ▼
         orchestration/run_all.py
                │
                ├── discovery/validate_listing.py (live mode only)
                │         │
                │         ▼ (if reachable)
                ├── harness/browser.py (live) OR
                │   tests/fixtures/*.html (fixtures)
                │         │
                │         ▼
                ├── harness/capture.py → harness/scroll.py
                │         │
                │         ▼ (raw HTML)
                ├── parser/review_parser.py → harness/locator.py
                │         │
                │         ▼ (Review[] objects)
                ├── storage/delta.py (vs prior snapshot)
                │         │
                │         ├── → data/reviews_new/{comp}_{ts}.json (deltas)
                │         └── → data/snapshots/{comp}.json (full snapshot)
                │
                └── → data/run_summary.json
                └── → data/run.log (appended)
```

### Dashboard Data Flow (Next.js)

```
                           Browser (Client)
                                │
                    fetch() requests (no-store cache)
                                │
                                ▼
                    Next.js API Routes (server-side)
                                │
                    read JSON files via node:fs
                                │
                                ▼
          ┌─────────────────────────────────────┐
          │  gbp-monitor/data/                  │
          │    ├── snapshots/{comp}.json        │
          │    ├── reviews_new/{comp}_{ts}.json │
          │    ├── run_summary.json             │
          │    ├── run.log                      │
          │    └── gbp-monitor/config/          │
          │        ├── listings.json            │
          │        └── selectors.json           │
          └─────────────────────────────────────┘
                                │
                    JSON responses
                                │
                                ▼
                    React Components (client-side)
                                │
                    Render: charts, tables, KPIs
```

### Trigger Data Flow (Manual Scrape)

```
User clicks "Run Now" (dashboard button)
        │
        ▼
POST /api/scrape/trigger
        │
        ▼
spawnSync("python3", ["-m", "orchestration.run_all", "--fixtures"])
        │
        ▼
Python writes to data/*.json + data/run.log
        │
        ▼
Response returns (with run_summary.json content)
        │
        ▼
Dashboard refreshes all sections (refreshKey++)
```

### Data Flow Diagram (Text)

```
                         ┌──────────────┐
                         │  GitHub      │
                         │  Actions     │
                         │  Cron (daily)│
                         └──────┬───────┘
                                │ python -m orchestration.run_all
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                     PYTHON SCRAPER (gbp-monitor/)                │
│                                                                   │
│  ┌──────────┐    ┌─────────┐    ┌──────────┐    ┌────────────┐  │
│  │Discovery │───▶│ Harness │───▶│ Parser   │───▶│  Storage   │  │
│  │(Pre-check)│   │(Browser)│   │(parsel)  │    │(Delta+Snap)│  │
│  └──────────┘    └─────────┘    └──────────┘    └─────┬──────┘  │
│                                                        │         │
│                                                        ▼         │
│                                              data/*.json files   │
└──────────────────────────────────────────────────────┬───────────┘
                                                        │
                                                        │ reads via
                                                        │ node:fs
                                                        ▼
┌──────────────────────────────────────────────────────────────────┐
│                  NEXT.JS DASHBOARD (src/)                        │
│                                                                   │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────────┐   │
│  │ API Routes   │───▶│ Server Data  │───▶│ React Components  │   │
│  │ (/api/*)     │    │ (lib/gbp)    │    │ (30+ dashboards)  │   │
│  └──────────────┘    └──────────────┘    └───────────────────┘   │
│                                                                   │
│                           ┌──────────────┐                       │
│                           │  Client Mode │◀── ?mode=dev ──▶│ Dev│
│                           │  4 tabs      │           │ Mode│
│                           └──────────────┘           │ 6 tabs│
└──────────────────────────────────────────────────────────────────┘
```

---

## Current Architecture

### Overall Pattern

The system follows a **two-subsystem, file-based integration** architecture:

1. **Data Producer** (Python scraper): Generates JSON files on disk
2. **Data Consumer** (Next.js dashboard): Reads those files and renders a UI

There is no database involved in the primary data path. The scraper writes to files, the dashboard reads from files. This is a deliberate zero-cost architecture — no server, no queue, no API gateway.

### Key Architectural Decisions

- **File-based integration:** The two subsystems share no runtime dependency. The dashboard does not call the scraper API; it reads files that the scraper writes. The only exception is `/api/scrape/trigger` which spawns the scraper as a subprocess.
- **Defensive server-data layer:** All file reads in `server-data.ts` have try/catch with safe fallbacks (empty arrays, null). A missing or corrupt JSON file never crashes the dashboard.
- **Client/Dev mode separation:** A single codebase with a URL-query-parameter toggle that controls terminology, tab visibility, and technical detail display. No separate build for each mode.
- **Two-phase data flow for manual triggers:** When a user clicks "Update Now," the dashboard POSTs to the API, which spawns a Python subprocess synchronously (`spawnSync`), waits for completion, then returns the result. The dashboard then fetches all sections fresh.
- **Refetch-on-trigger pattern:** Instead of reactive state management (TanStack Query), the dashboard uses a `refreshKey` counter. When incremented, `useEffect` dependencies cause all sections to re-fetch from their `useState`/`fetch` hooks.

### Anti-Bot Strategy (Python Scraper)

The scraper uses 3 complementary mechanisms to avoid headless Chromium detection:
1. **HTTP header override** (`extra_http_headers`): Spoofs `sec-ch-ua`, `sec-ch-ua-mobile`, `sec-ch-ua-platform`
2. **CDP `Network.setUserAgentOverride`**: Makes the browser's internal client-hints state self-consistent
3. **JS init script**: Patches `navigator.userAgentData` as a belt-and-suspenders measure

### Self-Healing Locator Strategy

The HTML parser uses a 5-tier self-healing locator hierarchy:
- Tiers 1-4: class-name-independent (survive Google redesign)
- Tier 5: The seeded CSS selector from `config/selectors.json` (legacy fallback)

This is based on arXiv:2603.20358.

---

## Strengths

1. **Zero-cost architecture:** No paid services, no paid APIs, no AI/LLM costs. Operates entirely on GitHub Actions free tier and self-hosted Node.js.
2. **Defensive error handling:** Every file read in the dashboard has safe fallbacks. The scraper has per-listing failure isolation (Rule 7). The system never crashes due to a single broken listing.
3. **Clean separation of concerns:** Scraper and dashboard are independent subsystems sharing only file formats. Each Python module has exactly one responsibility.
4. **Evidence-based anti-bot strategy:** The Client Hints override is backed by arXiv research, with 3 complementary layers and self-consistent identity across all layers.
5. **Self-healing locators:** The 5-tier tier hierarchy ensures the parser can survive a Google DOM class-name refactoring.
6. **Atomic file writes:** Snapshot storage uses `.tmp` + rename to avoid corrupting the baseline snapshot.
7. **Client/Dev mode:** A well-designed abstraction that lets a single codebase serve both end users and developers with appropriate terminology and features.
8. **Comprehensive changelog and worklog:** The project has 1300+ lines of session history and 138 changelog entries, providing excellent traceability.
9. **Build self-healing:** The `build.sh` script can detect and auto-fix missing `output: "standalone"` in next.config — a pragmatic defense against accidental config changes.
10. **Rich dashboard experience:** 30+ components, 8+ chart types, keyboard shortcuts, export features, dark mode, auto-refresh — the UI punches above the project's "Phase 1" label.

---

## Weaknesses

1. **TanStack Query wired but unused:** `QueryProvider` wraps the app but the dashboard uses raw `fetch` + `useState` + `refreshKey` for data fetching. This adds bundle size (~15KB gzipped) for no benefit and creates a confusing architecture (two data-fetching patterns coexist).
2. **TypeScript build errors ignored:** `next.config.ts` has `ignoreBuildErrors: true`. This means TypeScript may not catch real type errors during CI/CD.
3. **React strict mode disabled:** `reactStrictMode: false` means double-rendering bugs in development may go unnoticed.
4. **ESLint effectively disabled:** Nearly all lint rules are turned off. The linter passes regardless of code quality.
5. **No automated tests:** No test framework detected for either the Python scraper (fixtures exist but no test runner) or the Next.js dashboard. No unit tests, integration tests, or E2E tests.
6. **Scraper selectors UNPROVEN:** The entire `selectors.json` is marked `verified_by: "seed"` — never verified against a real Google Maps DOM. Only static HTML fixtures have been tested.
7. **Mock competitor data:** All URLs in `listings.json` are mock/placeholder URLs (containing "mock" in the place_id). The scraper cannot actually scrape any real competitor.
8. **Blocking manual scrape:** The `/api/scrape/trigger` endpoint uses `spawnSync` (blocking call). A long-running scrape would block the Next.js event loop, potentially causing request timeouts.
9. **Python path hardcoded:** `paths.ts` hardcodes `GBP_ROOT = "/home/z/my-project/gbp-monitor"`. This path is specific to the development sandbox and will need configuration for other environments.
10. **File-based concurrency risk:** Python writes JSON files in the background while the dashboard reads them. There is no locking mechanism — a read during a write could get a partial file (mitigated somewhat by atomic writes in snapshot_store.py but not for other files).
11. **Prisma unused overhead:** Prisma with SQLite is installed and configured but the dashboard never queries it. The User + Post models are a scaffold from the initial `create-next-app` setup. The `db:push` step runs in dev.sh unnecessarily.

---

## Technical Debt

### Duplicate Code
- **Branch aggregation logic duplicated:** The `branches/route.ts` and `overview/route.ts` both iterate listings and compute per-competitor stats (average ratings, total reviews, delta counts) with near-identical logic.
- **Export routes share grouped-run logic:** `history/export/route.ts` duplicates the run-grouping logic from `history/route.ts` almost verbatim.
- **Filter logic duplicated:** `reviews/route.ts` and `reviews/export/route.ts` share identical filter parameter parsing and competitor-allowed-set computation.

### Unused Modules
- **TanStack Query:** Provider is wired in `layout.tsx` but no component uses `useQuery` or `useMutation`. All components use raw `fetch`.
- **Prisma/User+Post models:** The database schema is defined, the client is initialized in `lib/db.ts`, but no application code uses it.
- **Zustand:** Listed in `package.json` but not imported anywhere in `src/`.
- **React Hook Form + Zod:** Listed in deps, not obviously used by current components.
- **`@mdxeditor/editor` and `react-markdown`:** Listed in deps, no usage found in dashboard code.
- **`next-intl`:** Listed in deps, no i18n usage found.
- **`next-auth`:** Listed in deps, no authentication implemented.
- **`@dnd-kit` packages:** Listed in deps, no drag-and-drop usage found.

### Incomplete Modules
- **Mini-services:** Directory exists, build/start scripts handle it, but the directory is empty.
- **Python tests:** `tests/fixtures/` has 3 HTML fixture files but no test runner or test scripts configured.
- **Real competitor URLs:** The M1 milestone (obtaining real competitor URLs from the client) has not been completed.

### Placeholder Code
- **API root route** (`src/app/api/route.ts`): Returns `"Hello, world!"` — this is a development stub.
- **Mock competitor URLs:** All `gmaps_url` values in `listings.json` contain `mock` in the place_id — clearly placeholder.
- **Prisma User + Post models:** These are the default scaffold models from `create-next-app`, not part of the GBP Monitor domain.

### TODOs / FIXMEs
- No TODOs or FIXMEs found in the source code comments (strict execution rules likely prevented them). The worklog documents unresolved risks rather than inline TODOs.

### Dead Code
- `lib/db.ts`: Exported `db` constant that is never imported by any route or component.
- `hooks/use-toast.ts`: The shadcn/ui toast hook — the project uses `sonner` directly instead.

### High-Risk Areas
1. **`/api/scrape/trigger`** uses `spawnSync` with a 60s timeout. A hung Python process would block the Node.js event loop for the full 60s.
2. **`paths.ts`** hardcodes absolute paths that only work in the development sandbox. Any deployment to a different filesystem will break unless environment variables are introduced.
3. **No input validation** on the scrape trigger POST endpoint — any client can trigger a subprocess spawn.
4. **`eslint.config.mjs`** has all rules effectively disabled, meaning TypeScript compile errors (which are also ignored) and ESLint issues silently pass CI.

---

## Risks

1. **Selectors UNPROVEN against live Google Maps:** The scraper has never been run against an actual Google Maps page. When run in live mode, it will almost certainly fail due to either (a) stale 2023-vintage CSS selectors or (b) headless-Chromium bot detection. The anti-bot hardening (Fix A) mitigates (b) but has not been empirically verified.
2. **Real competitor data blocker:** The project has no real competitor Google Maps URLs. The M1 milestone (client provides URLs) is unresolved. Without real URLs, the scraper cannot enter production.
3. **Hardcoded filesystem path:** `GBP_ROOT = "/home/z/my-project/gbp-monitor"` is hardcoded. The dashboard will not work if deployed to a machine where the Python scraper lives elsewhere.
4. **No authentication:** The dashboard has no login or access control. `next-auth` is in `package.json` but not configured. Any deploy exposing port 81/3000 to the internet would be publicly accessible.
5. **Subprocess security:** The `/api/scrape/trigger` endpoint spawns `python3` with arguments derived from constants (not user input), but a future change could introduce command injection risk.
6. **SQLite file locking:** If the dashboard ever writes to the SQLite database concurrently with Prisma operations, SQLite's file-level locking could cause write contention.
7. **No monitoring or alerting:** The system relies on the dashboard's "failed >= success" warning for health detection. There is no external monitoring, email alert, or notification system.
8. **run.log unbounded growth:** Mitigated by Fix D (rotation in GitHub Actions at 5MB), but only works in CI. Development/local runs do not rotate the log.

---

## Missing Documentation

- **API documentation:** No OpenAPI/Swagger spec or API reference. Routes are documented only via code comments.
- **Deployment guide:** No single document describing how to deploy the system (though `.zscripts/*.sh` partially covers it).
- **Environment setup guide:** No `.env.example` or setup instructions for new developers.
- **Architecture diagram:** No visual architecture diagram (only text-based in `GBP_MONITOR_PLAN.md`).
- **Data format specification:** The JSON file formats are documented in the worklog (`worklog.md:38-63`) and in `lib/gbp/types.ts`, but not in a standalone schema document.
- **Testing guide:** No instructions for how to run tests (no test framework makes this trivially short, but still undocumented).
- **Configuration guide:** No document explaining how to add a new branch/competitor or update selectors.
- **Secrets management:** No documentation about how to handle secrets (currently there are none, but a production deployment would need some).

---

## Questions

1. **Is the dashboard intended to use TanStack Query, or is the `fetch` + `useState` pattern the final design?** The presence of both patterns suggests unfinished migration or confusion.
2. **Will `mini-services/` ever contain anything?** The directory exists, build/start scripts support it, but it's empty. Is this a future feature placeholder or dead scaffolding?
3. **Should the Prisma/SQLite database be removed or repurposed?** It is unused by the GBP Monitor dashboard. Is it needed for future features (e.g., user preferences, auth)?
4. **Is the hardcoded `GBP_ROOT` path acceptable for the target deployment?** If not, how should the path be configured?
5. **Will the scraper ever be run in LIVE (non-fixtures) mode?** This requires real competitor URLs from the client and a verified set of selectors.
6. **What is the intended production deployment target?** The build scripts suggest a Function Compute (FC)-like environment with Caddy, but there is no documented target.
7. **Who is the intended audience for Client mode vs Dev mode?** Is the Client mode ready for non-technical stakeholders to use?
8. **Should the GitHub Actions workflow commit data back to the repo?** This works for demonstration but would create unbounded repo growth over months of daily runs.
9. **Is `next-intl` (i18n) intended for future use, or was it added as a dependency without a plan?**
10. **Why is `noImplicitAny: false` in tsconfig?** This undermines TypeScript's type safety.

---

## Recommended Audit Order

For subsequent audits, the following priority is recommended:

1. **`gbp-monitor/harness/`** — The browser automation layer is the highest-risk module given the UNPROVEN selectors and anti-bot strategy. Audit the Playwright integration, the 3-layer Client Hints override, and whether the self-healing locator actually works against modern Google Maps HTML.
2. **`src/app/api/`** — Audit all 15 API routes for correctness, error handling, path assumptions, and performance (especially the synchronous subprocess spawn).
3. **`src/lib/gbp/`** — Audit the data layer for path handling, file read safety, and type correctness.
4. **`gbp-monitor/orchestration/`** — Audit the main loop for failure isolation correctness, the fixtures-vs-live mode split, and summary generation.
5. **`src/components/dashboard/`** — Audit for component composition, unnecessary re-renders, and state management patterns.
6. **`package.json`** — Audit all dependencies for actual usage vs dead weight.
7. **`.zscripts/`** — Audit the build/deployment pipeline for correctness and environment assumptions.
8. **`prisma/`** — Audit whether the database schema and client should be retained, removed, or adapted for future use.
