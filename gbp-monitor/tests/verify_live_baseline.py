#!/usr/bin/env python3
"""Live baseline verification gate for the single-path scraper.

Given a known ``place_id`` (with >= 100 real reviews) and a logged-in
``storage_state`` session, runs the product scraper and asserts it yields
>= 100 deduplicated reviews. Exits non-zero with a precise reason otherwise —
this is the "fail the build/run if not met" gate.

Usage:
    export GBP_BASELINE_PLACE_ID="ChIJ..."
    export GBP_MONITOR_STORAGE_STATE="/path/to/storage_state.json"
    python -m tests.verify_live_baseline

Exit codes:
    0  -- baseline met (>= target deduplicated reviews, status OK)
    2  -- missing required env (place_id / session)
    3  -- insufficient reviews collected
    4  -- run blocked
    1  -- other failure
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
TARGET_REVIEWS = int(os.environ.get("GBP_BASELINE_TARGET", "100"))


def _fail(code: int, msg: str) -> int:
    print(msg)
    return code


def main() -> int:
    place_id = os.environ.get("GBP_BASELINE_PLACE_ID", "").strip()
    session = os.environ.get("GBP_MONITOR_STORAGE_STATE", "").strip()
    cookies = os.environ.get("GBP_MONITOR_COOKIES_FILE", "").strip()

    if not place_id:
        return _fail(2, "[GATE] GBP_BASELINE_PLACE_ID is not set — cannot run live baseline.")
    if not session and not cookies:
        return _fail(
            2,
            "[GATE] No logged-in session (GBP_MONITOR_STORAGE_STATE / "
            "GBP_MONITOR_COOKIES_FILE) — the scraper refuses to run anonymously.",
        )

    print(f"[GATE] Running live baseline for place_id={place_id} target={TARGET_REVIEWS}")
    args = [
        sys.executable,
        "-m",
        "orchestration.run_all",
        "--business",
        place_id,
        "--max-reviews",
        str(TARGET_REVIEWS),
    ]
    if session:
        args += ["--session", session]
    proc = subprocess.run(args, cwd=str(REPO_ROOT), capture_output=True, text=True)
    if proc.returncode not in (0, 3, 4):
        # 0=OK, 3=INSUFFICIENT, 4=BLOCKED are expected terminal states we
        # evaluate below; anything else is an unexpected crash.
        return _fail(
            1,
            f"[GATE] Scraper crashed (exit {proc.returncode}).\nSTDERR:\n{proc.stderr[-1500:]}",
        )

    summary_path = REPO_ROOT / "data" / "run_summary.json"
    if not summary_path.exists():
        return _fail(1, "[GATE] run_summary.json was not written.")
    summary = json.loads(summary_path.read_text(encoding="utf-8"))

    status = summary.get("status")
    review_count = summary.get("reviewCount", 0)
    reason = summary.get("stoppedReason", "")

    print(f"[GATE] status={status} reviewCount={review_count}/{TARGET_REVIEWS} reason={reason}")

    if status == "BLOCKED":
        return _fail(4, f"[GATE] Run blocked: {reason}")
    if status == "NEED_SESSION":
        return _fail(2, f"[GATE] Need session: {reason}")
    if status == "INVALID_PLACE_ID":
        return _fail(2, f"[GATE] Invalid place_id: {reason}")

    # Dedupe integrity: review_ids in the written snapshots must be unique.
    snap_root = REPO_ROOT / "data" / "snapshots"
    seen_ids: set[str] = set()
    total = 0
    for comp_dir in snap_root.iterdir() if snap_root.exists() else []:
        if not comp_dir.is_dir():
            continue
        latest = comp_dir / "latest.json"
        if not latest.exists():
            continue
        try:
            fname = json.loads(latest.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        reviews = json.loads((comp_dir / fname).read_text(encoding="utf-8"))
        for r in reviews:
            total += 1
            rid = r.get("review_id")
            if rid:
                if rid in seen_ids:
                    return _fail(3, f"[GATE] Duplicate review_id detected: {rid}")
                seen_ids.add(rid)

    if review_count < TARGET_REVIEWS:
        return _fail(
            3,
            f"[GATE] INSUFFICIENT: collected {review_count}/{TARGET_REVIEWS} reviews "
            f"(status={status}). {reason}",
        )

    print(
        f"[GATE] PASS — {review_count} deduplicated reviews collected "
        f"({total} unique ids across snapshots), status={status}."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
