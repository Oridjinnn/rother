"""Orchestration: the ONLY place that loops branches × competitors.

Per GBP_MONITOR_PLAN.md Section 5.8 + EXECUTION_RULES.md Rule 7. This
module is the conductor: it loads configs, drives the per-listing pipeline
(capture → parse → delta → save), and — crucially — isolates each
listing's failures so one broken URL/selector cannot crash the whole run.

Modes:
  - LIVE (default):     Playwright captures real Google Maps HTML per
                        `config/listings.json` URLs. Requires the
                        Playwright Chromium binary installed.
  - `--fixtures`:       Skip Playwright entirely. Read each competitor's
                        HTML from `tests/fixtures/{competitor_id}.html`.
                        Proves the parser + storage + delta pipeline
                        end-to-end without hitting Google Maps (per
                        Section 5.5 testing requirement). Listings
                        without a fixture file are SKIPPED (not counted
                        as failures) so the "failed >= success" warning
                        signal stays meaningful.

Outputs (always):
  - `data/snapshots/{competitor_id}.json` — full review list per competitor
  - `data/reviews_new/{competitor_id}_{run_ts}.json` — only new reviews
    (delta vs the previous snapshot), written only when the delta is
    non-empty.
  - `data/run.log` — INFO/WARNING/ERROR lines for every step.
  - `data/run_summary.json` — the latest run's summary dict, for the
    Next.js dashboard to read. This is an addition to the plan's run.log
    summary line, documented in CHANGELOG.md.

Failure isolation (Rule 7):
  - Every per-listing exception is caught in the inner `try` block. The
    failure is logged with the competitor_id + error message, appended to
    `summary["errors"]`, and the loop continues to the next listing.
  - `SelectorNotFoundError` is NOT retried (per Section 6) — retrying a
    broken selector wastes time and looks like a bot hammering the page.
    Network/timeout errors are retried up to 2 times with backoff.
  - After the loop, if `failed >= success` we log a loud WARNING — this
    is the cheap "selector probably broke" alert discussed in Section 5.8.
"""

from __future__ import annotations

import argparse
import json
import logging
import random
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Configure the root logger so module-level `logging.getLogger("gbp-monitor.*")`
# loggers inherit the file handler. We also add a StreamHandler at WARNING+
# so the operator sees loud alerts on stdout too — the file gets everything.
_LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s %(message)s"
logging.basicConfig(
    level=logging.INFO,
    format=_LOG_FORMAT,
    handlers=[
        logging.FileHandler("data/run.log", encoding="utf-8"),
        logging.StreamHandler(sys.stderr),
    ],
)
logger = logging.getLogger("gbp-monitor.run_all")

# Module-level paths. Centralized so a future caller can monkey-patch them
# in tests if needed.
_LISTINGS_PATH = Path("config/listings.json")
_SELECTORS_PATH = Path("config/selectors.json")
_SNAPSHOT_DIR = Path("data/snapshots")
_REVIEWS_NEW_DIR = Path("data/reviews_new")
_SUMMARY_PATH = Path("data/run_summary.json")
_FIXTURES_DIR = Path("tests/fixtures")

# Per Section 6: at most 2 retries on network/timeout errors, with backoff.
_NETWORK_RETRY_MAX = 2
_NETWORK_RETRY_BACKOFF_S = (3.0, 7.0)  # 1st retry after 3s, 2nd after 7s

# Per Section 5.8: be polite between listings so we don't look like a bot
# hammering Google from a single IP. Only used in LIVE mode (fixtures mode
# hits local disk only, no need to sleep).
_LIVE_POLITE_DELAY_S = (5.0, 10.0)


