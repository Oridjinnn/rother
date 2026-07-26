"""Health check for GBP Monitor deployments.

Outputs structured JSON to stdout for Docker HEALTHCHECK and monitoring
systems. Exits 0 if all checks pass, 1 if any check fails.

Usage:
    python -m orchestration.health           # human-readable JSON
    python -m orchestration.health --compact  # single-line JSON for Docker HEALTHCHECK
"""

from __future__ import annotations

import json
import os
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

PASS = "pass"
FAIL = "fail"
WARN = "warn"


def _get_version() -> str:
    """Read the most recent CHANGELOG entry as the version identifier."""
    changelog = Path("CHANGELOG.md")
    if not changelog.exists():
        return "unknown"
    try:
        for line in changelog.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("## 20"):
                return line.split("--")[0].replace("##", "").strip() or "unknown"
    except Exception:
        pass
    return "unknown"


def _check_config() -> dict:
    listings = Path("config/listings.json")
    selectors = Path("config/selectors.json")
    errors: list[str] = []

    if not listings.exists():
        errors.append(f"listings.json not found at {listings.resolve()}")
    else:
        try:
            import json as _json
            data = _json.loads(listings.read_text(encoding="utf-8"))
            if not data.get("branches"):
                errors.append("listings.json: 'branches' is empty or missing")
        except Exception as e:
            errors.append(f"listings.json: invalid JSON ({e})")

    if not selectors.exists():
        errors.append(f"selectors.json not found at {selectors.resolve()}")
    else:
        try:
            import json as _json
            _json.loads(selectors.read_text(encoding="utf-8"))
        except Exception as e:
            errors.append(f"selectors.json: invalid JSON ({e})")

    return {
        "status": FAIL if errors else PASS,
        "errors": errors,
        "listings_exists": listings.exists(),
        "selectors_exists": selectors.exists(),
    }


def _check_storage() -> dict:
    data_dir = Path("data")
    snapshot_dir = data_dir / "snapshots"
    reviews_new_dir = data_dir / "reviews_new"
    errors: list[str] = []

    for d in [data_dir, snapshot_dir, reviews_new_dir]:
        try:
            d.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            errors.append(f"Cannot create {d}: {e}")

    # Check writeability.
    probe = data_dir / ".health_probe"
    try:
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
    except Exception as e:
        errors.append(f"Data directory not writeable: {e}")

    return {
        "status": FAIL if errors else PASS,
        "errors": errors,
        "data_dir_exists": data_dir.exists(),
        "snapshot_dir_exists": snapshot_dir.exists(),
    }


def _check_disk() -> dict:
    data_dir = Path("data")
    try:
        data_dir.mkdir(parents=True, exist_ok=True)
        usage = shutil.disk_usage(data_dir.resolve())
        free_bytes = usage.free
        free_mb = free_bytes / (1024 * 1024)
        total_mb = usage.total / (1024 * 1024)
        threshold = int(os.environ.get("GBP_MONITOR_MIN_DISK_BYTES", "104857600"))
        status = PASS if free_bytes >= threshold else FAIL
        return {
            "status": status,
            "free_mb": round(free_mb, 1),
            "total_mb": round(total_mb, 1),
            "threshold_mb": threshold // (1024 * 1024),
            "errors": [] if status == PASS else [f"Low disk space: {free_mb:.0f} MB free"],
        }
    except Exception as e:
        return {"status": FAIL, "free_mb": 0, "total_mb": 0, "threshold_mb": 100, "errors": [str(e)]}


def _check_snapshots() -> dict:
    snapshot_dir = Path("data/snapshots")
    if not snapshot_dir.is_dir():
        return {"status": WARN, "count": 0, "errors": ["No snapshot directory yet (first run pending)"]}
    competitors = [d for d in snapshot_dir.iterdir() if d.is_dir()]
    accessible = 0
    errors: list[str] = []
    for comp_dir in competitors:
        latest = comp_dir / "latest.json"
        if latest.exists():
            try:
                import json as _json
                filename = _json.loads(latest.read_text(encoding="utf-8"))
                snap = comp_dir / filename
                if snap.exists():
                    accessible += 1
                else:
                    errors.append(f"{comp_dir.name}: latest.json points to missing file {filename}")
            except Exception as e:
                errors.append(f"{comp_dir.name}: latest.json unreadable ({e})")
        else:
            errors.append(f"{comp_dir.name}: no latest.json")
    return {
        "status": PASS if accessible == len(competitors) else (WARN if errors else PASS),
        "competitor_count": len(competitors),
        "snapshots_accessible": accessible,
        "errors": errors,
    }


def _check_playwright() -> dict:
    try:
        import subprocess
        version_result = subprocess.run(
            [sys.executable, "-m", "playwright", "--version"],
            capture_output=True, text=True, timeout=15,
        )
        if version_result.returncode != 0:
            return {"status": WARN, "chromium_installed": False, "errors": ["Playwright CLI not available"]}
        return {"status": PASS, "chromium_installed": True, "errors": []}
    except Exception as e:
        return {"status": WARN, "chromium_installed": False, "errors": [str(e)]}


def healthcheck(compact: bool = False) -> dict:
    version = _get_version()
    config = _check_config()
    storage = _check_storage()
    disk = _check_disk()
    snapshots = _check_snapshots()
    playwright = _check_playwright()

    all_checks = [config, storage, disk, snapshots, playwright]
    overall = PASS if all(c["status"] == PASS for c in all_checks) else FAIL

    report = {
        "status": overall,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": version,
        "checks": {
            "config": config,
            "storage": storage,
            "disk": disk,
            "snapshots": snapshots,
            "playwright": playwright,
        },
    }

    return report


def main() -> int:
    compact = "--compact" in sys.argv
    report = healthcheck(compact=compact)
    indent = None if compact else 2
    output = json.dumps(report, indent=indent)
    sys.stdout.write(output + "\n")
    return 0 if report["status"] == PASS else 1


if __name__ == "__main__":
    sys.exit(main())
