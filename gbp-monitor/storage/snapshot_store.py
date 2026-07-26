"""JSON-file snapshot storage — versioned per-competitor directories.

Per GBP_MONITOR_PLAN.md Section 5.6. Each competitor gets a directory at
`data/snapshots/{competitor_id}/` containing:

  {YYYY-MM-DDTHH-MM-SSZ}.json   — immutable timestamped snapshot file
  latest.json                   — pointer file containing the latest filename

The pointer file avoids scanning the directory for the latest entry on every
read. It is updated atomically (`.tmp` + rename) alongside each snapshot write.

Paths are intentionally RELATIVE to the project root.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger("gbp-monitor.storage")

_SNAPSHOT_DIR = Path("data/snapshots")
_TIMESTAMP_FMT = "%Y-%m-%dT%H-%M-%SZ"       # colon-free for Windows paths
_LATEST_FILENAME = "latest.json"


def _competitor_dir(competitor_id: str) -> Path:
    return _SNAPSHOT_DIR / competitor_id


def _timestamped_path(competitor_id: str, ts: str) -> Path:
    return _competitor_dir(competitor_id) / f"{ts}.json"


def _latest_pointer_path(competitor_id: str) -> Path:
    return _competitor_dir(competitor_id) / _LATEST_FILENAME


def _now_timestamp() -> str:
    """Return the current UTC time as a filename-safe ISO string."""
    return datetime.now(timezone.utc).strftime(_TIMESTAMP_FMT)


def _ts_from_filename(filename: str) -> str | None:
    """Convert `YYYY-MM-DDTHH-MM-SSZ.json` → `YYYY-MM-DDTHH:MM:SSZ` for display."""
    m = re.match(
        r"(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})Z\.json$",
        filename,
    )
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}T{m.group(4)}:{m.group(5)}:{m.group(6)}Z"
    return None


def _read_latest_pointer(competitor_id: str) -> str | None:
    """Read the latest snapshot filename from the pointer file."""
    path = _latest_pointer_path(competitor_id)
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None


def _write_latest_pointer(competitor_id: str, filename: str) -> None:
    """Atomically write the pointer file."""
    path = _latest_pointer_path(competitor_id)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(filename), encoding="utf-8")
    tmp.replace(path)


def _load_json_array(path: Path) -> list[dict]:
    """Read and parse a JSON array file, returning [] on failure."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return data
        logger.warning("expected list at %s, got %s", path, type(data).__name__)
    except (FileNotFoundError, json.JSONDecodeError, OSError) as e:
        logger.warning("could not read %s (%s)", path, e)
    return []


def load_snapshot(competitor_id: str) -> list[dict]:
    """Load the latest snapshot for `competitor_id`.

    Returns [] if no snapshot exists yet (first run for this competitor)
    or if the data is corrupt.
    """
    # 1. Try versioned layout (new style).
    latest_filename = _read_latest_pointer(competitor_id)
    if latest_filename:
        path = _timestamped_path(competitor_id, latest_filename.replace(".json", ""))
        return _load_json_array(path)

    # 2. Fallback: old flat file (pre-migration).
    legacy = _SNAPSHOT_DIR / f"{competitor_id}.json"
    if legacy.exists():
        return _load_json_array(legacy)

    return []


def save_snapshot(competitor_id: str, reviews: list[dict]) -> None:
    """Persist `reviews` as a new immutable snapshot for `competitor_id`.

    Each call creates a new timestamped file alongside all previous snapshots.
    The `latest.json` pointer is updated atomically to point at the new file.
    """
    ts = _now_timestamp()
    comp_dir = _competitor_dir(competitor_id)
    comp_dir.mkdir(parents=True, exist_ok=True)

    snapshot_path = _timestamped_path(competitor_id, ts)
    tmp = snapshot_path.with_suffix(".tmp")
    tmp.write_text(
        json.dumps(reviews, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    tmp.replace(snapshot_path)

    _write_latest_pointer(competitor_id, snapshot_path.name)

    logger.info(
        "save_snapshot[%s]: wrote %d review(s) to %s",
        competitor_id,
        len(reviews),
        snapshot_path,
    )


def list_snapshots(competitor_id: str) -> list[dict]:
    """Return metadata for all available snapshots, newest first."""
    comp_dir = _competitor_dir(competitor_id)
    if not comp_dir.is_dir():
        return []

    entries: list[dict] = []
    for f in sorted(comp_dir.iterdir(), reverse=True):
        if f.suffix != ".json" or f.name == _LATEST_FILENAME:
            continue
        ts = _ts_from_filename(f.name)
        if ts is None:
            continue
        reviews = _load_json_array(f)
        entries.append({
            "timestamp": ts,
            "filename": f.name,
            "review_count": len(reviews),
        })

    # Also check for legacy flat file.
    legacy = _SNAPSHOT_DIR / f"{competitor_id}.json"
    if legacy.exists():
        reviews = _load_json_array(legacy)
        entries.append({
            "timestamp": "unknown (legacy)",
            "filename": legacy.name,
            "review_count": len(reviews),
        })

    return entries


def load_snapshot_at(competitor_id: str, timestamp: str) -> list[dict]:
    """Load a specific historical snapshot identified by its ISO timestamp.

    The `timestamp` parameter can be:
      - A full ISO string with colons:  `2026-07-23T09:53:45Z`
      - A filename-safe string:         `2026-07-23T09-53-45Z`
      - The special value `"latest"`    (delegates to load_snapshot)

    Returns [] if the snapshot does not exist or cannot be read.
    """
    if timestamp == "latest":
        return load_snapshot(competitor_id)

    # Normalize: replace colons with hyphens for filename matching.
    safe = timestamp.replace(":", "-")
    path = _timestamped_path(competitor_id, safe)
    if path.exists():
        return _load_json_array(path)

    # Try with .json stripped (in case the caller passed a bare filename).
    path2 = _competitor_dir(competitor_id) / f"{safe}.json"
    if path2.exists():
        return _load_json_array(path2)

    return []
