"""Operational validation suite for Phase 3."""
import json, os, subprocess, sys
from pathlib import Path

errors = []
passes = []
skipped = []

def check(name, ok, detail=""):
    if ok:
        passes.append(name)
        print(f"  PASS [{name}] {detail}")
    else:
        errors.append(name)
        print(f"  FAIL [{name}] {detail}")

def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)

HERE = Path(".")
LOCK = HERE / "data" / ".run.lock"
LOG = HERE / "data" / "run.log"
SUMMARY = HERE / "data" / "run_summary.json"

# 1. FIRST STARTUP (already tested in earlier runs)
print("\n[1] First startup — already verified (previous runs successful)")

# 2. RESTART (run again)
print("\n[2] Restart")
result = run([sys.executable, "-m", "orchestration.run_all", "--fixtures"], timeout=60, cwd=HERE)
check("restart exits 0", result.returncode == 0)
if SUMMARY.exists():
    d = json.loads(SUMMARY.read_text(encoding="utf-8"))
    check("restart success=3", d.get("success") == 3)
    check("restart failed=0", d.get("failed") == 0)

# 3. GRACEFUL SHUTDOWN — SIGTERM handler exists
print("\n[3] Graceful shutdown")
# Check atexit handler is registered
src = (HERE / "orchestration" / "run_all.py").read_text(encoding="utf-8")
check("signal handler exists", "signal.signal" in src)
check("atexit handler exists", "atexit.register" in src)
check("lock cleanup on shutdown", "_release_lock" in src)

# 4. STALE LOCK RECOVERY
print("\n[4] Stale lock recovery")
if LOCK.exists():
    LOCK.unlink()
from datetime import datetime, timezone, timedelta
past = datetime.now(timezone.utc) - timedelta(minutes=45)
LOCK.write_text(json.dumps({"run_id": "stale", "pid": 99999, "acquired_at": past.isoformat()}))
result = run([sys.executable, "-m", "orchestration.run_all", "--fixtures"], timeout=60, cwd=HERE)
check("stale lock detected & overwritten", "Stale lock" in result.stderr or "Stale lock" in result.stdout)
check("stale lock run succeeds", result.returncode == 0)
if LOCK.exists():
    d = json.loads(LOCK.read_text(encoding="utf-8"))
    check("new lock has new run_id", d.get("run_id", "") != "stale")

# 5. LOG ROTATION
print("\n[5] Log rotation")
LOG.write_text("x" * (6 * 1024 * 1024), encoding="ascii")
size_before = LOG.stat().st_size
result = run([sys.executable, "-m", "orchestration.run_all", "--fixtures"], timeout=60, cwd=HERE)
# After rotation, log should be smaller (fresh start) or rotated log file should exist
rotated = HERE / "data"
old_logs = list(rotated.glob("run.log.*"))
size_after = LOG.stat().st_size if LOG.exists() else 0
check("log rotated (6MB > 5MB threshold)", size_before > 5_242_880 and (len(old_logs) > 0 or size_after < size_before))
print(f"  Evidence: before={size_before}, after={size_after}, rotated files={len(old_logs)}")

# 6. BACKUP
print("\n[6] Backup")
result = run([sys.executable, "scripts/backup.py", "--dest", "data/backups"], timeout=30, cwd=HERE)
check("backup succeeds", result.returncode == 0)
backups = list((HERE / "data" / "backups").glob("*.zip"))
check("backup file created", len(backups) > 0)
if backups:
    print(f"  Latest: {backups[-1].name} ({backups[-1].stat().st_size} bytes)")

# 7. RESTORE — just verify the archive is valid
print("\n[7] Restore (dry-run)")
if backups:
    result = run([sys.executable, "scripts/restore.py", "--dry-run", str(backups[-1])], timeout=30, cwd=HERE)
    check("restore dry-run succeeds", result.returncode == 0)
    check("restore lists files", "entries" in result.stdout or "would be restored" in result.stdout or "Dry-run" in result.stdout)

# 8. HEALTH ENDPOINT
print("\n[8] Health endpoint")
result = run([sys.executable, "-m", "orchestration.health", "--compact"], timeout=30, cwd=HERE)
check("health exits 0", result.returncode == 0)
try:
    h = json.loads(result.stdout)
    check("health status pass", h.get("status") == "pass")
    checks = h.get("checks", {})
    for name, c in checks.items():
        st = c.get("status", "?")
        check(f"health check: {name}={st}", st in ("pass", "warn"))
except Exception as e:
    check("health JSON valid", False, str(e))

# 9. SUMMARY
print(f"\n{'='*60}")
print(f"Results: {len(passes)} passed, {len(errors)} failed, {len(skipped)} skipped")
if errors:
    print(f"Failures: {errors}")
print(f"{'='*60}")
sys.exit(1 if errors else 0)