def run(fixtures_mode: bool = False) -> dict:
    """Run one full pass over the configured branches × competitors.

    Args:
        fixtures_mode: If True, read HTML from `tests/fixtures/*.html`
            instead of doing live Playwright captures. Listings without a
            fixture file are skipped (not failures).

    Returns:
        The summary dict (also written to `data/run_summary.json`):
            {
              "started_at": ISO8601,
              "finished_at": ISO8601,
              "mode": "fixtures" | "live",
              "success": int,        # listings that produced a snapshot
              "failed": int,         # listings whose processing raised
              "skipped": int,        # listings with no fixture (fixtures
                                     #   mode only) or unreachable URL
              "new_reviews": int,    # total new reviews across all listings
              "total_reviews": int,  # total reviews in current snapshots
              "errors": [ {competitor_id, error}, ... ],
            }
    """
    started_at = datetime.now(timezone.utc).isoformat()
    mode = "fixtures" if fixtures_mode else "live"
    logger.info("=== run_all START mode=%s ===", mode)

    listings = json.loads(_LISTINGS_PATH.read_text(encoding="utf-8"))
    selectors = json.loads(_SELECTORS_PATH.read_text(encoding="utf-8"))

    summary = {
        "started_at": started_at,
        "finished_at": None,
        "mode": mode,
        "success": 0,
        "failed": 0,
        "skipped": 0,
        "new_reviews": 0,
        "total_reviews": 0,
        "errors": [],
    }

    # In LIVE mode we need a browser context for the whole run. In fixtures
    # mode we don't import Playwright at all — keeps `--fixtures` runnable
    # even when Playwright's browser binaries aren't installed (the
    # lazy-import inside `get_browser_context` ensures this).
    context = None
    browser_handles = None
    if not fixtures_mode:
        # Imported here (not at module top) so the `--fixtures` mode works
        # without Playwright installed at all.
        from harness.browser import get_browser_context

        try:
            browser_handles = get_browser_context()
            context = browser_handles[2]  # (playwright, browser, context)
        except Exception as e:
            # The whole run cannot proceed if we can't even launch a
            # browser in live mode. Record this as a single failure that
            # explains why nothing ran.
            logger.error(
                "FATAL: could not start browser in live mode: %s. "
                "Use --fixtures for a no-browser run.", e
            )
            summary["failed"] = 1
            summary["errors"].append(
                {"competitor_id": "__bootstrap__", "error": f"browser launch: {e}"}
            )
            _finish_and_write_summary(summary)
            return summary

    try:
        for branch in listings.get("branches", []):
            branch_id = branch.get("branch_id", "unknown-branch")
            for comp in branch.get("competitors", []):
                comp_id = comp.get("competitor_id", "unknown-competitor")
                _process_one_listing(
                    comp_id=comp_id,
                    branch_id=branch_id,
                    comp_name=comp.get("name", ""),
                    gmaps_url=comp.get("gmaps_url", ""),
                    selectors=selectors,
                    context=context,
                    fixtures_mode=fixtures_mode,
                    summary=summary,
                )
                # Polite delay only in live mode (hits Google) — fixtures
                # mode reads local files, no delay needed.
                if not fixtures_mode and _LIVE_POLITE_DELAY_S:
                    time.sleep(random.uniform(*_LIVE_POLITE_DELAY_S))
    finally:
        # Tear down the browser if we started one. `finally` so the
        # browser is closed even if the loop raised (which it shouldn't —
        # per-listing errors are caught in `_process_one_listing`).
        if browser_handles is not None:
            p, browser, ctx = browser_handles
            try:
                ctx.close()
            except Exception as e:
                logger.warning("context.close() failed: %s", e)
            try:
                browser.close()
            except Exception as e:
                logger.warning("browser.close() failed: %s", e)
            try:
                p.stop()
            except Exception as e:
                logger.warning("playwright.stop() failed: %s", e)

    _finish_and_write_summary(summary)
    return summary


