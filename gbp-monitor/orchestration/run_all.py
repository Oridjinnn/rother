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
                        Exits non-zero if any capture fails.

Outputs (always):
  - `data/snapshots/{competitor_id}/{ts}.json` — full review list (versioned)
  - `data/reviews_new/{competitor_id}_{run_ts}.json` — delta reviews
  - `data/run.log` — append-only structured log
  - `data/run_summary.json` — latest run summary for the dashboard
  - `data/selector_report.json` — per-selector health report
  - `data/selector_history.json` — historical selector health snapshots
  - `data/.run.lock` — lock file preventing overlapping runs

Outputs (verify mode):
  - `data/verify/{ts}/{competitor_id}/page.png` — full-page screenshot
  - `data/verify/{ts}/{competitor_id}/page.html` — captured raw HTML
  - `data/verify/{ts}/report.json` — structured verification report
  - `data/verify/{ts}/selector_report.json` — per-selector outcome report

Operational hardening (M6):
  - Lock file with stale detection prevents concurrent runs
  - SIGINT/SIGTERM handler ensures graceful shutdown + lock cleanup
  - Unique run_id per execution for log correlation
  - Stage-level timing (browser, capture, parse, delta, save)
  - Structured JSON log lines alongside human-readable text
  - Selector drift history with confidence trends

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
import atexit
import json
import logging
import os
import random
import re
import shutil
import signal
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
_LOCK_PATH = Path("data/.run.lock")
_SELECTOR_HISTORY_PATH = Path("data/selector_history.json")

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

# Lock file stale threshold: if a lock file is older than this, it's
# considered stale (previous run crashed without cleanup).
_LOCK_STALE_THRESHOLD_S = 1800  # 30 minutes

# --- M13B Security Hardening constants ---
# Log rotation threshold (same as CI scrape.yml:49-62)
_LOG_ROTATION_BYTES = 5_242_880  # 5 MB
# Minimum free disk space required before a run (100 MB)
_MIN_FREE_DISK_BYTES = 100 * 1024 * 1024
# Valid competitor_id pattern: alphanumeric + hyphens + underscores only.
_VALID_COMPETITOR_ID_RE = re.compile(r"^[a-zA-Z0-9_-]+$")
# Maximum length for competitor_id.
_MAX_COMPETITOR_ID_LEN = 64
# Path to config backup directory.
_CONFIG_BACKUP_DIR = Path("data/config_backups")
# Minimum seconds between requests to the same domain for rate limiting.
_RATE_LIMIT_MIN_INTERVAL_S = 5.0
# Maximum requests per domain per rolling window.
_RATE_LIMIT_MAX_PER_WINDOW = 12
# Rolling window size for rate limiting in seconds.
_RATE_LIMIT_WINDOW_S = 60.0

# Global state for lock cleanup on shutdown.
_lock_acquired: bool = False
_lock_file_owned: Path | None = None


def _run_id() -> str:
    """Return a short unique run identifier for log correlation."""
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _structured_log(run_id: str, stage: str, **kwargs) -> None:
    """Emit a JSON-structured log line alongside the human-readable message.

    The JSON object (prefixed with ``JSONLOG:``) is emitted at INFO level
    so it is captured both in the file and on stderr. Downstream tools can
    grep for ``JSONLOG:`` to extract machine-parseable events.
    """
    record = {"run_id": run_id, "stage": stage, "ts": datetime.now(timezone.utc).isoformat()}
    record.update(kwargs)
    logger.info("JSONLOG: %s", json.dumps(record, default=str))


# ── M13B Security Hardening ──────────────────────────────────────────


def _sanitize_competitor_id(competitor_id: str) -> str:
    """Validate and sanitize a competitor_id for safe filesystem use.

    Rejects IDs that contain path traversal characters (``..``, ``/``,
    ``\\``, null bytes), exceed the maximum length, or do not match the
    allowed character pattern (alphanumeric, hyphens, underscores).

    Returns the validated ID unchanged on success.
    Raises ValueError with a descriptive message on failure.
    """
    if not competitor_id or not isinstance(competitor_id, str):
        raise ValueError(
            f"Invalid competitor_id: must be a non-empty string, got {type(competitor_id).__name__}"
        )
    if "\x00" in competitor_id:
        raise ValueError(
            f"Invalid competitor_id {competitor_id!r}: contains null byte"
        )
    if competitor_id.startswith("-") or competitor_id.endswith("-"):
        raise ValueError(
            f"Invalid competitor_id {competitor_id!r}: cannot start or end with hyphen"
        )
    if ".." in competitor_id:
        raise ValueError(
            f"Invalid competitor_id {competitor_id!r}: contains '..' (path traversal)"
        )
    if "/" in competitor_id or "\\" in competitor_id:
        raise ValueError(
            f"Invalid competitor_id {competitor_id!r}: contains path separator"
        )
    if len(competitor_id) > _MAX_COMPETITOR_ID_LEN:
        raise ValueError(
            f"Invalid competitor_id {competitor_id!r}: "
            f"length {len(competitor_id)} exceeds maximum {_MAX_COMPETITOR_ID_LEN}"
        )
    if not _VALID_COMPETITOR_ID_RE.match(competitor_id):
        raise ValueError(
            f"Invalid competitor_id {competitor_id!r}: must match "
            f"{_VALID_COMPETITOR_ID_RE.pattern} "
            f"(alphanumeric, hyphens, underscores only)"
        )
    return competitor_id


