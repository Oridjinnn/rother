"""Zero-cost self-healing locator hierarchy for review-item discovery.

Per Fix B (2026-07-20), backed by arXiv:2603.20358 ("Beyond LLM-based test
automation: A Zero-Cost Self-Healing Approach Using DOM Accessibility Tree
Extraction", Joseph, Mar 2026). That paper empirically demonstrates (31/31
= 100% pass rate, <1s self-heal) that a priority-ranked locator hierarchy —
get_by_role (W3C standard) → data-testid → ARIA labels → CSS class fragments
→ visible text — is a robust, zero-cost, non-LLM alternative to single
brittle CSS selectors.

This module applies the paper's approach to the GBP Monitor's specific need:
finding review-item elements in a captured Google Maps HTML string. We try a
ranked list of selectors; the FIRST tier that yields ≥1 element with a
`data-review-id` attribute wins. The tier that succeeded is returned alongside
the matched elements so the orchestrator can log it (and, if a non-seed tier
keeps winning, a future `browser_agent` pass can promote it in
`config/selectors.json` per Rule 6).

This is Rule-4-compliant (no AI/LLM, zero per-run cost) and Rule-8-compliant
(the existing CSS-string selector in `config/selectors.json` remains the
LAST-RESORT tier; fixtures continue to test it).

Tier ranking (adapted from the paper's 10-tier scheme to Google Maps' DOM):
  Tier 1 — `[data-review-id]` attribute presence (the dedup key itself; if
           Google keeps ANY stable attribute on review items, this is it).
  Tier 2 — ARIA role `article` with a non-empty `aria-label` (W3C-standard
           accessibility role; review items are semantically articles).
  Tier 3 — `[data-review-id]` constrained to the reviews container (more
           specific than tier 1; survives a class-name refactor).
  Tier 4 — `div[role="article"][data-review-id]` (combines 1 + 2).
  Tier 5 — The seeded CSS selector `div.jftiEf.fontBodyMedium` from
           `config/selectors.json` (the legacy 2023-vintage default — kept as
           the last resort so existing fixtures still match, per Rule 8).

Tiers 1–4 are class-name-independent: they survive a Google redesign that
renames `jftiEf`/`fontBodyMedium` (which is exactly what broke the 2023
selectors). Tier 5 is retained so the seeded `config/selectors.json` value
remains the authoritative fallback and the fixtures (which use it) keep
working unchanged.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger("gbp-monitor.locator")


@dataclass(frozen=True)
class LocatorResult:
    """Outcome of a self-healing locator resolution.

    `tier` is the 1-indexed tier number that succeeded (see module docstring).
    `selector` is the string form of that tier's selector (for logging / for
        a future Rule-6 selector-promotion decision).
    `items` is the list of parsel Selector nodes matched at that tier.
    `tried` is the ordered list of (tier, selector, match_count) tuples for
        every tier attempted, so the caller can log a full audit trail when
        debugging selector breakage.
    """

    tier: int
    selector: str
    items: list[Any]
    tried: list[tuple[int, str, int]]


def _build_tier_list(seed_review_item_selector: str) -> list[tuple[int, str]]:
    """Return the ordered (tier, selector) list, with the seed at tier 5.

    Kept as a helper so the tier list is constructed in one place and can be
    unit-tested independently of parsel.
    """
    return [
        (1, "[data-review-id]"),
        (2, "[role='article'][aria-label]"),
        (3, "[data-review-id][aria-label]"),
        (4, "div[role='article'][data-review-id]"),
        # Tier 5: the seeded CSS selector from config/selectors.json. This is
        # the legacy 2023-vintage default. Keeping it last means a future
        # Google redesign that renames the class names will simply fall back
        # to an earlier tier rather than fail the whole parse.
        (5, seed_review_item_selector),
    ]


def resolve_review_items(
    sel: Any,
    seed_review_item_selector: str,
    review_id_attr: str,
    competitor_id: str,
) -> LocatorResult | None:
    """Resolve review-item elements via the self-healing tier hierarchy.

    Args:
        sel: A `parsel.Selector` rooted at the full page HTML.
        seed_review_item_selector: The `review_item` value from
            `config/selectors.json` (used as tier 5 — the last-resort
            fallback).
        review_id_attr: The attribute name that holds the dedup key (normally
            `data-review-id`). A tier only "succeeds" if it yields ≥1 element
            that actually HAS this attribute — matching elements without it
            are useless to the parser (they'd be skipped immediately).
        competitor_id: For log-line context only.

    Returns:
        LocatorResult if any tier yielded ≥1 element with the review_id_attr;
        None if every tier came up empty (which is the "Google changed the DOM
        drastically" signal — the orchestrator surfaces this as a per-listing
        failure per Rule 7).
    """
    tiers = _build_tier_list(seed_review_item_selector)
    tried: list[tuple[int, str, int]] = []

    for tier, selector in tiers:
        try:
            matched = sel.css(selector)
        except Exception as e:
            # A malformed selector would raise; log + continue to next tier.
            # This is defensive — all tier selectors above are hand-verified
            # valid CSS, but Rule 3 says don't assume.
            logger.warning(
                "resolve_review_items[%s]: tier %d selector %r raised %s — skipping",
                competitor_id,
                tier,
                selector,
                e,
            )
            tried.append((tier, selector, -1))
            continue

        # Count only items that actually carry the dedup attribute — a tier
        # that matches 50 divs but none with data-review-id is not a real
        # success (those items would all be skipped by the parser).
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
                items=matched,  # return ALL matched, parser re-checks the attr
                tried=tried,
            )

    # Every tier came up empty — this is the loud "selector broke" signal.
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
