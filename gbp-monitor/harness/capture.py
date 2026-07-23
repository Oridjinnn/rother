from __future__ import annotations

import logging
import time
from pathlib import Path

from harness.browser import setup_page_handlers
from harness.scroll import scroll_review_container
from harness.selectors import resolve_selectors

logger = logging.getLogger("gbp-monitor.capture")

_OPTIONAL_ELEMENT_TIMEOUT_MS = 4000


class NavigationError(Exception):
    """Raised when ``page.goto()`` fails with a specific error classification.

    Attributes:
        url: The URL that failed to load.
        category: One of ``"dns"``, ``"timeout"``, ``"http_error"``,
            ``"connection_refused"``, ``"ssl_error"``, ``"unknown"``.
        original: The original exception message.
    """

    def __init__(self, url: str, category: str, original: str):
        self.url = url
        self.category = category
        self.original = original
        super().__init__(f"[{category}] {url}: {original}")


class CaptureTimeoutError(Exception):
    """Raised when the full capture pipeline exceeds the total timeout.

    Uses Playwright-native timeouts (``page.set_default_timeout``) for
    individual operations and a wall-clock deadline for cross-stage
    enforcement — no threading. See ``docs/engineering/KILLCRITIC.md``
    for the full root-cause analysis.

    Attributes:
        stage: Which capture phase exceeded the deadline.
        elapsed_s: Total wall-clock seconds elapsed when the timeout fired.
        timeout_s: The configured total timeout value.
        probable_cause: Human-readable description of the likely cause.
        suggested_fix: Human-readable remediation advice.
    """

    def __init__(self, stage: str, elapsed_s: float, timeout_s: int):
        self.stage = stage
        self.elapsed_s = elapsed_s
        self.timeout_s = timeout_s
        self.probable_cause = (
            f"capture stage '{stage}' exceeded {timeout_s}s total timeout "
            f"(elapsed={elapsed_s:.1f}s)"
        )
        self.suggested_fix = (
            "Increase _CAPTURE_TOTAL_TIMEOUT_S in orchestration/run_all.py "
            "if the page genuinely needs more time, or investigate whether "
            "a bot interstitial / captcha is blocking the page load"
        )
        super().__init__(
            f"[CaptureTimeoutError] stage={stage} elapsed={elapsed_s:.1f}s "
            f"timeout={timeout_s}s"
        )


def _classify_navigation_error(url: str, exc: Exception) -> NavigationError:
    msg = str(exc).lower()
    if "dns" in msg or "dnsresolutionfailed" in msg or "enotfound" in msg or "ns_error_unknown_host" in msg:
        return NavigationError(url, "dns", str(exc))
    if "timeout" in msg or "timed out" in msg or "net::err_timed_out" in msg:
        return NavigationError(url, "timeout", str(exc))
    if "refused" in msg or "connection refused" in msg or "econnrefused" in msg:
        return NavigationError(url, "connection_refused", str(exc))
    if "ssl" in msg or "cert" in msg or "tls" in msg:
        return NavigationError(url, "ssl_error", str(exc))
    if "http error" in msg or "status code" in msg:
        return NavigationError(url, "http_error", str(exc))
    return NavigationError(url, "unknown", str(exc))


def _fallback_click(
    page,
    selector_key: str,
    selectors: dict,
    tracker=None,
    comp_id: str = "",
    phase: str = "",
    settle_ms: int = 0,
) -> bool:
    candidates = resolve_selectors(selectors, selector_key)
    if not candidates:
        if tracker:
            tracker.record(
                selector_key=selector_key,
                selector_value=None,
                found=False,
                competitor_id=comp_id,
                phase=phase,
                error="not configured",
            )
        return False
    for i, candidate in enumerate(candidates):
        t0 = time.time() if tracker else None
        try:
            page.wait_for_selector(candidate, timeout=_OPTIONAL_ELEMENT_TIMEOUT_MS)
            page.click(candidate, timeout=_OPTIONAL_ELEMENT_TIMEOUT_MS)
            if settle_ms:
                page.wait_for_timeout(settle_ms)
            if tracker:
                tracker.record(
                    selector_key=selector_key,
                    selector_value=candidate,
                    found=True,
                    match_count=1,
                    duration_ms=(time.time() - t0) * 1000,
                    competitor_id=comp_id,
                    phase=phase,
                )
            return True
        except Exception as e:
            if tracker:
                tracker.record(
                    selector_key=selector_key,
                    selector_value=candidate,
                    found=False,
                    duration_ms=(time.time() - t0) * 1000,
                    error=str(e),
                    expected_missing=True,
                    competitor_id=comp_id,
                    phase=phase,
                )
            if i < len(candidates) - 1:
                logger.debug("%s fallback %d/%d failed for %s: %s", selector_key, i + 1, len(candidates), comp_id, e)
            else:
                logger.debug("%s all %d fallback(s) failed for %s: %s", selector_key, len(candidates), comp_id, e)
    return False