def _safe_path_within(base_dir: Path, sub_path: str) -> Path:
    """Resolve *sub_path* relative to *base_dir* and verify it stays inside.

    Raises ValueError if the resolved path escapes *base_dir*.
    """
    resolved = (base_dir / sub_path).resolve()
    base_resolved = base_dir.resolve()
    try:
        resolved.relative_to(base_resolved)
    except ValueError:
        raise ValueError(
            f"Path traversal detected: {sub_path!r} resolves to {resolved} "
            f"which is outside {base_resolved}"
        )
    return resolved


def _rotate_run_log_if_needed() -> None:
    """Rotate ``data/run.log`` if it exceeds ``_LOG_ROTATION_BYTES``.

    Renames the current log to ``data/run.log.YYYYMMDD`` so the new run
    starts with a fresh file. Mirrors the CI rotation in
    ``scrape.yml:49-62`` for local runs.
    """
    log_path = Path("data/run.log")
    if not log_path.exists():
        return
    try:
        size = log_path.stat().st_size
    except OSError:
        return
    if size <= _LOG_ROTATION_BYTES:
        return
    ts = datetime.now(timezone.utc).strftime("%Y%m%d")
    rotated = log_path.with_name(f"run.log.{ts}")
    try:
        log_path.rename(rotated)
        logger.info("Rotated run.log (%d bytes) to %s", size, rotated.name)
    except OSError as e:
        logger.warning("Failed to rotate run.log: %s", e)


def _check_disk_space() -> list[str]:
    """Check available disk space on the data directory.

    Returns a list of warning strings (empty if sufficient space).
    """
    data_dir = Path("data")
    data_dir.mkdir(parents=True, exist_ok=True)
    try:
        usage = shutil.disk_usage(data_dir.resolve())
        free_mb = usage.free / (1024 * 1024)
        if usage.free < _MIN_FREE_DISK_BYTES:
            return [
                f"Low disk space: {free_mb:.0f} MB free on {data_dir.resolve()} "
                f"(minimum {_MIN_FREE_DISK_BYTES // (1024*1024)} MB required). "
                "Snapshots and deltas may fail to write."
            ]
    except OSError as e:
        return [f"Could not check disk space: {e}"]
    return []


def _backup_config() -> None:
    """Backup config files before modification.

    Copies ``config/listings.json`` and ``config/selectors.json`` to
    ``data/config_backups/{YYYYMMDDTHHMMSSZ}/`` preserving originals.
    Silent if config files do not exist (fresh install).
    """
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_dir = _CONFIG_BACKUP_DIR / ts
    for config_path in [_LISTINGS_PATH, _SELECTORS_PATH]:
        if not config_path.exists():
            continue
        try:
            backup_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(str(config_path), str(backup_dir / config_path.name))
            logger.debug("Backed up %s to %s", config_path, backup_dir / config_path.name)
        except OSError as e:
            logger.warning("Failed to back up %s: %s", config_path, e)


def _validate_listings_config(listings: dict) -> list[str]:
    """Validate the structure of *listings.json*.

    Checks performed:
    1. Top-level ``branches`` is a non-empty list.
    2. Each branch has ``branch_id`` and ``branch_name``.
    3. No duplicate ``branch_id`` values.
    4. Each competitor has ``competitor_id`` and ``name``.
    5. No duplicate ``competitor_id`` values across branches.
    6. ``place_id`` is either null or a valid Google Maps ID (``ChIJ...``).

    Returns a list of error strings (empty = valid).
    Errors are fatal — the run should not proceed.
    """
    errors: list[str] = []
    branches = listings.get("branches", [])
    if not isinstance(branches, list):
        errors.append("listings.json: 'branches' must be a list")
        return errors
    if not branches:
        errors.append("listings.json: 'branches' list is empty")
        return errors

    seen_branch_ids: set[str] = set()
    seen_comp_ids: set[str] = set()

    for bi, branch in enumerate(branches):
        if not isinstance(branch, dict):
            errors.append(f"listings.json: branch[{bi}] is not an object")
            continue
        bid = branch.get("branch_id")
        if not bid or not isinstance(bid, str):
            errors.append(f"listings.json: branch[{bi}] missing 'branch_id'")
        else:
            if bid in seen_branch_ids:
                errors.append(f"listings.json: duplicate branch_id {bid!r}")
            seen_branch_ids.add(bid)

        competitors = branch.get("competitors", [])
        if not isinstance(competitors, list):
            errors.append(f"listings.json: branch[{bid}] 'competitors' must be a list")
            continue
        for ci, comp in enumerate(competitors):
            if not isinstance(comp, dict):
                errors.append(f"listings.json: branch[{bid}] competitor[{ci}] is not an object")
                continue
            cid = comp.get("competitor_id")
            if not cid or not isinstance(cid, str):
                errors.append(f"listings.json: branch[{bid}] competitor[{ci}] missing 'competitor_id'")
            else:
                if cid in seen_comp_ids:
                    errors.append(f"listings.json: duplicate competitor_id {cid!r}")
                seen_comp_ids.add(cid)

            pid = comp.get("place_id")
            if pid is not None:
                if not isinstance(pid, str) or not pid.strip():
                    errors.append(
                        f"listings.json: {cid} 'place_id' must be a non-empty string or null"
                    )
                elif not pid.startswith("ChIJ") or len(pid) < 25:
                    errors.append(
                        f"listings.json: {cid} 'place_id' {pid!r} does not look like "
                        f"a valid Google Maps place ID (should start with 'ChIJ', ≥25 chars)"
                    )

    return errors


