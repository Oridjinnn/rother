"""Pure-function delta computation between two review lists.

Per GBP_MONITOR_PLAN.md Section 5.6. Given the old snapshot (loaded by
`storage/snapshot_store.load_snapshot`) and the new parse (from
`parser/review_parser.parse_reviews`), return only the items whose
`review_id` is not already in the old set.

This is the heart of the "delta detection" architecture — we do NOT
re-store all reviews every run, only the new ones (written to
`data/reviews_new/{competitor_id}_{run_ts}.json`). The snapshot itself IS
overwritten with the full current list (so we always have a complete
recent baseline to diff against).
"""

from __future__ import annotations

import logging
from typing import Iterable

logger = logging.getLogger("gbp-monitor.delta")


def compute_new_reviews(old: Iterable[dict], new: Iterable[dict]) -> list[dict]:
    """Return reviews in `new` whose `review_id` is not in `old`.

    Pure function: no I/O, no side effects. Accepts any iterables of dicts
    (lists, generators) and returns a list — typing as Iterable on the way
    in keeps the signature flexible while the list return type matches the
    downstream JSON serialization needs.

    Items in `new` missing a `review_id` are excluded — the parser already
    skips those, but defensive filtering here means a future caller cannot
    accidentally introduce unkeyed items into the delta.

    Items in `old` missing a `review_id` (corrupted old snapshot) are
    silently ignored for set-membership purposes — they cannot match any
    well-formed new review, so they have no effect on the delta.
    """
    # Materialize `new` once — it may be a generator, and we need both the
    # delta list and the total count. Iterating it twice would silently
    # produce an empty count on the second pass for generators.
    new_list = list(new)
    old_ids = {r.get("review_id") for r in old if r.get("review_id")}
    delta = [
        r for r in new_list
        if r.get("review_id") and r["review_id"] not in old_ids
    ]
    logger.info(
        "compute_new_reviews: %d new (old=%d, new=%d)",
        len(delta),
        len(old_ids),
        len(new_list),
    )
    return delta
