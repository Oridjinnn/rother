# 09 — Future Platform Strategy

**Document:** `09_FUTURE_PLATFORM_STRATEGY.md`  
**Milestone:** M15.0  

---

## Purpose

Define the long-term strategy for expanding Rother beyond a Windows-first web dashboard to native desktop and multi-source data aggregation. This is a directional document, not a commitment to ship.

---

## Vision

Rother evolves from a single-dashboard web app into a **native desktop application** that aggregates review and reputation data from **multiple sources** (Google Maps, Facebook, Yelp, TripAdvisor), with optional **self-hosted server mode** for team access and **cloud-hosted SaaS** for managed deployments.

---

## Platform Evolution

### Phase 1: Web App (V1 — Current)
- **Status:** Already shipped
- **Platform:** PWA + browser
- **Backend:** Python (gbp-monitor)
- **Data source:** Google Maps only
- **Audience:** Single-user (ops manager on Windows)

### Phase 2: Desktop App (V2 — Next Major)
- **Platform:** Tauri or Electron
- **Backend:** Rust (Tauri) or Node (Electron) wrapping Python scraper
- **Auto-update:** Native updater (Tauri updater / Electron auto-updater)
- **System tray:** Minimize to tray, unread badge, notifications
- **Auto-start:** Windows startup registration
- **Offline cache:** IndexedDB for review data cache
- **Audience:** Same single-user, plus power users who want native feel

### Phase 3: Multi-Source (V3)
- **Data sources:** Google Maps + Facebook + Yelp + TripAdvisor
- **Source selector:** Per-source tabs in dashboard
- **Unified schema:** Normalized review model across sources
- **Audience:** Marketing managers who need cross-platform reputation data

### Phase 4: Server Mode (V4)
- **Self-hosted server:** Headless backend with web client
- **Team accounts:** Simple user management (no RBAC initially)
- **Shared data:** Multiple users see the same dashboard
- **Audience:** Small teams (2-5 people) sharing competitive analysis

### Phase 5: SaaS (V5+)
- **Cloud-hosted:** Managed by Rother team
- **Billing:** Per-seat or per-source pricing
- **SSO:** Google/Microsoft login
- **API:** Public API for data export
- **Audience:** Agencies and enterprises managing 50+ locations

---

## Technology Path

### Desktop Framework Decision

| Framework | Pros | Cons | Verdict |
|-----------|------|------|:-------:|
| **Electron** | Mature, extensive docs, large ecosystem | Heavy bundle (100MB+), Chrome overhead | Backup |
| **Tauri** | Lightweight (5MB), Rust backend, system tray built-in | Younger ecosystem, Rust learning curve | **Preferred** |
| **PWA-only** | No native code, instant updates | No system tray, no auto-start, limited notifications | V1 only |

**Recommendation:** Tauri for V2 native app. PWA covers 90% of use cases for V1.

### Backend Evolution
```
V1: Python (gbp-monitor) via subprocess
    │
V2: Python (gbp-monitor) via Tauri sidecar or REST API
    │
V3: Python scraper service (Docker container)
    + Rust data ingestion layer for multi-source normalization
    │
V4: Backend service (Python/FastAPI) with SQLite → PostgreSQL
    │
V5: Cloud backend (Python/FastAPI + PostgreSQL + Redis)
```

---

## Multi-Source Data Model

When adding new sources in V3, the normalized review model should be:

```typescript
interface NormalizedReview {
  id: string;
  source: 'google_maps' | 'facebook' | 'yelp' | 'tripadvisor';
  sourceId: string;            // Native ID from the source
  competitorId: string;
  reviewerName: string;
  rating: number;              // 1-5 (normalized from source scale)
  text: string;
  language: string;            // ISO 639-1
  url: string;                 // Link to original
  scrapedAt: string;           // ISO 8601
  metadata: {                  // Source-specific extras
    responseText?: string;     // Business owner reply
    reviewCount?: number;      // Total reviews for this business
    averageRating?: number;    // Aggregated rating
  };
}
```

---

## Deployment Models

| Model | V1 | V2 | V3 | V4 | V5 |
|-------|:--:|:--:|:--:|:--:|:--:|
| Local single-user | ✓ | ✓ | ✓ | ✓ | ✓ |
| Local multi-user | — | — | — | ✓ | ✓ |
| Self-hosted server | — | — | — | ✓ | ✓ |
| Cloud SaaS | — | — | — | — | ✓ |
| Docker container | — | — | ✓ | ✓ | ✓ |

---

## What WON'T Change

- **Windows-first** — Always. Rother's primary user sits at a Windows laptop.
- **Dashboard-first** — Always. The overview is the product.
- **One-click insight** — Always. Adding a competitor should never require JSON editing.
- **No brand affiliation** — Always. Rother stays neutral.

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|:------:|------------|
| Multi-source scope creep | Delays V2 desktop | Ship desktop V2 with Google Maps only. Multi-source is V3. |
| Tauri ecosystem immaturity | Bugs, missing features | Use PWA as fallback. Can switch to Electron if Tauri blockers emerge. |
| SaaS infrastructure cost | No revenue model | Keep self-hosted as default. SaaS is optional add-on. |
| Web scraping legality | Legal risk | Only scrape publicly available data. Respect robots.txt. Add terms of service. |
