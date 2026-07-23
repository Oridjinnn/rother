from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from harness.selectors import resolve_selector

logger = logging.getLogger("gbp-monitor.locator")


@dataclass(frozen=True)
class LocatorResult:
    tier: int
    selector: str
    items: list[Any]
    tried: list[tuple[int, str, int]]


def _build_tier_list(seed_review_item_selector: str) -> list[tuple[int, str]]:
    return [
        (1, "[data-review-id]"),
        (2, "[role='article'][aria-label]"),
        (3, "[data-review-id][aria-label]"),
        (4, "div[role='article'][data-review-id]"),
        (5, seed_review_item_selector),
    ]


def _resolve_field_selector(selectors: dict, key: str, default: str) -> str:
    val = resolve_selector(selectors, key)
    return val if val else default


def resolve_review_items(
    sel: Any,
    seed_review_item_selector: str,
    review_id_attr: str,
    competitor_id: str,
) -> LocatorResult | None:
    tiers = _build_tier_list(seed_review_item_selector)
    tried: list[tuple[int, str, int]] = []

    for tier, selector in tiers:
        try:
            matched = sel.css(selector)
        except Exception as e:
            logger.warning(
                "resolve_review_items[%s]: tier %d selector %r raised %s — skipping",
                competitor_id,
                tier,
                selector,
                e,
            )
            tried.append((tier, selector, -1))
            continue

        with_id = [
            m for m in matched if m.attrib.get(review_id_attr)
        ]
        tried.append((tier, selector, len(with_id)))

        if with_id:
            logger.info(
                "resolve_review_items[%s]: tier %d succeeded with %d item(s) "
                "(selector=%r); tried tiers=%s",
                competitor_id,
                tier,
                len(with_id),
                selector,
                [(t, n) for t, _, n in tried],
            )
            return LocatorResult(
                tier=tier,
                selector=selector,
                items=matched,
                tried=tried,
            )

    logger.warning(
        "resolve_review_items[%s]: ALL %d tiers failed to find items with %s. "
        "Tried: %s. This is a selector-breakage signal — the orchestration "
        "layer should count this listing as failed per Rule 7.",
        competitor_id,
        len(tiers),
        review_id_attr,
        tried,
    )
    return None
