from __future__ import annotations

from datetime import datetime, timezone


class SelectorTracker:
    def __init__(self) -> None:
        self._entries: list[dict] = []

    def record(
        self,
        *,
        selector_key: str,
        selector_value: str | None,
        found: bool,
        match_count: int = 0,
        duration_ms: float = 0.0,
        error: str | None = None,
        expected_missing: bool = False,
        competitor_id: str = "",
        phase: str = "",
    ) -> None:
        self._entries.append(
            {
                "selector_key": selector_key,
                "selector_value": selector_value,
                "found": found,
                "match_count": match_count,
                "duration_ms": round(duration_ms, 1),
                "error": error,
                "expected_missing": expected_missing,
                "competitor_id": competitor_id,
                "phase": phase,
            }
        )

    def get_report(self, configured_selectors: dict | None = None) -> dict:
        configured_keys = list(configured_selectors.keys()) if configured_selectors else []

        meta_keys: set[str] = {"last_verified", "verified_by", "_verification_note", "_meta"}
        relevant_keys = [k for k in configured_keys if k not in meta_keys]
        tested_keys: set[str] = {e["selector_key"] for e in self._entries}
        not_tested = [k for k in relevant_keys if k not in tested_keys]

        by_selector: dict[str, dict] = {}
        for key in relevant_keys:
            entries = [e for e in self._entries if e["selector_key"] == key]
            if not entries:
                by_selector[key] = {
                    "selector_value": (configured_selectors or {}).get(key),
                    "status": "not_evaluated",
                    "note": "verify mode did not exercise this selector",
                    "total_lookups": 0,
                }
                continue

            found_count = sum(1 for e in entries if e["found"])
            expected_missing_count = sum(1 for e in entries if e.get("expected_missing"))
            durations = [e["duration_ms"] for e in entries if e["duration_ms"] > 0]
            avg_dur = round(sum(durations) / len(durations), 1) if durations else None
            all_errors = [e["error"] for e in entries if e["error"]]

            total_attempts = len(entries)
            # Confidence: found / total, treating expected_missing as neutral (banner may not appear)
            effective_found = found_count + expected_missing_count
            confidence = round(effective_found / total_attempts, 3) if total_attempts > 0 else 0.0

            if found_count == len(entries):
                status = "healthy"
            elif found_count > 0:
                status = "degraded"
            elif expected_missing_count == len(entries):
                status = "healthy"
            else:
                status = "broken"

            by_selector[key] = {
                "selector_value": (configured_selectors or {}).get(key),
                "status": status,
                "confidence": confidence,
                "total_lookups": total_attempts,
                "times_found": found_count,
                "times_not_found": total_attempts - found_count,
                "expected_missing_count": expected_missing_count,
                "avg_duration_ms": avg_dur,
                "error_examples": all_errors[:3],
                "per_competitor": {
                    e["competitor_id"]: {
                        "found": e["found"],
                        "match_count": e["match_count"],
                        "duration_ms": e["duration_ms"],
                        "error": e["error"],
                    }
                    for e in entries
                },
            }

        healthy = sum(1 for s in by_selector.values() if s.get("status") == "healthy")
        degraded = sum(1 for s in by_selector.values() if s.get("status") == "degraded")
        broken = sum(1 for s in by_selector.values() if s.get("status") == "broken")
        not_evaluated = sum(1 for s in by_selector.values() if s.get("status") == "not_evaluated")
        avg_confidence = (
            round(
                sum(s["confidence"] for s in by_selector.values() if "confidence" in s)
                / max(len([s for s in by_selector.values() if "confidence" in s]), 1),
                3,
            )
            if by_selector
            else 0.0
        )

        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "selectors_configured": len(relevant_keys),
            "selectors_tested": len(tested_keys),
            "selectors_not_tested": not_tested,
            "healthy": healthy,
            "degraded": degraded,
            "broken": broken,
            "not_evaluated": not_evaluated,
            "avg_confidence": avg_confidence,
            "by_selector": by_selector,
            "details": list(self._entries),
        }
