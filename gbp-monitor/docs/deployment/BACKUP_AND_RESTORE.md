# Backup and Restore — GBP Monitor

**Document ID:** DEPLOY-003
**Date:** 2026-07-25
**Target Audience:** Operations team

---

## Backup

### Automated Backup Script

```bash
# Full backup (data + config)
python scripts/backup.py

# Data only (exclude config)
python scripts/backup.py --no-config

# Custom destination
python scripts/backup.py --dest /mnt/backups

# Dry-run (preview without writing)
python scripts/backup.py --dry-run
```

### What Gets Backed Up

| Source | Included by Default | Size Estimate (12 competitors) |
|---|---|---|
| `data/snapshots/**/*.json` | Yes | ~50 MB/year |
| `data/reviews_new/**/*.json` | Yes | ~1 MB/year |
| `data/selector_history.json` | Yes | ~50 KB |
| `data/run.log` | Yes | ~2 MB/year |
| `config/listings.json` | Yes (omit with `--no-config`) | ~5 KB |
| `config/selectors.json` | Yes (omit with `--no-config`) | ~15 KB |

### Output

Backups are timestamped zip archives:
```
data/backups/gbp-monitor-backup-{YYYYMMDDTHHMMSSZ}.zip
```

### Automated Backup via Cron

```bash
# Daily backup at 03:00 WITA (before the scrape at 05:00)
0 20 * * * cd /opt/gbp-monitor && python scripts/backup.py --dest /mnt/backups
```

### Docker Backup

```bash
# Backup data volume to host
docker run --rm -v gbp-monitor-data:/data -v $(pwd)/backups:/backups alpine \
    tar czf /backups/gbp-monitor-data-$(date -u +%Y%m%d).tar.gz -C /data .

# Backup using the backup script inside container
docker compose run --rm scraper python scripts/backup.py --dest /app/data/backups
```

### Backup Retention Policy

| Retention | Action |
|---|---|
| Last 7 daily backups | Keep on local disk |
| Last 4 weekly backups | Move to long-term storage |
| Last 12 monthly backups | Archive to cold storage |
| Older than 1 year | Delete |

---

## Restore

### Automated Restore Script

```bash
# Preview what will be restored
python scripts/restore.py data/backups/gbp-monitor-backup-20260725T120000Z.zip --dry-run

# Restore (overwrites existing files with warning)
python scripts/restore.py data/backups/gbp-monitor-backup-20260725T120000Z.zip
```

### Docker Restore

```bash
# Restore data volume from host backup
docker run --rm -v gbp-monitor-data:/data -v $(pwd)/backups:/backups alpine \
    tar xzf /backups/gbp-monitor-data-20260725.tar.gz -C /data

# Using the restore script inside container
docker compose run --rm scraper python scripts/restore.py /app/data/backups/gbp-monitor-backup-20260725T120000Z.zip
```

### Manual Restore (No Docker)

```bash
# 1. Stop any running scraper
# 2. Extract backup
unzip data/backups/gbp-monitor-backup-20260725T120000Z.zip -d /tmp/restore

# 3. Verify extracted files
ls -la /tmp/restore/data/snapshots/

# 4. Copy to data directory
cp -r /tmp/restore/data/* data/
# or for config restore:
cp -r /tmp/restore/config/* config/

# 5. Verify integrity
python -m orchestration.health

# 6. Run next scheduled scrape
```

---

## Disaster Recovery

### Scenario: Data directory deleted

```bash
# 1. Restore from latest backup
python scripts/restore.py data/backups/gbp-monitor-backup-YYYYMMDDTHHMMSSZ.zip

# 2. Verify
python -m orchestration.health

# 3. Next run will re-scrape and create new snapshots
```

### Scenario: Config file corrupted

```bash
# 1. Restore config from backup
python scripts/restore.py data/backups/gbp-monitor-backup-YYYYMMDDTHHMMSSZ.zip

# 2. Or restore from git
git checkout HEAD -- config/listings.json config/selectors.json

# 3. Or restore from auto-backup
cp data/config_backups/YYYYMMDDTHHMMSSZ/listings.json config/listings.json
```

### Scenario: Full system failure

```bash
# 1. Reinstall Docker and clone repo
git clone <repo-url> /opt/gbp-monitor

# 2. Restore data volume
docker run --rm -v gbp-monitor-data:/data -v /mnt/backups:/backups alpine \
    tar xzf /backups/gbp-monitor-data-latest.tar.gz -C /data

# 3. Restore config
cp /mnt/backups/config/* /opt/gbp-monitor/config/

# 4. Verify
docker compose run --rm scraper python -m orchestration.health
```