class RateLimiter:
    """Simple in-memory rate limiter per domain.

    Tracks request timestamps per domain and rejects requests that exceed
    the configured window limits.
    """

    def __init__(
        self,
        min_interval_s: float = _RATE_LIMIT_MIN_INTERVAL_S,
        max_per_window: int = _RATE_LIMIT_MAX_PER_WINDOW,
        window_s: float = _RATE_LIMIT_WINDOW_S,
    ):
        self._min_interval_s = min_interval_s
        self._max_per_window = max_per_window
        self._window_s = window_s
        self._history: dict[str, list[float]] = {}

    def _extract_domain(self, url: str) -> str:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        return parsed.netloc or url

    def check(self, url: str) -> None:
        """Check if a request to *url* is allowed.

        Raises ``RateLimitError`` if the request would exceed limits.
        Records the request timestamp on success (call only before sending).
        """
        domain = self._extract_domain(url)
        now = time.time()
        timestamps = self._history.setdefault(domain, [])
        # Prune timestamps outside the rolling window.
        cutoff = now - self._window_s
        timestamps[:] = [t for t in timestamps if t >= cutoff]

        # Check minimum interval since last request.
        if timestamps and (now - timestamps[-1]) < self._min_interval_s:
            raise RateLimitError(
                f"Rate limit: minimum interval {self._min_interval_s}s not elapsed "
                f"for domain {domain!r} "
                f"(last request {now - timestamps[-1]:.1f}s ago)"
            )
        # Check max requests in the window.
        if len(timestamps) >= self._max_per_window:
            raise RateLimitError(
                f"Rate limit: {self._max_per_window} requests in {self._window_s}s "
                f"exceeded for domain {domain!r}"
            )
        timestamps.append(now)


class RateLimitError(Exception):
    """Raised when a request exceeds the rate limit configuration."""


def _acquire_lock(run_id: str) -> None:
    """Acquire a file-based lock to prevent overlapping runs.

    Writes a lock file containing the run_id and PID. If the lock file
    already exists and is not stale, raises RuntimeError. Stale locks
    (older than ``_LOCK_STALE_THRESHOLD_S``) are overwritten with a
    warning.
    """
    global _lock_acquired, _lock_file_owned
    _LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)

    if _LOCK_PATH.exists():
        try:
            lock_data = json.loads(_LOCK_PATH.read_text(encoding="utf-8"))
            lock_time_str = lock_data.get("acquired_at", "")
            lock_pid = lock_data.get("pid", 0)
            if lock_time_str:
                lock_time = datetime.fromisoformat(lock_time_str)
                age = (datetime.now(timezone.utc) - lock_time).total_seconds()
                if age < _LOCK_STALE_THRESHOLD_S:
                    raise RuntimeError(
                        f"Lock file exists (run_id={lock_data.get('run_id', '?')}, "
                        f"pid={lock_pid}, age={age:.0f}s). Another run is in progress."
                    )
                logger.warning(
                    "Stale lock file detected (age=%ds, pid=%d, run_id=%s) — overwriting",
                    age, lock_pid, lock_data.get("run_id", "?"),
                )
            else:
                logger.warning("Lock file has no timestamp — treating as stale, overwriting")
        except (json.JSONDecodeError, KeyError):
            logger.warning("Lock file corrupt — overwriting")

    lock_content = {
        "run_id": run_id,
        "pid": os.getpid(),
        "acquired_at": datetime.now(timezone.utc).isoformat(),
    }
    _LOCK_PATH.write_text(json.dumps(lock_content, indent=2), encoding="utf-8")
    _lock_acquired = True
    _lock_file_owned = _LOCK_PATH
    logger.info("Lock acquired (run_id=%s, pid=%d)", run_id, os.getpid())


def _release_lock() -> None:
    """Release the lock file if we own it."""
    global _lock_acquired, _lock_file_owned
    if _lock_acquired and _lock_file_owned and _lock_file_owned.exists():
        try:
            _lock_file_owned.unlink()
            logger.info("Lock released")
        except Exception as e:
            logger.warning("Failed to release lock: %s", e)
    _lock_acquired = False
    _lock_file_owned = None


def _shutdown_handler(signum, frame) -> None:
    """Handle SIGINT/SIGTERM by releasing the lock and exiting."""
    sig_name = signal.Signals(signum).name
    logger.warning("Received %s — shutting down gracefully", sig_name)
    _release_lock()
    sys.exit(1)


