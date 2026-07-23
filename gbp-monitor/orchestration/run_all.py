"""Orchestration: the ONLY place that loops branches × competitors.

Per GBP_MONITOR_PLAN.md Section 5.8 + EXECUTION_RULES.md Rule 7. This
module is the conductor: it loads configs, runs pre-flight checks, drives
the per-listing pipeline (capture → parse → delta → save), and — crucially
— isolates each listing's failures so one broken URL/selector cannot crash
the whole run.

Modes:
  - LIVE (default):     Playwright captures real Google Maps HTML per
                        `config/listings.json` URLs. Requires the
                        Playwright Chromium binary installed. Uses
                        ``place_id`` from each competitor when available
                        to construct the real URL; otherwise falls back
                        to ``gmaps_url`` (mock URLs gracefully skip).
  - `--fixtures`:       Skip Playwright entirely. Read each competitor's
                        HTML from `tests/fixtures/{competitor_id}.html`.
                        Proves the parser + storage + delta pipeline
                        end-to-end without hitting Google Maps (per
                        Section 5.5 testing requirement). Listings
                        without a fixture file are SKIPPED (not counted
                        as failures) so the "failed >= success" warning
                        signal stays meaningful.
  - `--verify`:         Live verification mode. Captures screenshot + raw
                        HTML from real Google Maps URLs without modifying
                        production snapshots, deltas, or run_summary.
                        Evidence is written to ``data/verify/{ts}/``.
                        Exits non-zero if any capture fails. See
                        ``docs/engineering/LIVE_VERIFICATION.md`` for
                        the full workflow guide.

Outputs (always):
  - `data/snapshots/{competitor_id}.json` — full review list per competitor
  - `data/reviews_new/{competitor_id}_{run_ts}.json` — only new reviews
    (delta vs the previous snapshot), written only when the delta is
    non-empty.
  - `data/run.log` — INFO/WARNING/ERROR lines for every step.
  - `data/run_summary.json` — the latest run's summary dict, for the
    Next.js dashboard to read. This is an addition to the plan's run.log
    summary line, documented in CHANGELOG.md.

Outputs (verify mode):
  - `data/verify/{ts}/{competitor_id}/page.png` — full-page screenshot
  - `data/verify/{ts}/{competitor_id}/page.html` — captured raw HTML
  - `data/verify/{ts}/report.json` — structured verification report
  - `data/verify/{ts}/selector_report.json` — per-selector outcome report

Pre-flight checks (new):
  - Python dependency validation (playwright, parsel, requests)
  - Playwright Chromium binary presence (live mode only)
  - Config file existence (listings.json, selectors.json)
  - Data directory creation (snapshots, reviews_new)
  - Mock URL detection with clear warning in live mode
  - Fixture coverage warning (fixtures mode only)

Progress logging (new):
  - Per-competitor progress: ``[3/12] Processing comp-canggu-01...``
  - Phase timings per listing: ``capture=12.4s parse=0.3s total=13.1s``
  - Structured JSON log lines for machine parsing

Failure isolation (Rule 7):
  - Every per-listing exception is caught in the inner ``try`` block. The
    failure is logged with the competitor_id + error message, appended to
    ``summary["errors"]``, and the loop continues to the next listing.
  - ``SelectorNotFoundError`` is NOT retried (per Section 6) — retrying a
    broken selector wastes time and looks like a bot hammering the page.
    Network/timeout errors are retried up to 2 times with backoff.
  - After the loop, if ``failed >= success`` we log a loud WARNING — this
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

# Timeout for the full capture step (per-competitor) — if a single listing
# takes longer than this, the capture is aborted and counted as a failure.
_CAPTURE_TOTAL_TIMEOUT_S = 90


def _preflight_checks(fixtures_mode: bool) -> list[str]:
    """Run pre-flight checks before starting the main loop.

    Returns a list of warning strings (empty = all clear). Warnings are
    non-fatal — the run proceeds — but they're displayed prominently so
    the operator sees them before the per-listing output begins.

    Checks performed:
      1. Config file existence (listings.json, selectors.json)
      2. Data directory creation (snapshots, reviews_new)
      3. Python dependency availability (playwright, parsel, requests)
      4. Playwright Chromium binary (live mode only)
      5. Mock URL detection with clear warning (live mode only)
      6. Fixture file coverage (fixtures mode only)
    """
    warnings: list[str] = []

    # --- 1. Config files ---
    if not _LISTINGS_PATH.exists():
        warnings.append(f"listings.json not found at {_LISTINGS_PATH.resolve()}")
    if not _SELECTORS_PATH.exists():
        warnings.append(f"selectors.json not found at {_SELECTORS_PATH.resolve()}")

    # --- 2. Data directories ---
    _SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    _REVIEWS_NEW_DIR.mkdir(parents=True, exist_ok=True)

    # --- 3. Python dependencies ---
    for mod_name, import_name in [
        ("playwright", "playwright"),
        ("parsel", "parsel"),
        ("requests", "requests"),
    ]:
        try:
            __import__(import_name)
        except ImportError:
            warnings.append(
                f"Python package '{mod_name}' is not installed. "
                f"Run: pip install -r requirements.txt"
            )

    # --- 4. Playwright Chromium binary (live mode) ---
    if not fixtures_mode:
        try:
            import subprocess

            result = subprocess.run(
                [sys.executable, "-m", "playwright", "install", "--check", "chromium"],
                capture_output=True,
                text=True,
                timeout=30,
            )
            if result.returncode != 0:
                stderr_lower = result.stderr.lower()
                stdout_lower = result.stdout.lower()
                if "chromium" not in stdout_lower and "chromium" not in stderr_lower:
                    warnings.append(
                        "Playwright Chromium binary not installed. "
                        "Run: playwright install chromium"
                    )
        except Exception as e:
            warnings.append(f"Could not verify Playwright installation: {e}")

    # --- 5. Mock URL detection (live mode) ---
    if not fixtures_mode:
        try:
            listings = json.loads(_LISTINGS_PATH.read_text(encoding="utf-8"))
            mock_count = 0
            has_place_id = 0
            total_count = 0
            for branch in listings.get("branches", []):
                for comp in branch.get("competitors", []):
                    total_count += 1
                    if comp.get("place_id"):
                        has_place_id += 1
                    url = comp.get("gmaps_url", "")
                    if "place_id:ChIJmock_" in url:
                        mock_count += 1
            if total_count > 0 and has_place_id == 0 and mock_count == total_count:
                warnings.append(
                    "ALL competitors use mock URLs (ChIJmock_*). Live mode will "
                    "skip every listing. Add real place_id values to "
                    "config/listings.json for production scraping."
                )
            elif has_place_id > 0 and mock_count > 0:
                warnings.append(
                    f"Mixed configuration: {has_place_id} competitor(s) have "
                    f"real place_id values, {mock_count} still use mock URLs."
                )
        except Exception:
            pass

    # --- 6. Fixture coverage ---
    if fixtures_mode:
        try:
            listings = json.loads(_LISTINGS_PATH.read_text(encoding="utf-8"))
            total_competitors = sum(
                len(b.get("competitors", []))
                for b in listings.get("branches", [])
            )
            fixture_files = list(_FIXTURES_DIR.glob("*.html"))
            if len(fixture_files) == 0:
                warnings.append(
                    f"No fixture files found in {_FIXTURES_DIR.resolve()}/ — "
                    f"all {total_competitors} competitor(s) will be skipped"
                )
            elif len(fixture_files) < total_competitors:
                warnings.append(
                    f"Only {len(fixture_files)}/{total_competitors} competitor(s) "
                    f"have fixture files — partial coverage"
                )
        except Exception:
            pass

    return warnings


def _resolve_url(comp: dict) -> str:
    """Return the best Google Maps URL for this competitor.

    If ``place_id`` is set (non-empty string), construct a real URL.
    Otherwise fall back to ``gmaps_url`` (may be a mock URL that will
    gracefully fail reachability checks in live mode).
    """
    place_id = comp.get("place_id")
    if place_id and isinstance(place_id, str) and place_id.strip():
        return f"https://www.google.com/maps/place/?q=place_id:{place_id.strip()}"
    return comp.get("gmaps_url", "")


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
    run_start_wall = time.time()
    mode = "fixtures" if fixtures_mode else "live"
    logger.info("=== run_all START mode=%s ===", mode)

    # --- Pre-flight checks ---
    warnings = _preflight_checks(fixtures_mode)
    for w in warnings:
        logger.warning("PREFLIGHT: %s", w)
    if warnings and not fixtures_mode:
        # In live mode, mock-URL warning is expected; don't make it feel
        # like a fatal error, but be clear about the consequence.
        mock_warnings = [w for w in warnings if "mock" in w.lower()]
        if mock_warnings:
            logger.warning(
                "Live mode will process 0 listings (all mock URLs or no place_ids). "
                "This is expected if real place IDs have not been configured yet."
            )

    listings = json.loads(_LISTINGS_PATH.read_text(encoding="utf-8"))
    selectors = json.loads(_SELECTORS_PATH.read_text(encoding="utf-8"))

    # Count total competitors for progress tracking.
    total_competitors = sum(
        len(branch.get("competitors", []))
        for branch in listings.get("branches", [])
    )

    summary = {
        "started_at": started_at,
        "finished_at": None,
        "mode": mode,
        "success": 0,
        "failed": 0,
        "skipped": 0,
        "new_reviews": 0,
        "total_reviews": 0,
        "total_competitors": total_competitors,
        "preflight_warnings": len(warnings),
        "duration_seconds": 0,
        "errors": [],
    }

    logger.info(
        "config: %d branch(es), %d competitor(s)",
        len(listings.get("branches", [])),
        total_competitors,
    )

    # Selector tracker — records per-selector outcomes across all captures.
    # Previously only used in ``--verify`` mode; now active in production live
    # mode so every run produces a ``data/selector_report.json``.
    selector_tracker = None
    if not fixtures_mode:
        from harness.selector_tracker import SelectorTracker

        selector_tracker = SelectorTracker()

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
        processed = 0
        for branch in listings.get("branches", []):
            branch_id = branch.get("branch_id", "unknown-branch")
            branch_name = branch.get("branch_name", branch_id)
            competitors = branch.get("competitors", [])
            if not competitors:
                logger.info("branch[%s] has no competitors — skipping", branch_id)
                continue
            logger.info(
                "branch[%s] (%s): %d competitor(s)",
                branch_id, branch_name, len(competitors),
            )
            for comp in competitors:
                processed += 1
                comp_id = comp.get("competitor_id", "unknown-competitor")
                url = _resolve_url(comp)
                logger.info(
                    "progress[%d/%d] processing %s (%s)",
                    processed, total_competitors, comp_id, branch_id,
                )
                listing_start = time.time()
                _process_one_listing(
                    comp_id=comp_id,
                    branch_id=branch_id,
                    comp_name=comp.get("name", ""),
                    gmaps_url=url,
                    selectors=selectors,
                    context=context,
                    fixtures_mode=fixtures_mode,
                    summary=summary,
                    tracker=selector_tracker,
                )
                listing_duration = round(time.time() - listing_start, 1)
                # Structured log line for machine parsing.
                logger.info(
                    "listing_result competitor=%s branch=%s duration_s=%s "
                    "success=%d failed=%d skipped=%d total_reviews=%d",
                    comp_id, branch_id, listing_duration,
                    summary["success"], summary["failed"],
                    summary["skipped"], summary["total_reviews"],
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

    # Write selector report (production mode) — same format as verify mode.
    if selector_tracker is not None:
        sel_report = selector_tracker.get_report(configured_selectors=selectors)
        sel_report_path = _SNAPSHOT_DIR.parent / "selector_report.json"
        sel_report_path.write_text(
            json.dumps(sel_report, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        logger.info(
            "selector report: %d healthy, %d degraded, %d broken, %d not evaluated (avg confidence=%.3f)",
            sel_report.get("healthy", 0),
            sel_report.get("degraded", 0),
            sel_report.get("broken", 0),
            sel_report.get("not_evaluated", 0),
            sel_report.get("avg_confidence", 0.0),
        )

    summary["duration_seconds"] = round(time.time() - run_start_wall, 1)
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
    tracker=None,
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
            html = _capture_with_retries(context, gmaps_url, selectors, comp_id, tracker=tracker)

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

        # Empty capture detection — distinguish "page has no reviews" from
        # "capture failed silently" by checking HTML size and parse result.
        html_size = len(html)
        if not parsed_dicts:
            if html_size < 1024:
                logger.error(
                    "EMPTY_CAPTURE[%s]: HTML is %d bytes, 0 reviews — page likely failed to load",
                    comp_id, html_size,
                )
            elif html_size < 10240:
                logger.warning(
                    "LOW_CONTENT[%s]: HTML is %d bytes, 0 reviews — may be an interstitial page",
                    comp_id, html_size,
                )
            else:
                logger.info(
                    "NO_REVIEWS[%s]: HTML is %d bytes, 0 reviews parsed — page has no reviews or selectors are stale",
                    comp_id, html_size,
                )

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


def _capture_with_retries(
    context,
    url: str,
    selectors: dict,
    comp_id: str,
    screenshot_dir: str | None = None,
    tracker=None,
) -> str:
    """Call `capture_listing_html` with up to 2 retries on transient errors.

    Per Section 6: do NOT retry `SelectorNotFoundError` (broken selector —
    retrying just hammers the page). Also do NOT retry `CaptureTimeoutError`
    (the total timeout is a hard pipeline cap — retrying will exhaust it
    again). Other exceptions (network, DNS) are retried up to
    `_NETWORK_RETRY_MAX` times with backoff.

    Each call to ``capture_listing_html`` enforces its own total timeout via
    Playwright-native mechanisms (``page.set_default_timeout`` + wall-clock
    deadline checks) — no threading. See ``docs/engineering/KILLCRITIC.md``
    for the root-cause analysis of why threading was removed.

    When ``screenshot_dir`` is provided (verify mode), evidence is saved
    before the page closes. Existing callers omit this parameter and get
    identical behavior to the original signature.

    When ``tracker`` is provided, per-selector outcomes are recorded for
    the selector verification report.
    """
    from harness.capture import capture_listing_html, CaptureTimeoutError
    from harness.scroll import SelectorNotFoundError

    last_exc: Exception | None = None
    for attempt in range(_NETWORK_RETRY_MAX + 1):
        try:
            return capture_listing_html(
                context, url, selectors, screenshot_dir,
                tracker=tracker, comp_id=comp_id,
                total_timeout_s=_CAPTURE_TOTAL_TIMEOUT_S,
            )
        except SelectorNotFoundError:
            raise
        except CaptureTimeoutError:
            raise
        except Exception as e:
            last_exc = e
            if attempt < _NETWORK_RETRY_MAX:
                delay = _NETWORK_RETRY_BACKOFF_S[attempt]
                logger.warning(
                    "capture[%s] attempt %d failed (%s) — retrying in %.1fs",
                    comp_id, attempt + 1, e, delay,
                )
                time.sleep(delay)
            else:
                logger.error("capture[%s] exhausted %d retries: %s", comp_id, _NETWORK_RETRY_MAX, e)
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
    # Structured log line for machine parsing.
    logger.info(
        "Run summary: mode=%s success=%d failed=%d skipped=%d "
        "new_reviews=%d total_reviews=%d total_competitors=%d "
        "duration_s=%s error_count=%d",
        log_summary.get("mode"),
        log_summary.get("success", 0),
        log_summary.get("failed", 0),
        log_summary.get("skipped", 0),
        log_summary.get("new_reviews", 0),
        log_summary.get("total_reviews", 0),
        log_summary.get("total_competitors", 0),
        log_summary.get("duration_seconds", 0),
        log_summary.get("error_count", 0),
    )

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


def run_verify(url_override: str | None = None) -> dict:
    """Run a verification pass — capture evidence without modifying production data.

    Launches Playwright (same as live mode), iterates all configured
    competitors, captures a screenshot + raw HTML for each listing,
    and writes evidence to ``data/verify/{run_timestamp}/``.

    Unlike `run()`:
      - No parse, delta, save_snapshot, or run_summary writes
      - Evidence (page.png + page.html) is saved per listing
      - A structured report is written to ``data/verify/{ts}/report.json``
      - On failure, any partial evidence (e.g. screenshot of error state)
        is still saved
      - The run does NOT count as a production scrape

    Returns the report dict (also written to disk) with structure::

        {
          "started_at": ISO8601,
          "finished_at": ISO8601,
          "mode": "verify",
          "url_override": str | None,
          "total": int,
          "passed": int,
          "failed": int,
          "results": [ {competitor_id, branch_id, url, status, ...}, ... ],
        }
    """
    started_at = datetime.now(timezone.utc).isoformat()
    logger.info("=== run_verify START ===")
    if url_override:
        logger.info("URL override: %s", url_override)

    listings = json.loads(_LISTINGS_PATH.read_text(encoding="utf-8"))
    selectors = json.loads(_SELECTORS_PATH.read_text(encoding="utf-8"))

    verify_ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    verify_root = Path("data/verify") / verify_ts
    report = {
        "started_at": started_at,
        "finished_at": None,
        "mode": "verify",
        "url_override": url_override,
        "total": 0,
        "passed": 0,
        "failed": 0,
        "results": [],
    }

    # Count total listings for progress tracking.
    total_listings = sum(
        len(branch.get("competitors", []))
        for branch in listings.get("branches", [])
    )
    report["total"] = total_listings
    logger.info("verify mode: %d competitor(s) to capture", total_listings)

    # Selector tracker — records per-selector outcomes for the verification
    # report. Only active in verify mode; production calls pass tracker=None.
    from harness.selector_tracker import SelectorTracker

    tracker = SelectorTracker()

    # Lazy import — verify mode always needs Playwright.
    from harness.browser import get_browser_context

    context = None
    browser_handles = None
    try:
        browser_handles = get_browser_context()
        context = browser_handles[2]
    except Exception as e:
        logger.error("FATAL: could not start browser in verify mode: %s", e)
        report["failed"] = total_listings
        report["finished_at"] = datetime.now(timezone.utc).isoformat()
        verify_root.mkdir(parents=True, exist_ok=True)
        (verify_root / "report.json").write_text(
            json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        # Write empty selector report (no captures happened).
        sel_report = tracker.get_report(configured_selectors=selectors)
        (verify_root / "selector_report.json").write_text(
            json.dumps(sel_report, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        return report

    try:
        processed = 0
        for branch in listings.get("branches", []):
            branch_id = branch.get("branch_id", "unknown-branch")
            for comp in branch.get("competitors", []):
                processed += 1
                comp_id = comp.get("competitor_id", "unknown-competitor")
                comp_name = comp.get("name", "")
                url = url_override or _resolve_url(comp)
                logger.info(
                    "verify[%d/%d] %s (%s): %s",
                    processed, total_listings, comp_id, branch_id, comp_name,
                )

                comp_dir = str(verify_root / comp_id)
                result = {
                    "competitor_id": comp_id,
                    "branch_id": branch_id,
                    "name": comp_name,
                    "url": url,
                    "status": "FAIL",
                }

                try:
                    _capture_with_retries(
                        context,
                        url,
                        selectors,
                        comp_id,
                        screenshot_dir=comp_dir,
                        tracker=tracker,
                    )
                    result["status"] = "PASS"
                    report["passed"] += 1
                    logger.info("verify[%s] PASS", comp_id)
                except Exception as e:
                    result["error"] = f"{type(e).__name__}: {e}"
                    report["failed"] += 1
                    logger.error("verify[%s] FAIL: %s", comp_id, result["error"])

                report["results"].append(result)
    finally:
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

    report["finished_at"] = datetime.now(timezone.utc).isoformat()
    verify_root.mkdir(parents=True, exist_ok=True)
    (verify_root / "report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    # Write selector verification report alongside report.json.
    sel_report = tracker.get_report(configured_selectors=selectors)
    (verify_root / "selector_report.json").write_text(
        json.dumps(sel_report, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    logger.info(
        "verify summary: %d passed, %d failed (of %d) — "
        "selector report: %d healthy, %d degraded, %d broken, %d not evaluated",
        report["passed"],
        report["failed"],
        report["total"],
        sel_report.get("healthy", 0),
        sel_report.get("degraded", 0),
        sel_report.get("broken", 0),
        sel_report.get("not_evaluated", 0),
    )
    return report


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
    parser.add_argument(
        "--verify",
        action="store_true",
        help=(
            "Live verification mode: capture screenshots + HTML evidence "
            "from real Google Maps URLs without modifying production "
            "snapshots, deltas, or run_summary.json. Evidence is written "
            "to data/verify/{timestamp}/. Requires Playwright browser "
            "binary. Use --url to override competitor URLs for testing "
            "a single listing."
        ),
    )
    parser.add_argument(
        "--url",
        type=str,
        default=None,
        help=(
            "Override all competitor URLs with this single URL. Only "
            "meaningful with --verify. Useful for testing capture against "
            "one real Google Maps listing without editing listings.json."
        ),
    )
    return parser.parse_args(argv)


if __name__ == "__main__":
    args = _parse_args()
    if args.verify:
        report = run_verify(url_override=args.url)
        # Exit non-zero when any verification fails so CI / the
        # operator can detect it without parsing the report JSON.
        sys.exit(1 if report["failed"] > 0 else 0)
    else:
        summary = run(fixtures_mode=args.fixtures)
        # Exit 0 even if some listings failed — Rule 7 mandates the run
        # completes; the dashboard reads the summary to see the failure
        # count. A non-zero exit would make GitHub Actions treat the whole
        # run as failed, which would block the "commit results" step.
        # (If we ever want CI to fail on mass failures, gate on
        # summary["failed"] >= summary["success"] here.)
        sys.exit(0)
