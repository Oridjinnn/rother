# Long-Term Roadmap

**Document ID:** PADR-002
**Date:** 2026-07-24
**Status:** DRAFT — for review

---

## Current State (M12 complete)

```
Production Readiness:    4/10
Deployment Readiness:    2/10
Maintainability:         5/10
Security:                7/10
Scalability:             4/10
Client Usability:        3/10
Overall:                 4.2/10
Core pipeline:           FUNCTIONAL (12/12 live verify passed)
Place IDs:               2/12 real, 10/12 missing
Dashboard:               NOT IMPLEMENTED
Docker:                  NOT IMPLEMENTED
Config CLI:              NOT IMPLEMENTED
```

---

## Phase 1 — Foundation (M13-M15)

**Goal:** Production-ready for demo with 12 competitors.

### Security Hardening (Critical)

| Item | Priority | Effort | Evidence |
|---|---|---|---|
| Path traversal fix in competitor_id | Critical | 1 day | `run_all.py:957` — `comp_id` used in `Path()` without sanitization |
| URL validation on --url flag | Medium | 1 day | `run_all.py:1060-1069` — no URL scheme/domain validation |
| Disk space preflight check | Low | 1 day | No `shutil.disk_usage()` check before write operations |
| Log rotation for local mode | Medium | 1 day | `run_all.py:86` — `logging.FileHandler` with no rotation; CI has it (`scrape.yml:49-62`) |

### Deployment (Critical)

| Item | Priority | Effort | Evidence |
|---|---|---|---|
| Dockerfile for scraper | Critical | 2 days | No Dockerfile exists; `browser.py:207` needs `--no-sandbox` for containers |
| docker-compose.yml | High | 1 day | No multi-service orchestration; needed for dashboard later |
| Update CI to use Docker | Medium | 1 day | `scrape.yml:43` — `pip install` + `playwright install` each run; Docker would cache |

### Configuration (Critical)

| Item | Priority | Effort | Evidence |
|---|---|---|---|
| Config validation CLI | Critical | 2 days | `config/listings.json` has no schema validation; `_preflight_checks` only runs during scrape |
| Config auto-backup | Medium | 1 day | No `data/config_backups/` mechanism; accidental JSON error breaks run |
| Dry-run mode | High | 1 day | `_resolve_url()` constructs URLs but no way to preview without running |
| Place ID lookup wizard | Medium | 3 days | `README.md:23` references non-existent `LIVE_SCRAPING_GUIDE.md` |

### UX (High)

| Item | Priority | Effort | Evidence |
|---|---|---|---|
| Print summary after run | High | 1 day | `_finish_and_write_summary` writes to JSON file only; no stdout summary |
| Progress indicator | Medium | 1 day | `run_all.py:468-488` — sequential loop with no progress bar |
| Better first-run experience | High | 1 day | `run_all` with no args silently skips all listings (no place_ids) |
| Fix README stale content | Low | 1 hr | `README.md:39` says "67 checks pass" — actual is 46 |

---

## Phase 2 — Dashboard (M16-M17)

**Goal:** Non-developers can view review data without filesystem access.

### Dashboard (Critical)

| Item | Priority | Effort | Description |
|---|---|---|---|
| Simple read-only dashboard | Critical | 2 weeks | Next.js or Streamlit dashboard reading JSON files |
| Per-competitor review view | High | 1 week | Filterable list of reviews with ratings, dates, text |
| Delta highlighting | Medium | 3 days | Highlight reviews added since last run |
| Run history view | Medium | 3 days | Table of recent runs with pass/fail counts |
| Selector health view | Low | 2 days | Visual display of `selector_report.json` data |
| Screenshot viewer | Low | 2 days | Display verify-mode screenshots in dashboard |

---

## Phase 3 — Data Architecture (M18)

**Goal:** Database-backed storage for reliability and performance.

### Database Migration (High)

| Item | Priority | Effort | Description |
|---|---|---|---|
| SQLite schema design | High | 2 days | `reviews`, `runs`, `config_versions` tables |
| Dual-write (JSON + SQLite) | High | 3 days | Write to both for 2-week transition |
| Dashboard reads from SQLite | High | 3 days | Switch dashboard queries to SQLite |
| JSON retention policy | Medium | 2 days | Keep 90 days of JSON snapshots, then auto-prune |
| Config version history | Low | 2 days | Track changes to `listings.json` and `selectors.json` |

---

## Phase 4 — Scalability (M19-M20)

**Goal:** Support 50-100 competitors.

### Performance (High)

