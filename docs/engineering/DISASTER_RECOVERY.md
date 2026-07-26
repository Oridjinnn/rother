# Rother Disaster Recovery Plan

**Version:** 0.2.0  
**Audience:** Operations engineers  
**Scope:** Complete system (Next.js dashboard + Python scraper + data)

---

## Table of Contents

1. [Recovery Scenarios](#recovery-scenarios)
2. [Backup Validation](#backup-validation)
3. [Restore Validation](#restore-validation)
4. [Scenario Procedures](#scenario-procedures)
5. [Communication Plan](#communication-plan)
6. [Post-Mortem](#post-mortem)

---

## Recovery Scenarios

| Scenario | Severity | RTO (Recovery Time Objective) | RPO (Recovery Point Objective) |
|---|---|---|---|
| S-1: Dashboard crash (unrecoverable) | High | 30 min | 5 min (data loss = active run state only) |
| S-2: Data corruption (snapshots/deltas) | Critical | 2 hours | 24 hours (daily backup) |
| S-3: Database corruption (Prisma SQLite) | High | 1 hour | 24 hours (daily backup) |
| S-4: Filesystem / hardware failure | Critical | 4 hours | 24 hours (daily backup + separate backup location) |
| S-5: Google Maps DOM change (scraper broken) | High | 1-5 days | N/A (no data loss, scraping paused) |
| S-6: Configuration loss (listings/selectors) | High | 30 min | 24 hours (daily backup) |
| S-7: Accidental data deletion | Critical | 1 hour | Depends on detection time |

---

## Backup Validation

### Daily Validation Checklist

Before relying on any backup for recovery, validate:

```powershell
# 1. Backup file exists and is not corrupt
Test-Path "C:\backups\rother\*.zip"
# Expected: True

# 2. Backup is recent (within 24 hours)
Get-ChildItem "C:\backups\rother\*.zip" |
    Where-Object { $_.LastWriteTime -gt (Get-Date).AddDays(-1) }
# Expected: At least one file returned

# 3. Backup contains all required directories
$backup = "C:\backups\rother\latest.zip"
$contents = Expand-Archive -Path $backup -DestinationPath "$env:TEMP\rother-validate" -PassThru
$required = @("snapshots", "reviews_new", "config", "run_summary.json", "custom.db", ".env")
$missing = $required | Where-Object { -not (Test-Path "$env:TEMP\rother-validate\$_") }
$missing.Count
# Expected: 0
Remove-Item -Recurse "$env:TEMP\rother-validate" -Force

# 4. Backup integrity (CRC check)
# If using Compress-Archive, test by extracting a sample file
$testFile = "$env:TEMP\backup-test.txt"
try {
    Expand-Archive -Path $backup -DestinationPath "$env:TEMP\rother-validate2" -Force
    "Backup integrity: OK"
} catch {
    "Backup integrity: FAILED — $($_.Exception.Message)"
}
Remove-Item -Recurse "$env:TEMP\rother-validate2" -Force
```

### Automated Validation (Scheduled Task)

Run daily via Windows Task Scheduler:

```powershell
# validate-backup.ps1
$backupDir = "C:\backups\rother"
$latest = Get-ChildItem "$backupDir\*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $latest) {
    Write-EventLog -LogName Application -Source "Rother" -EntryType Error -EventId 1001 -Message "DR FAIL: No backup found"
    exit 1
}

if ($latest.LastWriteTime -lt (Get-Date).AddDays(-2)) {
    Write-EventLog -LogName Application -Source "Rother" -EntryType Warning -EventId 1002 -Message "DR WARN: Latest backup is older than 48 hours: $($latest.Name)"
}

Write-EventLog -LogName Application -Source "Rother" -EntryType Information -EventId 1000 -Message "DR OK: Latest backup: $($latest.Name), Size: $($latest.Length) bytes"
```

---

## Restore Validation

### Post-Restore Verification

After any restore operation, run this checklist:

```powershell
# 1. Dashboard serves pages
$homeResp = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing
if ($homeResp.StatusCode -eq 200) { "✓ Dashboard loads" } else { "✗ Dashboard failed: $($homeResp.StatusCode)" }

# 2. Overview API responds
$overviewResp = Invoke-WebRequest -Uri "http://localhost:3000/api/overview" -UseBasicParsing
$overview = $overviewResp.Content | ConvertFrom-Json
if ($overview.totalCompetitors -gt 0) { "✓ Overview API has data ($($overview.totalCompetitors) competitors)" } else { "✗ Overview API returned no competitors" }

# 3. Branches API works
$branchesResp = Invoke-WebRequest -Uri "http://localhost:3000/api/branches" -UseBasicParsing
if ($branchesResp.StatusCode -eq 200) { "✓ Branches API responds" } else { "✗ Branches API failed" }

# 4. Config is intact
$configResp = Invoke-WebRequest -Uri "http://localhost:3000/api/config/listings" -UseBasicParsing
$config = $configResp.Content | ConvertFrom-Json
if ($config.branches.Count -gt 0) { "✓ Config has $($config.branches.Count) branches" } else { "✗ Config is empty" }

# 5. Reviews are accessible
$reviewsResp = Invoke-WebRequest -Uri "http://localhost:3000/api/reviews?page=1&pageSize=5" -UseBasicParsing
$reviews = $reviewsResp.Content | ConvertFrom-Json
if ($reviews.total -ge 0) { "✓ Reviews API responds ($($reviews.total) total)" } else { "✗ Reviews API failed" }

# 6. Scraper config exists
if (Test-Path "gbp-monitor\config\listings.json") { "✓ Scraper listings config exists" } else { "✗ Scraper listings config missing" }
if (Test-Path "gbp-monitor\config\selectors.json") { "✓ Scraper selectors config exists" } else { "✗ Scraper selectors config missing" }

# Summary
Write-Host ""
Write-Host "Restore validation complete."
```

---

## Scenario Procedures

### S-1: Dashboard Crash (Unrecoverable)

**Symptoms:** Dashboard returns 5xx errors, white screen, or won't start.

**Recovery:**

```powershell
# 1. Check logs
pm2 logs rother-dashboard --lines 50

# 2. Restart the process
pm2 restart rother-dashboard

# 3. If restart fails, rebuild from source
cd C:\rother
git checkout main
npm install
npm run build
xcopy /E /I public .next\standalone\public
xcopy /E /I gbp-monitor .next\standalone\gbp-monitor
xcopy /E /I node_modules .next\standalone\node_modules
pm2 restart rother-dashboard

# 4. If still failing, rollback to previous version
git stash
git checkout <previous-stable-tag>
npm install && npm run build
pm2 restart rother-dashboard
```

**Data loss:** In-flight scrape runs are lost. Data on disk is preserved.

**Verification:** Run the [Restore Validation](#restore-validation) checklist.

---

### S-2: Data Corruption (Snapshots / Deltas)

**Symptoms:** Dashboard shows 0 reviews, charts are empty, overview shows no data.

**Recovery:**

```powershell
# 1. Stop the dashboard
pm2 stop rother-dashboard

# 2. Identify the latest valid backup
$backups = Get-ChildItem "C:\backups\rother\*.zip" | Sort-Object LastWriteTime -Descending
$latest = $backups[0]
Write-Host "Restoring from: $($latest.FullName)"

# 3. Extract backup
Expand-Archive -Path $latest.FullName -DestinationPath "C:\restore-temp" -Force

# 4. Replace corrupted data
Remove-Item -Recurse "gbp-monitor\data\snapshots" -ErrorAction SilentlyContinue
Remove-Item -Recurse "gbp-monitor\data\reviews_new" -ErrorAction SilentlyContinue
Copy-Item -Recurse "C:\restore-temp\snapshots" "gbp-monitor\data\snapshots"
Copy-Item -Recurse "C:\restore-temp\reviews_new" "gbp-monitor\data\reviews_new"
Copy-Item "C:\restore-temp\run_summary.json" "gbp-monitor\data\run_summary.json"

# 5. Clean up temp
Remove-Item -Recurse "C:\restore-temp" -Force

# 6. Restart
pm2 start rother-dashboard
```

**Data loss:** Up to 24 hours of recent scrapes (since last backup).

**Verification:** Run the [Restore Validation](#restore-validation) checklist.

---

### S-3: Database Corruption (Prisma SQLite)

**Symptoms:** Prisma errors in logs, dashboard features that use the database fail.

**Recovery:**

```powershell
# 1. Stop the dashboard
pm2 stop rother-dashboard

# 2. Restore from backup
$backup = Get-ChildItem "C:\backups\rother\*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Expand-Archive -Path $backup.FullName -DestinationPath "C:\restore-temp" -Force
Copy-Item "C:\restore-temp\custom.db" "db\custom.db" -Force
Remove-Item -Recurse "C:\restore-temp" -Force

# 3. Verify database integrity
npx prisma db push --accept-data-loss 2>&1

# 4. Restart
pm2 start rother-dashboard
```

**Data loss:** Up to 24 hours of database changes.

> **Note:** The Prisma SQLite database (`db/custom.db`) is currently minimal and not used by the core dashboard features (reviews, snapshots, config). Data loss here is less critical than snapshot data loss.

---

### S-4: Filesystem / Hardware Failure

**Symptoms:** Server unreachable, disk errors, OS not booting.

**Recovery:**

```powershell
# 1. Provision new server (bare metal / VM)
#    - Windows Server 2022+ or Ubuntu 22.04+
#    - Node.js 20.x LTS
#    - Python 3.11+
#    - Git

# 2. Clone repository
git clone https://github.com/your-org/rother.git
cd rother

# 3. Restore from off-site backup
#    (Copy backup from S3 / Azure Blob / network share)
Copy-Item "\\backup-server\rother\latest.zip" "C:\restore"

# 4. Extract and replace
Expand-Archive -Path "C:\restore\latest.zip" -DestinationPath "C:\restore-temp" -Force
Copy-Item "C:\restore-temp\.env" ".env"
Copy-Item -Recurse "C:\restore-temp\config" "gbp-monitor\config"
Copy-Item -Recurse "C:\restore-temp\snapshots" "gbp-monitor\data\snapshots"
Copy-Item -Recurse "C:\restore-temp\reviews_new" "gbp-monitor\data\reviews_new"
Copy-Item "C:\restore-temp\custom.db" "db\custom.db"

# 5. Install dependencies and build
npm install
npm run build

# 6. Start
pm2 start .next\standalone\server.js --name rother-dashboard
```

**Data loss:** Up to 24 hours. All in-memory run state is lost.

---

### S-5: Google Maps DOM Change (Scraper Broken)

**Symptoms:** Scraper runs but finds 0 reviews, or produces parse errors.

**Recovery:**

1. **Pause automatic scraping** — disable the GitHub Actions cron workflow
2. **Run the scraper in debug mode** to capture current DOM:
   ```powershell
   cd gbp-monitor
   python -m orchestration.run_all --fixtures --debug
   ```
3. **Compare captured HTML** against existing selectors in `config/selectors.json`
4. **Update selectors** to match new DOM structure
5. **Run verification** against golden dataset:
   ```powershell
   python -m tests.verify_baseline
   ```
6. **Re-enable scraping** after all tests pass

**Data loss:** No data loss. New reviews cannot be collected until selectors are updated.

**Prevention:** The golden dataset (`gbp-monitor/data/golden/`) stores known-good HTML snapshots. Run weekly diff checks against live pages.

---

### S-6: Configuration Loss (Listings / Selectors)

**Symptoms:** Dashboard shows no competitors, scraper fails with config errors.

**Recovery:**

```powershell
# 1. Restore from backup
$backup = Get-ChildItem "C:\backups\rother\*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Expand-Archive -Path $backup.FullName -DestinationPath "C:\restore-temp" -Force
Copy-Item "C:\restore-temp\config\*" "gbp-monitor\config\" -Force
Remove-Item -Recurse "C:\restore-temp" -Force

# 2. Verify config
Get-Content "gbp-monitor\config\listings.json" | ConvertFrom-Json
# Expected: Lists all competitors with branch_id, competitor_id, name, gmaps_url

# 3. Restart the dashboard
pm2 restart rother-dashboard
```

**Alternative (no backup):** Manually recreate from the dashboard config editor (`/?mode=dev` → Config tab).

---

### S-7: Accidental Data Deletion

**Symptoms:** Dashboard shows fewer reviews or competitors than expected.

**Recovery:**

```powershell
# 1. Determine what was deleted (compare with backup)
$backup = Get-ChildItem "C:\backups\rother\*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Expand-Archive -Path $backup.FullName -DestinationPath "C:\restore-temp" -Force

# 2. Compare snapshot counts
$currentCount = (Get-ChildItem "gbp-monitor\data\snapshots" -Directory).Count
$backupCount = (Get-ChildItem "C:\restore-temp\snapshots" -Directory).Count
Write-Host "Current snapshots: $currentCount, Backup snapshots: $backupCount"

# 3. Restore missing data
#    (Restore individual directories as needed)
Copy-Item -Recurse "C:\restore-temp\snapshots\comp-missing-01" "gbp-monitor\data\snapshots\"

# 4. Restart
pm2 restart rother-dashboard
```

---

## Communication Plan

### Incident Severity Levels

| Level | Definition | Notification |
|---|---|---|
| SEV-1 | System unavailable, data loss | Notify team within 15 min |
| SEV-2 | Partial outage, degraded performance | Notify team within 1 hour |
| SEV-3 | Minor issue, no user impact | Log in issue tracker |

### Notification Channels

1. **Primary:** Team chat (Slack / Teams)
2. **Secondary:** Email distribution list
3. **Escalation:** Phone call to on-call engineer

### Incident Template

```
SEVERITY: [SEV-1 | SEV-2 | SEV-3]
SCENARIO: [S-1 through S-7]
TIME DETECTED: [UTC timestamp]
IMPACT: [What is affected? Users? Data?]
CURRENT STATUS: [Investigating / Mitigating / Resolved]
NEXT UPDATE: [Time]
```

---

## Post-Mortem

After any recovery event, document:

1. **Timeline** — When was the issue detected? When was recovery completed?
2. **Root cause** — What caused the incident?
3. **Recovery steps** — What was done to recover?
4. **Data loss** — How much data was lost (if any)?
5. **Improvements** — How can this be prevented in the future?
6. **Action items** — Specific tasks with owners and deadlines.

---

## Appendices

### A: Backup Locations

| Location | Type | Retention |
|---|---|---|
| `C:\backups\rother\` | Local | 30 days |
| `\\backup-server\rother\` | Network | 90 days |
| (Future) S3 / Azure Blob | Off-site | 1 year |

### B: Critical File Paths

| Path | Purpose |
|---|---|
| `<project>\.env` | Environment configuration |
| `<project>\gbp-monitor\config\listings.json` | Competitor listings |
| `<project>\gbp-monitor\config\selectors.json` | CSS/XPath selectors |
| `<project>\gbp-monitor\data\snapshots\` | Review snapshots |
| `<project>\gbp-monitor\data\reviews_new\` | Review deltas |
| `<project>\gbp-monitor\data\run_summary.json` | Last run summary |
| `<project>\db\custom.db` | Prisma SQLite database |

### C: Emergency Contacts

| Role | Contact |
|---|---|
| Engineering lead | (Define for your organization) |
| Operations engineer | (Define for your organization) |
| Security contact | (Define for your organization) |