# Register handlers for graceful shutdown.
signal.signal(signal.SIGINT, _shutdown_handler)
signal.signal(signal.SIGTERM, _shutdown_handler)
atexit.register(_release_lock)


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
            mock_ids: list[str] = []
            real_ids: list[str] = []
            total_count = 0
            for branch in listings.get("branches", []):
                for comp in branch.get("competitors", []):
                    total_count += 1
                    pid = comp.get("place_id")
                    if pid and isinstance(pid, str) and pid.strip().startswith("ChIJ") and len(pid.strip()) >= 25:
                        real_ids.append(comp["competitor_id"])
                    else:
                        mock_ids.append(comp["competitor_id"])
            if total_count > 0 and len(real_ids) == 0:
                warnings.append(
                    "ALL competitors lack valid place_ids. Live mode will "
                    "skip every listing. Add real place_id values to "
                    "config/listings.json for production scraping."
                )
            elif len(real_ids) > 0 and len(mock_ids) > 0:
                warnings.append(
                    f"Mixed configuration: {len(real_ids)} real ({', '.join(real_ids)}), "
                    f"{len(mock_ids)} mock ({', '.join(mock_ids)}). "
                    "Only competitors with real place_ids will be scraped."
                )
            elif len(real_ids) == total_count:
                warnings.append(f"All {total_count} competitors have real place_ids — ready for live scrape.")
        except Exception:
            pass

    # --- 6. Fixture coverage ---
    if fixtures_mode:
        try:
            listings = json.loads(_LISTINGS_PATH.read_text(encoding="utf-8"))
            all_competitors: list[str] = []
            for branch in listings.get("branches", []):
                for comp in branch.get("competitors", []):
                    all_competitors.append(comp["competitor_id"])
            fixture_files = {f.stem for f in _FIXTURES_DIR.glob("*.html")}
            missing = [c for c in all_competitors if c not in fixture_files]
            if not missing:
                warnings.append(
                    f"All {len(all_competitors)} competitors have fixture files — full coverage"
                )
            elif len(fixture_files) == 0:
                warnings.append(
                    f"No fixture files found in {_FIXTURES_DIR.resolve()}/ — "
                    f"all {len(all_competitors)} competitor(s) will be skipped"
                )
            else:
                warnings.append(
                    f"Only {len(fixture_files)}/{len(all_competitors)} competitor(s) "
                    f"have fixture files — missing: {', '.join(missing)}"
                )
        except Exception:
            pass

    return warnings


def _resolve_url(comp: dict) -> str:
    """Return the best Google Maps URL for this competitor.

    If ``place_id`` is set to a valid Google Maps place ID (starts with
    ``ChIJ`` and has reasonable length), construct a real URL.
    Otherwise fall back to ``gmaps_url`` (may be a mock URL that will
    gracefully fail reachability checks in live mode).

    A place_id that does not look like a valid Google Maps place ID is
    logged as a warning and treated as absent (falls back to gmaps_url).
    """
    place_id = comp.get("place_id")
    if place_id and isinstance(place_id, str) and place_id.strip():
        pid = place_id.strip()
        # Basic validation: real Google place_ids start with ChIJ
        # and are typically 25-30 characters of base64-ish text.
        if pid.startswith("ChIJ") and len(pid) >= 25:
            return f"https://www.google.com/maps/place/?q=place_id:{pid}"
        logger.warning(
            "place_id[%s] does not look like a valid Google Maps place ID "
            "(expected 'ChIJ...' ≥25 chars, got %r). Falling back to gmaps_url.",
            comp.get("competitor_id", "?"), pid,
        )
    return comp.get("gmaps_url", "")


