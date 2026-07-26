"""Phase 2 · 3: Selector Certification + Golden Dataset creation."""
import json, re, sys
from pathlib import Path
from datetime import datetime, timezone

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from parser.review_parser import parse_reviews
from parser.schema import Review, review_to_dict
from storage.snapshot_store import save_snapshot, load_snapshot, list_snapshots

selectors_path = REPO_ROOT / "config" / "selectors.json"
selectors = json.loads(selectors_path.read_text("utf-8"))

verify_dir = REPO_ROOT / "data" / "verify"
capture_dirs = sorted(verify_dir.iterdir())
latest = capture_dirs[-1]
html_path = latest / "comp-canggu-01" / "page.html"
html = html_path.read_text("utf-8", errors="replace")
timestamp = latest.name  # e.g. 20260723T101225Z

# ── Phase 2: Selector Certification ──────────────────────────────────
print("=" * 60)
print("PHASE 2: SELECTOR CERTIFICATION")
print("=" * 60)

selector_health = {}
for key, raw in selectors.items():
    if key == "_meta":
        continue

    # Resolve selector to CSS/attribute string
    if isinstance(raw, str):
        selectors_list = [raw]
    elif isinstance(raw, list):
        selectors_list = raw
    else:
        continue

    # Check each tier against actual HTML
    tiers = []
    for tier_idx, sel in enumerate(selectors_list):
        if not sel:
            tiers.append({"tier": tier_idx, "selector": sel, "status": "empty", "matches": 0})
            continue

        # Determine match type
        if key.endswith("_attr"):
            # Attribute check: does this attribute name appear in HTML?
            attr_name = sel
            count = html.count(f"{attr_name}=")
            status = "live" if count > 0 else "broken"
            confidence = "high" if count >= 3 else ("medium" if count > 0 else "none")
        else:
            # CSS selector → extract class names and check HTML for them
            # e.g. "div.jftiEf.fontBodyMedium" → count elements with both classes
            classes = re.findall(r"\.([\w-]+)", sel)
            tag = re.match(r"^([a-z]+)", sel)
            tag_name = tag.group(1) if tag else None
            if classes:
                # Count elements that contain ALL required classes (any order)
                # Build a pattern that matches class="..." with all classes inside
                perms = []
                for c in classes:
                    perms.append(rf'(?=.*\b{re.escape(c)}\b)')
                class_pattern = r'class="' + ''.join(perms) + r'[^"]*"'
                matches = re.findall(class_pattern, html)
                count = len(matches)
            elif tag_name:
                count = len(re.findall(f"<{tag_name}[\\s>]", html))
            else:
                count = html.count(sel)
            if count >= 1:
                status = "live"
                confidence = "high" if count >= 3 else "medium"
            else:
                status = "degraded" if count == 0 else "broken"
                confidence = "none"

        tiers.append({
            "tier": tier_idx,
            "selector": sel,
            "status": status,
            "confidence": confidence,
            "matches": count,
        })

    # Overall status: best tier wins
    best = tiers[0]
    for t in tiers:
        if t["status"] == "live":
            best = t
            break

    selector_health[key] = {
        "verified_by": "M5-LiveCapture",
        "last_verified": timestamp,
        "tiers": tiers,
        "overall_status": best["status"],
        "overall_confidence": best["confidence"],
        "active_tier": best["tier"],
        "active_selector": best["selector"],
    }

print(f"{'Selector':35s} {'Active Tier':12s} {'Status':10s} {'Confidence':10s} {'Matches'}")
print("-" * 80)
for key in sorted(selector_health.keys()):
    h = selector_health[key]
    print(f"{key:35s} {str(h['active_tier']):12s} {h['overall_status']:10s} {h['overall_confidence']:10s} {str(h['tiers'][0]['matches']):>7s}")
    for t in h["tiers"][1:]:
        if t["status"] != h["overall_status"] or t["confidence"] != h["overall_confidence"]:
            print(f"{'':35s} {'tier '+str(t['tier']):12s} {t['status']:10s} {t['confidence']:10s} {str(t['matches']):>7s}")

