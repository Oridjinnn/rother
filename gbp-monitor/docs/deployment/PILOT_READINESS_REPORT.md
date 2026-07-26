# Pilot Readiness Report — gbp-monitor

**Date:** 2026-07-25  
**Scope:** End-to-end readiness assessment for gbp-monitor pilot deployment  
**Method:** 5-phase audit (deployment → install → ops → observability → report)

---

## 1. Executive Summary

| Area | Status |
|------|--------|
| Deployment | ✅ Ready |
| Installation | ✅ Verified |
| Operations | ✅ Verified (with notes) |
| Observability | ⚠️ Adequate for pilot |
| **Overall** | **✅ Conditionally ready** |

The system can be deployed to production for pilot use. All core paths work. The documented gaps are acceptable for a controlled pilot and have remediation plans.

---

## 2. Phase 1 — Deployment Audit

| Check | Result |
|-------|--------|
| Dockerfile | ✅ Present — multi-stage, non-root user, HEALTHCHECK, resource limits |
| docker-compose.yml | ✅ Present — volume mounts, env, restart policy |
| .dockerignore | ✅ Present — excludes dev artifacts |
| .env.example | ✅ Present — all secrets documented |
| CI/CD | ✅ GitHub Actions — ci.yml (PRs) + scrape.yml (daily cron) |
| Secrets management | ✅ No hardcoded secrets — all via env vars |
| Container security | ✅ Non-root user (uid 1001), read-only root FS supported |

### Key Architecture
- **Deployment model:** Single Docker container, daily cron-driven scrape cycle
- **Data persistence:** Host-mounted `data/` volume
- **Health:** CLI health check via Docker HEALTHCHECK
- **Logging:** Structured JSONLOG to `data/run.log` + stderr

---

## 3. Phase 2 — Installation Validation

| Check | Result |
|-------|--------|
| `pip install -e .` | ✅ Installs cleanly |
| `playwright install chromium` | ✅ Chromium installed |
| `python -m orchestration.run_all --fixtures` | ✅ success=3, failed=0 |
| `python -m orchestration.health` | ✅ All 5 checks pass |
| Docker build | ✅ Builds in ~90s |
| Docker HEALTHCHECK | ✅ Passes |

---

## 4. Phase 3 — Operational Validation

### Lock Mechanism
| Check | Result |
|-------|--------|
| Exclusive file lock | ✅ `data/.run.lock` with PID + run_id |
| Lock prevents concurrent runs | ✅ Second process blocked |
| Stale lock recovery | ✅ 5 attempts, 60s timeout |
| Cleanup on success | ✅ Lock released |
| Cleanup on failure | ✅ Released in finally block |

### Preflight Checks
| Check | Result |
|-------|--------|
| Config JSON validation | ✅ |
| Disk space check (`GBP_MONITOR_MIN_DISK_BYTES`) | ✅ |
| Playwright/Chromium availability | ✅ |
| Fixture file presence (fixtures mode) | ✅ |

### Restart & Shutdown
| Check | Result |
|-------|--------|
| Idempotent restart | ✅ Multiple --fixtures runs produce same result |
| KeyboardInterrupt (Ctrl+C) | ✅ Caught, lock released, summary written |
| Partial data on abort | ✅ Snapshots preserved (per-listing commits) |

### Log Rotation
| Check | Result |
|-------|--------|
| Rotation on Linux/Docker | ✅ Works (POSIX rename-on-open semantics) |
| Rotation on Windows | ❌ Fails (file handle conflict — cannot rename open log) |
| Threshold | 5 MB before rotation |
| Retention | Single rotated file (`run.log.YYYYMMDD`) |

### Exit Code
| Check | Result |
|-------|--------|
| Always exits 0 | ✅ By design (Rule 7 — partial failures are data, not errors) |

---

## 5. Phase 4 — Observability Audit

### Logging