def run(fixtures_mode: bool = False) -> dict:
    """Run one full pass over the configured branches × competitors.

    Acquires a file lock to prevent overlapping runs. Sets up structured
    logging with a unique run_id. Every listing failure is isolated per
    Rule 7 — one broken URL cannot crash the whole run.

    Args:
        fixtures_mode: If True, read HTML from `tests/fixtures/*.html`
            instead of doing live Playwright captures.

    Returns:
        The summary dict (also written to `data/run_summary.json`).
    """
    started_at = datetime.now(timezone.utc).isoformat()
    run_start_wall = time.time()
    rid = _run_id()
    mode = "fixtures" if fixtures_mode else "live"
    _structured_log(rid, "run_start", mode=mode)

    _acquire_lock(rid)

    # M13B: Rotate log before this run starts writing to it.
    _rotate_run_log_if_needed()

    # M13B: Check disk space before starting.
    disk_warnings = _check_disk_space()
    for w in disk_warnings:
        logger.warning("DISK: %s", w)

    # M13B: Backup config files before any reads/modifications.
    _backup_config()

    warnings = _preflight_checks(fixtures_mode)
    for w in warnings:
        logger.warning("PREFLIGHT: %s", w)
    if warnings and not fixtures_mode:
        all_mock = any("ALL competitors lack" in w for w in warnings)
        if all_mock:
            logger.warning(
                "Live mode will process 0 listings (all mock URLs or no place_ids). "
                "This is expected if real place IDs have not been configured yet."
            )

    listings = json.loads(_LISTINGS_PATH.read_text(encoding="utf-8"))
    selectors = json.loads(_SELECTORS_PATH.read_text(encoding="utf-8"))

    # M13B: Validate listings config before proceeding.
    config_errors = _validate_listings_config(listings)
    for ce in config_errors:
        logger.error("CONFIG: %s", ce)
    if config_errors:
        _finish_and_write_summary(
            {
                "started_at": started_at,
                "finished_at": None,
                "mode": mode,
                "run_id": rid,
                "success": 0,
                "failed": 0,
                "skipped": 0,
                "new_reviews": 0,
                "total_reviews": 0,
                "total_competitors": 0,
                "preflight_warnings": len(warnings),
                "duration_seconds": 0,
                "browser_launch_s": 0,
                "errors": [
                    {
                        "competitor_id": "__config__",
                        "error": f"Config validation failed ({len(config_errors)} error(s))",
                    }
                ],
            },
            run_id=rid,
        )
        _release_lock()
        return {
            "success": 0,
            "failed": 0,
            "skipped": 0,
            "new_reviews": 0,
            "total_reviews": 0,
            "errors": [{"competitor_id": "__config__", "error": f"{len(config_errors)} config errors"}],
        }

    total_competitors = sum(
        len(branch.get("competitors", []))
        for branch in listings.get("branches", [])
    )

    summary = {
        "started_at": started_at,
        "finished_at": None,
        "mode": mode,
        "run_id": rid,
        "success": 0,
        "failed": 0,
        "skipped": 0,
        "new_reviews": 0,
        "total_reviews": 0,
        "total_competitors": total_competitors,
        "preflight_warnings": len(warnings),
        "duration_seconds": 0,
        "browser_launch_s": 0,
        "errors": [],
    }

    _structured_log(rid, "config_loaded",
                    branches=len(listings.get("branches", [])),
                    competitors=total_competitors)

    selector_tracker = None
    if not fixtures_mode:
        from harness.selector_tracker import SelectorTracker
        selector_tracker = SelectorTracker()

    context = None
    browser_handles = None
    browser_launch_duration = 0.0

    if not fixtures_mode:
        from harness.browser import get_browser_context
        try:
            t0 = time.time()
            browser_handles = get_browser_context()
            context = browser_handles[2]
            browser_launch_duration = round(time.time() - t0, 2)
            _structured_log(rid, "browser_launch", duration_s=browser_launch_duration)
        except Exception as e:
            logger.error(
                "FATAL: could not start browser in live mode: %s. "
                "Use --fixtures for a no-browser run.", e
            )
            summary["failed"] = 1
            summary["errors"].append(
                {"competitor_id": "__bootstrap__", "error": f"browser launch: {e}"}
            )
            _finish_and_write_summary(summary, run_id=rid)
            _release_lock()
            return summary

    try:
        processed = 0
        for branch in listings.get("branches", []):
            branch_id = branch.get("branch_id", "unknown-branch")
            branch_name = branch.get("branch_name", branch_id)
            competitors = branch.get("competitors", [])
            if not competitors:
                continue
            for comp in competitors:
                processed += 1
                comp_id = comp.get("competitor_id", "unknown-competitor")
                url = _resolve_url(comp)
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
                    run_id=rid,
                )
                duration = round(time.time() - listing_start, 2)
                _structured_log(rid, "listing_result",
                                competitor=comp_id,
                                branch=branch_id,
                                duration_s=duration,
                                progress=f"{processed}/{total_competitors}")
                if not fixtures_mode and _LIVE_POLITE_DELAY_S:
                    time.sleep(random.uniform(*_LIVE_POLITE_DELAY_S))
    finally:
        if browser_handles is not None:
            p, browser, ctx = browser_handles
            t0 = time.time()
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
            _structured_log(rid, "browser_teardown", duration_s=round(time.time() - t0, 2))

    if selector_tracker is not None:
        previous = _load_previous_selector_report()
        sel_report = selector_tracker.get_report(
            configured_selectors=selectors,
            previous_report=previous,
        )
        sel_report["run_id"] = rid
        sel_report["run_timestamp"] = started_at
        sel_report_path = _SNAPSHOT_DIR.parent / "selector_report.json"
        sel_report_path.write_text(
            json.dumps(sel_report, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        _append_selector_history(sel_report, rid)
        _structured_log(rid, "selector_report",
                        healthy=sel_report.get("healthy", 0),
                        degraded=sel_report.get("degraded", 0),
                        broken=sel_report.get("broken", 0))

    summary["duration_seconds"] = round(time.time() - run_start_wall, 1)
    summary["browser_launch_s"] = browser_launch_duration
    _finish_and_write_summary(summary, run_id=rid)
    _release_lock()
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
    run_id: str = "",
) -> None:
    """Capture → parse → delta → save for one listing.

    Records per-stage timing (capture, parse, delta, save) and emits
    structured JSON logs for each stage. All exceptions are caught here
    (Rule 7) and isolated to this listing. Failure diagnostics include
    competitor_id, stage, URL, probable cause, and elapsed time.
    """
    # M13B: Validate competitor_id is safe for filesystem use before any I/O.
    try:
        _sanitize_competitor_id(comp_id)
    except ValueError as ve:
        summary["failed"] += 1
        summary["errors"].append({
            "competitor_id": comp_id,
            "branch_id": branch_id,
            "error": f"Invalid competitor_id: {ve}",
        })
        logger.error("FAILURE[%s] Invalid competitor_id: %s", comp_id, ve)
        _structured_log(run_id, "listing_skip", competitor=comp_id, reason=f"invalid_id: {ve}")
        return

    _structured_log(run_id, "listing_start", competitor=comp_id, branch=branch_id)
    stages: dict[str, float] = {}
    failed_stage: str | None = None
    start_wall = time.time()

    if fixtures_mode:
        fixture_path = _FIXTURES_DIR / f"{comp_id}.html"
        if not fixture_path.exists():
            summary["skipped"] += 1
            _structured_log(run_id, "listing_skip", competitor=comp_id,
                            reason="no_fixture", fixture=str(fixture_path))
            return

    try:
        if not fixtures_mode:
            from discovery.validate_listing import validate_listing
            if not validate_listing(gmaps_url):
                summary["skipped"] += 1
                _structured_log(run_id, "listing_skip", competitor=comp_id,
                                reason="unreachable_url", url=gmaps_url)
                return

        # Step 1 — capture.
        failed_stage = "capture"
        t0 = time.time()
        if fixtures_mode:
            html = fixtures_path(comp_id).read_text(encoding="utf-8")
        else:
            html = _capture_with_retries(context, gmaps_url, selectors, comp_id, tracker=tracker)
        stages["capture_s"] = round(time.time() - t0, 2)
        failed_stage = None

        # Step 2 — parse.
        failed_stage = "parse"
        t0 = time.time()
        from parser.review_parser import parse_reviews
        from parser.schema import review_to_dict
        from storage.snapshot_store import load_snapshot, save_snapshot
        from storage.delta import compute_new_reviews

        parsed = parse_reviews(html, comp_id, branch_id, selectors)
        parsed_dicts = [review_to_dict(r) for r in parsed]
        stages["parse_s"] = round(time.time() - t0, 2)
        failed_stage = None

        html_size = len(html)
        if not parsed_dicts:
            if html_size < 1024:
                logger.error("EMPTY_CAPTURE[%s]: HTML is %d bytes", comp_id, html_size)
            elif html_size < 10240:
                logger.warning("LOW_CONTENT[%s]: HTML is %d bytes", comp_id, html_size)
            else:
                logger.info("NO_REVIEWS[%s]: HTML is %d bytes", comp_id, html_size)

        # Step 3 — delta.
        failed_stage = "delta"
        t0 = time.time()
        old = load_snapshot(comp_id)
        delta = compute_new_reviews(old, parsed_dicts)
        stages["delta_s"] = round(time.time() - t0, 2)
        failed_stage = None

        # Step 4 — persist.
        failed_stage = "save"
        t0 = time.time()
        if delta:
            _append_new_reviews(comp_id, delta, run_id=run_id)
            summary["new_reviews"] += len(delta)
            _structured_log(run_id, "delta", competitor=comp_id, new_reviews=len(delta))

        save_snapshot(comp_id, parsed_dicts)
        stages["save_s"] = round(time.time() - t0, 2)
        failed_stage = None

        summary["success"] += 1
        summary["total_reviews"] += len(parsed_dicts)

        _structured_log(run_id, "listing_done", competitor=comp_id,
                        reviews=len(parsed_dicts), delta=len(delta), **stages)

    except Exception as e:
        elapsed = round(time.time() - start_wall, 1)
        summary["failed"] += 1

        cause = _diagnose_failure(e, failed_stage)
        err = {
            "competitor_id": comp_id,
            "branch_id": branch_id,
            "url": gmaps_url,
            "stage": failed_stage or "unknown",
            "error": f"{type(e).__name__}: {e}",
            "probable_cause": cause,
            "elapsed_s": elapsed,
        }
        summary["errors"].append(err)
        logger.error("FAILURE[%s] stage=%s url=%s elapsed=%.1fs: %s — %s",
                     comp_id, failed_stage or "unknown", gmaps_url, elapsed, e, cause)
        _structured_log(run_id, "listing_fail", competitor=comp_id,
                        branch=branch_id, url=gmaps_url,
                        stage=failed_stage or "unknown",
                        error=str(e), error_type=type(e).__name__,
                        probable_cause=cause, elapsed_s=elapsed)


_FAILURE_DIAGNOSES: dict[str, dict[str, str]] = {
    "capture": {
        "NavigationError": "Page navigation failed — check place_id validity and network connectivity",
        "CaptureTimeoutError": "Capture exceeded total timeout — page may be slow or blocked by bot detection",
        "PageCrashError": "Browser page crashed (OOM / renderer crash) — check system resources",
        "SelectorNotFoundError": "Review container selector not found — DOM structure may have changed",
        "*": "Capture pipeline failed — check browser console and network logs",
    },
    "parse": {
        "*": "Parser threw an unexpected exception — review HTML structure or parser code",
    },
    "delta": {
        "*": "Delta computation failed — snapshot data may be corrupt",
    },
    "save": {
        "*": "Snapshot write failed — check disk space and permissions",
    },
}


def _diagnose_failure(e: Exception, stage: str | None) -> str:
    """Return a human-readable probable cause for a listing failure.

    Matches on (stage, exception type) to produce specific diagnostics
    for each point in the pipeline. Falls back to generic messages.
    """
    stage_diag = _FAILURE_DIAGNOSES.get(stage or "unknown", {})
    type_name = type(e).__name__
    cause = stage_diag.get(type_name) or stage_diag.get("*")
    if cause:
        return cause
    return f"Unexpected {type_name} during {stage or 'unknown'} stage"


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



def _append_new_reviews(competitor_id: str, new_reviews: list[dict], run_id: str = "") -> None:
    """Write the delta (new reviews) to a timestamped file in reviews_new/.

    Uses the run_id as the timestamp suffix so multiple runs are always
    unique and sortable. The run_id format (YYYYMMDDTHHMMSSZ) is compatible
    with the existing filename convention.
    """
    _REVIEWS_NEW_DIR.mkdir(parents=True, exist_ok=True)
    path = _REVIEWS_NEW_DIR / f"{competitor_id}_{run_id}.json"
    tmp = path.with_suffix(".tmp")
    tmp.write_text(
        json.dumps(new_reviews, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    tmp.replace(path)
    _structured_log(run_id or _run_id(), "delta_write",
                    competitor=competitor_id, count=len(new_reviews), path=str(path))


def _load_previous_selector_report() -> dict | None:
    """Load the previous run's selector report from the history file.

    Returns the second-to-last entry (the most recent COMPLETE previous"
    run), or None if there are fewer than 2 entries.
    """
    hist_path = _SELECTOR_HISTORY_PATH
    if not hist_path.exists():
        return None
    try:
        history = json.loads(hist_path.read_text(encoding="utf-8"))
        if not isinstance(history, list) or len(history) < 2:
            return None
        return history[-2]
    except (json.JSONDecodeError, OSError, IndexError):
        return None


def _append_selector_history(report: dict, run_id: str) -> None:
    """Append the current selector report to the selector history file.

    Maintains a rolling window of the last 50 reports for drift analysis.
    Each entry includes the run_id, timestamp, and per-selector health stats.
    If a previous report exists, computes the confidence delta (trend).
    """
    history_path = _SELECTOR_HISTORY_PATH
    history: list[dict] = []
    if history_path.exists():
        try:
            history = json.loads(history_path.read_text(encoding="utf-8"))
            if not isinstance(history, list):
                history = []
        except (json.JSONDecodeError, OSError):
            history = []

    entry = {
        "run_id": run_id,
        "timestamp": report.get("run_timestamp", datetime.now(timezone.utc).isoformat()),
        "healthy": report.get("healthy", 0),
        "degraded": report.get("degraded", 0),
        "broken": report.get("broken", 0),
        "not_evaluated": report.get("not_evaluated", 0),
        "avg_confidence": report.get("avg_confidence", 0.0),
        "selectors": {},
    }

    per_selector = report.get("selectors", {})
    for key, data in per_selector.items():
        entry["selectors"][key] = {
            "status": data.get("status", "not_evaluated"),
            "confidence": data.get("confidence", 0.0),
            "match_count": data.get("match_count", 0),
        }

    # Compute trend vs previous entry.
    if history:
        prev = history[-1]
        entry["trend"] = {
            "healthy_delta": entry["healthy"] - prev.get("healthy", 0),
            "confidence_delta": round(entry["avg_confidence"] - prev.get("avg_confidence", 0.0), 3),
        }
    else:
        entry["trend"] = {"healthy_delta": 0, "confidence_delta": 0.0}

    history.append(entry)
    # Keep last 50 entries.
    if len(history) > 50:
        history = history[-50:]

    history_path.parent.mkdir(parents=True, exist_ok=True)
    history_path.write_text(
        json.dumps(history, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def _finish_and_write_summary(summary: dict, run_id: str = "") -> None:
    """Stamp `finished_at`, log the summary, and write `data/run_summary.json`.

    Also emits the loud "failed >= success" warning per Section 5.8 —
    that's the cheap zero-cost selector-breakage alert.
    """
    rid = run_id or _run_id()
    summary["finished_at"] = datetime.now(timezone.utc).isoformat()

    log_summary = {k: v for k, v in summary.items() if k != "errors"}
    log_summary["error_count"] = len(summary["errors"])
    _structured_log(rid, "run_summary",
                    mode=log_summary.get("mode"),
                    success=log_summary.get("success", 0),
                    failed=log_summary.get("failed", 0),
                    skipped=log_summary.get("skipped", 0),
                    new_reviews=log_summary.get("new_reviews", 0),
                    total_reviews=log_summary.get("total_reviews", 0),
                    total_competitors=log_summary.get("total_competitors", 0),
                    duration_s=log_summary.get("duration_seconds", 0),
                    error_count=log_summary.get("error_count", 0))

    if summary["failed"] > 0 and summary["failed"] >= summary["success"]:
        logger.warning(
            "ALERT: %d of %d listing(s) failed (failed >= success). "
            "Likely selector breakage in config/selectors.json — investigate.",
            summary["failed"],
            summary["failed"] + summary["success"] + summary["skipped"],
        )

    _SUMMARY_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = _SUMMARY_PATH.with_suffix(".tmp")
    tmp.write_text(
        json.dumps(summary, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    tmp.replace(_SUMMARY_PATH)
    _structured_log(rid, "summary_written", path=str(_SUMMARY_PATH))


def run_verify(url_override: str | None = None) -> dict:
    """Run a verification pass — capture evidence without modifying production data.

    Uses structured logging with a unique run_id. Records per-listing
    capture timing. Does NOT modify production snapshots or deltas.
    """
    started_at = datetime.now(timezone.utc).isoformat()
    rid = _run_id()
    _structured_log(rid, "verify_start", url_override=url_override)

    listings = json.loads(_LISTINGS_PATH.read_text(encoding="utf-8"))
    selectors = json.loads(_SELECTORS_PATH.read_text(encoding="utf-8"))

    verify_ts = rid
    verify_root = Path("data/verify") / verify_ts
    report = {
        "started_at": started_at,
        "finished_at": None,
        "mode": "verify",
        "run_id": rid,
        "url_override": url_override,
        "total": 0,
        "passed": 0,
        "failed": 0,
        "browser_launch_s": 0,
        "results": [],
    }

    total_listings = sum(
        len(branch.get("competitors", []))
        for branch in listings.get("branches", [])
    )
    report["total"] = total_listings

    from harness.selector_tracker import SelectorTracker
    from harness.browser import get_browser_context

    tracker = SelectorTracker()
    context = None
    browser_handles = None
    browser_launch_duration = 0.0

    try:
        t0 = time.time()
        browser_handles = get_browser_context()
        context = browser_handles[2]
        browser_launch_duration = round(time.time() - t0, 2)
        report["browser_launch_s"] = browser_launch_duration
        _structured_log(rid, "browser_launch", duration_s=browser_launch_duration)
    except Exception as e:
        logger.error("FATAL: could not start browser in verify mode: %s", e)
        report["failed"] = total_listings
        report["finished_at"] = datetime.now(timezone.utc).isoformat()
        verify_root.mkdir(parents=True, exist_ok=True)
        (verify_root / "report.json").write_text(
            json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
        )
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

                # M13B: Sanitize competitor_id before using in filesystem paths.
                try:
                    safe_id = _sanitize_competitor_id(comp_id)
                except ValueError as ve:
                    logger.error("VERIFY_FAIL[%s] Invalid competitor_id: %s", comp_id, ve)
                    result = {
                        "competitor_id": comp_id,
                        "branch_id": branch_id,
                        "name": comp_name,
                        "url": url,
                        "status": "FAIL",
                        "capture_s": 0,
                        "error": f"invalid competitor_id: {ve}",
                    }
                    report["results"].append(result)
                    report["failed"] += 1
                    continue

                comp_dir = str(verify_root / safe_id)
                result = {
                    "competitor_id": comp_id,
                    "branch_id": branch_id,
                    "name": comp_name,
                    "url": url,
                    "status": "FAIL",
                    "capture_s": 0,
                }

                t0 = time.time()
                try:
                    _capture_with_retries(
                        context, url, selectors, comp_id,
                        screenshot_dir=comp_dir, tracker=tracker,
                    )
                    result["status"] = "PASS"
                    result["capture_s"] = round(time.time() - t0, 2)
                    report["passed"] += 1
                    _structured_log(rid, "verify_pass", competitor=comp_id,
                                    duration_s=result["capture_s"],
                                    progress=f"{processed}/{total_listings}")
                except Exception as e:
                    result["capture_s"] = round(time.time() - t0, 2)
                    result["error"] = f"{type(e).__name__}: {e}"
                    report["failed"] += 1
                    _structured_log(rid, "verify_fail", competitor=comp_id,
                                    error=str(e), duration_s=result["capture_s"])

                report["results"].append(result)
    finally:
        if browser_handles is not None:
            p, browser, ctx = browser_handles
            t0 = time.time()
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
            _structured_log(rid, "browser_teardown", duration_s=round(time.time() - t0, 2))

    report["finished_at"] = datetime.now(timezone.utc).isoformat()
    verify_root.mkdir(parents=True, exist_ok=True)
    (verify_root / "report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    sel_report = tracker.get_report(configured_selectors=selectors)
    (verify_root / "selector_report.json").write_text(
        json.dumps(sel_report, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    _structured_log(rid, "verify_done",
                    passed=report["passed"], failed=report["failed"],
                    total=report["total"])
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
            "one real Google Maps listing without editing listings.json. "
            "Must start with https://."
        ),
    )
    parser.add_argument(
        "--validate-config",
        action="store_true",
        help=(
            "Validate config/listings.json structure and exit. "
            "Checks for duplicate IDs, missing fields, and invalid place_id "
            "format. Exits 0 if valid, 1 if errors found."
        ),
    )
    return parser.parse_args(argv)


if __name__ == "__main__":
    args = _parse_args()

    # M13B: Config validation mode — validate and exit.
    if args.validate_config:
        try:
            listings = json.loads(_LISTINGS_PATH.read_text(encoding="utf-8"))
        except FileNotFoundError:
            print(f"ERROR: {_LISTINGS_PATH} not found")
            sys.exit(1)
        except json.JSONDecodeError as e:
            print(f"ERROR: {_LISTINGS_PATH} is not valid JSON: {e}")
            sys.exit(1)
        errors = _validate_listings_config(listings)
        if errors:
            print(f"Config validation FAILED ({len(errors)} error(s)):")
            for e in errors:
                print(f"  - {e}")
            sys.exit(1)
        else:
            print(f"Config validation PASSED — {_LISTINGS_PATH} is valid")
            sys.exit(0)

    # M13B: Validate --url if provided.
    if args.url is not None:
        if not isinstance(args.url, str) or not args.url.strip():
            print("ERROR: --url must be a non-empty string")
            sys.exit(1)
        if not args.url.strip().startswith("https://"):
            print(f"ERROR: --url must start with https:// (got {args.url[:20]}...)")
            sys.exit(1)
        if "google.com/maps" not in args.url and "maps.googleapis.com" not in args.url:
            logger.warning("URL does not appear to be a Google Maps URL: %s", args.url[:60])

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
