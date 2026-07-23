"""Promote verified captures to Golden Datasets for regression testing.

Usage::

    cd gbp-monitor/
    python -m golden.promote 20260722T120000Z
    python -m golden.promote 20260722T120000Z --competitor comp-canggu-01

Promotes evidence from ``data/verify/<ts>/<competitor_id>/`` into
``golden-datasets/<competitor_id>_<YYYYMMDD>/``.

This script is optional and separate from production execution. It does not
modify any production data, configs, or code paths.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

VERIFY_ROOT = Path("data/verify")
GOLDEN_ROOT = Path("../golden-datasets")
SELECTORS_PATH = Path("config/selectors.json")
LISTINGS_PATH = Path("config/listings.json")


def _read_selector_version() -> str | None:
    try:
        s = json.loads(SELECTORS_PATH.read_text(encoding="utf-8"))
        return s.get("last_verified")
    except Exception:
        return None


def _build_competitor_map() -> dict:
    """Build {competitor_id: {branch_id, name}} from listings.json."""
    try:
        listings = json.loads(LISTINGS_PATH.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"  WARNING: could not load {LISTINGS_PATH}: {e}")
        return {}

    comp_map: dict[str, dict] = {}
    for branch in listings.get("branches", []):
        bid = branch.get("branch_id", "")
        for comp in branch.get("competitors", []):
            cid = comp.get("competitor_id", "")
            if cid:
                comp_map[cid] = {
                    "branch_id": bid,
                    "name": comp.get("name", ""),
                    "gmaps_url": comp.get("gmaps_url", ""),
                }
    return comp_map


def _write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def _generate_expected_parse(ds_dir: Path, comp_id: str, branch_id: str) -> None:
    """Run the existing parser on the captured HTML to produce expected output."""
    html_path = ds_dir / "page.html"
    try:
        selectors = json.loads(SELECTORS_PATH.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"  WARNING: cannot load selectors: {e}")
        return

    try:
        from parser.review_parser import parse_reviews
        from parser.schema import review_to_dict

        html = html_path.read_text(encoding="utf-8")
        parsed = parse_reviews(html, comp_id, branch_id, selectors)
        reviews = [review_to_dict(r) for r in parsed]
        _write_json(ds_dir / "expected_reviews.json", reviews)
        print(f"  PARSED {len(reviews)} reviews for {comp_id}")
    except ImportError as e:
        print(f"  WARNING: parser unavailable ({e}) — install 'parsel' and re-run")
    except Exception as e:
        print(f"  WARNING: parser failed for {comp_id}: {e}")
        print(f"    expected_reviews.json not generated; HTML preserved for debugging")


_NOTES_TEMPLATE = """# Golden Dataset: {dataset_id}

## Capture Summary

- **Competitor**: {competitor_name} ({competitor_id})
- **Branch**: {branch_id}
- **Capture date**: {capture_date}
- **Capture status**: {capture_status}

## Verification Notes

*Describe what you observed when reviewing this dataset.*
- Does the screenshot show a complete, correct listing?
- Are the reviews scrolled and visible?
- Does the parse output look accurate?
- Any anomalies, captchas, or layout issues?

## Acceptance

- [ ] Screenshot shows a real Google Maps listing (not captcha/error)
- [ ] Reviews section is scrolled and visible
- [ ] Raw HTML is >10KB (non-trivial content)
- [ ] Parser ran successfully (expected_reviews.json exists)
- [ ] Parsed review count is plausible (check against screenshot)
- [ ] No obvious extraction errors (missing text, wrong ratings)

