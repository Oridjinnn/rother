# V1.0 Release Plan

**Document ID:** PADR-005
**Date:** 2026-07-24
**Status:** DRAFT — for review

---

## Executive Summary

### Recommended Product Direction

**Internal Company Tool** — build for Copenhagen Bali's marketing team. Do not multi-tenant or commercialize until V1.0 is stable and proven.

**Rationale:** Current architecture (Python CLI, JSON storage, 12 competitors) perfectly fits an internal tool. Adding multi-tenancy would delay V1.0 by 6+ months with no validated revenue.

### Recommended Deployment Model

**Docker Compose** — single-command deployment, portable across environments, ready for dashboard integration.

**Rationale:** Docker ensures reproducible environments, eliminates `pip install` + `playwright install` friction, and provides a natural path to add the dashboard as a second service.

### Recommended Storage Strategy

**Hybrid (JSON + SQLite):**
- JSON config files → permanent (human-editable source of truth)
- JSON snapshots → 90-day retention (transitional — replaced by SQLite)
- SQLite database → primary query layer (added in M18)
- Golden datasets → permanent (immutable regression evidence)

**Rationale:** SQLite solves the indexing, aggregation, and querying problems of flat JSON files without adding infrastructure complexity. JSON files remain as backup during transition and as config source of truth.

### Recommended Scalability Strategy

**Phased:**
- Current (12 competitors): Sequential processing — adequate within CI 30-min timeout
- 50-100 competitors (M19): 3-worker parallelism + 60-min CI timeout
- 500+ competitors (future): Distributed workers with work queue

**Rationale:** Parallelism with 3 workers triples throughput without significant architecture changes. Beyond 100 competitors, the architecture needs distributed processing which is out of scope for V1.0.

### Estimated Remaining Milestones Before V1.0

| Phase | Milestones | Duration | Start | End |
|---|---|---|---|---|
| M13 | Security hardening + Docker | 2 weeks | Now | +2 weeks |
| M14 | Config CLI tools | 2 weeks | +2 weeks | +4 weeks |
| M15 | UX improvements | 2 weeks | +4 weeks | +6 weeks |
| M16-M17 | Dashboard | 4 weeks | +6 weeks | +10 weeks |
| M18 | SQLite migration | 2 weeks | +10 weeks | +12 weeks |
| M19-M20 | Scalability (parallel + retention) | 4 weeks | +12 weeks | +16 weeks |
| M21 | Operations (monitoring + docs) | 2 weeks | +16 weeks | +18 weeks |
| M22 | V1.0 release | 1 week | +18 weeks | +19 weeks |

**Total: ~19 weeks to V1.0**

---

## V1.0 Definition of Done

### Must-Have (Release Blockers)

| Criterion | Verification |
|---|---|
| All 12 competitors can be scraped with real place_ids | `run_summary.json: success=12, failed=0` |
| Baseline verification: 46/46 PASS | `python -m tests.verify_baseline` → exit 0 |
| Data survives machine restart | Data is in Docker volume or SQLite |
| Non-developer can add a competitor | Via CLI tool: `python -m config.cli add-competitor ...` |
| Dashboard loads and shows review data | Via web browser at `http://localhost:8080` |
| Docker Compose: `docker compose up` works | Fresh clone → single command → running system |
| Security: no critical/high findings from M12 audit | Path traversal fix applied, URL validation applied |

### Should-Have (Target but not Blockers)

| Criterion | Priority |
|---|---|
| Snapshot retention (90-day auto-prune) | High |
| Progress bar during scrape | Medium |
| Email/webhook alerts on failure | Medium |
| Backup/restore script | Medium |
| Log rotation in local mode | Medium |

### Nice-to-Have (Post-V1.0)

| Criterion | Priority |
|---|---|
| Parallel processing (3 workers) | High (for 50+ scale) |
| Windows service deployment | Low |
| systemd service file | Low |
| Unit tests with pytest | Low |
| Historical trend charts in dashboard | Low |

---

## V1.0 Exit Criteria

### Gate 1: Foundation Complete (End of M15)

- [ ] Docker Compose runs on Linux and Windows (WSL2)
- [ ] Config CLI: `add-competitor`, `set-place-id`, `validate`, `dry-run`
- [ ] Path traversal vulnerability fixed
- [ ] URL validation on `--url` flag
- [ ] Log rotation for local mode
- [ ] Disk space preflight check
- [ ] Run summary printed to stdout
- [ ] First-run guidance when no place_ids
- [ ] README updated (46 checks, accurate instructions)

### Gate 2: Dashboard Complete (End of M17)

- [ ] Dashboard reads `data/snapshots/` and displays reviews
- [ ] Per-competitor filtered view
- [ ] Delta highlighting (new reviews since last run)
- [ ] Run history view
- [ ] Dashboard runs in Docker Compose alongside scraper
- [ ] Loads in < 2 seconds for 12 competitors

### Gate 3: Data Architecture Complete (End of M18)

- [ ] SQLite database with `reviews`, `runs` tables
- [ ] Dual-write (JSON + SQLite) for 2+ weeks
- [ ] Dashboard reads from SQLite
- [ ] JSON retention set to 90 days
- [ ] Migration script for existing JSON data → SQLite

### Gate 4: V1.0 Release (End of M22)

- [ ] All Must-Have criteria met
- [ ] All Should-Have criteria met or deferred with documented reason
- [ ] Release tagged (`v1.0.0`)
- [ ] CHANGELOG updated with full history
- [ ] Upgrade guide from pre-V1.0
- [ ] Release archive published

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Google Maps changes DOM | Medium | High | Self-healing locators (M10); monitor `selector_report.json` |
| Google blocks scraping | Medium | High | Fix A anti-bot hardening; rotate user agents; add proxy support in M19 |
| Client doesn't provide place_ids | High | High | 10/12 still missing; block M13 until resolved |
| Dashboard scope creep | Medium | Medium | Start with read-only; no edit/delete functionality in V1 |
| SQLite migration data loss | Low | High | Dual-write for 2 weeks; JSON backup retained 90 days |
| Docker + Playwright compatibility | Medium | Medium | Test with `--no-sandbox` flag; pin Playwright version |

---

## Resource Estimates

| Phase | Person-weeks | Skill Required |
|---|---|---|
| M13 — Security + Docker | 1-2 | Python, Docker |
| M14 — Config CLI | 1-2 | Python, argparse |
| M15 — UX | 1 | Python |
| M16-M17 — Dashboard | 3-4 | Next.js/React or Streamlit |
| M18 — SQLite migration | 2 | Python, SQL |
| M19-M20 — Scalability | 2-3 | Python, threading |
| M21 — Operations | 1 | Technical writing |
| M22 — V1.0 release | 1 | DevOps, QA |
| **Total** | **12-16 weeks** | |

---

## Current Score vs. V1.0 Target

| Category | Current | V1.0 Target |
|---|---|---|
| Production Readiness | 4/10 | 7/10 |
| Deployment Readiness | 2/10 | 8/10 |
| Maintainability | 5/10 | 7/10 |
| Security | 7/10 | 9/10 |
| Scalability | 4/10 | 6/10 |
| Client Usability | 3/10 | 8/10 |
| **Overall** | **4.2/10** | **7.5/10** |
