#!/usr/bin/env python3
"""Backup GBP Monitor data to a timestamped archive.

Usage:
    cd gbp-monitor/
    python scripts/backup.py                          # backup data/ to data/backups/
    python scripts/backup.py --dest /mnt/backups       # backup to custom path
    python scripts/backup.py --no-config               # skip config files
    python scripts/backup.py --dry-run                 # show what would be backed up

Output:
    Creates {dest}/gbp-monitor-backup-{YYYYMMDDTHHMMSSZ}.zip
"""

from __future__ import annotations

import argparse
import json
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path


def _find_files(base: Path, patterns: list[str]) -> list[Path]:
    files: list[Path] = []
    for pattern in patterns:
        files.extend(sorted(base.glob(pattern)))
    return files


def _run_backup(
    source_dir: Path,
    dest_dir: Path,
    include_config: bool,
    dry_run: bool,
) -> int:
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dest_dir.mkdir(parents=True, exist_ok=True)
    archive_name = f"gbp-monitor-backup-{ts}.zip"
    archive_path = dest_dir / archive_name

    source_dir = source_dir.resolve()
    if not source_dir.is_dir():
        print(f"ERROR: source directory not found: {source_dir}")
        return 1

    # Collect files to back up.
    data_files = _find_files(source_dir, [
        "snapshots/**/*.json",
        "reviews_new/**/*.json",
        "selector_history.json",
        "run.log",
        "run.log.*",
    ])
    config_files = [f.resolve() for f in _find_files(Path("config"), ["*.json"])] if include_config else []
    project_root = source_dir.parent

    all_files = data_files + config_files
    total_size = sum(f.stat().st_size for f in all_files if f.exists())
    total_mb = total_size / (1024 * 1024)

    print(f"Backup: {len(all_files)} file(s), {total_mb:.1f} MB")
    print(f"Source: {source_dir}")
    print(f"Destination: {archive_path}")

    if dry_run:
        for f in all_files:
            rel = f.relative_to(project_root) if include_config else f.relative_to(source_dir)
            print(f"  Would add: {rel} ({f.stat().st_size} bytes)")
        print("Dry-run complete — no files written.")
        return 0

    try:
        with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in all_files:
                if not f.exists():
                    continue
                rel = f.relative_to(project_root) if include_config else f.relative_to(source_dir)
                zf.write(f, str(rel))
        print(f"Created: {archive_path} ({archive_path.stat().st_size / 1024:.0f} KB)")
        return 0
    except Exception as e:
        print(f"ERROR: backup failed: {e}")
        return 1


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python scripts/backup.py",
        description="Backup GBP Monitor data to a timestamped zip archive.",
    )
    parser.add_argument(
        "--dest",
        default="data/backups",
        help="Destination directory for backup archives (default: data/backups/)",
    )
    parser.add_argument(
        "--source",
        default="data",
        help="Source data directory (default: data/)",
    )
    parser.add_argument(
        "--no-config",
        action="store_true",
        help="Exclude config files from the backup",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be backed up without writing anything",
    )
    return parser.parse_args(argv)


if __name__ == "__main__":
    args = _parse_args()
    sys.exit(
        _run_backup(
            source_dir=Path(args.source),
            dest_dir=Path(args.dest),
            include_config=not args.no_config,
            dry_run=args.dry_run,
        )
    )
