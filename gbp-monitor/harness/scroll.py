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
    page, selectors: dict, tracker=None, comp_id: str = "",
    instrument=None,
) -> str:
    candidates = resolve_selectors(selectors, "review_container")
    primary = candidates[0] if candidates else None
    if not candidates:
        raise SelectorNotFoundError("review_container not configured in selectors.json")
    errors = []
    used_fallback = False
    for i, candidate in enumerate(candidates):
        t0 = time.time() if tracker else None
        try:
            page.wait_for_selector(candidate, timeout=10000)
            duration_ms = (time.time() - t0) * 1000 if t0 else 0
            if instrument:
                instrument.record_selector(
                    selector_key="review_container", primary=primary,
                    fallback_used=used_fallback, matched=True,
                    match_count=1, candidate=candidate,
                    duration_ms=duration_ms,
                )
            if tracker:
                tracker.record(
                    selector_key="review_container",
                    selector_value=candidate,
                    found=True,
                    match_count=1,
                    duration_ms=duration_ms,
                    competitor_id=comp_id,
                    phase="scroll",
                )
            return candidate
        except Exception as e:
            used_fallback = True
            errors.append(f"fallback {i + 1}/{len(candidates)} ({candidate}): {e}")
            duration_ms = (time.time() - t0) * 1000 if t0 else 0
            if instrument:
                instrument.record_selector(
                    selector_key="review_container", primary=primary,
                    fallback_used=True, matched=False,
                    candidate=candidate, duration_ms=duration_ms,
                    detail=f"fallback {i + 1}/{len(candidates)}: {e}",
                )
            if tracker:
                tracker.record(
                    selector_key="review_container",
                    selector_value=candidate,
                    found=False,
                    duration_ms=duration_ms,
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


def _collect_dom_stats(page, container_selector: str) -> dict:
    """Count total DOM nodes and visible cards inside the container.

    Returns dict with total DOM nodes, visible cards count.

    NOTE (M5 live validation): Google Maps renders the SAME ``data-review-id``
    on multiple nested elements per review card (outer div, inner div, avatar
    button, ...). Raw attribute counting inflated the total 10-11x (33 DOM
    nodes for 3 distinct reviews). We now dedupe by review-id value so the
    numbers represent DISTINCT reviews, matching the parser's dedup.
    """
    try:
        result = page.eval_on_selector(
            container_selector,
            """el => {
                const raw = el.querySelectorAll('[data-review-id]');
                const ids = new Set();
                const visibleIds = new Set();
                const rect = el.getBoundingClientRect();
                for (const item of raw) {
                    const id = item.getAttribute('data-review-id');
                    if (!id) continue;
                    ids.add(id);
                    const ir = item.getBoundingClientRect();
                    if (ir.top < rect.bottom && ir.bottom > rect.top) {
                        visibleIds.add(id);
                    }
                }
                return {
                    total: ids.size,
                    visible: visibleIds.size,
                    raw_attr_matches: raw.length,
                    has_data_review_id: ids.size,
                };
            }""",
        )
        if isinstance(result, dict):
            return {
                "total": result.get("total", 0),
                "visible": result.get("visible", 0),
                "raw_attr_matches": result.get("raw_attr_matches", 0),
                "has_data_review_id": result.get("has_data_review_id", 0),
            }
        return {"total": 0, "visible": 0, "raw_attr_matches": 0, "has_data_review_id": 0}
    except Exception as e:
        logger.debug("_collect_dom_stats failed: %s", e)
        return {"total": 0, "visible": 0, "raw_attr_matches": 0, "has_data_review_id": 0}


def _detect_bottom(page, container_selector: str, previous_height: int, previous_dom: int) -> str | None:
    """Explicitly detect whether we have reached the bottom of the review list.

    Checks multiple signals and returns the reason if bottom is confirmed.
    Returns None if bottom is not confirmed.
    """
    try:
        current_height = page.eval_on_selector(
            container_selector, "el => el.scrollHeight",
        )

        current_dom = _collect_dom_stats(page, container_selector)["total"]

        height_unchanged = (current_height == previous_height)
        dom_unchanged = (current_dom == previous_dom) and (current_dom > 0)

        if height_unchanged and dom_unchanged:
            return "stable_scroll"

        spinner_visible = page.eval_on_selector(
            container_selector,
            """el => {
                const spinners = el.querySelectorAll('[class*=\"spinner\"], [class*=\"Spinner\"], [role=\"progressbar\"]');
                return spinners.length > 0;
            }""",
        )
        if not spinner_visible and height_unchanged:
            return "spinner_finished"

        sentinel_visible = page.eval_on_selector(
            container_selector,
            """el => {
                const all = el.querySelectorAll('*');
                for (const node of all) {
                    if (node.children.length === 0 && node.textContent.trim()) {
                        const txt = node.textContent.toLowerCase();
                        if (txt.includes('no more') || txt.includes('end') || txt.includes('showing all') || txt.includes('you\'ve seen')) {
                            return true;
                        }
                    }
                }
                return false;
            }""",
        )
        if sentinel_visible:
            return "sentinel_detected"

    except Exception as e:
        logger.debug("_detect_bottom check failed: %s", e)

    return None


def collect_visible_review_count(page, container_selector: str) -> int:
    """Simple wrapper returning visible count only (backward compat)."""
    stats = _collect_dom_stats(page, container_selector)
    return stats.get("visible", 0)


def scroll_review_container(
    page, selectors: dict, tracker=None, comp_id: str = "",
    deadline: float | None = None, instrument=None,
) -> dict | None:
    """Scroll the review container and return scroll progress data.

    Returns a dict with scroll_progress list and bottom_reason, or None if
    the container could not be resolved.
    """
    if instrument:
        instrument.start_phase("scroll_resolve_container")

    container_selector = _resolve_container_with_fallback(
        page, selectors, tracker=tracker, comp_id=comp_id, instrument=instrument
    )

    if instrument:
        instrument.end_phase()

    previous_height = 0
    previous_dom = 0
    stable_count = 0
    overall_start = time.time()
    scroll_progress: list[dict] = []
    bottom_reason: str | None = None

    for i in range(MAX_SCROLLS):
        if deadline is not None and time.time() >= deadline:
            bottom_reason = "timeout"
            logger.warning(
                "scroll[%s]: deadline exceeded after %d scroll(s) — "
                "returning partial data",
                comp_id, i,
            )
            break

        iter_start = time.time()
        iteration_label = f"scroll_iteration_{i + 1}"

        if instrument:
            instrument.start_phase(iteration_label)

        page.eval_on_selector(
            container_selector,
            "el => el.scrollTop = el.scrollHeight",
        )
        page.wait_for_timeout(SCROLL_WAIT_MS)

        current_height = page.eval_on_selector(
            container_selector,
            "el => el.scrollHeight",
        )

        dom_stats = _collect_dom_stats(page, container_selector)
        visible = dom_stats.get("visible", 0)
        dom_nodes = dom_stats.get("total", 0)

        iter_duration = time.time() - iter_start

        bottom = _detect_bottom(page, container_selector, previous_height, previous_dom)
        if bottom and not bottom_reason:
            bottom_reason = bottom

        scroll_progress.append({
            "iteration": i + 1,
            "height": current_height,
            "visible_cards": visible,
            "dom_nodes": dom_nodes,
            "stable": stable_count,
            "bottom_reason": bottom_reason,
            "duration_s": round(iter_duration, 3),
        })

        if instrument:
            instrument.record_scroll_iteration(
                iteration=i + 1, height=current_height,
                visible_cards=visible, dom_nodes=dom_nodes,
                stable=stable_count, bottom_reason=bottom_reason,
            )

        detail = (
            f"height={current_height} visible_cards={visible} "
            f"dom_nodes={dom_nodes} stable={stable_count}/{STABLE_THRESHOLD}"
        )

        if current_height == previous_height:
            stable_count += 1
            if stable_count >= STABLE_THRESHOLD and not bottom_reason:
                bottom_reason = "stable_scroll"
                if instrument:
                    instrument.end_phase("success", detail=f"{detail} — STABILIZED (bottom={bottom_reason})")
                logger.info(
                    "SCROLL[%s] iteration %d stabilized (height=%s, visible=%d, dom=%d, %.2fs)",
                    comp_id, i + 1, current_height, visible, dom_nodes, iter_duration,
                )
                break
            if instrument:
                instrument.end_phase("success", detail=detail)
        else:
            stable_count = 0
            if instrument:
                instrument.end_phase("success", detail=detail)

        previous_height = current_height
        previous_dom = dom_nodes

        if bottom_reason:
            logger.info(
                "SCROLL[%s] iteration %d bottom detected: %s (height=%s, visible=%d, dom=%d, %.2fs)",
                comp_id, i + 1, bottom_reason, current_height, visible, dom_nodes, iter_duration,
            )
            break

        logger.debug(
            "SCROLL[%s] iteration %d height=%s visible=%d dom=%d (%.2fs)",
            comp_id, i + 1, current_height, visible, dom_nodes, iter_duration,
        )
    else:
        bottom_reason = "max_scroll"
        logger.info(
            "SCROLL[%s] hit MAX_SCROLLS=%d without stabilizing "
            "(final height=%s, last visible=%d, dom=%d) — results may be truncated",
            comp_id, MAX_SCROLLS, previous_height,
            scroll_progress[-1]["visible_cards"] if scroll_progress else 0,
            scroll_progress[-1]["dom_nodes"] if scroll_progress else 0,
        )

    total_scrolls = len(scroll_progress)
    max_visible = max((s["visible_cards"] for s in scroll_progress), default=0)

    if bottom_reason is None:
        bottom_reason = "unknown"

    if instrument:
        instrument.phase_result(
            "scroll_complete", "success",
            detail=f"{total_scrolls} scrolls, max visible={max_visible}, final height={previous_height}, bottom={bottom_reason}",
        )

    logger.info(
        "SCROLL_COMPLETE[%s] %d scroll(s), max_visible=%d, final_height=%s, bottom=%s, %.2fs total",
        comp_id, total_scrolls, max_visible, previous_height,
        bottom_reason, time.time() - overall_start,
    )

    return {
        "scroll_progress": scroll_progress,
        "bottom_reason": bottom_reason,
        "total_scrolls": total_scrolls,
        "max_visible_cards": max_visible,
        "final_height": previous_height,
        "total_duration_s": round(time.time() - overall_start, 3),
    }