print()

# Save selector health back to selectors.json
selectors["_meta"]["last_verified"] = timestamp
selectors["_meta"]["verified_by"] = "M5-LiveCapture"
selectors["_meta"]["selector_health"] = selector_health
selectors_path.write_text(json.dumps(selectors, indent=2, ensure_ascii=False), "utf-8")
print(f"Selector health metadata written to config/selectors.json")

# ── Phase 3: Golden Dataset ──────────────────────────────────────────
print()
print("=" * 60)
print("PHASE 3: GOLDEN DATASET")
print("=" * 60)

golden_dir = REPO_ROOT / "data" / "golden"
golden_dir.mkdir(parents=True, exist_ok=True)

# Parse reviews with current parser
reviews = parse_reviews(html, "comp-canggu-01", "cph-canggu", selectors)
print(f"Parsed reviews: {len(reviews)}")
for r in reviews:
    d = review_to_dict(r)
    print(f"  {d['review_id'][:20]}... {d['reviewer_name']:25s} {d['rating']} {d['relative_date']:15s}")

# Save parsed reviews as golden dataset
golden_reviews = [review_to_dict(r) for r in reviews]
(golden_dir / "reviews.json").write_text(
    json.dumps(golden_reviews, indent=2, ensure_ascii=False), "utf-8"
)
print(f"\nGolden reviews saved: data/golden/reviews.json ({len(golden_reviews)} reviews)")

# Save raw HTML for future regression
(golden_dir / "page.html").write_text(html, "utf-8")
print(f"Golden HTML saved: data/golden/page.html ({len(html)} bytes)")

# Save selectors as they were at verification time
selectors_snapshot = json.loads(selectors_path.read_text("utf-8"))
(golden_dir / "selectors.json").write_text(
    json.dumps(selectors_snapshot, indent=2, ensure_ascii=False), "utf-8"
)
print(f"Golden selectors saved: data/golden/selectors.json")

# Compute expected metrics from the golden reviews
ratings = [r.rating for r in reviews if r.rating is not None]
total_reviews = len(reviews)
avg_rating = sum(ratings) / len(ratings) if ratings else 0.0
rating_dist = {str(i): 0 for i in range(1, 6)}
for r in ratings:
    rating_dist[str(int(r))] = rating_dist.get(str(int(r)), 0) + 1

metrics = {
    "competitor_id": "comp-canggu-01",
    "branch_id": "cph-canggu",
    "total_reviews": total_reviews,
    "average_rating": round(avg_rating, 2),
    "rating_distribution": rating_dist,
    "reviewer_names": sorted([r.reviewer_name for r in reviews if r.reviewer_name]),
    "relative_dates": [r.relative_date for r in reviews if r.relative_date],
}

(golden_dir / "metrics.json").write_text(
    json.dumps(metrics, indent=2, ensure_ascii=False), "utf-8"
)
print(f"Golden metrics saved: data/golden/metrics.json")

# Generate selector report
selector_report = {
    "capture_timestamp": timestamp,
    "capture_source": "live_gmaps",
    "verified_by": "M5-LiveCapture",
    "selector_health": selector_health,
}
(golden_dir / "selector_report.json").write_text(
    json.dumps(selector_report, indent=2, ensure_ascii=False), "utf-8"
)
print(f"Selector report saved: data/golden/selector_report.json")

print()
print("=== Golden Dataset Summary ===")
print(f"  Reviews: {total_reviews}")
print(f"  Avg Rating: {metrics['average_rating']}")
print(f"  Distribution: {rating_dist}")
print(f"  Reviewers: {metrics['reviewer_names']}")
print(f"  Dates: {metrics['relative_dates']}")

print()
print("=== Phase 2 & 3 Complete ===")
