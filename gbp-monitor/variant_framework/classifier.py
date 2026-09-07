"""Deterministic variant classification for the M7 framework.

Classifies a captured page as FULL / REDUCED / UNKNOWN using ONLY explicit,
documented rules over evidence collected from the DOM. No machine learning,
no heuristics, no thresholds tuned by hand to pass.

Rules (each documented exactly):

    FULL   if any review card is present:
           - ``div.jftiEf`` element exists, OR
           - any element with a ``data-review-id`` attribute exists.
           Google's FULL variant embeds review cards in the initial HTML
           (M6 evidence: 3-5 unique ``data-review-id`` values).
           Confidence: 1.0 if unique_ids > 0; 0.5 if only raw matches.

    FULL   if a Reviews tab is present but no cards yet:
           - a ``[role=tab]`` whose label matches /ulasan|reviews?|avis/i.
           M6 evidence: the FULL variant shows the "Ulasan untuk X" tab at
           load even before cards render.
           Confidence: 0.6 (tab present, feed may not have rendered).

    REDUCED if the page loaded the known reduced layout:
           - at least 2 ``[role=tab]`` elements AND none of them is a
             Reviews tab AND zero review cards.
           M6 evidence: REDUCED shows only Ringkasan/Tentang tabs and never
           embeds reviews.
           Confidence: 0.9.

    UNKNOWN  otherwise:
           - zero review cards, fewer than 2 tabs, and no Reviews tab.
           Likely causes: page did not finish loading, an interstitial/
           consent/error page, or a NEW layout we have not seen. Confidence 0.0.
           This case is deliberately conservative — never guess.

``classify(snapshot)`` consumes a dict produced by the evidence collector:
    {unique_ids:int, raw_attr:int, jftiEf:int, role_tab_count:int,
     tabs:[labels], ...}
and returns {"variant": str, "confidence": float, "reason": str,
             "rules_applied": [str]}.
"""

from __future__ import annotations

import re

_REVIEWS_TAB_RE = re.compile(r"ulasan|reviews?|avis", re.IGNORECASE)


def classify(snapshot: dict) -> dict:
    """Classify one page snapshot into FULL / REDUCED / UNKNOWN."""
    unique_ids = int(snapshot.get("unique_ids", 0))
    raw_attr = int(snapshot.get("raw_attr", 0))
    jfti_ef = int(snapshot.get("jftiEf", 0))
    tabs = snapshot.get("tabs", []) or []
    role_tab_count = int(snapshot.get("role_tab_count", len(tabs)))
    has_reviews_tab = any(_REVIEWS_TAB_RE.search(t or "") for t in tabs)
    rules_applied: list[str] = []

    # Rule F1: review cards present.
    if unique_ids > 0:
        rules_applied.append("F1: unique data-review-id count > 0")
        return {
            "variant": "FULL", "confidence": 1.0,
            "reason": f"FULL: {unique_ids} unique review cards embedded in DOM",
            "rules_applied": rules_applied,
        }
    if jfti_ef > 0 or raw_attr > 0:
        rules_applied.append("F2: jftiEf/data-review-id raw matches present, unique=0")
        return {
            "variant": "FULL", "confidence": 0.5,
            "reason": f"FULL: {raw_attr} raw review-id matches but 0 unique ids",
            "rules_applied": rules_applied,
        }

    # Rule F3: Reviews tab present (FULL variant signal) even without cards.
    if has_reviews_tab:
        rules_applied.append("F3: Reviews tab present, no cards yet")
        return {
            "variant": "FULL", "confidence": 0.6,
            "reason": "FULL: Reviews tab present (feed may not have rendered)",
            "rules_applied": rules_applied,
        }

    # Rule R1: reduced layout — tabs exist, none is a Reviews tab, no cards.
    if role_tab_count >= 2:
        rules_applied.append("R1: >=2 tabs, no Reviews tab, zero cards")
        return {
            "variant": "REDUCED", "confidence": 0.9,
            "reason": f"REDUCED: {role_tab_count} tabs (Ringkasan/Tentang only), zero review cards",
            "rules_applied": rules_applied,
        }

    # Rule U1: everything else — cannot determine.
    rules_applied.append("U1: no cards, <2 tabs, no Reviews tab")
    return {
        "variant": "UNKNOWN", "confidence": 0.0,
        "reason": "UNKNOWN: page did not expose reviews, tabs, or a known reduced layout",
        "rules_applied": rules_applied,
    }