def capture_listing_html(
    context,
    url: str,
    selectors: dict,
    screenshot_dir: str | None = None,
    tracker=None,
    comp_id: str = "",
    total_timeout_s: int = 90,
) -> str:
    phase_timings = {}
    page = context.new_page()
    setup_page_handlers(page, comp_id=comp_id)
    start = time.time()
    deadline = start + total_timeout_s
    try:
        # Playwright-native timeouts for individual operations. These cap
        # each single Playwright call (goto, wait_for_selector, click) so
        # no operation blocks forever. The total across all phases is
        # enforced by the wall-clock deadline checks below — no threading.
        page.set_default_navigation_timeout(30000)
        page.set_default_timeout(10000)

        t0 = time.time()
        try:
            page.goto(url, timeout=30000)
        except Exception as e:
            raise _classify_navigation_error(url, e)
        phase_timings["goto"] = round(time.time() - t0, 2)
        if time.time() > deadline:
            raise CaptureTimeoutError("goto", time.time() - start, total_timeout_s)

        t0 = time.time()
        _fallback_click(page, "cookie_reject_button", selectors, tracker=tracker, comp_id=comp_id, phase="dismiss_cookie")
        phase_timings["cookie"] = round(time.time() - t0, 2)
        if time.time() > deadline:
            raise CaptureTimeoutError("cookie", time.time() - start, total_timeout_s)

        t0 = time.time()
        _fallback_click(page, "reviews_tab_button", selectors, tracker=tracker, comp_id=comp_id, phase="click_reviews_tab", settle_ms=1500)
        phase_timings["reviews_tab"] = round(time.time() - t0, 2)
        if time.time() > deadline:
            raise CaptureTimeoutError("reviews_tab", time.time() - start, total_timeout_s)

        t0 = time.time()
        scroll_review_container(page, selectors, tracker=tracker, comp_id=comp_id, deadline=deadline)
        phase_timings["scroll"] = round(time.time() - t0, 2)

        t0 = time.time()
        _fallback_expand(page, selectors, tracker=tracker, comp_id=comp_id)
        phase_timings["expand"] = round(time.time() - t0, 2)

        html = page.content()

        # Validate captured HTML is non-trivial.
        _validate_capture_output(html, comp_id, logger)

        if screenshot_dir:
            spath = Path(screenshot_dir)
            spath.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(spath / "page.png"), full_page=True)
            spath.joinpath("page.html").write_text(html, encoding="utf-8")

        logger.info("capture[%s] phases: %s", comp_id, ", ".join(f"{k}={v}s" for k, v in phase_timings.items()))
        return html
    except NavigationError:
        raise
    except CaptureTimeoutError:
        raise
    finally:
        try:
            page.close()
        except Exception as close_err:
            logger.warning("page.close() failed: %s", close_err)


def _validate_capture_output(html: str, comp_id: str, log: logging.Logger) -> None:
    size = len(html)
    if size < 1024:
        log.error("CAPTURE_EMPTY[%s]: HTML is only %d bytes — page likely failed to load", comp_id, size)
    elif size < 10240:
        log.warning("CAPTURE_SMALL[%s]: HTML is only %d bytes — may be incomplete or an interstitial page", comp_id, size)
    else:
        log.info("capture[%s]: %d bytes captured", comp_id, size)


def _fallback_expand(
    page, selectors: dict, tracker=None, comp_id: str = ""
) -> None:
    candidates = resolve_selectors(selectors, "expand_text_button")
    if not candidates:
        if tracker:
            tracker.record(
                selector_key="expand_text_button",
                selector_value=None,
                found=False,
                competitor_id=comp_id,
                phase="expand",
                error="not configured",
            )
        return
    total_clicked = 0
    best_candidate = None
    for i, candidate in enumerate(candidates):
        t0 = time.time() if tracker else None
        try:
            buttons = page.query_selector_all(candidate)
            clicked = 0
            for btn in buttons:
                try:
                    btn.click(timeout=_OPTIONAL_ELEMENT_TIMEOUT_MS)
                    clicked += 1
                except Exception as e:
                    logger.debug("expand fallback %d/%d click failed: %s", i + 1, len(candidates), e)
            if clicked > total_clicked:
                total_clicked = clicked
                best_candidate = candidate
        except Exception as e:
            logger.debug("expand fallback %d/%d query failed: %s", i + 1, len(candidates), e)
        if tracker:
            tracker.record(
                selector_key="expand_text_button",
                selector_value=candidate,
                found=clicked > 0,
                match_count=clicked,
                duration_ms=(time.time() - t0) * 1000 if t0 else 0,
                competitor_id=comp_id,
                phase="expand",
            )
    if total_clicked > 0:
        logger.debug("expanded %d truncated review(s) via %s", total_clicked, best_candidate)


def _dismiss_cookie_banner(
    page, selectors: dict, tracker=None, comp_id: str = ""
) -> None:
    _fallback_click(page, "cookie_reject_button", selectors, tracker=tracker, comp_id=comp_id, phase="dismiss_cookie")


def _click_reviews_tab_if_present(
    page, selectors: dict, tracker=None, comp_id: str = ""
) -> None:
    _fallback_click(page, "reviews_tab_button", selectors, tracker=tracker, comp_id=comp_id, phase="click_reviews_tab", settle_ms=1500)


def _expand_truncated_reviews(
    page, selectors: dict, tracker=None, comp_id: str = ""
) -> None:
    _fallback_expand(page, selectors, tracker=tracker, comp_id=comp_id)
