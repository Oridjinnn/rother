from __future__ import annotations

import logging
import time

from harness.selectors import resolve_selectors

logger = logging.getLogger("gbp-monitor.scroll")

MAX_SCROLLS = 40
STABLE_THRESHOLD = 3
SCROLL_WAIT_MS = 2500


class SelectorNotFoundError(Exception):
    """Raised when review_container selector is absent (Google DOM change)."""


def _resolve_container_with_fallback(
    page, selectors: dict, tracker=None, comp_id: str = ""
) -> str:
    """Return the first matching review_container selector. Raises SelectorNotFoundError if none match."""
    candidates = resolve_selectors(selectors, "review_container")
    if not candidates:
        raise SelectorNotFoundError("review_container not configured in selectors.json")
    errors = []
    for i, candidate in enumerate(candidates):
        t0 = time.time() if tracker else None
        try:
            page.wait_for_selector(candidate, timeout=10000)
            if tracker:
                tracker.record(
                    selector_key="review_container",
                    selector_value=candidate,
                    found=True,
                    match_count=1,
                    duration_ms=(time.time() - t0) * 1000,
                    competitor_id=comp_id,
                    phase="scroll",
                )
            return candidate
        except Exception as e:
            errors.append(f"fallback {i + 1}/{len(candidates)} ({candidate}): {e}")
            if tracker:
                tracker.record(
                    selector_key="review_container",
                    selector_value=candidate,
                    found=False,
                    duration_ms=(time.time() - t0) * 1000,
                    error=str(e),
                    competitor_id=comp_id,
                    phase="scroll",
                )
            if i < len(candidates) - 1:
                logger.debug("review_container %s", errors[-1])
    logger.error("review_container all %d fallbacks failed: %s", len(candidates), "; ".join(errors))
    raise SelectorNotFoundError(
        f"review_container selector failed — all {len(candidates)} fallback(s) exhausted"
    )


def scroll_review_container(
    page, selectors: dict, tracker=None, comp_id: str = "", deadline: float | None = None
) -> None:
    container_selector = _resolve_container_with_fallback(
        page, selectors, tracker=tracker, comp_id=comp_id
    )

    previous_height = 0
    stable_count = 0
    for i in range(MAX_SCROLLS):
        if deadline is not None and time.time() >= deadline:
            logger.warning(
                "scroll[%s]: deadline exceeded after %d scroll(s) — "
                "returning partial data",
                comp_id, i,
            )
            break
        page.eval_on_selector(
            container_selector,
            "el => el.scrollTop = el.scrollHeight",
        )
        page.wait_for_timeout(SCROLL_WAIT_MS)
        current_height = page.eval_on_selector(
            container_selector,
            "el => el.scrollHeight",
        )

        if current_height == previous_height:
            stable_count += 1
            if stable_count >= STABLE_THRESHOLD:
                logger.debug(
                    "scroll stabilized after %d attempts (height=%s)",
                    i + 1,
                    current_height,
                )
                break
        else:
            stable_count = 0
        previous_height = current_height
    else:
        logger.debug(
            "scroll hit MAX_SCROLLS=%d without stabilizing "
            "(final height=%s) — large listing, results may be truncated",
            MAX_SCROLLS,
            previous_height,
        )
