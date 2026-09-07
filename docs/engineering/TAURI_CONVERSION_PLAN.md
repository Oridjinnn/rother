# Tauri v2 Desktop Conversion Plan — Rother

**Date:** 2026-08-13
**Version:** 0.3.0 (planned)
**Status:** Plan — approved to proceed (defer Google OAuth to later phase)

---

## Goal & Scope

Convert the existing Next.js web app (`Rother - 0.0.1`) into a desktop application
using **Tauri v2**, while preserving the rebuilt UX layer (login → onboarding →
4-hub navigator → Cmd+K command palette → lazy feature rendering).

Hard constraints:

| Constraint | Target |
|---|---|
| Bundle / install size | **≤ 500 MB** |
| Offline operation | App + SQLite + UI fully offline; live web scraping requires internet |
| Platforms (v1) | Windows, macOS, Linux (x64) |
| Reuse | Keep Next.js frontend + existing API routes + SQLite; do NOT rewrite the API in Rust for v1 |

Out of scope for v1: real Google OAuth (mock Gmail sign-in stays), mobile, auto-update
infrastructure (stubbed only).

---

## Why Tauri (and not Electron)

- **No bundled Chromium.** Tauri uses the OS-native webview (WebView2 / WKWebView /
  webkit2gtk). This alone saves ~120–170 MB vs an Electron build.
- **Small runtime.** Tauri core + webview host is typically < 10 MB.
- **Rust shell** for windowing, file access, and the sidecar lifecycle; the bulk of
  our logic stays in the already-working Next.js/Node stack.

---

## Target Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Tauri v2 Rust Shell (window, tray, updates, sidecar mgmt) │
│                                                            │
│   ┌────────────────────────────────────────────────────┐  │
│   │ OS Webview  ← loads http://127.0.0.1:<port>         │  │
│   └────────────────────────────────────────────────────┘  │
│            │  IPC / HTTP                    │ spawns &      │
│            ▼                                ▼ supervises    │
│   ┌─────────────────────────┐   ┌──────────────────────┐   │
│   │ Next.js Standalone      │   │ Node Sidecar          │   │
│   │ (static + server.js)    │   │ (existing API routes) │   │
│   └─────────────────────────┘   └──────────┬───────────┘   │
│                                            ▼               │
│                                    ┌──────────────┐        │
│                                    │ SQLite (file)│        │
│                                    └──────────────┘        │
└──────────────────────────────────────────────────────────┘
```

Two serving options for the Next layer:

1. **Node sidecar running `.next/standalone/server.js`** (recommended, reuses everything).
   The Rust shell launches the Node binary at startup, waits for the listen port,
   then points the webview at `http://127.0.0.1:<port>`.
2. **Static export served by a tiny Rust static server** — only viable if API routes
   are also ported to Rust commands. Deferred; too much rework for v1.

The scraper (`gbp-monitor/`, Python + Playwright) remains a **separate, lazily
installed** component, invoked by the Node sidecar over the existing `/api/scrape`
route. Its Chromium binary is downloaded on first use, never bundled.

---

## Project Structure (to be added)

```
Rother - 0.0.1/
├── src-tauri/                      # NEW — Tauri Rust project
│   ├── Cargo.toml                  # tauri v2, tauri-build, serde
│   ├── build.rs
│   ├── tauri.conf.json             # window, bundle, sidecar config
│   ├── capabilities/
│   │   └── default.json           # IPC permissions for palette/sidecar
│   ├── icons/                     # app icons (generated)
│   └── src/
│       └── main.rs                # build(), sidecar spawn + port wait, shutdown
├── .zscripts/
│   └── build.mjs                  # extend to emit standalone (already exists)
└── package.json                   # add: tauri (dev dep), tauri-build script
```

No changes to `src/app/**`, `src/components/shell/**`, or `src/lib/**` are required
for the desktop shell — the rebuilt UX already runs against the same API/SQLite
contract.

---

## Bundle Size Budget (< 500 MB)

| Component | Est. size | Notes |
|---|---:|---|
| Tauri runtime + Rust binary | ~8 MB | Strips well in release |
| OS webview | 0 MB | Provided by host OS |
| Node sidecar (node binary) | ~75–90 MB | Single `node` executable, musl/static preferred |
| Next standalone server + deps | ~60–120 MB | Subset needed to run API routes + SQLite |
| SQLite (better-sqlite3 / prisma) | < 2 MB | Native lib only |
| App assets (Next static, public) | ~5–15 MB | UI bundle |
| **Base install subtotal** | **~150–235 MB** | Well under 500 MB |
| Playwright Chromium (deferred) | ~150–300 MB | Downloaded at first scrape, NOT in installer |
| Python scraper runtime (deferred) | ~40–80 MB | Optional, bundled only if offline scraping required |

