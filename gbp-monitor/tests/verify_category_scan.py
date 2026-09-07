#!/usr/bin/env python3
"""Category-scan parser verification (calibration harness).

Validates that :func:`discovery.category_scan.parse_category_results` extracts
candidate competitors from the representative fixture HTML using ``parsel``
(not brittle forward-window regex). The fixture mimics a Google Maps
category-search results page with at least 3 result cards.

Usage:
    python -m tests.verify_category_scan

Exit codes:
    0 -- parser returned >= 1 candidate (ideally >= 3)
    1 -- parser returned zero candidates
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
FIXTURE = REPO_ROOT / "tests" / "fixtures" / "category_scan.html"
# Imported lazily so a missing parsel still reports a clear failure.
sys.path.insert(0, str(REPO_ROOT))


def main() -> int:
    if not FIXTURE.exists():
        print(f"  [FAIL] fixture not found: {FIXTURE}")
        return 1

    html = FIXTURE.read_text(encoding="utf-8")
    from discovery.category_scan import parse_category_results

    candidates = parse_category_results(html)

    if not candidates:
        print("  [FAIL] parser returned 0 candidates (expected >= 1)")
        return 1

    # Surface what was extracted for calibration visibility.
    for c in candidates:
        print(
            f"  [INFO] {c['name']!r} place_id={c['place_id']} "
            f"rating={c['rating']} reviews={c['reviews_count']}"
        )

    if len(candidates) < 3:
        print(
            f"  [WARN] only {len(candidates)} candidate(s) extracted "
            f"(ideal >= 3)"
        )
    print(f"  [PASS] extracted {len(candidates)} candidate(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
