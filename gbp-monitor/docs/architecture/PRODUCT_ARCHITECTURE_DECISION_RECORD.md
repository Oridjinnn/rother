# Product Architecture Decision Record (PADR)

**Document ID:** PADR-001
**Date:** 2026-07-24
**Author:** M13A Pipeline
**Status:** DRAFT — for review

---

## Phase 1 — Current Architecture

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    CONFIGURATION                         │
│  config/listings.json   config/selectors.json            │
│  (12 competitors, 6 branches)  (schema v4, 9 selectors) │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│              ORCHESTRATION (run_all.py)                   │
│  Entry point: python -m orchestration.run_all             │
│  Modes: live | --fixtures | --verify                      │
│  Features: lock file, retry logic, failure isolation      │
│  Outputs: run_summary.json, selector_report.json          │
└───┬───────────┬───────────┬───────────┬──────────────────┘
    │           │           │           │
    ▼           ▼           ▼           ▼
┌──────┐ ┌──────────┐ ┌───────┐ ┌──────────┐
│HARNESS│ │ DISCOVERY│ │PARSER │ │ STORAGE  │
│browser│ │validate_ │ │review_│ │snapshot_ │
│capture│ │listing.py│ │parser │ │store.py  │
│scroll │ │(head/GET)│ │schema │ │delta.py  │
│locator│ │          │ │.py   │ │migrate_  │
│select │ │          │ │       │ │snapshots │
│or_trak│ │          │ │       │ │.py       │
│er     │ │          │ │       │ │          │
└───────┘ └──────────┘ └───────┘ └─────┬────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────┐
│                    DATA STORAGE                          │
│  data/snapshots/{comp_id}/{ts}.json  (versioned)         │
│  data/reviews_new/{comp_id}_{run_id}.json  (deltas)     │
│  data/run_summary.json  data/run.log                     │
│  data/selector_report.json  data/selector_history.json   │
│  data/.run.lock  data/verify/{ts}/                       │
│  data/raw_html/  (gitignored)                            │
└─────────────────────────────────────────────────────────┘
```

### Component Breakdown

#### 1. Python Scraper (core)
- **File:** `orchestration/run_all.py` (1088 lines)
- **Role:** Conductor — loads configs, runs pre-flight checks, drives per-listing pipeline
- **Technology:** Python 3.11, Playwright 1.57, parsel 1.11
- **Modes:** live (Playwright), `--fixtures` (static HTML), `--verify` (capture without modifying data)

#### 2. Playwright Browser Automation
- **Files:** `harness/browser.py`, `harness/capture.py`, `harness/scroll.py`
- **Role:** Launches headless Chromium, navigates to Google Maps, scrolls review containers, captures HTML
- **Hardening:** 3-layer Client Hints override (Fix A, arXiv:2606.14525)

#### 3. Locator System
- **File:** `harness/locator.py`
- **Role:** Self-healing 3-tier review item locator (arXiv:2603.20358)

#### 4. Parser
- **Files:** `parser/review_parser.py`, `parser/schema.py`
- **Role:** Extracts structured reviews from HTML using parsel.Selector
- **Design:** `_safe_parse_*` helpers isolate field-level exceptions

#### 5. Storage
- **Files:** `storage/snapshot_store.py`, `storage/delta.py`
- **Role:** Versioned JSON snapshots, delta computation
- **Design:** Atomic writes (`.tmp` → replace), `latest.json` pointer files

#### 6. Configuration
- **Files:** `config/listings.json`, `config/selectors.json`
- **Role:** Competitor definitions (12 listings, 6 branches) and DOM selectors (schema v4)

#### 7. Selector Health Tracking
- **File:** `harness/selector_tracker.py`
- **Role:** Records per-selector outcomes, computes confidence, detects drift

#### 8. Operational Tooling
- **GitHub Actions:** `schedule/.github/workflows/scrape.yml` — daily cron at 05:00 WITA
- **Golden Datasets:** `golden/promote.py` — promotes verify evidence to golden-datasets/
- **Baseline Tests:** `tests/verify_baseline.py` — 46 regression checks
- **Migration:** `storage/migrate_snapshots.py` — flat file → versioned directories

#### 9. Dashboard (NOT IMPLEMENTED)
- **Status:** Planned but not built
- **Current state:** Data is consumed by reading raw JSON files

### Architectural Strengths

| Strength | Evidence | Location |
|---|---|---|
| Failure isolation per listing | Inner `try/except` catches all exceptions; run continues | `run_all.py:633-654` |
| Atomic file writes | `.tmp` → `replace()` prevents partial-write corruption | `snapshot_store.py:117-125` |
| Clean separation of concerns | 6 packages with single responsibilities | `harness/`, `parser/`, `storage/`, etc. |
| Evidence-based anti-bot hardening | 3-layer Client Hints override based on arXiv papers | `browser.py:86-182` |
| Self-healing locators | 3-tier ranked selector list, class-name-independent | `locator.py:20-25` |
| Comprehensive change tracking | CHANGELOG.md with PROVEN/UNPROVEN status per entry | `CHANGELOG.md` |
| Lock file with stale detection | Prevents overlapping runs; 30-min stale threshold | `run_all.py:142-196` |
| Structured logging | JSONLOG prefix enables machine parsing | `run_all.py:130-139` |

### Architectural Weaknesses

| Weakness | Impact | Evidence | Location |
|---|---|---|---|
| Sequential processing | 5 min for 12 competitors; exceeds CI timeout at 50+ | `run_all.py:458-488` |
| No database | Reading all reviews requires scanning directories + parsing JSON | `snapshot_store.py` |
| No HTTP server/dashboard | Cannot view data without filesystem access | Not implemented |
| No Docker packaging | Requires manual Python + Playwright install per machine | No Dockerfile |
| No config validation CLI | Non-developers must edit raw JSON | `config/listings.json` edited manually |
| JSON snapshots grow unbounded | 365 snapshots/competitor/year with no retention policy | `snapshot_store.py:107-125` |
| No input rate limiting | 5-10s random delay is minimal; no per-domain rate tracking | `run_all.py:110` |
| Path traversal risk | `competitor_id` used in file paths without sanitization | `run_all.py:957` |

---

## Phase 2 — Product Direction

### Option A: Internal Company Tool

**Description:** CLI tool used by Copenhagen Bali's internal marketing team.

**Advantages:**
- Lowest implementation cost — current architecture already works
- No multi-tenancy needed
- No authentication/authorization required
- Single deployment target (one server)
- Simplest support model

**Disadvantages:**
- No dashboard — ops team must read JSON files
- Manual config changes require developer
- No audit trail for changes
- Scales poorly beyond current 12 competitors

**Required Changes:**
- Add dashboard (Next.js or Streamlit)
- Add CLI for config management
- Add Docker for easy deployment
- Add snapshot retention

**Long-term Maintenance Cost:** LOW (~10 hrs/month)

### Option B: Agency Software

**Description:** Tool used by a digital agency to monitor multiple clients' competitors.

**Advantages:**
- Multi-client revenue potential
- Builds on existing architecture
- Differentiated from expensive enterprise tools

**Disadvantages:**
- Significant scope increase — multi-tenancy, auth, billing
- Each client needs separate place_ids
- Data isolation between clients required
- SLA obligations

**Required Changes:**
- Multi-tenant database
- Client onboarding workflow
- Authentication system
- Billing integration
- Per-client dashboards
- Data isolation layer

**Long-term Maintenance Cost:** HIGH (~40 hrs/month)

### Option C: Multi-Client Platform

**Description:** SaaS platform where multiple businesses monitor their competitors.

**Advantages:**
- Recurring revenue
- Scales to hundreds of clients
- Network effects

**Disadvantages:**
- Requires full rewrite for web architecture
- Requires infrastructure for 100+ concurrent scrapers
- Google Maps scraping at scale risks IP blocks
- Anti-bot detection escalates with volume
- Requires dedicated ops team
- 6-12 months development before first client

**Required Changes:**
- Full web backend (Django/Node.js/Go)
- Distributed scraping infrastructure
- Proxy rotation + residential IPs
- Database (PostgreSQL)
- Authentication + billing
- Admin dashboard
- Monitoring + alerting

**Long-term Maintenance Cost:** VERY HIGH (~80+ hrs/month)

### Option D: Self-Hosted Commercial Product

**Description:** Packaged product clients install on their own infrastructure.

**Advantages:**
- One-time or subscription revenue
- No infrastructure costs for us
- Client manages their own scraping

**Disadvantages:**
- Complex installation for non-technical clients
- Support burden per-instance
- Version fragmentation
- Requires polished packaging (Docker Compose + docs)

**Required Changes:**
- Docker Compose deployment package
- Web dashboard
- CLI management tool
- Backup/restore system
- Upgrade migration framework
- Documentation site

**Long-term Maintenance Cost:** MEDIUM (~30 hrs/month)

### Option E: Enterprise Deployment

**Description:** Large-scale deployment for enterprises with 500+ competitors, SLA-backed.

**Advantages:**
- Highest revenue potential
- Enterprise contracts = stable income

**Disadvantages:**
- SMB market may not have 500 competitors
- Requires distributed scraping infrastructure
- SLA commitments require 99.9% uptime
- Security certifications (SOC2, ISO 27001)
- Dedicated enterprise sales team

**Required Changes:**
- Distributed worker architecture
- PostgreSQL + TimescaleDB
- Redis for work queue
- High-availability deployment
- Monitoring + alerting (PagerDuty)
- Security compliance program
- Enterprise SSO

**Long-term Maintenance Cost:** HIGH (~60 hrs/month)

### Recommendation: Option A — Internal Company Tool

**Primary Direction: Internal Company Tool**
**Contingency: Self-Hosted Commercial Product (Option D)**

**Rationale:**

1. **Current state aligns with Option A:** The scraper is designed for a single company (Copenhagen Bali) monitoring 12 competitors. Adding multi-tenancy or enterprise features before the basic product works is premature.

2. **Missing fundamentals first:** Before commercializing, the product needs: dashboard, config CLI, Docker packaging, snapshot retention, and security hardening. These are Option A requirements that also benefit any future commercialization.

3. **Revenue doesn't justify re-architecture:** The Bali coffee shop competitor monitoring niche is small. Multi-client revenue from 10-20 agencies wouldn't fund the 6-12 month development of Option C.

4. **Option D is a natural evolution:** Once Option A is stable with dashboard + Docker + CLI, packaging it for self-hosted sale adds minimal incremental cost and opens a revenue stream.

**Decision:** Build as internal company tool. Revisit commercialization (Option D → C) after V1.0 stable and proven with actual users.

---

## Phase 2 Findings Summary

| Criterion | A: Internal | B: Agency | C: Multi-Client | D: Self-Hosted | E: Enterprise |
|---|---|---|---|---|---|
| Implementation Cost | LOW | MEDIUM | VERY HIGH | MEDIUM | HIGH |
| Time to V1.0 | 2-3 months | 6-8 months | 12+ months | 4-6 months | 8-12 months |
| Revenue Potential | None | LOW | MEDIUM | MEDIUM | HIGH |
| Maintenance Cost | LOW | HIGH | VERY HIGH | MEDIUM | HIGH |
| Risk | LOW | MEDIUM | HIGH | LOW | MEDIUM |
| Strategic Value | Builds foundation | Premature | Over-engineered | Future evolution | Premature |
