"""P1 / RISK-024 — category discovery scan (scraper-based).

Given a ``category`` (e.g. ``"coffee"``) and an optional ``location``
(e.g. ``"Copenhagen"``), build a Google Maps category-search URL, capture
the result cards, and extract candidate competitors.

Two acquisition paths (both reuse the existing Playwright harness — no new
API key, per the RISK-023 "keep Playwright scraper" decision):

* **live** — launch headless Chromium, capture the category-search page HTML
  via :func:`harness.capture.capture_listing_html`, then parse the result
  cards.
* **fixtures** — read ``tests/fixtures/category_scan.html`` instead of hitting
  Google. Used by CI / offline dev so the pipeline is exercisable without a
  browser binary or network.

Output is written to ``<data-dir>/category_scan/{timestamp}.json`` plus a
``latest.json`` pointer (same layout as the snapshot store) so the dashboard
can read the most recent scan via ``server-data.readCategoryScan``.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path

from storage.common import base_data_dir

logger = logging.getLogger("gbp-monitor.discovery")

_FIXTURES_DIR = Path("tests/fixtures")
_FIXTURE_NAME = "category_scan.html"

# Raw HTML of the most recent LIVE capture, persisted so a subsequent
# `--cached` run can replay it offline (no browser / network required).
_LAST_CAPTURE_NAME = "_last_capture.html"

# Best-effort extraction patterns. Google Maps markup is volatile, so every
# pattern is defensive: a missing field yields ``None`` rather than raising.
_RATING_RE = re.compile(r'([0-9](?:\.[0-9])?)\s*(?:star|★)', re.IGNORECASE)
_REVIEWS_RE = re.compile(r'(?:\(|\b)(\d[\d,.]*)\s*(?:reviews?|avis)', re.IGNORECASE)
# Absolute-URL builder for the /maps/place/ href extracted from a result anchor.
_MAPS_PLACE_RE = re.compile(r'(/maps/place/[^"\s]+)')
# Fallback: a data-place-id anywhere in the markup (with or without a link).
_PLACE_ID_RE = re.compile(r'data-place-id="([A-Za-z0-9_\-]+)"')


def build_search_url(category: str, location: str) -> str:
    """Construct a Google Maps category-search URL."""
    query = " ".join(p for p in (category, location) if p).strip()
    q = query.replace(" ", "+")
    return f"https://www.google.com/maps/search/{q}"


def parse_category_results(html: str) -> list[dict]:
    """Extract candidate competitors from captured category-search HTML.

    Uses :mod:`parsel` (the project's already-pinned selector library) to walk
    the DOM tree per result card, instead of brittle forward-window regex over
    raw HTML. Each result anchor (``<a href="/maps/place/...">``) is a card;
    within its subtree we read ``data-place-id``, an ``aria-label`` for the
    name, and rating/review text.

    Returns a list of dicts with keys: ``name``, ``gmaps_url``, ``place_id``,
    ``rating`` (float|None), ``reviews_count`` (int|None). Best-effort: any
    field the markup does not expose is left ``None``.
    """
    from parsel import Selector

    candidates: list[dict] = []
    seen_place_ids: set[str] = set()

    # Primary strategy: one card per result anchor whose href points at a
    # /maps/place/... page. We constrain the search to the anchor's own
    # subtree so a card's name/rating/reviews cannot leak from a neighbour.
    sel = Selector(text=html)
    anchors = sel.xpath("//a[contains(@href, '/maps/place/')]")
    for a in anchors:
        href = a.attrib.get("href", "")
        place_match = _MAPS_PLACE_RE.search(href)
        place_path = place_match.group(1) if place_match else href
        gmaps_url = (
            place_path
            if place_path.startswith("http")
            else f"https://www.google.com{place_path}"
        )

        place_id = a.attrib.get("data-place-id")

        # Name: prefer an aria-label anywhere in the card subtree (Google
        # puts the business name in such an attribute); fall back to the
        # anchor's own text content.
        name = (a.xpath(".//*[@aria-label][1]/@aria-label").get() or "").strip()
        if not name:
            name = (a.xpath("normalize-space(.)").get() or "").strip() or None

        if place_id:
            if place_id in seen_place_ids:
                continue
            seen_place_ids.add(place_id)
        if not name and not place_id:
            continue

        # Rating + reviews live as text within the card subtree — scan that
        # subtree (not the whole document) so we stay card-scoped.
        chunk = a.get() or ""

        rating = None
        rm = _RATING_RE.search(chunk)
        if rm:
            try:
                rating = float(rm.group(1))
            except ValueError:
                rating = None

        reviews_count = None
        rv = _REVIEWS_RE.search(chunk)
        if rv:
            digits = rv.group(1).replace(",", "").replace(".", "")
            if digits.isdigit():
                reviews_count = int(digits)

        candidates.append({
            "name": name,
            "gmaps_url": gmaps_url,
            "place_id": place_id,
            "rating": rating,
            "reviews_count": reviews_count,
        })

    # Fallback strategy: some markup exposes place_ids without a /maps/place/
    # link. Pick those up so we don't miss cards the first pass skipped.
    if not candidates:
        for place_id in _PLACE_ID_RE.findall(html):
            if place_id in seen_place_ids:
                continue
            seen_place_ids.add(place_id)
            candidates.append({
                "name": None,
                "gmaps_url": f"https://www.google.com/maps/place/?q=place_id:{place_id}",
                "place_id": place_id,
                "rating": None,
                "reviews_count": None,
            })

    return candidates


def _timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")


def _load_selectors() -> dict:
    sel_path = Path("config/selectors.json")
    try:
        return json.loads(sel_path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError) as e:
        logger.warning("could not load selectors.json (%s); using empty set", e)
        return {}


def _capture_live(category: str, location: str) -> str:
    """Capture the category-search page via the Playwright harness.

    Raises on any capture failure so the caller can surface a clear error
    instead of silently returning an empty candidate list.
    """
    from harness.browser import get_browser_context
    from harness.capture import capture_listing_html

    url = build_search_url(category, location)
    p, browser, context = get_browser_context()
    try:
        html = capture_listing_html(
            context,
            url,
            _load_selectors(),
            comp_id="category-scan",
            total_timeout_s=90,
        )
        return html
    finally:
        try:
            context.close()
        except Exception:
            pass
        try:
            browser.close()
        except Exception:
            pass
        try:
            p.stop()
        except Exception:
            pass


def _scan_dir() -> Path:
    """On-disk directory for category-scan artifacts (under ``base_data_dir``)."""
    scan_dir = base_data_dir() / "category_scan"
    scan_dir.mkdir(parents=True, exist_ok=True)
    return scan_dir


def run_scan(
    category: str,
    location: str = "",
    fixtures_mode: bool = False,
    cached_mode: bool = False,
) -> dict:
    """Run a category discovery scan and persist the candidates.

    Three acquisition paths (all reuse the Playwright harness — no new API
    key, per the RISK-023 "keep Playwright scraper" decision):

    * **fixtures** (``fixtures_mode=True``) — read
      ``tests/fixtures/category_scan.html``; no browser/network.
    * **cached** (``cached_mode=True``) — replay the raw HTML persisted by the
      most recent LIVE run (``<data-dir>/category_scan/_last_capture.html``);
      offline after one live capture. Raises a clear error if no cached
      capture exists yet.
    * **live** (default) — launch headless Chromium, capture the
      category-search page, and persist the raw HTML for future cached runs.

    Returns the result dict (also written to disk):
        {
          "category", "location", "query_url", "mode",
          "timestamp", "candidates": [...]
        }
    """
    query_url = build_search_url(category, location)
    if fixtures_mode:
        mode = "fixtures"
    elif cached_mode:
        mode = "cached"
    else:
        mode = "live"

    scan_dir = _scan_dir()

    if fixtures_mode:
        fixture = _FIXTURES_DIR / _FIXTURE_NAME
        if not fixture.exists():
            raise FileNotFoundError(
                f"fixtures category scan HTML not found: {fixture}"
            )
        html = fixture.read_text(encoding="utf-8")
        logger.info("category_scan[%s]: MODE=fixtures — using fixtures HTML (%d bytes)", category, len(html))
    elif cached_mode:
        cache = scan_dir / _LAST_CAPTURE_NAME
        if not cache.exists():
            raise FileNotFoundError(
                "No cached capture found — run a live scan once first."
            )
        html = cache.read_text(encoding="utf-8")
        logger.info("category_scan[%s]: MODE=cached — replaying cached HTML (%d bytes)", category, len(html))
    else:
        html = _capture_live(category, location)
        # Persist the raw capture so a later --cached run can replay offline.
        (scan_dir / _LAST_CAPTURE_NAME).write_text(html, encoding="utf-8")
        logger.info("category_scan[%s]: MODE=live — captured %d bytes (cached for replay)", category, len(html))

    candidates = parse_category_results(html)

    # RISK-023/024 early-warning: a live scan returning nothing strongly
    # suggests Google changed its result-card markup (selector drift).
    if mode == "live" and not candidates:
        logger.warning(
            "category_scan: 0 candidates extracted — possible Google Maps "
            "markup drift (RISK-023/024)."
        )

    result = {
        "category": category,
        "location": location,
        "query_url": query_url,
        "mode": mode,
        "timestamp": _timestamp(),
        "candidates": candidates,
    }

    # Persist: <data-dir>/category_scan/{ts}.json + latest.json pointer.
    ts = result["timestamp"]
    out_path = scan_dir / f"{ts}.json"
    out_path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    (scan_dir / "latest.json").write_text(json.dumps(out_path.name), encoding="utf-8")

    logger.info(
        "category_scan[%s]: found %d candidate(s) → %s",
        category, len(candidates), out_path,
    )
    return result


if __name__ == "__main__":
    import sys

    cat = sys.argv[1] if len(sys.argv) > 1 else "coffee"
    loc = sys.argv[2] if len(sys.argv) > 2 else "Copenhagen"
    print(json.dumps(run_scan(cat, loc, fixtures_mode=True), indent=2, ensure_ascii=False))
