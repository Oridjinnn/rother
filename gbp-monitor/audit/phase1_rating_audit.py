"""Phase 1: Audit rating extraction against real captured HTML."""
import json, sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from parser.review_parser import parse_reviews

selectors = json.loads((REPO_ROOT / "config" / "selectors.json").read_text("utf-8"))

verify_dir = REPO_ROOT / "data" / "verify"
capture_dirs = sorted(verify_dir.iterdir())
latest = capture_dirs[-1]
html_path = latest / "comp-canggu-01" / "page.html"
html = html_path.read_text("utf-8", errors="replace")

print(f"Capture: {latest.name}")
print(f"HTML size: {len(html)} bytes")
print()

reviews = parse_reviews(html, "comp-canggu-01", "cph-canggu", selectors)
print(f"Reviews parsed: {len(reviews)}")
print()

fields = ["review_id", "reviewer_name", "rating", "text", "relative_date"]
for field in fields:
    vals = [repr(getattr(r, field, ""))[:80] for r in reviews]
    present = sum(1 for v in vals if v != "''" and v != "None")
    pct = present / len(vals) * 100 if vals else 0
    print(f"  {field}: {present}/{len(vals)} ({pct:.0f}%)")
    if field == "rating":
        nums = [getattr(r, field, 0) for r in reviews if getattr(r, field, None) is not None]
        print(f"    values: {set(nums)}  range: {min(nums)} - {max(nums)}")
    for v in vals[:3]:
        print(f"    {v}")
    print()

# Selector metadata
print("--- Selectors Used ---")
for key in ["review_item", "review_id_attr", "rating_selector", "rating_attr",
            "reviewer_name_attr", "review_text_selector", "relative_date_selector"]:
    raw = selectors.get(key)
    val = raw[0] if isinstance(raw, list) and raw else raw if isinstance(raw, str) else ""
    print(f"  {key}: {val}")

print()
print("--- HTML Presence Checks ---")
checks = [
    ("kvMYJc class", "kvMYJc" in html),
    ("data-review-id exists", 'data-review-id="' in html),
    ("lang=id", 'lang="id"' in html),
    ("aria-label rating pattern", 'aria-label="' in html),
    ("bintang (Indonesian)", "bintang" in html),
]
for label, ok in checks:
    print(f"  {'PASS' if ok else 'FAIL'} {label}")

print()
print("=== Phase 1 Complete ===")
