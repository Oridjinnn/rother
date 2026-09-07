from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("gbp-monitor.instrument")


class PipelineInstrument:
    def __init__(self, competitor_id: str):
        self.competitor_id = competitor_id
        self.phases: list[dict] = []
        self.selector_decisions: list[dict] = []
        self.screenshots: list[dict] = []
        self.review_stats: dict | None = None
        self.business_metadata: dict | None = None
        self.scroll_progress: list[dict] = []
        self.parser_efficiency: dict | None = None
        self.collection_verdict: dict | None = None
        self._phase_start: float | None = None
        self._current_phase: str | None = None
        self._overall_start = time.time()

    def start_phase(self, phase: str) -> None:
        now = time.time()
        self._current_phase = phase
        self._phase_start = now
        logger.info("PHASE[%s] %s — starting", self.competitor_id, phase)

    def end_phase(self, status: str = "success", detail: str | None = None) -> None:
        if self._phase_start is None or self._current_phase is None:
            logger.warning("end_phase called without matching start_phase")
            return
        duration = round(time.time() - self._phase_start, 3)
        entry = {
            "phase": self._current_phase,
            "status": status,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "duration_s": duration,
            "detail": detail,
        }
        self.phases.append(entry)
        logger.info(
            "PHASE[%s] %s — %s (%.3fs)%s",
            self.competitor_id,
            self._current_phase,
            status,
            duration,
            f" — {detail}" if detail else "",
        )
        self._current_phase = None
        self._phase_start = None

    def phase_result(self, phase: str, status: str = "success", detail: str | None = None) -> None:
        self.start_phase(phase)
        self.end_phase(status, detail)

    def record_selector(
        self,
        selector_key: str,
        primary: str | None = None,
        fallback_used: bool = False,
        matched: bool = False,
        match_count: int = 0,
        candidate: str | None = None,
        duration_ms: float = 0.0,
        detail: str | None = None,
    ) -> None:
        entry = {
            "selector_key": selector_key,
            "primary": primary,
            "fallback_used": fallback_used,
            "matched": matched,
            "match_count": match_count,
            "candidate_used": candidate,
            "duration_ms": round(duration_ms, 1),
            "detail": detail,
            "competitor_id": self.competitor_id,
        }
        self.selector_decisions.append(entry)
        log_level = logger.info if matched else logger.warning
        log_level(
            "SELECTOR[%s] %s primary=%s fallback=%s matched=%s count=%d%s",
            self.competitor_id,
            selector_key,
            primary or "?",
            fallback_used,
            matched,
            match_count,
            f" — {detail}" if detail else "",
        )

    def record_screenshot(self, phase: str, path: str) -> None:
        entry = {"phase": phase, "path": path, "timestamp": datetime.now(timezone.utc).isoformat()}
        self.screenshots.append(entry)
        logger.info("SCREENSHOT[%s] %s -> %s", self.competitor_id, phase, path)

    def set_review_stats(self, stats: dict) -> None:
        self.review_stats = stats
        logger.info(
            "REVIEW_STATS[%s] visible=%d unique_ids=%d ratings=%d text=%d "
            "missing_fields=%d skipped=%d parsed=%d exported=%d",
            self.competitor_id,
            stats.get("visible_cards", 0),
            stats.get("unique_ids", 0),
            stats.get("with_rating", 0),
            stats.get("with_text", 0),
            stats.get("missing_fields", 0),
            stats.get("skipped", 0),
            stats.get("parsed", 0),
            stats.get("exported", 0),
        )

    def record_scroll_iteration(self, iteration: int, height: int, visible_cards: int, dom_nodes: int, stable: int, bottom_reason: str | None = None) -> None:
        entry = {
            "iteration": iteration,
            "height": height,
            "visible_cards": visible_cards,
            "dom_nodes": dom_nodes,
            "stable": stable,
            "bottom_reason": bottom_reason,
        }
        self.scroll_progress.append(entry)
        logger.info(
            "SCROLL_ITER[%s] iter=%d height=%d visible=%d dom=%d stable=%d%s",
            self.competitor_id, iteration, height, visible_cards, dom_nodes, stable,
            f" bottom={bottom_reason}" if bottom_reason else "",
        )

    def set_business_metadata(self, metadata: dict) -> None:
        self.business_metadata = metadata
        name = metadata.get("business_name", "?")
        count = metadata.get("google_review_count", "?")
        rating = metadata.get("google_rating", "?")
        logger.info(
            "BUSINESS_META[%s] name=%s rating=%s reviews=%s",
            self.competitor_id, name, rating, count,
        )

    def set_parser_efficiency(self, efficiency: dict) -> None:
        self.parser_efficiency = efficiency
        logger.info(
            "PARSER_EFF[%s] google_count=%s dom_nodes=%d parsed=%d exported=%d pct=%.1f%%",
            self.competitor_id,
            efficiency.get("google_review_count", "?"),
            efficiency.get("dom_review_nodes", 0),
            efficiency.get("parsed_reviews", 0),
            efficiency.get("exported_reviews", 0),
            efficiency.get("parser_efficiency", 0.0),
        )

    def set_collection_verdict(self, verdict: dict) -> None:
        self.collection_verdict = verdict
        logger.info(
            "VERDICT[%s] status=%s reason=%s",
            self.competitor_id, verdict.get("status", "?"), verdict.get("reason", ""),
        )

    def total_elapsed(self) -> float:
        return round(time.time() - self._overall_start, 3)

    def to_dict(self) -> dict:
        d: dict[str, Any] = {
            "competitor_id": self.competitor_id,
            "overall_duration_s": self.total_elapsed(),
            "phases": list(self.phases),
            "selector_decisions": list(self.selector_decisions),
            "screenshots": list(self.screenshots),
        }
        if self.review_stats is not None:
            d["review_statistics"] = self.review_stats
        if self.business_metadata is not None:
            d["business_metadata"] = self.business_metadata
        if self.scroll_progress:
            d["scroll_progress"] = list(self.scroll_progress)
        if self.parser_efficiency is not None:
            d["parser_efficiency"] = self.parser_efficiency
        if self.collection_verdict is not None:
            d["collection_verdict"] = self.collection_verdict
        return d

    def pipeline_summary(self) -> dict:
        phases_ok = all(p["status"] == "success" for p in self.phases)
        selectors_ok = not any(d["matched"] is False for d in self.selector_decisions if d.get("detail") != "not configured")
        stats_ok = self.review_stats is not None
        scraped = (self.review_stats or {}).get("exported", 0)
        loaded = (self.review_stats or {}).get("visible_cards", 0)
        failed_phases = [p for p in self.phases if p["status"] != "success"]
        efficiency = self.parser_efficiency or {}
        verdict = self.collection_verdict or {}

        overall = "PASS" if (phases_ok and selectors_ok) else "FAIL"
        if verdict.get("status") == "FAIL":
            overall = "FAIL"

        return {
            "overall": overall,
            "competitor_id": self.competitor_id,
            "total_duration_s": self.total_elapsed(),
            "phases_ok": phases_ok,
            "selectors_ok": selectors_ok,
            "reviews_parsed": stats_ok,
            "phases_total": len(self.phases),
            "phases_failed": len(failed_phases),
            "failed_phases": [p["phase"] for p in failed_phases],
            "selectors_total": len(self.selector_decisions),
            "selectors_failed": sum(1 for d in self.selector_decisions if d["matched"] is False),
            "cards_loaded": loaded,
            "cards_parsed": scraped,
            "cards_missing": loaded - scraped if (loaded and scraped) else None,
            "google_review_count": (self.business_metadata or {}).get("google_review_count"),
            "google_rating": (self.business_metadata or {}).get("google_rating"),
            "collection_percent": efficiency.get("collection_percent"),
            "parser_efficiency_pct": efficiency.get("parser_efficiency"),
            "verdict": verdict.get("status"),
            "verdict_reason": verdict.get("reason"),
        }
