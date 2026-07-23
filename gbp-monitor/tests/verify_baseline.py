#!/usr/bin/env python3
"""Lightweight baseline verification script.

Runs the scraper in --fixtures mode and validates that all expected output
artifacts are produced with correct content.

Usage:
    python -m tests.verify_baseline

Exit codes:
    0 -- all checks passed
    1 -- one or more checks failed
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"
SNAPSHOTS_DIR = DATA_DIR / "snapshots"
REVIEWS_NEW_DIR = DATA_DIR / "reviews_new"
SUMMARY_PATH = DATA_DIR / "run_summary.json"
LOG_PATH = DATA_DIR / "run.log"

EXPECTED_SNAPSHOTS = {"comp-canggu-01", "comp-seminyak-01", "comp-ubud-01"}
EXPECTED_TOTAL_REVIEWS = 20

PASS = 0
FAIL = 0


def check(name: str, condition: bool, detail: str = "") -> None:
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  [PASS] {name}")
    else:
        FAIL += 1
        msg = f"  [FAIL] {name}"
        if detail:
            msg += f" -- {detail}"
        print(msg)


def check_dependencies() -> bool:
    """Verify that required Python packages are installed."""
    missing = []
    for mod in ["playwright", "parsel", "requests"]:
        try:
            __import__(mod)
        except ImportError:
            missing.append(mod)
    if missing:
        print(f"  [FAIL] Missing dependencies: {', '.join(missing)}")
        print(f"         Run: pip install -r {REPO_ROOT / 'requirements.txt'}")
        return False
    return True


def clean_data() -> None:
    """Remove data artifacts from a previous run."""
    for d in [SNAPSHOTS_DIR, REVIEWS_NEW_DIR]:
        if d.exists():
            for f in d.iterdir():
                f.unlink()
    for f in [SUMMARY_PATH, LOG_PATH]:
        if f.exists():
            f.unlink()


def run_scraper() -> subprocess.CompletedProcess:
    """Execute the scraper in --fixtures mode."""
    return subprocess.run(
        [sys.executable, "-m", "orchestration.run_all", "--fixtures"],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
    )


def verify_artifacts() -> None:
    """Validate all expected output files."""
    check("run_summary.json exists", SUMMARY_PATH.exists())
    if SUMMARY_PATH.exists():
        summary = json.loads(SUMMARY_PATH.read_text())
        check("run_summary is a dict", isinstance(summary, dict))
        check("mode is fixtures", summary.get("mode") == "fixtures")
        check(
            "success count is 3",
            summary.get("success") == 3,
            f"got {summary.get('success')}",
        )
        check(
            "failed count is 0",
            summary.get("failed") == 0,
            f"got {summary.get('failed')}",
        )
        check(
            "skipped count is 9",
            summary.get("skipped") == 9,
            f"got {summary.get('skipped')}",
        )
        check(
            "total_reviews is 20",
            summary.get("total_reviews") == 20,
            f"got {summary.get('total_reviews')}",
        )

    snapshot_ids = {p.stem for p in SNAPSHOTS_DIR.glob("*.json") if p.stem in EXPECTED_SNAPSHOTS}
    missing = EXPECTED_SNAPSHOTS - snapshot_ids
    check(
        "all expected snapshots exist",
        not missing,
        f"missing: {missing}",
    )

    total_reviews = 0
    for comp_id in EXPECTED_SNAPSHOTS:
        path = SNAPSHOTS_DIR / f"{comp_id}.json"
        if path.exists():
            reviews = json.loads(path.read_text())
            total_reviews += len(reviews)
            check(
                f"{comp_id} snapshot is a list",
                isinstance(reviews, list),
            )
            for r in reviews:
                check(
                    f"{comp_id}: review has review_id",
                    bool(r.get("review_id")),
                )
                rating = r.get("rating")
                if rating is not None:
                    check(
                        f"{comp_id}: rating in 1..5",
                        1.0 <= rating <= 5.0,
                        f"invalid rating {rating}",
                    )

    check(
        "total review count matches expected",
        total_reviews == EXPECTED_TOTAL_REVIEWS,
        f"got {total_reviews}, expected {EXPECTED_TOTAL_REVIEWS}",
    )

    delta_files = list(REVIEWS_NEW_DIR.glob("*.json"))
    check("at least one delta file exists", len(delta_files) > 0)
    for df in delta_files:
        reviews = json.loads(df.read_text())
        check(
            f"delta {df.name} has valid content",
            isinstance(reviews, list) and len(reviews) > 0,
        )

    check("run.log exists", LOG_PATH.exists())
    if LOG_PATH.exists():
        log_content = LOG_PATH.read_text()
        check("run.log has content", len(log_content) > 0)
        check("run.log has INFO lines", "INFO" in log_content)
        check("run.log has Run summary", "Run summary:" in log_content)


def main() -> int:
    print("=" * 60)
    print("GBP Monitor -- Baseline Verification")
    print("=" * 60)

    print("\n[Phase 0] Checking dependencies...")
    if not check_dependencies():
        return 1

    print("\n[Phase 1] Cleaning prior data...")
    clean_data()

    print("\n[Phase 2] Running scraper (--fixtures)...")
    result = run_scraper()
    check("scraper exit code is 0", result.returncode == 0, f"exit code {result.returncode}")
    last_lines = result.stderr.strip().splitlines()[-3:]
    for line in last_lines:
        print(f"         {line}")

    print("\n[Phase 3] Verifying artifacts...")
    verify_artifacts()

    print("\n" + "=" * 60)
    print(f"Results: {PASS} passed, {FAIL} failed")
    print("=" * 60)

    return 1 if FAIL > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
