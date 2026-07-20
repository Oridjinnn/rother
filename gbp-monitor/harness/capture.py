"""Capture one Google Maps listing's raw HTML.

Per GBP_MONITOR_PLAN.md Section 5.4. This module orchestrates a single listing:
open page → dismiss cookie banner → click reviews tab if present → scroll the
review container (loads lazy reviews) → expand truncated review text → return
page HTML. It does NOT parse the HTML — that is `parser/review_parser.py`'s
job.

The private helpers (`_dismiss_cookie_banner`, `_click_reviews_tab_if_present`,
`_expand_truncated_reviews`) wrap each step in try/except because these UI
states are optional (cookie banner may not appear, reviews tab may already be
active, expand buttons may not exist on this listing). They log a warning and
continue if the element simply is not present.

`scroll_review_container` is the one call whose `SelectorNotFoundError` MUST
NOT be swallowed here — it is the signal that Google changed the DOM, and the
orchestration layer (Section 6) needs to see it to log the listing + selector
and continue with the next listing per Rule 7.
"""

from __future__ import annotations

import logging

from harness.scroll import scroll_review_container

logger = logging.getLogger("gbp-monitor.capture")

# Conservative timeout for optional UI interactions (cookie banner, reviews
# tab, expand buttons). These are best-effort; we don't want to wait the full
# 10s of the scroll module's container wait when a banner simply isn't there.
_OPTIONAL_ELEMENT_TIMEOUT_MS = 4000


def capture_listing_html(context, url: str, selectors: dict) -> str:
    """Open `url`, drive it to the reviews state, return the raw HTML string.

    SelectorNotFoundError from `scroll_review_container` is intentionally NOT
    caught here — it propagates up to the orchestration layer for per-listing
    failure isolation + logging. All other optional-step failures are caught
    locally and logged as warnings.

    The caller owns the `context`; this function only opens and closes one
    page within it. The returned HTML is what `parser/review_parser.py`
    consumes.
    """
    page = context.new_page()
    try:
        page.goto(url, timeout=30000)
        _dismiss_cookie_banner(page, selectors)
        _click_reviews_tab_if_present(page, selectors)
        scroll_review_container(page, selectors)  # may raise SelectorNotFoundError
        _expand_truncated_reviews(page, selectors)
        html = page.content()
        return html
    finally:
        # `finally` (not bare `except`) so we still close the page on success
        # AND on the SelectorNotFoundError path. Not closing the page leaks a
        # tab per listing, which on a 12-listing run would tank memory.
        try:
            page.close()
        except Exception as close_err:  # pragma: no cover - defensive
            logger.warning("page.close() failed: %s", close_err)


def _dismiss_cookie_banner(page, selectors: dict) -> None:
    """Click the EU cookie consent 'Reject all' button if it appears.

    Google shows this banner to EU locales. We use an XPath selector (the
    seed value) so the cookie consent `Reject all` text is matched regardless
    of whether it's on a `<button>` or `<span>`. If the banner doesn't appear
    (non-EU locale, already dismissed), we just continue.
    """
    selector = selectors.get("cookie_reject_button")
    if not selector:
        return
    try:
        # `wait_for_selector` accepts XPath strings starting with `//` or
        # `//button[contains(...)]`. Verified against Playwright 1.57.
        page.wait_for_selector(selector, timeout=_OPTIONAL_ELEMENT_TIMEOUT_MS)
        page.click(selector, timeout=_OPTIONAL_ELEMENT_TIMEOUT_MS)
        logger.debug("dismissed cookie banner")
    except Exception as e:
        # Expected when no banner is shown — debug-level only to avoid noise.
        logger.debug("cookie banner not dismissed (likely not shown): %s", e)


def _click_reviews_tab_if_present(page, selectors: dict) -> None:
    """Click the 'Reviews' tab button on the listing page if present.

    Some listings deep-link directly to the reviews panel (e.g. when the URL
    has `?q=place_id:...` and the user lands on the overview). Others need
    the reviews tab clicked. Best-effort: if the tab isn't there, the reviews
    container selector in `scroll_review_container` will fail loudly later.
    """
    selector = selectors.get("reviews_tab_button")
    if not selector:
        return
    try:
        page.wait_for_selector(selector, timeout=_OPTIONAL_ELEMENT_TIMEOUT_MS)
        page.click(selector, timeout=_OPTIONAL_ELEMENT_TIMEOUT_MS)
        # Brief settle so the reviews panel can render before scrolling.
        page.wait_for_timeout(1500)
        logger.debug("clicked reviews tab")
    except Exception as e:
        logger.debug("reviews tab not clicked (likely already active): %s", e)


def _expand_truncated_reviews(page, selectors: dict) -> None:
    """Click each 'See more' / expand button on truncated reviews.

    Google truncates long review text with an ellipsis + a small expand
    button. Clicking all of them before capturing HTML ensures the parser
    sees the full text. Best-effort: if a button is mid-animation and the
    click misses, we log + continue rather than failing the whole capture.
    """
    selector = selectors.get("expand_text_button")
    if not selector:
        return
    try:
        # query_all returns handles that may go stale; click each defensively.
        buttons = page.query_selector_all(selector)
        for btn in buttons:
            try:
                btn.click(timeout=_OPTIONAL_ELEMENT_TIMEOUT_MS)
            except Exception as e:
                logger.debug("could not click one expand button: %s", e)
        logger.debug("expanded %d truncated review(s)", len(buttons))
    except Exception as e:
        # `query_selector_all` itself rarely raises, but be defensive.
        logger.debug("expand-truncated step skipped: %s", e)
