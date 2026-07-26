#!/usr/bin/env python3
"""Restore GBP Monitor data from a backup archive.

Usage:
    cd gbp-monitor/
    python scripts/restore.py data/backups/gbp-monitor-backup-20260725T120000Z.zip
    python scripts/restore.py data/backups/gbp-monitor-backup-20260725T120000Z.zip --dry-run
"""

from __future__ import annotations

import argparse
import json
import sys
import zipfile
from pathlib import Path


def _run_restore(archive_path: Path, dry_run: bool) -> int:
    if not archive_path.exists():
        print(f"ERROR: archive not found: {archive_path}")
        return 1

    if not zipfile.is_zipfile(archive_path):
        print(f"ERROR: not a valid zip file: {archive_path}")
        return 1

    try:
        with zipfile.ZipFile(archive_path, "r") as zf:
            entries = [e for e in zf.infolist() if not e.is_dir()]
            total_size = sum(e.file_size for e in entries)
            total_mb = total_size / (1024 * 1024)
            print(f"Archive: {archive_path.name} ({len(entries)} entries, {total_mb:.1f} MB)")

            if dry_run:
                print("Dry-run — files that would be restored:")
                for e in entries:
                    print(f"  {e.filename} ({e.file_size} bytes)")
                return 0

            # Restore files, preserving directory structure.
            restored = 0
            skipped = 0
            for entry in entries:
                target = Path(entry.filename)
                if target.exists():
                    # Warn but overwrite.
                    print(f"  OVERWRITE: {entry.filename}")
                target.parent.mkdir(parents=True, exist_ok=True)
                zf.extract(entry, path=".")
                restored += 1

            print(f"\nRestored {restored} file(s) to current directory.")
            if skipped:
                print(f"Skipped {skipped} file(s).")
            return 0
    except Exception as e:
        print(f"ERROR: restore failed: {e}")
        return 1


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python scripts/restore.py",
        description="Restore GBP Monitor data from a backup archive.",
    )
    parser.add_argument(
        "archive",
        type=str,
        help="Path to the backup zip archive",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List files in the archive without restoring",
    )
    return parser.parse_args(argv)


if __name__ == "__main__":
    args = _parse_args()
    sys.exit(_run_restore(Path(args.archive), dry_run=args.dry_run))
