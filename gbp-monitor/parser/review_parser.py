"""Pure HTML → list[Review] parser.

Per GBP_MONITOR_PLAN.md Section 5.5. This module takes a raw HTML string
(produced by `harness/capture.py` or read from a `tests/fixtures/*.html`
file) and returns a list of `Review` dataclass instances. It performs NO
network or browser calls — it is fully deterministic and unit-testable
against a static HTML fixture (per Rule 1 / Section 5.5 testing requirement).

Design notes:
- Uses `parsel.Selector` (the standalone Scrapy selector library) — verified
  importable as `parsel 1.11.0` in this sandbox before writing.
- Each `_safe_parse_*` helper catches its own exceptions and returns `None`
  on failure so a single malformed field (e.g. a missing rating) does not
  discard the whole review. `review_id` is the one field that CANNOT be
  missing — items without it are skipped (we cannot deduplicate without an
  ID). Per Section 5.5, if a large fraction of items lack an ID that is a
  signal the selector itself is broken, surfaced loudly at the orchestration
  layer via the "failed >= success" warning.
- `reviewer_name` comes from the `aria-label` attribute on the review item
  container (Google sets this to the reviewer's name + " · original"
  suffix). We do NOT trim that suffix here — the dashboard can normalize
  if it wants. Keeping the raw value preserves evidence for selector
  verification passes (Rule 3).
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from parsel import Selector

from .schema import Review

logger = logging.getLogger("gbp-monitor.parser")

# Matches strings like "Rated 4 out of 5" or "5 out of 5 stars" — Google's
# `aria-label` on the rating star span historically uses these patterns. The
# first captured digit is the rating (1-5). Compiled once at import time.
_RATING_PATTERN = re.compile(r"(\d(?:\.\d)?)\s*(?:out of|/)\s*5", re.IGNORECASE)


def parse_reviews(
    html: str,
    competitor_id: str,
    branch_id: str,
    selectors: dict,
) -> list[Review]:
    """Parse `html` and return a list of `Review` instances.

    Pure function: no I/O, no side effects, fully deterministic given the
    same `html` + `selectors` + clock. The `scraped_at` field is the only
    non-deterministic component — it is set once per call to the current
    UTC time in ISO 8601 so all reviews from the same capture share it.

    Args:
        html: Raw HTML of the reviews panel (from `harness/capture.py` or a
            fixture file).
        competitor_id: The competitor this HTML belongs to (propagated into
            every `Review` for downstream dedup/storage).
        branch_id: The branch this listing competes with (propagated into
            every `Review`).
        selectors: The selector dict from `config/selectors.json`. Required
            keys: `review_item`, `review_id_attr`, `reviewer_name_attr`,
            `review_text_selector`, `rating_selector`, `rating_attr`,
            `relative_date_selector`.

    Returns:
        list[Review] — items without a `review_id` are skipped (logged at
        INFO so the orchestrator's per-listing error count can detect a
        selector breakage wave).
    """
    sel = Selector(text=html)
    items = sel.css(selectors["review_item"])
    scraped_at = datetime.now(timezone.utc).isoformat()

    results: list[Review] = []
    skipped_without_id = 0

    for item in items:
        # `item.attrib` is a dict of the element's attributes — for the
        # review item div, Google sets `data-review-id` to a stable opaque
        # token we use as the dedup key.
        review_id = item.attrib.get(selectors["review_id_attr"])
        if not review_id:
            skipped_without_id += 1
            continue

        results.append(
            Review(
                review_id=review_id,
                competitor_id=competitor_id,
                branch_id=branch_id,
                reviewer_name=_safe_parse_reviewer_name(item, selectors),
                rating=_safe_parse_rating(item, selectors),
                text=_safe_parse_text(item, selectors),
                relative_date=_safe_parse_date(item, selectors),
                scraped_at=scraped_at,
            )
        )

    if skipped_without_id:
        logger.info(
            "parse_reviews[%s]: skipped %d item(s) without %s",
            competitor_id,
            skipped_without_id,
            selectors["review_id_attr"],
        )

    logger.info(
        "parse_reviews[%s]: %d review(s) parsed from %d item(s)",
        competitor_id,
        len(results),
        len(items),
    )
    return results


def _safe_parse_reviewer_name(item: Selector, selectors: dict) -> str | None:
    """Return the reviewer name from the item's `aria-label`, or None.

    Google decorates the review-item container with `aria-label="<name> ·
    original"` for accessibility. We use this rather than a separate
    `<span class="d4r55">` selector because it is on the same element we
    match for `review_item` — fewer selector dependencies, less to break
    when Google ships a redesign.
    """
    try:
        attr = selectors.get("reviewer_name_attr", "aria-label")
        return item.attrib.get(attr)
    except Exception as e:
        logger.debug("reviewer_name parse failed: %s", e)
        return None


def _safe_parse_rating(item: Selector, selectors: dict) -> float | None:
    """Extract the numeric rating (1.0–5.0) from the rating star span.

    The span's `aria-label` is a human string like "4 out of 5 stars" or
    "Rated 5 out of 5". We regex-extract the leading digit. Returns None
    on any failure (missing element, non-matching label, etc.).
    """
    try:
        rating_selector = selectors["rating_selector"]
        rating_attr = selectors.get("rating_attr", "aria-label")
        label = item.css(rating_selector).attrib.get(rating_attr)
        if not label:
            return None
        match = _RATING_PATTERN.search(label)
        if not match:
            return None
        return float(match.group(1))
    except Exception as e:
        logger.debug("rating parse failed: %s", e)
        return None


def _safe_parse_text(item: Selector, selectors: dict) -> str | None:
    """Return the review body text, stripped of surrounding whitespace.

    Returns None if the selector doesn't match (some reviews have no text,
    only a rating — that's a valid Google Maps state, not a parse error).
    """
    try:
        node = item.css(selectors["review_text_selector"])
        if not node:
            return None
        # `::text` would be cleaner but `css` already returns the matched
        # element; `.get()` returns its HTML. Use `xpath('./text()')` on
        # the matched node to get the inner text instead.
        text = node.xpath("string(.)").get()
        return text.strip() if text else None
    except Exception as e:
        logger.debug("text parse failed: %s", e)
        return None


def _safe_parse_date(item: Selector, selectors: dict) -> str | None:
    """Return the relative-date string (e.g. "a week ago", "2 months ago").

    Google renders these as localized relative strings, not absolute dates.
    We keep them verbatim — converting to absolute dates is the dashboard's
    job (it requires locale handling and a "today" reference).
    """
    try:
        node = item.css(selectors["relative_date_selector"])
        if not node:
            return None
        text = node.xpath("string(.)").get()
        return text.strip() if text else None
    except Exception as e:
        logger.debug("relative_date parse failed: %s", e)
        return None
