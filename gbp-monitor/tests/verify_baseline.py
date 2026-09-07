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
CONFIG_LISTINGS_PATH = REPO_ROOT / "config" / "listings.json"
# E3 / RISK-025: regression baselines live in the project-root golden-datasets dir.
GOLDEN_DIR = REPO_ROOT.parent / "golden-datasets"

EXPECTED_SNAPSHOTS = {"comp-canggu-01", "comp-seminyak-01", "comp-ubud-01"}
EXPECTED_TOTAL_REVIEWS = 20  # ubud=7 (8 items - 1 skip), seminyak=7, canggu=6

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
    lock_file = DATA_DIR / ".run.lock"
    if lock_file.exists():
        lock_file.unlink()
    if SNAPSHOTS_DIR.exists():
        for entry in SNAPSHOTS_DIR.iterdir():
            if entry.is_dir():
                for f in entry.iterdir():
                    f.unlink()
                entry.rmdir()
            else:
                entry.unlink()
    if REVIEWS_NEW_DIR.exists():
        for f in REVIEWS_NEW_DIR.iterdir():
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
        summary = json.loads(SUMMARY_PATH.read_text(encoding="utf-8"))
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

    # Versioned snapshot layout: each competitor is a subdirectory with latest.json pointer.
    snapshot_dirs = {p.name for p in SNAPSHOTS_DIR.iterdir() if p.is_dir() and p.name in EXPECTED_SNAPSHOTS}
    missing = EXPECTED_SNAPSHOTS - snapshot_dirs
    check(
        "all expected snapshot directories exist",
        not missing,
        f"missing: {missing}",
    )

    total_reviews = 0
    for comp_id in EXPECTED_SNAPSHOTS:
        comp_dir = SNAPSHOTS_DIR / comp_id
        latest_pointer = comp_dir / "latest.json"
        check(
            f"{comp_id}: latest.json exists",
            latest_pointer.exists(),
        )
        if not latest_pointer.exists():
            continue

        try:
            latest_filename = json.loads(latest_pointer.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            check(f"{comp_id}: could not read latest.json", False)
            continue

        snapshot_path = comp_dir / latest_filename
        check(
            f"{comp_id}: snapshot file {latest_filename} exists",
            snapshot_path.exists(),
        )
        if not snapshot_path.exists():
            continue

        reviews = json.loads(snapshot_path.read_text(encoding="utf-8"))
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
        reviews = json.loads(df.read_text(encoding="utf-8"))
        check(
            f"delta {df.name} has valid content",
            isinstance(reviews, list) and len(reviews) > 0,
        )

    check("run.log exists", LOG_PATH.exists())
    if LOG_PATH.exists():
        log_content = LOG_PATH.read_text(encoding="utf-8")
        check("run.log has content", len(log_content) > 0)
        check("run.log has INFO lines", "INFO" in log_content)
        check("run.log has Run summary",
              "run_summary" in log_content or "Run summary:" in log_content)


# ── M13B Security regression tests ──────────────────────────────────


def _verify_security() -> None:
    """Run security-specific regression tests.

    Tests the hardening measures implemented in M13B:
    - competitor_id sanitization rejects path traversal attempts
    - config validation detects duplicates and invalid place_ids
    - --validate-config CLI flag works
    """
    print("\n[Phase 4] Security regression tests...")

    # 4a  Import security functions from orchestration (only available after
    #     the scraper run, which guarantees the module is importable).
    try:
        from orchestration.run_all import (
            _sanitize_competitor_id,
            _validate_listings_config,
            _VALID_COMPETITOR_ID_RE,
        )
    except ImportError as e:
        check("security import", False, str(e))
        return

    # 4b  Valid competitor_ids must pass.
    valid_ids = ["comp-canggu-01", "foo", "a", "comp_123", "COMP-SEMINYAK-01"]
    for vid in valid_ids:
        try:
            _sanitize_competitor_id(vid)
            check(f"sec: valid ID {vid!r} accepted", True)
        except ValueError as ve:
            check(f"sec: valid ID {vid!r} accepted", False, str(ve))

    # 4c  Invalid competitor_ids must be rejected.
    invalid_ids = [
        ("../etc/passwd", "path traversal via .."),
        ("foo/bar", "path separator /"),
        ("foo\\bar", "path separator \\"),
        ("a\x00b", "null byte"),
        ("-" * 65, "exceeds max length (65 > 64)"),
        ("", "empty string"),
        ("comp with spaces", "contains space"),
        (".hidden", "starts with dot"),
    ]
    for bad_id, reason in invalid_ids:
        try:
            _sanitize_competitor_id(bad_id)
            check(f"sec: reject {reason} ({bad_id!r})", False, "should have raised ValueError")
        except ValueError:
            check(f"sec: reject {reason}", True)

    # 4d  Config validation rejects duplicate competitor_ids.
    duplicate_config = {
        "branches": [
            {
                "branch_id": "cph-a",
                "branch_name": "Branch A",
                "competitors": [
                    {"competitor_id": "comp-dup", "name": "First", "place_id": None},
                    {"competitor_id": "comp-dup", "name": "Second", "place_id": None},
                ],
            }
        ]
    }
    dup_errors = _validate_listings_config(duplicate_config)
    has_dup_error = any("duplicate" in e for e in dup_errors)
    check("sec: detect duplicate competitor_id", has_dup_error, str(dup_errors))

    # 4e  Config validation rejects invalid place_ids.
    bad_pid_config = {
        "branches": [
            {
                "branch_id": "cph-b",
                "branch_name": "Branch B",
                "competitors": [
                    {"competitor_id": "comp-badpid", "name": "Bad", "place_id": "invalid"},
                    {"competitor_id": "comp-nopid", "name": "None", "place_id": None},
                ],
            }
        ]
    }
    pid_errors = _validate_listings_config(bad_pid_config)
    has_pid_error = any("place_id" in e for e in pid_errors)
    check("sec: reject invalid place_id", has_pid_error, str(pid_errors))

    # 4f  Config validation passes for a valid config.
    valid_config = {
        "branches": [
            {
                "branch_id": "cph-c",
                "branch_name": "Branch C",
                "competitors": [
                    {"competitor_id": "comp-valid", "name": "Valid", "place_id": None},
                    {"competitor_id": "comp-valid2", "name": "Valid 2", "place_id": "ChIJxxxxxxxxxxxxxxxxxxxxxxxxxx"},
                ],
            }
        ]
    }
    valid_errors = _validate_listings_config(valid_config)
    check("sec: valid config passes", len(valid_errors) == 0, str(valid_errors))

    # 4g  --validate-config CLI flag works.
    result = subprocess.run(
        [sys.executable, "-m", "orchestration.run_all", "--validate-config"],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
    )
    # E2 / RISK-025: a config-validation failure (exit 1) or a crash (exit 2 /
    # traceback) must NOT be masked as a pass. We still allow exit 1 because the
    # known unverified place_ids (RISK-002) legitimately fail validation, but a
    # crash is always a failure.
    crashed = result.returncode not in (0, 1) or "Traceback" in result.stderr
    check("sec: --validate-config exits cleanly", not crashed)


def compare_golden() -> None:
    """E3 / RISK-025 — diff the fixtures run output against the golden baselines.

    Provides an honest regression signal: if the topology, run-summary shape, or
    parsed-review counts drift from the committed baselines, the test fails. Only
    runs when golden-datasets/ is populated.
    """
    if not GOLDEN_DIR.exists():
        return
    golden_files = list(GOLDEN_DIR.glob("*.golden.json"))
    if not golden_files:
        return

    print("\n[Phase 5] Golden-dataset regression comparison...")

    # 5a  Topology baseline (listings.golden.json).
    listings_golden = GOLDEN_DIR / "listings.golden.json"
    if listings_golden.exists() and CONFIG_LISTINGS_PATH.exists():
        golden = json.loads(listings_golden.read_text(encoding="utf-8"))
        actual_cfg = json.loads(CONFIG_LISTINGS_PATH.read_text(encoding="utf-8"))
        actual_ids: list[str] = []
        actual_branches = 0
        for biz in actual_cfg.get("businesses", []):
            for branch in biz.get("branches", []):
                actual_branches += 1
                for comp in branch.get("competitors", []):
                    actual_ids.append(comp["competitor_id"])
        check(
            "golden: branch count matches config",
            actual_branches == golden.get("branches", -1),
            f"config={actual_branches}, golden={golden.get('branches')}",
        )
        check(
            "golden: competitor count matches config",
            len(actual_ids) == golden.get("competitors", -1),
            f"config={len(actual_ids)}, golden={golden.get('competitors')}",
        )
        missing = set(golden.get("competitor_ids", [])) - set(actual_ids)
        check(
            "golden: all expected competitor_ids present",
            not missing,
            f"missing: {missing}",
        )

    # 5b  Run-summary shape baseline (run_summary.golden.json).
    summary_golden = GOLDEN_DIR / "run_summary.golden.json"
    if summary_golden.exists() and SUMMARY_PATH.exists():
        golden = json.loads(summary_golden.read_text(encoding="utf-8"))
        actual = json.loads(SUMMARY_PATH.read_text(encoding="utf-8"))
        for key in ("success", "failed", "skipped", "new_reviews", "total_reviews"):
            check(
                f"golden: run_summary.{key} matches baseline",
                actual.get(key) == golden.get(key),
                f"got {actual.get(key)}, golden {golden.get(key)}",
            )

    # 5c  Review-count baseline (reviews.golden.json).
    reviews_golden = GOLDEN_DIR / "reviews.golden.json"
    if reviews_golden.exists() and SNAPSHOTS_DIR.exists():
        golden = json.loads(reviews_golden.read_text(encoding="utf-8"))
        per = golden.get("per_competitor", {})
        actual_total = 0
        for comp_id, expected in per.items():
            comp_dir = SNAPSHOTS_DIR / comp_id
            latest_pointer = comp_dir / "latest.json"
            count = 0
            if latest_pointer.exists():
                try:
                    latest_filename = json.loads(latest_pointer.read_text(encoding="utf-8"))
                    snapshot_path = comp_dir / latest_filename
                    if snapshot_path.exists():
                        count = len(json.loads(snapshot_path.read_text(encoding="utf-8")))
                except (json.JSONDecodeError, OSError):
                    count = 0
            actual_total += count
            check(
                f"golden: {comp_id} review count matches baseline",
                count == expected,
                f"got {count}, golden {expected}",
            )
        check(
            "golden: total review count matches baseline",
            actual_total == golden.get("expected_total_reviews", -1),
            f"got {actual_total}, golden {golden.get('expected_total_reviews')}",
        )


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

    # M13B: Security regression tests.
    _verify_security()

    # E3 / RISK-025: golden-dataset regression comparison.
    compare_golden()

    print("\n" + "=" * 60)
    print(f"Results: {PASS} passed, {FAIL} failed")
    print("=" * 60)

    return 1 if FAIL > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
