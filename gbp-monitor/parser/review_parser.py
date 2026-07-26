from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from parsel import Selector

from harness.locator import resolve_review_items
from harness.selectors import resolve_selector
from .schema import Review

logger = logging.getLogger("gbp-monitor.parser")

_RATING_PATTERN = re.compile(r"(\d+(?:[.,]\d+)?)\s*(?:out\s*of\s*5\b|[\s/]*5|bintang|star|estrella|sterne)?", re.IGNORECASE)


def _first(selectors: dict, key: str, default: str = "") -> str:
    val = resolve_selector(selectors, key)
    return val if val else default


def parse_reviews(
    html: str,
    competitor_id: str,
    branch_id: str,
    selectors: dict,
) -> list[Review]:
    sel = Selector(text=html)
    scraped_at = datetime.now(timezone.utc).isoformat()

    seed_review_item = _first(selectors, "review_item", "div.jftiEf.fontBodyMedium")
    review_id_attr = _first(selectors, "review_id_attr", "data-review-id")

    locator_result = resolve_review_items(
        sel,
        seed_review_item_selector=seed_review_item,
        review_id_attr=review_id_attr,
        competitor_id=competitor_id,
    )
    if locator_result is None:
        logger.error(
            "parse_reviews[%s]: all locator tiers failed — returning 0 reviews "
            "(this is a selector-breakage signal, surfaced by the orchestrator)",
            competitor_id,
        )
        return []

    items = locator_result.items

    results: list[Review] = []
    skipped_without_id = 0
    seen_ids: set[str] = set()

    for item in items:
        review_id = item.attrib.get(review_id_attr)
        if not review_id:
            skipped_without_id += 1
            continue

        if review_id in seen_ids:
            continue
        seen_ids.add(review_id)

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
            review_id_attr,
        )

    logger.info(
        "parse_reviews[%s]: %d review(s) parsed from %d item(s) via tier %d (%r)",
        competitor_id,
        len(results),
        len(items),
        locator_result.tier,
        locator_result.selector,
    )
    return results


def _safe_parse_reviewer_name(item: Selector, selectors: dict) -> str | None:
    try:
        attr = _first(selectors, "reviewer_name_attr", "aria-label")
        return item.attrib.get(attr)
    except Exception as e:
        logger.debug("reviewer_name parse failed: %s", e)
        return None


def _safe_parse_rating(item: Selector, selectors: dict) -> float | None:
    try:
        rating_selector = _first(selectors, "rating_selector")
        if not rating_selector:
            return None
        rating_attr = _first(selectors, "rating_attr", "aria-label")
        label = item.css(rating_selector).attrib.get(rating_attr)
        if not label:
            return None
        match = _RATING_PATTERN.search(label)
        if not match:
            return None
        raw = match.group(1).replace(",", ".")
        return float(raw)
    except Exception as e:
        logger.debug("rating parse failed: %s", e)
        return None


def _safe_parse_text(item: Selector, selectors: dict) -> str | None:
    try:
        selector = _first(selectors, "review_text_selector")
        if not selector:
            return None
        node = item.css(selector)
        if not node:
            return None
        text = node.xpath("string(.)").get()
        return text.strip() if text else None
    except Exception as e:
        logger.debug("text parse failed: %s", e)
        return None


def _safe_parse_date(item: Selector, selectors: dict) -> str | None:
    try:
        selector = _first(selectors, "relative_date_selector")
        if not selector:
            return None
        node = item.css(selector)
        if not node:
            return None
        text = node.xpath("string(.)").get()
        return text.strip() if text else None
    except Exception as e:
        logger.debug("relative_date parse failed: %s", e)
        return None
