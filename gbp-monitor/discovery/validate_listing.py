"""Cheap URL-reachability pre-check before committing to a Playwright capture.

Per GBP_MONITOR_PLAN.md Section 5.7. The plan calls for Spider (local mode,
not Spider Cloud) as the preferred tool here, with a plain HTTP HEAD/GET
fallback if Spider's Python binding proves impractical. Spider's `spider-py`
package is not part of `requirements.txt` (it would add an extra dependency
for a narrow HEAD/GET need) and the plain HTTP fallback is what the plan
explicitly allows. This decision is recorded in `CHANGELOG.md` per the
plan's instruction.

This pre-check is OPTIONAL — the orchestration layer (`run_all.py`) calls
it before the Playwright capture, but a `False` return only logs a warning
and skips the listing; it does NOT raise. The actual capture can still
fail (and be isolated) even if this check passed — Google can return 200
to HEAD but render an empty page, or rate-limit mid-scroll. This is a
fast-fail for the obvious "the URL is wrong / the place was deleted" case
to save a Playwright launch.
"""

from __future__ import annotations

import logging

import requests

logger = logging.getLogger("gbp-monitor.discovery")

# Google Maps has historically rejected HEAD requests on some listing URLs
# (returns 405). The fallback to a streaming GET (which we abort after the
# headers arrive) is the documented workaround per Section 5.7.
_TIMEOUT_SECONDS = 10
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def validate_listing(url: str) -> bool:
    """Return True if `url` appears reachable, False otherwise.

    Strategy (per Section 5.7 fallback):
      1. Try `requests.head(url, allow_redirects=True, timeout=_TIMEOUT)`.
         HEAD is cheap — no body download — but some Google endpoints 405.
      2. On any HEAD failure (405, network, etc.), fall back to
         `requests.get(url, stream=True, ...)` and call `raise_for_status`.
         `stream=True` means the body is not downloaded until we read it;
         we close the response immediately, so this is still cheap.
      3. Any non-2xx final status or network error → False.

    This function MUST NOT raise — it is a best-effort pre-check. Callers
    (the orchestration layer) treat a `False` return as a skip-with-warn,
    not as a hard failure. The real capture might still succeed even if
    this returns False (transient blip); the orchestration layer is the
    final authority on whether to proceed.
    """
    headers = {"User-Agent": _USER_AGENT, "Accept-Language": "en-US,en;q=0.9"}

    # Step 1 — HEAD.
    try:
        resp = requests.head(
            url,
            headers=headers,
            allow_redirects=True,
            timeout=_TIMEOUT_SECONDS,
        )
        # 2xx → reachable. 3xx shouldn't happen (allow_redirects=True) but
        # is also OK. 4xx/5xx → fall through to GET (some servers reject
        # HEAD with 405/403 but accept GET).
        if 200 <= resp.status_code < 400:
            logger.debug(
                "validate_listing[%s]: HEAD %s → reachable",
                url,
                resp.status_code,
            )
            return True
        logger.debug(
            "validate_listing[%s]: HEAD %s — falling back to GET",
            url,
            resp.status_code,
        )
    except requests.RequestException as e:
        logger.debug(
            "validate_listing[%s]: HEAD raised %s — falling back to GET",
            url,
            e,
        )

    # Step 2 — GET (streaming, headers only).
    try:
        with requests.get(
            url,
            headers=headers,
            allow_redirects=True,
            timeout=_TIMEOUT_SECONDS,
            stream=True,
        ) as resp:
            resp.raise_for_status()
            logger.debug(
                "validate_listing[%s]: GET %s → reachable",
                url,
                resp.status_code,
            )
            return True
    except requests.RequestException as e:
        logger.warning(
            "validate_listing[%s]: not reachable — %s",
            url,
            e,
        )
        return False
