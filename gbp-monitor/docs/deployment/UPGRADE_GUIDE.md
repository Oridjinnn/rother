# Upgrade Guide — GBP Monitor

**Document ID:** DEPLOY-004
**Date:** 2026-07-25
**Target Audience:** Engineers performing GBP Monitor upgrades

---

## Upgrade Strategy

GBP Monitor follows **semantic versioning** (`MAJOR.MINOR.PATCH`):

| Bump | When | Data Migration Needed |
|---|---|---|
| PATCH | Bug fixes, security patches | No |
| MINOR | New features, backward-compatible | No (unless documented) |
| MAJOR | Breaking changes (config schema, storage format) | Yes |

---

## Pre-Upgrade

### 1. Check Current Version

```bash
python -m orchestration.health | python -c "import json,sys; print(json.load(sys.stdin)['version'])"
```

### 2. Review CHANGELOG

```bash
# Look for migration notes or breaking changes
head -50 CHANGELOG.md
```

### 3. Check for Breaking Changes

Look for these signals in changelog entries:
- `**BREAKING:**` prefix
- "Schema version X → Y"
- "Migration required"
- "Deprecated: ... will be removed in ..."

### 4. Backup Current State

```bash
# Full backup before any upgrade
python scripts/backup.py --dest /tmp/pre-upgrade-backup
```

---

## Upgrade Process

### Docker Compose

```bash
# 1. Pull latest code
git pull origin main

# 2. Review changes
git log HEAD@{1}..HEAD --oneline

# 3. Rebuild image
docker compose build --no-cache

# 4. Run data migration (if any — see Release Notes)
# (No migration script in current version; add here if needed)

# 5. Test with fixtures mode
docker compose run --rm -e GBP_MONITOR_MODE=fixtures scraper

# 6. Run health check
docker compose run --rm scraper python -m orchestration.health

# 7. Run live verify
docker compose run --rm -e GBP_MONITOR_MODE=live scraper python -m orchestration.run_all --verify

# 8. Deploy to production
docker compose up -d
```

### Manual (No Docker)

```bash
# 1. Pull latest code
git pull origin main

# 2. Activate venv
source .venv/bin/activate

# 3. Update dependencies
pip install -r requirements.txt --upgrade

# 4. Update Playwright if needed
playwright install chromium

# 5. Run data migration (if any — none in current version)
# python scripts/migrate.py

# 6. Test
python -m tests.verify_baseline

# 7. Verify
python -m orchestration.run_all --fixtures
```

---

## Data Migration

### Automatic Migrations

When a MAJOR version changes the storage format, the scraper detects the old format on startup and migrates automatically:

```bash
# Example: v0.9 → v1.0 snapshot migration
# The scraper will:
# 1. Detect old flat-file snapshots (data/snapshots/{id}.json)
# 2. Migrate to versioned directory layout
# 3. Update latest.json pointers
# 4. Report migrated count
```

---

> **Note:** Migration scripts are created per-release when the data format changes.
> No migration scripts exist in the current codebase — the versioned snapshot layout
> (`data/snapshots/{competitor_id}/{timestamp}.json`) is the initial and only format.

## Rollback

### Docker Compose Rollback

```bash
# 1. Revert code
git checkout v0.9.0

# 2. Rebuild previous version
docker compose build

# 3. Restore data (if migration occurred)
python scripts/restore.py /tmp/pre-upgrade-backup/gbp-monitor-backup-*.zip

# 4. Verify
docker compose run --rm scraper python -m orchestration.health
```

### Manual Rollback

```bash
# 1. Revert code
git checkout v0.9.0

# 2. Revert dependencies
pip install -r requirements.txt

# 3. Restore data
python scripts/restore.py /tmp/pre-upgrade-backup/gbp-monitor-backup-*.zip

# 4. Verify
python -m tests.verify_baseline
```

---

## Version Compatibility Matrix

| From | To | Config Compat | Data Compat | Migration |
|---|---|---|---|---|
| v0.x | v1.0 | Yes (json schema v4) | Yes (versioned snapshots) | `migrate_snapshots.py` if on flat files |
| v1.0 | v1.1 | Yes | Yes | None |
| v1.x | v2.0 | Maybe (check changelog) | Maybe | Check release notes |

---

## Post-Upgrade Verification

After every upgrade, verify:

```bash
# 1. Baseline tests
python -m tests.verify_baseline
# Expected: 63 passed, 0 failed

# 2. Health check
python -m orchestration.health
# Expected: status = "pass"

# 3. Fixtures mode scrape
python -m orchestration.run_all --fixtures
# Expected: success=3, failed=0, skipped=9

# 4. Live verify (if place_ids configured)
python -m orchestration.run_all --verify
# Expected: passed=12, failed=0

# 5. Check run summary
cat data/run_summary.json
# Expected: no errors
```

## Upgrade Notifications

Subscribers to the repository will receive:
- **GitHub Release notifications** for each version
- **CHANGELOG.md** updated with every release
- **Release notes** on the GitHub Releases page

## Emergency Upgrade

For critical security patches:

```bash
# 1. Pull security fix
git pull origin main

# 2. Rebuild and restart
docker compose build --no-cache
docker compose up -d

# No backup needed for PATCH version upgrades
```
