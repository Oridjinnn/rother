"""Scroll the Google Maps review container until its content stabilizes.

Per GBP_MONITOR_PLAN.md Section 5.3. The review list on Google Maps lazy-loads
more items as the user scrolls; we keep scrolling until 3 consecutive
attempts produce no height change, capped at MAX_SCROLLS so we never loop
forever on a page that infinitely grows.

If the review container selector itself cannot be located, this module raises
`SelectorNotFoundError`. That exception MUST propagate up to the orchestration
layer (Section 6) — it is NOT a recoverable per-listing blip, it is a signal
that Google changed the DOM and `config/selectors.json` may need updating.
"""

from __future__ import annotations

import logging
import time

logger = logging.getLogger("gbp-monitor.scroll")

# Tuning constants per Section 5.3 of the plan.
MAX_SCROLLS = 40
STABLE_THRESHOLD = 3
SCROLL_WAIT_MS = 2500


class SelectorNotFoundError(Exception):
    """Raised when a CSS selector expected to be present on the page is not.

    Distinct from generic Playwright timeouts/network errors so the
    orchestration layer can tell "Google changed its DOM" (this) from
    "transient network blip" (other exceptions). See EXECUTION_RULES.md
    Rule 7 and GBP_MONITOR_PLAN.md Section 6.
    """


def scroll_review_container(
    page, selectors: dict, tracker=None, comp_id: str = ""
) -> None:
    """Scroll `selectors["review_container"]` until content height stabilizes.

    Strategy:
      1. Wait for the container to appear (10s timeout). If it doesn't, raise
         `SelectorNotFoundError` — this propagates to the orchestration layer
         which logs the failing listing and selector, then continues to the
         next listing per Rule 7.
      2. Repeatedly set `container.scrollTop = scrollHeight` to jump to the
         bottom, then wait `SCROLL_WAIT_MS` for Google to lazy-load more.
      3. If the height does not change for `STABLE_THRESHOLD` consecutive
         attempts, stop early (we've reached the end of the list).
      4. Hard cap at `MAX_SCROLLS` to bound runtime on listings with thousands
         of reviews (per Section 5.3).
    """
    container_selector = selectors["review_container"]

    # `wait_for_selector` raises `playwright._impl._errors.TimeoutError` (or
    # `Error`) if the element does not appear within the timeout. We re-raise
    # as `SelectorNotFoundError` so the caller can distinguish DOM changes
    # from other failures. Verified API: `wait_for_selector(selector, *,
    # timeout=None, state=None, strict=None)` against Playwright 1.57.
    t0 = time.time() if tracker else None
    try:
        page.wait_for_selector(container_selector, timeout=10000)
        if tracker:
            tracker.record(
                selector_key="review_container",
                selector_value=container_selector,
                found=True,
                match_count=1,
                duration_ms=(time.time() - t0) * 1000,
                competitor_id=comp_id,
                phase="scroll",
            )
    except Exception as e:
        if tracker:
            tracker.record(
                selector_key="review_container",
                selector_value=container_selector,
                found=False,
                duration_ms=(time.time() - t0) * 1000,
                error=str(e),
                competitor_id=comp_id,
                phase="scroll",
            )
        raise SelectorNotFoundError(
            f"review_container selector failed: {container_selector}"
        ) from e

    previous_height = 0
    stable_count = 0
    for i in range(MAX_SCROLLS):
        # Verified API: `eval_on_selector(selector, expression, arg=None, *,
        # strict=None)` against Playwright 1.57. Returns the JS-evaluated
        # value (here, the integer scrollHeight). Using strict=False-style
        # behavior intentionally — Google Maps can momentarily have multiple
        # containers during transitions, and we want the first match.
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
        # `for/else` — runs only if the loop did NOT break. Logs that we hit
        # the hard cap; not an error, just a heads-up for very long listings.
        logger.debug(
            "scroll hit MAX_SCROLLS=%d without stabilizing "
            "(final height=%s) — large listing, results may be truncated",
            MAX_SCROLLS,
            previous_height,
        )