**Conclusion:** Base install lands at ~150–235 MB. The only heavy item
(Playwright Chromium) is excluded from the installer and fetched on demand, keeping
the shipped artifact comfortably under the 500 MB ceiling.

---

## Offline Strategy

| Feature | Offline? | Mechanism |
|---|---|---|
| Login (mock Gmail) | Yes | Local; real OAuth deferred |
| Onboarding + business profile | Yes | localStorage + SQLite |
| 4-hub navigator + Cmd+K palette | Yes | Client-side registry (`src/lib/features.tsx`) |
| Insights / reviews / alerts / branches / compare | Yes | Reads from local SQLite |
| Config / logs / export | Yes | Local SQLite + file export |
| Live Google Business scraping | **No** | Requires internet; prompts user when offline |

Design rule: every screen must render and be usable from local data. Network is an
enrichment path, never a hard dependency for the UI.

---

## Implementation Phases

### Phase A — Scaffold (low risk)
1. `cargo install tauri-cli` (or `npm i -D @tauri-apps/cli`).
2. Add `src-tauri/` with `Cargo.toml`, `tauri.conf.json`, `build.rs`, `src/main.rs`.
3. Configure `bundle > externalBin` to bundle the Node sidecar per target.
4. Verify an empty Tauri window launches on the dev machine.

### Phase B — Sidecar Wiring
5. Extend `.zscripts/build.mjs` to produce `.next/standalone` (already does) and copy
   the `node` binary + `server.js` into the Tauri resources.
6. In `main.rs`: spawn Node sidecar, poll the listen port, set webview URL on ready,
   terminate sidecar on window close.
7. Map `/api/*` calls to `127.0.0.1:<port>` (no cross-origin issues inside the shell).

### Phase C — Data & Permissions
8. Point SQLite path to an app-data directory (`tauri::api::path::app_data_dir`).
9. Add `capabilities/default.json` granting the palette/sidecar IPC commands only.
10. Confirm Prisma client loads against the bundled SQLite file.

### Phase D — Scraper Deferral
11. On first `/api/scrape` call with no Playwright Chromium present, download it to
    app-cache and report progress in the UI. Never block first launch.

### Phase E — Packaging & Size Gate
12. `tauri build` for Windows/macOS/Linux; measure installer size.
13. Assert installer < 500 MB in CI; fail the build otherwise.

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Node sidecar bloats bundle | Medium | Use a minimal static `node`; tree-shake standalone deps |
| Playwright fetched inline blows budget | Low | Keep it out of installer; download to app-cache at runtime |
| Prisma native engine per-platform | Medium | Vendor only needed query engine binaries in `externalBin` |
| Webview version gaps (old Linux) | Low | Document minimum OS; WKWebView/WebView2 are current |
| Google OAuth on desktop | Deferred | Mock stays; swap for Tauri `oauth` plugin later |

---

## Decision Log

- **2026-08-13** — Approved: keep mock Gmail login; proceed with Tauri v2 plan (item 1).
- **2026-08-13** — Approved earlier: keep Next.js + API/SQLite, rebuild only the UX
  layer; wrap in Tauri later. This plan is that "later" step.

---

## Data-Layer Correction (Errata — 2026-08-13, RISK-026)

**The data layer is JSON-file based, NOT SQLite.** This plan (lines 20, 56, 106,
125–127) and its bundle/architecture assumptions describe a SQLite store that the
application does not actually use.

- The dashboard reads JSON files via `src/lib/gbp/server-data.ts`
  (`snapshots/`, `reviews_new/`, `run_summary.json`, `listings.json`, `selectors.json`).
- `prisma/`, `src/lib/db.ts`, and `@prisma/client` are **dead code** (TD-M03) — no
  code path in the live data layer imports Prisma. There is no SQLite file in the
  runtime data path.
- Therefore: the "SQLite (better-sqlite3 / prisma) < 2 MB" line in the bundle table is
  **not required**, and Phase C items 8 ("Point SQLite path to app-data dir") and 10
  ("Confirm Prisma client loads against the bundled SQLite file") do not apply.

**Correct offline story:** Next standalone server + JSON files on disk (read/written by
the existing Python orchestrator and `server-data.ts`) + optional lazily-installed
Python scraper sidecar. The bundle budget should drop the Prisma/SQLite engine line
entirely; offline operation is already satisfied by local JSON files.

**Action:** If a relational store is desired later, it is an additive decision — not a
current dependency. Until then, do not provision a SQLite engine in the installer.