def _process_one_listing(
    *,
    comp_id: str,
    branch_id: str,
    comp_name: str,
    gmaps_url: str,
    selectors: dict,
    context,
    fixtures_mode: bool,
    summary: dict,
) -> None:
    """Capture → parse → delta → save for one listing.

    All exceptions are caught here (Rule 7). The failure is logged, added
    to `summary["errors"]`, and `summary["failed"]` is incremented; the
    caller's loop continues to the next listing.
    """
    logger.info("listing: %s (%s / %s)", comp_id, branch_id, comp_name)

    # In fixtures mode, skip listings without a fixture file rather than
    # counting them as failures. This keeps the "failed >= success" alert
    # meaningful — a missing fixture is a development-environment gap,
    # not a selector breakage.
    if fixtures_mode:
        fixture_path = _FIXTURES_DIR / f"{comp_id}.html"
        if not fixture_path.exists():
            logger.info("no fixture for %s at %s — skipping", comp_id, fixture_path)
            summary["skipped"] += 1
            return

    try:
        # Step 0 (live mode only) — cheap reachability pre-check per
        # Section 5.7. Skip the listing if the URL doesn't resolve at all
        # — saves a Playwright launch + 30s navigation timeout for the
        # case where the place was deleted or the URL is malformed. In
        # fixtures mode we skip this check (local files are always
        # "reachable"). `validate_listing` MUST NOT raise per its own
        # contract; a False return is a skip, not a failure.
        if not fixtures_mode:
            from discovery.validate_listing import validate_listing

            if not validate_listing(gmaps_url):
                logger.warning(
                    "listing %s URL not reachable — skipping capture: %s",
                    comp_id,
                    gmaps_url,
                )
                summary["skipped"] += 1
                return

        # Step 1 — capture HTML.
        if fixtures_mode:
            html = (fixtures_path(comp_id)).read_text(encoding="utf-8")
            logger.info("read fixture %s (%d bytes)", comp_id, len(html))
        else:
            html = _capture_with_retries(context, gmaps_url, selectors, comp_id)

        # Step 2 — parse.
        # Lazy import keeps `--fixtures` mode from loading parser modules
        # if the import itself would fail (it won't, but the pattern is
        # consistent with the browser lazy-import).
        from parser.review_parser import parse_reviews
        from parser.schema import review_to_dict
        from storage.snapshot_store import load_snapshot, save_snapshot
        from storage.delta import compute_new_reviews

        parsed = parse_reviews(html, comp_id, branch_id, selectors)
        parsed_dicts = [review_to_dict(r) for r in parsed]

        # Step 3 — delta.
        old = load_snapshot(comp_id)
        delta = compute_new_reviews(old, parsed_dicts)

        # Step 4 — persist.
        if delta:
            _append_new_reviews(comp_id, delta)
            summary["new_reviews"] += len(delta)
            logger.info(
                "delta[%s]: %d new review(s) since last snapshot",
                comp_id,
                len(delta),
            )

        save_snapshot(comp_id, parsed_dicts)
        summary["success"] += 1
        summary["total_reviews"] += len(parsed_dicts)

    except Exception as e:
        # Rule 7: catch-all per-listing failure isolation. Log + record +
        # continue. We do NOT re-raise. SelectorNotFoundError is a subclass
        # of Exception and is handled here too — but it's logged distinctly
        # by the harness layer so the error string will say "review_container
        # selector failed" rather than a generic timeout.
        summary["failed"] += 1
        err = {"competitor_id": comp_id, "error": f"{type(e).__name__}: {e}"}
        summary["errors"].append(err)
        logger.error("FAILED listing %s: %s", comp_id, err["error"])


def _capture_with_retries(context, url: str, selectors: dict, comp_id: str) -> str:
    """Call `capture_listing_html` with up to 2 retries on transient errors.

    Per Section 6: do NOT retry `SelectorNotFoundError` (broken selector —
    retrying just hammers the page). Other exceptions (network, timeout)
    are retried up to `_NETWORK_RETRY_MAX` times with backoff.
    """
    from harness.capture import capture_listing_html
    from harness.scroll import SelectorNotFoundError

    last_exc: Exception | None = None
    for attempt in range(_NETWORK_RETRY_MAX + 1):
        try:
            return capture_listing_html(context, url, selectors)
        except SelectorNotFoundError:
            # Re-raise immediately — retrying a broken selector wastes
            # time and looks like a bot. The orchestration layer will
            # catch it as a normal per-listing failure.
            raise
        except Exception as e:
            last_exc = e
            if attempt < _NETWORK_RETRY_MAX:
                delay = _NETWORK_RETRY_BACKOFF_S[attempt]
                logger.warning(
                    "capture[%s] attempt %d failed (%s) — retrying in %.1fs",
                    comp_id,
                    attempt + 1,
                    e,
                    delay,
                )
                time.sleep(delay)
            else:
                logger.error(
                    "capture[%s] exhausted %d retries: %s",
                    comp_id,
                    _NETWORK_RETRY_MAX,
                    e,
                )
    # Should be unreachable, but mypy/pessimist-safe.
    raise last_exc if last_exc else RuntimeError("capture failed without exception")