| Item | Priority | Effort | Evidence |
|---|---|---|---|
| Parallel processing (3 workers) | High | 3 days | `run_all.py:458-488` — sequential loop; exceeds CI timeout at 50+ |
| Snapshot retention policy | High | 2 days | `snapshot_store.py:107-125` — no cleanup; 365 files/year/competitor |
| HTTP caching (1 hour TTL) | Medium | 2 days | `capture.py:141-213` — re-downloads all pages each run |
| CI timeout increase (30→60 min) | High | 5 min | `scrape.yml:29` — `timeout-minutes: 30` limits scale |

### Service Hardening (Medium)

| Item | Priority | Effort | Description |
|---|---|---|---|
| systemd service file | Medium | 1 day | For Linux deployments (auto-restart, logging) |
| Windows service guide | Low | 1 day | NSSM or Task Scheduler documentation |
| Backup/restore script | Medium | 2 days | Automated `data/` volume backup |

---

## Phase 5 — Operations (M21)

**Goal:** Production operations run smoothly.

### Documentation (Medium)

| Item | Priority | Effort | Description |
|---|---|---|---|
| CONTRIBUTING.md | Medium | 1 day | Coding style, PR workflow, commit format |
| On-call runbook | Medium | 2 days | Incident response procedures (from M12 findings) |
| Error catalog | Medium | 1 day | All error types with causes and remediation |
| Maintenance checklist | Low | 1 day | Weekly/monthly/quarterly tasks |

### Monitoring (Medium)

| Item | Priority | Effort | Description |
|---|---|---|---|
| Run success/failure alerts | Medium | 2 days | Email or webhook on `failed >= success` |
| Delta volume alert | Low | 1 day | Alert on unexpected spike in new reviews |
| Disk usage alert | Low | 1 day | Alert when `data/` exceeds threshold |

---

## Phase 6 — V1.0 Release (M22)

**Goal:** First stable release.

### Release (Critical)

| Item | Priority | Effort | Description |
|---|---|---|---|
| Release checklist automation | High | 2 days | Script that runs all pre-release checks |
| Versioned releases (git tags) | High | 1 day | Semantic versioning with changelog |
| Upgrade migration framework | Medium | 3 days | Schema migration between versions (needed for DB migration) |
| Rollback procedure | Medium | 1 day | Documented `git revert` + data restore steps |

---

## Roadmap Visualization

```
M13    M14    M15    M16    M17    M18    M19    M20    M21    M22
│      │      │      │      │      │      │      │      │      │
├──────┤      │      │      │      │      │      │      │      │  Security
│  Sec │      │      │      │      │      │      │      │      │  Hardening
│      ├──────┤      │      │      │      │      │      │      │  Deployment
│      │ Doc- │      │      │      │      │      │      │      │  (Docker +
│      │ ker   │      │      │      │      │      │      │      │  Compose)
│      │      ├──────┤      │      │      │      │      │      │  Configuration
│      │      │ CLI  │      │      │      │      │      │      │  (validation +
│      │      │ tools │      │      │      │      │      │      │  dry-run)
│      │      │      ├──────────────┤      │      │      │      │  Dashboard
│      │      │      │  Dashboard   │      │      │      │      │  (Next.js/
│      │      │      │              │      │      │      │      │  Streamlit)
│      │      │      │      │      ├──────┤      │      │      │  Data
│      │      │      │      │      │ SQL  │      │      │      │  Architecture
│      │      │      │      │      │ ite  │      │      │      │  (SQLite
│      │      │      │      │      │      │      │      │      │  migration)
│      │      │      │      │      │      ├──────┤      │      │  Scalability
│      │      │      │      │      │      │ Par- │      │      │  (parallel +
│      │      │      │      │      │      │ allel │      │      │  retention)
│      │      │      │      │      │      │      ├──────┤      │  Operations
│      │      │      │      │      │      │      │ Docs │      │  (monitoring
│      │      │      │      │      │      │      │      │      │  + runbook)
│      │      │      │      │      │      │      │      ├──────┤  V1.0 Release
│      │      │      │      │      │      │      │      │ Release │
```

---

## Milestone Summary

| Phase | Milestones | Duration | Dependencies | Outcome |
|---|---|---|---|---|
| 1: Foundation | M13-M15 | ~6 weeks | None | Production-ready for demo; Docker + CLI + security fixes |
| 2: Dashboard | M16-M17 | ~4 weeks | Phase 1 | Non-developers can view data |
| 3: Data Architecture | M18 | ~2 weeks | Phase 2 | SQLite-backed storage |
| 4: Scalability | M19-M20 | ~4 weeks | Phase 3 | Support 50-100 competitors |
| 5: Operations | M21 | ~2 weeks | Phase 4 | Monitoring + runbooks |
| 6: V1.0 | M22 | ~2 weeks | Phase 5 | First stable release |
| **Total** | **M13-M22** | **~20 weeks** | | |
