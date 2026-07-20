"""JSON-file snapshot storage — one file per competitor.

Per GBP_MONITOR_PLAN.md Section 5.6. Each competitor gets a JSON file at
`data/snapshots/{competitor_id}.json` containing the full list of reviews
seen in the most recent successful run. This is the input to
`storage/delta.compute_new_reviews` on the NEXT run — the diff between
"what we saw last time" and "what we saw this time" is the delta.

Paths are intentionally RELATIVE to the project root (the working
directory when `orchestration/run_all.py` is invoked as
`python -m orchestration.run_all`). The orchestration layer never `chdir`s,
so as long as the project is invoked from `/home/z/my-project/gbp-monitor/`
these paths resolve correctly. (If a future caller wants to run from
elsewhere, they must set the working directory first.)
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

logger = logging.getLogger("gbp-monitor.storage")

# Module-level path roots so they can be overridden by tests if needed.
_SNAPSHOT_DIR = Path("data/snapshots")


def _snapshot_path(competitor_id: str) -> Path:
    """Return the snapshot file path for `competitor_id`.

    Centralized so the filename pattern (`{competitor_id}.json`) is defined
    in exactly one place — if the pattern ever changes, only this function
    needs updating.
    """
    return _SNAPSHOT_DIR / f"{competitor_id}.json"


def load_snapshot(competitor_id: str) -> list[dict]:
    """Load the previously-saved reviews for `competitor_id`.

    Returns an empty list if no snapshot exists yet (first run for this
    competitor). Returns an empty list (with a warning) if the file exists
    but is not valid JSON — a corrupted snapshot should NOT crash the run
    per Rule 7; treating it as "no prior data" means all currently-parsed
    reviews will be flagged as new, which is the safe direction to err.
    """
    path = _snapshot_path(competitor_id)
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(
            "load_snapshot[%s]: could not read %s (%s) — treating as empty",
            competitor_id,
            path,
            e,
        )
        return []
    if not isinstance(data, list):
        logger.warning(
            "load_snapshot[%s]: snapshot is not a list (got %s) — treating as empty",
            competitor_id,
            type(data).__name__,
        )
        return []
    return data


def save_snapshot(competitor_id: str, reviews: list[dict]) -> None:
    """Persist `reviews` as the latest snapshot for `competitor_id`.

    Overwrites any existing snapshot atomically-ish: we write to a sibling
    `.tmp` file first then rename, so a crash mid-write does not leave a
    half-written file in place (which would otherwise be loaded as empty
    by `load_snapshot` on the next run — losing the prior baseline).
    """
    path = _snapshot_path(competitor_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(
        json.dumps(reviews, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    tmp.replace(path)
    logger.info(
        "save_snapshot[%s]: wrote %d review(s) to %s",
        competitor_id,
        len(reviews),
        path,
    )