def _append_new_reviews(competitor_id: str, new_reviews: list[dict]) -> None:
    """Write the delta (new reviews) to a timestamped file in reviews_new/.

    File naming: `{competitor_id}_{YYYYMMDDTHHMMSSZ}.json` — sortable by
    filename and human-readable. Multiple runs in the same second would
    collide, but that's acceptable for a daily cron job (and even for the
    fixtures-mode ad-hoc runs in development).
    """
    _REVIEWS_NEW_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = _REVIEWS_NEW_DIR / f"{competitor_id}_{ts}.json"
    path.write_text(
        json.dumps(new_reviews, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    logger.info("wrote %d new review(s) to %s", len(new_reviews), path)


def _finish_and_write_summary(summary: dict) -> None:
    """Stamp `finished_at`, log the summary, and write `data/run_summary.json`.

    Also emits the loud "failed >= success" warning per Section 5.8 —
    that's the cheap zero-cost selector-breakage alert.
    """
    summary["finished_at"] = datetime.now(timezone.utc).isoformat()

    # Strip the `errors` list from the log line if it gets huge — keep
    # the log readable. The summary JSON file gets the full thing.
    log_summary = {k: v for k, v in summary.items() if k != "errors"}
    log_summary["error_count"] = len(summary["errors"])
    logger.info("Run summary: %s", json.dumps(log_summary, ensure_ascii=False))

    if summary["failed"] > 0 and summary["failed"] >= summary["success"]:
        # Loud warning — easy to grep. This is the "alert" mechanism per
        # Section 5.8. The dashboard should surface this prominently.
        logger.warning(
            "ALERT: %d of %d listing(s) failed (failed >= success). "
            "Likely selector breakage in config/selectors.json — investigate.",
            summary["failed"],
            summary["failed"] + summary["success"] + summary["skipped"],
        )

    # Write the full summary (including errors) for the dashboard to read.
    _SUMMARY_PATH.parent.mkdir(parents=True, exist_ok=True)
    _SUMMARY_PATH.write_text(
        json.dumps(summary, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    logger.info("wrote run summary to %s", _SUMMARY_PATH)


def fixtures_path(competitor_id: str) -> Path:
    """Return the fixture file path for `competitor_id`.

    Thin wrapper around `_FIXTURES_DIR / f"{competitor_id}.html"` so tests
    can monkey-patch if needed. Kept as a function rather than inlined so
    the fixture filename pattern lives in exactly one place.
    """
    return _FIXTURES_DIR / f"{competitor_id}.html"


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m orchestration.run_all",
        description=(
            "GBP Competitor Review Monitor — one full scrape pass. "
            "Use --fixtures to run against tests/fixtures/*.html instead "
            "of live Google Maps (no Playwright required)."
        ),
    )
    parser.add_argument(
        "--fixtures",
        action="store_true",
        help=(
            "Read HTML from tests/fixtures/{competitor_id}.html instead "
            "of doing a live Playwright scrape. Listings without a "
            "fixture file are skipped (not failures)."
        ),
    )
    return parser.parse_args(argv)


if __name__ == "__main__":
    args = _parse_args()
    summary = run(fixtures_mode=args.fixtures)
    # Exit 0 even if some listings failed — Rule 7 mandates the run
    # completes; the dashboard reads the summary to see the failure
    # count. A non-zero exit would make GitHub Actions treat the whole
    # run as failed, which would block the "commit results" step.
    # (If we ever want CI to fail on mass failures, gate on
    # summary["failed"] >= summary["success"] here.)
    sys.exit(0)
