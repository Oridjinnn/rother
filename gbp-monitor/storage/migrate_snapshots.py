"""Migrate flat snapshot files to versioned directory layout.

Before:  data/snapshots/{competitor_id}.json
After:   data/snapshots/{competitor_id}/{YYYY-MM-DDTHH-MM-SSZ}.json
         data/snapshots/{competitor_id}/latest.json

The timestamp is derived from the reviews' most common `scraped_at` value.
If no reviews exist, the file's mtime is used.
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("migration")

SNAPSHOTS_DIR = Path("data/snapshots")
TIMESTAMP_FMT = "%Y-%m-%dT%H-%M-%SZ"


def _derive_timestamp(reviews: list[dict], mtime: float) -> str:
    """Pick the most common scraped_at, falling back to file mtime."""
    scraped_ats: dict[str, int] = {}
    for r in reviews:
        ts = r.get("scraped_at")
        if ts and isinstance(ts, str):
            scraped_ats[ts] = scraped_ats.get(ts, 0) + 1

    if scraped_ats:
        # Most common scraped_at
        best = max(scraped_ats, key=scraped_ats.get)  # type: ignore[arg-type]
        # Normalize to filename-safe format
        dt = datetime.fromisoformat(best)
        return dt.strftime(TIMESTAMP_FMT)

    # Fall back to file modification time
    dt = datetime.fromtimestamp(mtime, tz=timezone.utc)
    return dt.strftime(TIMESTAMP_FMT)


def migrate() -> int:
    migrated = 0
    skipped = 0
    errors = 0

    for f in sorted(SNAPSHOTS_DIR.iterdir()):
        if not f.is_file() or f.suffix != ".json":
            continue

        competitor_id = f.stem
        comp_dir = SNAPSHOTS_DIR / competitor_id

        # Skip if already versioned
        if comp_dir.is_dir():
            latest_pointer = comp_dir / "latest.json"
            if latest_pointer.exists():
                logger.info(
                    "SKIP  %s — already versioned (latest.json exists)",
                    competitor_id,
                )
                skipped += 1
                continue

        # Read the flat file
        try:
            reviews = json.loads(f.read_text(encoding="utf-8"))
            if not isinstance(reviews, list):
                logger.warning(
                    "SKIP  %s — snapshot is not a list (got %s)",
                    competitor_id,
                    type(reviews).__name__,
                )
                skipped += 1
                continue
        except (json.JSONDecodeError, OSError) as e:
            logger.error("FAIL  %s — could not read: %s", competitor_id, e)
            errors += 1
            continue

        # Derive timestamp
        mtime = f.stat().st_mtime
        ts = _derive_timestamp(reviews, mtime)

        # Create versioned directory + file
        comp_dir.mkdir(parents=True, exist_ok=True)
        versioned_path = comp_dir / f"{ts}.json"
        versioned_path.write_text(
            json.dumps(reviews, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

        # Write latest pointer
        latest_pointer = comp_dir / "latest.json"
        latest_pointer.write_text(
            json.dumps(versioned_path.name),
            encoding="utf-8",
        )

        # Remove old flat file
        f.unlink()

        logger.info(
            "MIGRATE %s → %s/ (%d reviews, ts=%s)",
            competitor_id,
            competitor_id,
            len(reviews),
            ts,
        )
        migrated += 1

    logger.info("")
    logger.info("Migration complete: %d migrated, %d skipped, %d errors", migrated, skipped, errors)
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    sys.exit(migrate())