| Aspect | Status |
|--------|--------|
| Structured JSONLOG in orchestration | ✅ All major stages logged as grep-able JSON |
| Plain logging in submodules | ⚠️ Acceptable — submodule logs include module name |
| Log level config | 🔧 `GBP_MONITOR_LOG_LEVEL` documented in .env but not wired in code |
| Traceback on errors | ❌ Errors logged as `type: message` without full traceback |

### Health

| Aspect | Status |
|--------|--------|
| Docker HEALTHCHECK | ✅ `python -m orchestration.health` (5 checks) |
| HTTP health endpoint | ❌ Not present (intentional — see ADR M13A) |
| Prometheus /metrics | ❌ Not present |

### Alerting

| Aspect | Status |
|--------|--------|
| In-log alert prefix | ✅ `ALERT:` emitted when `failed >= successful` |
| Push-based alerts (Slack/email) | ❌ Not implemented |
| Selector drift alerts | ✅ Embedded in `selector_report.json` |

### Monitoring Documentation

| Document | Covers |
|----------|--------|
| OPERATIONS_RUNBOOK.md | Daily checks, incident response, escalation |
| DEPLOYMENT_GUIDE.md | Health verification, cron/systemd setup |
| DOCKER_GUIDE.md | HEALTHCHECK usage |
| UPGRADE_GUIDE.md | Health check as upgrade verification |
| BACKUP_AND_RESTORE.md | Health check for restore verification |

---

## 6. Known Gaps & Remediation

| Gap | Severity | Pilot Impact | Remediation |
|-----|----------|-------------|-------------|
| Log rotation fails on Windows | Low | None (pilot uses Docker/Linux) | Fix with log handler reopen; low priority |
| No push alerts | Medium | Admin must check run_summary.json manually | Add Slack webhook in M16; acceptable for pilot |
| No dashboard | Medium | No visual overview | Next.js dashboard in M16-M17 |
| No Sentry/error tracking | Low | Errors visible in logs | Acceptable for pilot; add if scaling |
| No HTTP health endpoint | Low | HEALTHCHECK works via CLI | ADR M13A — intentional CLI-only |
| `GBP_MONITOR_LOG_LEVEL` not wired | Low | Log level always INFO | Minor fix; acceptable for pilot |
| No full traceback in error logs | Low | Diagnosis possible via `_diagnose_failure` | Acceptable; improve in M17 |

---

## 7. Pilot Deployment Checklist

### Pre-deployment

- [ ] Verify `docker-compose.yml` environment section has all required vars
- [ ] Set `GBP_MONITOR_DATA_DIR` to persistent host path
- [ ] Set `TZ=Asia/Makassar` for WITA timezone
- [ ] Set `GBP_MONITOR_MIN_DISK_BYTES` (default 104857600 = 100 MB)
- [ ] Run `docker compose build --no-cache` on target host
- [ ] Run `docker compose up -d` and verify `docker compose ps` shows healthy
- [ ] Verify `docker compose logs` shows successful run with JSONLOG entries
- [ ] Confirm first daily cron run completes via `docker compose logs`

### Post-deployment (first week)

- [ ] Daily check: `docker compose exec app cat data/run_summary.json`
- [ ] Daily check: verify `success` count > 0
- [ ] Weekly check: review `data/run.log` for unexpected WARNING/ERROR
- [ ] Weekly check: verify `data/selector_report.json` shows no broken selectors
- [ ] After 1 week: verify log rotation occurred (check for `data/run.log.*` files)

### Rollback

- [ ] `docker compose down` to stop
- [ ] Previous version image tagged in registry (use explicit version tags)
- [ ] Data volume preserved under host-mounted path

---

## 8. Summary

The gbp-monitor system is **conditionally ready for pilot deployment**. All core functional paths have been verified. The known gaps are well-understood, documented, and acceptable for a controlled pilot with active admin oversight. The two highest-priority items (dashboard and push alerts) are already planned for M16-M17.