**Verified by**: ____________
**Date**: ____________
**Status**: candidate | verified | superseded
"""


def _write_notes_template(ds_dir: Path, comp_id: str, branch_id: str,
                          comp_name: str, capture_date: str,
                          capture_status: str) -> None:
    dataset_id = ds_dir.name
    notes = _NOTES_TEMPLATE.format(
        dataset_id=dataset_id,
        competitor_id=comp_id,
        competitor_name=comp_name,
        branch_id=branch_id,
        capture_date=capture_date,
        capture_status=capture_status,
    )
    (ds_dir / "notes.md").write_text(notes, encoding="utf-8")


def promote(verify_ts: str, competitor: str | None = None) -> list[str]:
    """Promote one verify run into Golden Datasets.

    Args:
        verify_ts: Timestamp directory under ``data/verify/``
                   (e.g. ``20260722T120000Z``).
        competitor: Optional competitor_id to promote. If None, all
                    PASS results are promoted.

    Returns:
        List of promoted competitor_ids.
    """
    verify_dir = VERIFY_ROOT / verify_ts
    if not verify_dir.exists():
        print(f"ERROR: verify directory not found: {verify_dir}")
        return []

    report_path = verify_dir / "report.json"
    if not report_path.exists():
        print(f"ERROR: report.json not found in {verify_dir}")
        return []
    report = json.loads(report_path.read_text(encoding="utf-8"))

    comp_map = _build_competitor_map()

    results = report.get("results", [])
    if competitor:
        results = [r for r in results if r["competitor_id"] == competitor]
        if not results:
            print(f"ERROR: competitor '{competitor}' not found in verify results")
            return []

    promoted: list[str] = []
    date_str = verify_ts[:8]  # YYYYMMDD

    for result in results:
        comp_id = result["competitor_id"]
        status = result.get("status", "FAIL")
        src_dir = verify_dir / comp_id

        if not src_dir.exists():
            print(f"  SKIP {comp_id}: evidence directory not found")
            continue

        html_path = src_dir / "page.html"
        if not html_path.exists():
            print(f"  SKIP {comp_id}: page.html not found")
            continue

        ds_dir = GOLDEN_ROOT / f"{comp_id}_{date_str}"

        # Warn if dataset already exists.
        if ds_dir.exists():
            existing_md = ds_dir / "metadata.json"
            existing_status = "unknown"
            if existing_md.exists():
                try:
                    existing_status = json.loads(
                        existing_md.read_text(encoding="utf-8")
                    ).get("verification_status", "unknown")
                except Exception:
                    pass
            print(f"  EXISTS {ds_dir} (status: {existing_status})")
            print(f"    Use --force to overwrite or remove it manually.")
            continue

        ds_dir.mkdir(parents=True)

        # Copy evidence files.
        shutil.copy2(str(html_path), str(ds_dir / "page.html"))
        png_path = src_dir / "page.png"
        if png_path.exists():
            shutil.copy2(str(png_path), str(ds_dir / "page.png"))

        # Build metadata.
        cinfo = comp_map.get(comp_id, {"branch_id": "", "name": "", "gmaps_url": ""})
        capture_date = report.get("started_at", verify_ts)
        metadata = {
            "dataset_id": f"{comp_id}_{date_str}",
            "competitor_id": comp_id,
            "branch_id": cinfo["branch_id"],
            "competitor_name": cinfo["name"],
            "capture_date": capture_date,
            "verify_run": verify_ts,
            "capture_status": status,
            "google_maps_url": result.get("url", cinfo.get("gmaps_url", "")),
            "selector_version": _read_selector_version(),
            "verification_status": "candidate",
            "verified_by": None,
            "notes": "",
        }
        _write_json(ds_dir / "metadata.json", metadata)

        # Try to generate expected parse output (parser may not be available).
        _generate_expected_parse(ds_dir, comp_id, cinfo["branch_id"])

        # Create notes template.
        _write_notes_template(
            ds_dir,
            comp_id,
            cinfo["branch_id"],
            cinfo["name"],
            capture_date,
            status,
        )

        print(f"  PROMOTED {comp_id} -> {ds_dir}")
        promoted.append(comp_id)

    return promoted


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m golden.promote",
        description=(
            "Promote verified captures to Golden Datasets for regression "
            "testing. Run from the gbp-monitor/ directory."
        ),
    )
    parser.add_argument(
        "verify_ts",
        type=str,
        help=(
            "Verify run timestamp directory under data/verify/, "
            "e.g. 20260722T120000Z"
        ),
    )
    parser.add_argument(
        "--competitor",
        type=str,
        default=None,
        help=(
            "Promote only this competitor_id. If omitted, all results "
            "are promoted."
        ),
    )
    parser.add_argument(
        "--dest",
        type=str,
        default=None,
        help="Override destination root (default: ../golden-datasets/)",
    )
    return parser.parse_args(argv)


if __name__ == "__main__":
    args = _parse_args()
    if args.dest:
        GOLDEN_ROOT = Path(args.dest)
    promoted = promote(args.verify_ts, args.competitor)

    if promoted:
        print(
            f"\nPromoted {len(promoted)} dataset(s) to "
            f"{GOLDEN_ROOT.resolve()}"
        )
        print()
        print("Next steps:")
        print("  1. Review each dataset per docs/engineering/GOLDEN_DATASET.md")
        print("  2. Update metadata.json: set verification_status to 'verified'")
        print("  3. Fill in notes.md with observations")
        print("  4. Commit the golden-datasets/ directory")
    else:
        print("No datasets were promoted.")
        sys.exit(1)
