from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from parsel import Selector

from harness.instrument import PipelineInstrument
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
    instrument: PipelineInstrument | None = None,
) -> list[Review]:
    sel = Selector(text=html)
    scraped_at = datetime.now(timezone.utc).isoformat()

    seed_review_item = _first(selectors, "review_item", "div.jftiEf.fontBodyMedium")
    review_id_attr = _first(selectors, "review_id_attr", "data-review-id")

    if instrument:
        instrument.start_phase("parse_locator")

    locator_result = resolve_review_items(
        sel,
        seed_review_item_selector=seed_review_item,
        review_id_attr=review_id_attr,
        competitor_id=competitor_id,
    )

    if instrument:
        if locator_result:
            instrument.end_phase("success", detail=f"tier {locator_result.tier} ({locator_result.selector}): {len(locator_result.items)} items")
        else:
            instrument.end_phase("fail", detail="all tiers failed")

    if locator_result is None:
        logger.error(
            "parse_reviews[%s]: all locator tiers failed — returning 0 reviews "
            "(this is a selector-breakage signal, surfaced by the orchestrator)",
            competitor_id,
        )
        if instrument:
            instrument.set_review_stats({
                "visible_cards": 0, "unique_ids": 0, "with_rating": 0,
                "with_text": 0, "missing_fields": 0, "skipped": 0,
                "parsed": 0, "exported": 0,
                "tier": None, "tier_selector": None,
            })
        return []

    items = locator_result.items

    results: list[Review] = []
    skipped_without_id = 0
    seen_ids: set[str] = set()
    with_rating = 0
    with_text = 0
    missing_fields = 0

    for item in items:
        review_id = item.attrib.get(review_id_attr)
        if not review_id:
            skipped_without_id += 1
            continue

        if review_id in seen_ids:
            continue
        seen_ids.add(review_id)

        rating = _safe_parse_rating(item, selectors)
        text = _safe_parse_text(item, selectors)
        if rating is None:
            missing_fields += 1
        if rating is not None:
            with_rating += 1
        if text and text.strip():
            with_text += 1

        results.append(
            Review(
                review_id=review_id,
                competitor_id=competitor_id,
                branch_id=branch_id,
                reviewer_name=_safe_parse_reviewer_name(item, selectors),
                rating=rating,
                text=text,
                relative_date=_safe_parse_date(item, selectors),
                scraped_at=scraped_at,
                owner_response=_safe_parse_owner_response(item, selectors),
            )
        )

    if skipped_without_id:
        logger.warning(
            "parse_reviews[%s]: skipped %d item(s) without '%s' "
            "(possible selector breakage — check review_id_attr config)",
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

    stats = {
        "visible_cards": len(seen_ids),
        "unique_ids": len(seen_ids),
        "with_rating": with_rating,
        "with_text": with_text,
        "missing_fields": missing_fields,
        "skipped": skipped_without_id,
        "parsed": len(results),
        "exported": len(results),
        "raw_item_matches": len(items),
        "tier": locator_result.tier,
        "tier_selector": locator_result.selector,
    }
    if instrument:
        instrument.set_review_stats(stats)

    logger.info(
        "REVIEW_STATS[%s] visible=%d unique=%d ratings=%d text=%d missing=%d skipped=%d parsed=%d",
        competitor_id,
        stats["visible_cards"], stats["unique_ids"], stats["with_rating"],
        stats["with_text"], stats["missing_fields"], stats["skipped"],
        stats["parsed"],
    )
    return results


def _safe_parse_reviewer_name(item: Selector, selectors: dict) -> str | None:
    try:
        attr = _first(selectors, "reviewer_name_attr", "aria-label")
        return item.attrib.get(attr)
    except Exception as e:
        logger.warning("reviewer_name parse failed for item %s: %s", item.attrib.get("data-review-id", "?"), e)
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
        logger.warning("rating parse failed for item %s: %s", item.attrib.get("data-review-id", "?"), e)
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
        logger.warning("text parse failed for item %s: %s", item.attrib.get("data-review-id", "?"), e)
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
        logger.warning("relative_date parse failed for item %s: %s", item.attrib.get("data-review-id", "?"), e)
        return None


def _safe_parse_owner_response(item: Selector, selectors: dict) -> str | None:
    """Best-effort extraction of the business owner's public reply.

    Google Maps nests an "owner response" section inside each review card when
    the business has replied. Selectors drift frequently, so we first honor an
    explicit ``owner_response_selector`` from config and otherwise fall back to
    a heuristic: any descendant whose text mentions a response. Returns the
    cleaned text (without the leading "Response from the owner" label) or None.
    """
    try:
        explicit = _first(selectors, "owner_response_selector")
        if explicit:
            node = item.css(explicit)
            if node:
                text = node.xpath("string(.)").get()
                if text and text.strip():
                    return _clean_owner_text(text)
        for node in item.xpath(
            ".//*[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', "
            "'abcdefghijklmnopqrstuvwxyz'), 'response')]"
        ):
            t = node.xpath("string(.)").get() or ""
            if "response" in t.lower():
                return _clean_owner_text(t)
    except Exception as e:
        logger.debug("owner_response parse failed for item %s: %s", item.attrib.get("data-review-id", "?"), e)
    return None


def _clean_owner_text(text: str) -> str | None:
    cleaned = re.sub(r"^[^:]*response[^:]*:\s*", "", text, flags=re.IGNORECASE).strip()
    return cleaned or None
