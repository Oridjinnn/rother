from __future__ import annotations

import json
import logging
import time
from pathlib import Path

from harness.browser import setup_page_handlers
from harness.instrument import PipelineInstrument
from harness.scroll import scroll_review_container, collect_visible_review_count
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
    instrument: PipelineInstrument | None = None,
) -> bool:
    candidates = resolve_selectors(selectors, selector_key)
    primary = candidates[0] if candidates else None
    if not candidates:
        if instrument:
            instrument.record_selector(
                selector_key=selector_key, primary=None, fallback_used=False,
                matched=False, detail="not configured",
            )
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
    used_fallback = False
    for i, candidate in enumerate(candidates):
        t0 = time.time() if (tracker or instrument) else None
        try:
            page.wait_for_selector(candidate, timeout=_OPTIONAL_ELEMENT_TIMEOUT_MS)
            page.click(candidate, timeout=_OPTIONAL_ELEMENT_TIMEOUT_MS)
            if settle_ms:
                page.wait_for_timeout(settle_ms)
            duration_ms = (time.time() - t0) * 1000 if t0 else 0
            if instrument:
                instrument.record_selector(
                    selector_key=selector_key, primary=primary,
                    fallback_used=used_fallback, matched=True,
                    match_count=1, candidate=candidate,
                    duration_ms=duration_ms,
                )
            if tracker:
                tracker.record(
                    selector_key=selector_key,
                    selector_value=candidate,
                    found=True,
                    match_count=1,
                    duration_ms=duration_ms,
                    competitor_id=comp_id,
                    phase=phase,
                )
            return True
        except Exception as e:
            used_fallback = True
            duration_ms = (time.time() - t0) * 1000 if t0 else 0
            if instrument:
                instrument.record_selector(
                    selector_key=selector_key, primary=primary,
                    fallback_used=True, matched=False,
                    candidate=candidate, duration_ms=duration_ms,
                    detail=f"fallback {i + 1}/{len(candidates)}: {e}",
                )
            if tracker:
                tracker.record(
                    selector_key=selector_key,
                    selector_value=candidate,
                    found=False,
                    duration_ms=duration_ms,
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


_BUSINESS_META_SELECTORS = [
    "h1.fontHeadlineLarge",
    "div.fontHeadlineLarge",
    "span.fontHeadlineLarge",
    "div.aMPvhf-fI6EEc-KVuj8d",
]

_BUSINESS_RATING_SELECTORS = [
    "div.fontBodyMedium span[aria-label*='star']",
    "span.kvMYJc",
    "div.aMPvhf-fI6EEc-KVuj8d span[aria-label*='star']",
]


def _capture_business_metadata(page, instrument: PipelineInstrument | None = None) -> dict | None:
    """Extract business name, displayed rating, and displayed review count.

    Uses multiple extraction strategies in priority order:
    1. Structured JSON-LD data (most reliable)
    2. Page title + body text regex
    3. Known Google Maps CSS selectors
    """
    import json as json_mod
    import re

    metadata: dict = {}

    # Strategy 1: JSON-LD structured data
    try:
        jsonld = page.evaluate("""() => {
            const scripts = document.querySelectorAll('script[type="application/ld+json"]');
            for (const s of scripts) {
                try {
                    const data = JSON.parse(s.textContent);
                    if (data.name || (data.itemListElement && data.itemListElement[0])) {
                        return JSON.stringify(data);
                    }
                } catch(e) {}
            }
            return null;
        }""")
        if jsonld:
            parsed = json_mod.loads(jsonld)
            ld = parsed
            if not metadata.get("business_name"):
                name = ld.get("name") or (ld.get("itemListElement") and ld["itemListElement"][0].get("name"))
                if name:
                    metadata["business_name"] = str(name)[:200]
            if not metadata.get("google_rating"):
                agg = ld.get("aggregateRating") or {}
                rating = agg.get("ratingValue")
                if rating is not None:
                    metadata["google_rating"] = str(rating)
                count = agg.get("reviewCount")
                if count is not None:
                    metadata["google_review_count"] = str(count)
    except Exception:
        pass

    # Strategy 2: page title
    if not metadata.get("business_name"):
        try:
            title = page.title()
            if title:
                clean = re.sub(r"\s*[-–|].*$", "", title).strip()
                if clean:
                    metadata["business_name"] = clean[:200]
        except Exception:
            pass

    # Strategy 3: Google Maps h1 / header selectors
    try:
        name_selectors = [
            "h1.fontHeadlineLarge",
            "h1",
            "[itemprop='name']",
            "div[role='main'] h1",
        ]
        for sel in name_selectors:
            el = page.query_selector(sel)
            if el:
                text = el.inner_text()
                if text and text.strip():
                    metadata["business_name"] = text.strip()[:200]
                    break
    except Exception:
        pass

    # Strategy 4: body text regex for review count + rating
    try:
        body_text = page.locator("body").inner_text(timeout=3000)[:8000]

        if not metadata.get("google_review_count"):
            review_matches = list(re.finditer(r"(\d[\d,.]*)\s*reviews?", body_text[:5000], re.IGNORECASE))
            if review_matches:
                metadata["google_review_count"] = review_matches[0].group(1)

        if not metadata.get("google_rating"):
            rating_match = re.search(r"(\d[.,]?\d*)\s*stars?", body_text[:3000], re.IGNORECASE)
            if not rating_match:
                rating_match = re.search(r"(\d[.,]?\d*)\s*[(][\d,]+[)]", body_text[:3000])
            if not rating_match:
                rating_match = re.search(r"(\d[.,]?\d*)\s*out\s*of\s*5", body_text[:3000], re.IGNORECASE)
            if rating_match:
                metadata["google_rating"] = rating_match.group(1)
    except Exception:
        pass

    result = metadata if metadata else None
    if instrument and result:
        instrument.set_business_metadata(result)
    return result


def _safe_screenshot(page, spath: Path, name: str) -> str | None:
    try:
        full = spath / name
        page.screenshot(path=str(full), full_page=False)
        return str(full)
    except Exception as e:
        logger.warning("screenshot %s failed: %s", name, e)
        return None


def _path_traversal_check(spath: Path) -> bool:
    resolved = spath.resolve()
    if ".." in str(spath) or ".." in str(resolved):
        logger.error("Path traversal detected in %r — skipping evidence save", str(spath))
        return False
    return True


def _verify_reviews_dialog(page, selectors: dict, comp_id: str, instrument: PipelineInstrument | None = None) -> bool:
    """Prove the Reviews dialog opened after clicking the Reviews tab.

    Tries selectors from config (review_dialog, review_container) and known
    Google Maps patterns. Logs a WARNING if none match — this is the early
    warning that the Reviews tab click may not have worked.
    """
    from harness.selectors import resolve_selectors
    candidates = []
    for key in ("review_dialog", "review_container"):
        candidates.extend(resolve_selectors(selectors, key))
    candidates.extend([
        "div[role='dialog'] div.m6QErb",
        "div.m6QErb.DxyBCb",
        "div[aria-label*='review' i]",
    ])
    for candidate in candidates:
        try:
            el = page.wait_for_selector(candidate, timeout=3000)
            if el:
                logger.info(
                    "REVIEWS_DIALOG[%s] detected via %r",
                    comp_id, candidate,
                )
                if instrument:
                    instrument.record_selector(
                        selector_key="review_dialog", primary=candidate,
                        fallback_used=False, matched=True,
                        match_count=1, candidate=candidate,
                        detail="Reviews dialog confirmed open",
                    )
                return True
        except Exception:
            continue
    logger.warning(
        "REVIEWS_DIALOG[%s] NOT detected — Reviews tab click may have "
        "failed or the DOM has changed. Proceeding with scroll anyway; "
        "the parser will report 0 reviews if none are found.",
        comp_id,
    )
    if instrument:
        instrument.record_selector(
            selector_key="review_dialog", primary=None,
            fallback_used=True, matched=False,
            detail="No candidate selector matched — Reviews dialog may not be open",
        )
    return False


def capture_listing_html(
    context,
    url: str,
    selectors: dict,
    screenshot_dir: str | None = None,
    tracker=None,
    comp_id: str = "",
    total_timeout_s: int = 90,
    instrument: PipelineInstrument | None = None,
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

        if instrument:
            instrument.start_phase("navigation")

        t0 = time.time()
        try:
            page.goto(url, timeout=30000)
        except Exception as e:
            if instrument:
                instrument.end_phase("fail", detail=str(e))
            raise _classify_navigation_error(url, e)
        phase_timings["goto"] = round(time.time() - t0, 2)
        if instrument:
            instrument.end_phase("success", detail=f"loaded {url[:80]}...")

        if screenshot_dir:
            spath = Path(screenshot_dir)
            if not _path_traversal_check(spath):
                spath = None
            if spath:
                spath.mkdir(parents=True, exist_ok=True)
                shot = _safe_screenshot(page, spath, "01-business-loaded.png")
                if shot and instrument:
                    instrument.record_screenshot("business_loaded", shot)

        if instrument:
            instrument.start_phase("cookie_dialog")
        t0 = time.time()
        _fallback_click(page, "cookie_reject_button", selectors, tracker=tracker, comp_id=comp_id, phase="dismiss_cookie", instrument=instrument)
        phase_timings["cookie"] = round(time.time() - t0, 2)
        if instrument:
            instrument.end_phase()
        if time.time() > deadline:
            raise CaptureTimeoutError("cookie", time.time() - start, total_timeout_s)

        if instrument:
            instrument.start_phase("reviews_tab_click")
        t0 = time.time()
        reviews_clicked = _fallback_click(page, "reviews_tab_button", selectors, tracker=tracker, comp_id=comp_id, phase="click_reviews_tab", settle_ms=1500, instrument=instrument)
        phase_timings["reviews_tab"] = round(time.time() - t0, 2)
        if instrument:
            status = "success" if reviews_clicked else "fail"
            instrument.end_phase(status, detail="Reviews button clicked" if reviews_clicked else "Reviews button not found")

        if screenshot_dir and spath:
            shot = _safe_screenshot(page, spath, f"02-reviews-{'opened' if reviews_clicked else 'not-found'}.png")
            if shot and instrument:
                instrument.record_screenshot("after_reviews_click", shot)

        if instrument:
            instrument.start_phase("reviews_dialog_verify")
        _verify_reviews_dialog(page, selectors, comp_id, instrument)
        if instrument:
            instrument.end_phase()

        if time.time() > deadline:
            raise CaptureTimeoutError("reviews_tab", time.time() - start, total_timeout_s)

        if instrument:
            instrument.start_phase("scroll")
        t0 = time.time()
        scroll_result = scroll_review_container(page, selectors, tracker=tracker, comp_id=comp_id, deadline=deadline, instrument=instrument)
        phase_timings["scroll"] = round(time.time() - t0, 2)
        if instrument:
            instrument.end_phase()
            if scroll_result:
                for entry in scroll_result.get("scroll_progress", []):
                    instrument.record_scroll_iteration(
                        iteration=entry["iteration"],
                        height=entry["height"],
                        visible_cards=entry["visible_cards"],
                        dom_nodes=entry["dom_nodes"],
                        stable=entry["stable"],
                        bottom_reason=entry.get("bottom_reason"),
                    )

        if screenshot_dir and spath:
            shot = _safe_screenshot(page, spath, "03-after-scroll.png")
            if shot and instrument:
                instrument.record_screenshot("after_scroll", shot)

            final_shot = _safe_screenshot(page, spath, "04-final-state.png")
            if final_shot and instrument:
                instrument.record_screenshot("final_state", final_shot)

        if instrument:
            instrument.start_phase("expand_reviews")
        t0 = time.time()
        _fallback_expand(page, selectors, tracker=tracker, comp_id=comp_id, instrument=instrument)
        phase_timings["expand"] = round(time.time() - t0, 2)
        if instrument:
            instrument.end_phase()

        if instrument:
            instrument.start_phase("html_capture")
        html = page.content()

        _validate_capture_output(html, comp_id, logger)
        if instrument:
            instrument.end_phase("success", detail=f"{len(html)} bytes captured")

        if instrument:
            instrument.start_phase("business_metadata")
        _capture_business_metadata(page, instrument)
        if instrument:
            instrument.end_phase()

        if spath:
            spath.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(spath / "page.png"), full_page=True)
            spath.joinpath("page.html").write_text(html, encoding="utf-8")

        logger.info("capture[%s] phases: %s", comp_id, ", ".join(f"{k}={v}s" for k, v in phase_timings.items()))
        return html
    except NavigationError:
        if instrument:
            instrument.phase_result("navigation", "fail")
        raise
    except CaptureTimeoutError:
        if instrument:
            instrument.phase_result("capture_timeout", "fail")
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
    page, selectors: dict, tracker=None, comp_id: str = "",
    instrument: PipelineInstrument | None = None,
) -> None:
    candidates = resolve_selectors(selectors, "expand_text_button")
    primary = candidates[0] if candidates else None
    if not candidates:
        if instrument:
            instrument.record_selector(
                selector_key="expand_text_button", primary=None,
                fallback_used=False, matched=False, detail="not configured",
            )
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
    used_fallback = False
    for i, candidate in enumerate(candidates):
        t0 = time.time() if (tracker or instrument) else None
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
            duration_ms = (time.time() - t0) * 1000 if t0 else 0
            if instrument:
                instrument.record_selector(
                    selector_key="expand_text_button", primary=primary,
                    fallback_used=used_fallback, matched=clicked > 0,
                    match_count=clicked, candidate=candidate,
                    duration_ms=duration_ms,
                    detail=f"{clicked} button(s) clicked" if clicked else "no buttons found",
                )
        except Exception as e:
            used_fallback = True
            duration_ms = (time.time() - t0) * 1000 if t0 else 0
            if instrument:
                instrument.record_selector(
                    selector_key="expand_text_button", primary=primary,
                    fallback_used=True, matched=False,
                    candidate=candidate, duration_ms=duration_ms,
                    detail=f"fallback {i + 1}/{len(candidates)}: {e}",
                )
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
        logger.info("EXPAND[%s] expanded %d truncated review(s) via %s", comp_id, total_clicked, best_candidate)


def _dismiss_cookie_banner(
    page, selectors: dict, tracker=None, comp_id: str = "",
    instrument: PipelineInstrument | None = None,
) -> None:
    _fallback_click(page, "cookie_reject_button", selectors, tracker=tracker, comp_id=comp_id, phase="dismiss_cookie", instrument=instrument)


def _click_reviews_tab_if_present(
    page, selectors: dict, tracker=None, comp_id: str = "",
    instrument: PipelineInstrument | None = None,
) -> None:
    _fallback_click(page, "reviews_tab_button", selectors, tracker=tracker, comp_id=comp_id, phase="click_reviews_tab", settle_ms=1500, instrument=instrument)


def _expand_truncated_reviews(
    page, selectors: dict, tracker=None, comp_id: str = "",
    instrument: PipelineInstrument | None = None,
) -> None:
    _fallback_expand(page, selectors, tracker=tracker, comp_id=comp_id, instrument=instrument)
