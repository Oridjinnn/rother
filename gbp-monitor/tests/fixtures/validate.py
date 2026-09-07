from __future__ import annotations

import logging
from pathlib import Path
from parsel import Selector

logger = logging.getLogger("gbp-monitor.fixture_validate")

_FIXTURES_DIR = Path(__file__).resolve().parent


def validate_fixture_html(fixture_path: Path) -> list[str]:
    errors: list[str] = []
    if not fixture_path.exists():
        return [f"Fixture file not found: {fixture_path}"]
    html = fixture_path.read_text(encoding="utf-8")
    sel = Selector(text=html)
    items = sel.css("div.jftiEf.fontBodyMedium")
    if not items:
        return [f"No review items found in {fixture_path.name} (selector div.jftiEf.fontBodyMedium matched nothing)"]
    for i, item in enumerate(items):
        rid = item.attrib.get("data-review-id")
        if not rid:
            errors.append(f"{fixture_path.name}: item[{i}] missing data-review-id")
        rating_label = item.css("span.kvMYJc").attrib.get("aria-label", "")
        if not rating_label:
            errors.append(f"{fixture_path.name}: item[{i}] (id={rid or '?'}) missing rating aria-label")
        date_text = item.css("span.rsqaWe").xpath("string(.)").get()
        if not date_text or not date_text.strip():
            errors.append(f"{fixture_path.name}: item[{i}] (id={rid or '?'}) missing relative date")
        text_node = item.css("span.wiI7pd").xpath("string(.)").get()
        if not text_node or not text_node.strip():
            errors.append(f"{fixture_path.name}: item[{i}] (id={rid or '?'}) missing review text")
    return errors


def validate_all_fixtures() -> dict[str, list[str]]:
    results: dict[str, list[str]] = {}
    for fixture_path in sorted(_FIXTURES_DIR.glob("comp-*.html")):
        errs = validate_fixture_html(fixture_path)
        if errs:
            results[fixture_path.name] = errs
        else:
            results[fixture_path.name] = []
    return results


def print_validation_report(results: dict[str, list[str]]) -> str:
    lines: list[str] = []
    total = len(results)
    clean = sum(1 for errs in results.values() if not errs)
    lines.append(f"Fixture validation: {clean}/{total} clean")
    for name, errs in results.items():
        if errs:
            lines.append(f"  FAIL {name}:")
            for e in errs:
                lines.append(f"    - {e}")
        else:
            lines.append(f"  PASS {name}")
    return "\n".join(lines)
