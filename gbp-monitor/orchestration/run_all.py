"""orchestration.run_all — single, reliable product path for the GBP scraper.

This module is now the ONLY command the product uses:

    python -m orchestration.run_all --business <place_id> --max-reviews 100 \
        [--session <storage_state.json>] [--mode live]

It replaces the old variant_framework matrix / experiment scaffolding as the
happy path. The matrix experiments (variant_framework.*) remain available for
research but are deliberately NOT on the critical path — they are what made the
harness feel fragile.

Given a real Google Maps ``place_id`` and a logged-in session, it:

  1. Pre-flights the ``place_id`` (format + best-effort reachability/name check).
  2. REFUSES to run anonymously: if no valid storage_state / cookies exist, it
     exits with a clear ``NEED_SESSION`` error and writes NO review data.
  3. Loads the logged-in ``storage_state`` (or seeds cookies) before navigating.
  4. Opens the place's Reviews tab and sorts by "Newest" for deterministic order.
  5. Scrolls the reviews container in small, human-like, randomized increments
     (the old ``scrollTop = scrollHeight`` jump is gone — it caused scroll
     recycling / 11x duplicate DOM nodes).
  6. Parses every new content with ``parsel`` (review_id, author, rating, text,
     relative date, owner response) and dedupes strictly by ``review_id``.
  7. Stops when it has >= ``--max-reviews`` real reviews, OR when no new review
     appears after >= 6 consecutive scrolls (genuine end / soft block), OR when
     a block signal is detected (CAPTCHA, "unusual traffic", null ratings).
  8. Writes the dashboard-compatible layout:
       - ``reviews_new/{competitor_id}_{ts}.json``  (the run's new reviews)
       - ``snapshots/{competitor_id}/{ts}.json`` + ``latest.json`` (full set)
       - ``run_summary.json`` with status: OK | BLOCKED | INSUFFICIENT |
         NEED_SESSION | INVALID_PLACE_ID | FAILED
       - appends to ``run.log``
  9. Honors ``GBP_MONITOR_MIN_DISK_BYTES`` before writing anything.

Honest reporting is non-negotiable: a business with < 100 reviews never gets
silently reported as success; it is reported as INSUFFICIENT with the real count.
"""

from __future__ import annotations

import argparse
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

# `base_data_dir()` honors ROTHER_DATA_DIR so the Node scrape-runner can scope
# a run to a single business's data directory (data/users/{businessId}).
from storage.common import base_data_dir

_DATA = base_data_dir()
_DATA.mkdir(parents=True, exist_ok=True)

_LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s %(message)s"
logging.basicConfig(
    level=logging.INFO,
    format=_LOG_FORMAT,
    handlers=[
        logging.FileHandler(_DATA / "run.log", encoding="utf-8"),
        logging.StreamHandler(sys.stderr),
    ],
)
logger = logging.getLogger("gbp-monitor.run_all")

# ── Status constants ─────────────────────────────────────────────────
STATUS_OK = "OK"
STATUS_BLOCKED = "BLOCKED"
STATUS_INSUFFICIENT = "INSUFFICIENT"
STATUS_NEED_SESSION = "NEED_SESSION"
STATUS_INVALID_PLACE_ID = "INVALID_PLACE_ID"
STATUS_FAILED = "FAILED"

# Exit codes (non-zero lets the verification gate fail loudly).
EXIT_OK = 0
EXIT_FAILED = 1
EXIT_NEED_SESSION = 2
EXIT_INSUFFICIENT = 3
EXIT_BLOCKED = 4
EXIT_INVALID_PLACE_ID = 5

# ── Hardening constants ──────────────────────────────────────────────
_MIN_FREE_DISK_BYTES = int(os.environ.get("GBP_MONITOR_MIN_DISK_BYTES", "104857600"))
_MAX_SCROLLS = 200
_MIN_CONSECUTIVE_NO_NEW = 6          # >=6 scrolls w/ no new id => genuine end
_SCROLL_MIN_DELAY_MS = 800           # human-like lower bound
_SCROLL_MAX_DELAY_MS = 2200          # human-like upper bound
_SCROLL_INCREMENT_MIN = 0.55         # fraction of container height per scroll
_SCROLL_INCREMENT_MAX = 0.95
_PLACE_ID_RE = re.compile(r"^ChIJ[A-Za-z0-9_\-]{20,}$")
_CAPTCHA_TERMS = ("recaptcha", "captcha", "unusual traffic", "automated queries",
                  "verify you are human", "our systems have detected")

# ── Security helpers (path-traversal safe IDs; kept for legacy tests) ──

_VALID_COMPETITOR_ID_RE = re.compile(r"^[a-zA-Z0-9_-]+$")
_MAX_COMPETITOR_ID_LEN = 64


def _sanitize_competitor_id(competitor_id: str) -> str:
    """Validate + sanitize a competitor_id for safe filesystem use.

    Rejects path traversal (``..``, ``/``, ``\\``, null), over-length, and
    non-``[a-zA-Z0-9_-]`` characters. Returns the cleaned id.
    """
    if not competitor_id or not isinstance(competitor_id, str):
        raise ValueError("competitor_id must be a non-empty string")
    if "\x00" in competitor_id:
        raise ValueError("competitor_id contains null byte")
    if competitor_id.startswith("-") or competitor_id.endswith("-"):
        raise ValueError("competitor_id cannot start/end with hyphen")
    if ".." in competitor_id:
        raise ValueError("competitor_id contains '..' (path traversal)")
    if "/" in competitor_id or "\\" in competitor_id:
        raise ValueError("competitor_id contains path separator")
    if len(competitor_id) > _MAX_COMPETITOR_ID_LEN:
        raise ValueError(f"competitor_id exceeds {_MAX_COMPETITOR_ID_LEN} chars")
    if not _VALID_COMPETITOR_ID_RE.match(competitor_id):
        raise ValueError("competitor_id has invalid characters")
    return competitor_id


# Log rotation threshold (kept for scripts/_test_rotation_direct.py).
_LOG_ROTATION_BYTES = 5_242_880


def _rotate_run_log_if_needed() -> None:
    """Rotate ``data/run.log`` if it exceeds ``_LOG_ROTATION_BYTES``."""
    log_path = _DATA / "run.log"
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


def _validate_listings_config(listings: dict) -> list[str]:
    """Validate listings.json structure. Returns a list of error strings."""
    errors: list[str] = []
    branches = listings.get("branches", [])
    if not isinstance(branches, list):
        errors.append("listings.json: 'branches' must be a list")
        return errors
    if not branches:
        errors.append("listings.json: 'branches' list is empty")
        return errors
    seen_branch: set[str] = set()
    seen_comp: set[str] = set()
    for bi, branch in enumerate(branches):
        if not isinstance(branch, dict):
            errors.append(f"listings.json: branch[{bi}] is not an object")
            continue
        bid = branch.get("branch_id")
        if not bid or not isinstance(bid, str):
            errors.append(f"listings.json: branch[{bi}] missing 'branch_id'")
        else:
            if bid in seen_branch:
                errors.append(f"listings.json: duplicate branch_id {bid!r}")
            seen_branch.add(bid)
        competitors = branch.get("competitors", [])
        if not isinstance(competitors, list):
            errors.append(f"listings.json: branch[{bid}] 'competitors' must be a list")
            continue
        for ci, comp in enumerate(competitors):
            if not isinstance(comp, dict):
                errors.append(f"listings.json: branch[{bid}] competitor[{ci}] not object")
                continue
            cid = comp.get("competitor_id")
            if not cid or not isinstance(cid, str):
                errors.append(f"listings.json: branch[{bid}] competitor[{ci}] missing id")
            else:
                if cid in seen_comp:
                    errors.append(f"listings.json: duplicate competitor_id {cid!r}")
                seen_comp.add(cid)
            pid = comp.get("place_id")
            if pid is not None:
                if not isinstance(pid, str) or not pid.strip():
                    errors.append(f"listings.json: {cid} 'place_id' must be non-empty or null")
                elif not pid.startswith("ChIJ") or len(pid) < 25:
                    errors.append(f"listings.json: {cid} 'place_id' {pid!r} looks invalid")
    return errors


def _run_id() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _structured_log(run_id: str, stage: str, **kwargs) -> None:
    record = {"run_id": run_id, "stage": stage, "ts": datetime.now(timezone.utc).isoformat()}
    record.update(kwargs)
    logger.info("JSONLOG: %s", json.dumps(record, default=str))


# ── Pre-flight ──────────────────────────────────────────────────────

def _validate_place_id_format(place_id: str) -> str | None:
    """Return an error string if *place_id* is not a plausible Google place id.

    Mirrors the rules used in validate_listing.py / _validate_listings_config:
    starts with ``ChIJ`` and is >= 25 chars.
    """
    if not place_id or not isinstance(place_id, str):
        return "place_id is required"
    pid = place_id.strip()
    if len(pid) < 25:
        return f"place_id too short ({len(pid)} chars); expected >=25 (got {pid!r})"
    if not pid.startswith("ChIJ"):
        return f"place_id must start with 'ChIJ' (got {pid!r})"
    if not _PLACE_ID_RE.match(pid):
        return f"place_id has unexpected characters (got {pid!r})"
    return None


def _preflight_reachability(place_id: str) -> str | None:
    """Best-effort reachability + name cross-check. Returns a warning or None.

    Uses discovery.validate_listing for a cheap URL check and
    discovery.validate_place_id (needs GOOGLE_PLACES_API_KEY) for a name
    cross-check. Network failures are downgraded to WARNINGs, never hard
    aborts, because the real capture might still succeed.
    """
    url = f"https://www.google.com/maps/place/?q=place_id:{place_id}"
    warning: str | None = None
    try:
        from discovery.validate_listing import validate_listing, validate_place_id
        if not validate_listing(url):
            warning = "pre-flight: listing URL not reachable (will still attempt live capture)"
            logger.warning(warning)
        api_key = os.environ.get("GOOGLE_PLACES_API_KEY")
        if api_key:
            ok, note = validate_place_id(place_id, None, api_key)
            if not ok:
                logger.warning("pre-flight: place_id name cross-check: %s", note)
    except Exception as e:  # never let pre-flight crash the run
        logger.debug("pre-flight reachability skipped: %s", e)
    return warning


# ── Session / auth ──────────────────────────────────────────────────

def _resolve_session(session_arg: str | None) -> tuple[str | None, str | None]:
    """Resolve the logged-in session source.

    Priority: ``--session`` CLI arg, then ``GBP_MONITOR_STORAGE_STATE`` env,
    then ``GBP_MONITOR_COOKIES_FILE`` env. Returns
    ``(storage_state_path, cookies_path)``; either may be None.
    """
    storage_state = session_arg or os.environ.get("GBP_MONITOR_STORAGE_STATE")
    cookies = os.environ.get("GBP_MONITOR_COOKIES_FILE")
    ss = Path(storage_state).expanduser() if storage_state else None
    cf = Path(cookies).expanduser() if cookies else None
    return (
        str(ss) if ss and ss.exists() else None,
        str(cf) if cf and cf.exists() else None,
    )


# ── Browser ─────────────────────────────────────────────────────────

def _launch_browser(storage_state: str | None, cookies: str | None):
    """Launch headless Chromium with anti-bot hardening + the logged-in session.

    Reuses the proven hardening from ``harness.browser`` (consistent UA +
    Client Hints across three layers) but injects the logged-in
    ``storage_state`` (or seeds ``cookies``) — anonymous runs are NOT allowed.
    Returns ``(playwright, browser, context)``; the caller owns teardown.
    """
    from playwright.sync_api import sync_playwright
    from harness.browser import (
        _REALISTIC_USER_AGENT,
        _EXTRA_HTTP_HEADERS,
        _USER_AGENT_DATA_INIT_SCRIPT,
        _apply_cdp_user_agent_override,
    )

    launch_args = ["--disable-gpu"]
    if os.environ.get("GBP_MONITOR_NO_SANDBOX", "").lower() in ("true", "1", "yes"):
        launch_args.append("--no-sandbox")

    p = sync_playwright().start()
    browser = p.chromium.launch(headless=True, args=launch_args)

    ctx_kwargs: dict = {
        "user_agent": _REALISTIC_USER_AGENT,
        "viewport": {"width": 1366, "height": 768},
        # id-ID locale + accept-language keeps rating text parseable ("X bintang").
        "locale": "id-ID",
        "extra_http_headers": {
            **_EXTRA_HTTP_HEADERS,
            "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        },
    }
    if storage_state:
        ctx_kwargs["storage_state"] = storage_state

    context = browser.new_context(**ctx_kwargs)

    if cookies and not storage_state:
        try:
            cookie_data = json.loads(Path(cookies).read_text(encoding="utf-8"))
            if isinstance(cookie_data, dict) and "cookies" in cookie_data:
                cookie_data = cookie_data["cookies"]
            context.add_cookies(cookie_data)
        except Exception as e:
            logger.warning("Failed to seed cookies from %s: %s", cookies, e)

    _apply_cdp_user_agent_override(context)
    context.add_init_script(_USER_AGENT_DATA_INIT_SCRIPT)
    context.on("dialog", lambda dialog: dialog.accept())
    return p, browser, context


# ── Navigation + sorting ────────────────────────────────────────────

def _goto_reviews(page, url: str) -> None:
    page.set_default_navigation_timeout(45000)
    page.set_default_timeout(15000)
    page.goto(url, timeout=45000)
    # Give the SPA a moment to hydrate the place panel.
    page.wait_for_timeout(2500)


def _click_by_text(page, text: str, timeout_ms: int = 6000) -> bool:
    """Click the first element whose visible text equals/contains *text*."""
    try:
        loc = page.get_by_text(text, exact=False).first
        loc.wait_for(state="visible", timeout=timeout_ms)
        loc.click(timeout=timeout_ms)
        return True
    except Exception:
        return False


def _open_reviews_and_sort_newest(page) -> None:
    """Open the Reviews tab and sort by Newest (deterministic collection)."""
    # Reviews are sometimes embedded in the initial HTML; clicking the tab is
    # best-effort and non-fatal if it isn't found.
    for label in ("Reviews", "Ulasan"):
        if _click_by_text(page, label):
            logger.info("Clicked Reviews tab (%s)", label)
            page.wait_for_timeout(1500)
            break

    # Sort: open the "Most relevant" menu, then click "Newest".
    for sort_label in ("Most relevant", "Terbaru", "Paling relevan"):
        if _click_by_text(page, sort_label, timeout_ms=4000):
            logger.info("Opened sort menu (%s)", sort_label)
            page.wait_for_timeout(600)
            for newest in ("Newest", "Terbaru"):
                if _click_by_text(page, newest, timeout_ms=4000):
                    logger.info("Selected sort => %s", newest)
                    page.wait_for_timeout(800)
                    return
            return


# ── Block detection ─────────────────────────────────────────────────

def _detect_block(page) -> str | None:
    """Return a block reason string if a bot-wall / CAPTCHA is detected."""
    try:
        html = page.content()
    except Exception:
        return None
    low = html.lower()
    if "recaptcha" in low or "google.com/recaptcha" in low or "recaptcha/api" in low:
        return "CAPTCHA interstitial detected"
    for term in _CAPTCHA_TERMS:
        if term in low:
            return f"block signal detected: '{term}'"
    # CAPTCHA iframes are a strong, structural signal.
    try:
        iframes = page.query_selector_all("iframe")
        for f in iframes:
            src = (f.get_attribute("src") or "").lower()
            title = (f.get_attribute("title") or "").lower()
            if "recaptcha" in src or "captcha" in src or "captcha" in title:
                return "CAPTCHA iframe detected"
    except Exception:
        pass
    return None


def _null_rating_ratio(reviews: list[dict]) -> float:
    if not reviews:
        return 0.0
    nulls = sum(1 for r in reviews if r.get("rating") is None)
    return nulls / len(reviews)


# ── Incremental scroll + collect ────────────────────────────────────

def _scroll_and_collect(
    page,
    selectors: dict,
    competitor_id: str,
    branch_id: str,
    max_reviews: int,
    run_id: str,
) -> tuple[list[dict], str, str]:
    """Incremental, human-like scroll that dedupes by review_id.

    Returns ``(reviews, status, stopped_reason)`` where *reviews* is the
    deduplicated list of collected review dicts.
    """
    from parsel import Selector
    from parser.review_parser import parse_reviews
    from parser.schema import review_to_dict
    from harness.selectors import resolve_selectors

    container_candidates = resolve_selectors(selectors, "review_container") or [
        "div.m6QErb[role='region']"
    ]

    seen: set[str] = set()
    reviews: list[dict] = []
    consecutive_no_new = 0
    status = STATUS_OK
    stopped_reason = ""

    for i in range(_MAX_SCROLLS):
        # Parse current DOM (cheap; parsel only).
        try:
            html = page.content()
        except Exception as e:
            logger.warning("page.content() failed at scroll %d: %s", i, e)
            html = ""

        parsed = parse_reviews(html, competitor_id, branch_id, selectors)
        new_in_this_pass = 0
        for rev in parsed:
            d = review_to_dict(rev)
            rid = d.get("review_id")
            if not rid or rid in seen:
                continue
            seen.add(rid)
            reviews.append(d)
            new_in_this_pass += 1

        # Progress (both for logs and the Node runner's JSONLOG parser).
        _structured_log(
            run_id,
            "collection_progress",
            collected=len(reviews),
            target=max_reviews,
            new_in_pass=new_in_this_pass,
            progress=f"{len(reviews)}/{max_reviews}",
        )

        # Block signals mid-collection.
        block = _detect_block(page)
        if block:
            return reviews, STATUS_BLOCKED, block
        if len(reviews) >= 5 and _null_rating_ratio(reviews) >= 0.9:
            return reviews, STATUS_BLOCKED, (
                "anonymous/null ratings detected on >=90% of parsed reviews "
                "(RISK-023 auth-gated response)"
            )

        if len(reviews) >= max_reviews:
            status = STATUS_OK
            stopped_reason = f"reached target {max_reviews} reviews"
            return reviews, status, stopped_reason

        if new_in_this_pass == 0:
            consecutive_no_new += 1
        else:
            consecutive_no_new = 0

        if consecutive_no_new >= _MIN_CONSECUTIVE_NO_NEW:
            if len(reviews) >= max_reviews:
                status = STATUS_OK
                stopped_reason = f"reached target {max_reviews} reviews"
            else:
                status = STATUS_INSUFFICIENT
                stopped_reason = (
                    f"no new reviews after {consecutive_no_new} consecutive scrolls "
                    f"(genuine end or soft block); collected {len(reviews)}/"
                    f"{max_reviews}"
                )
            return reviews, status, stopped_reason

        # Human-like incremental scroll: a fraction of the container height,
        # NEVER scrollTop = scrollHeight (that triggers scroll recycling).
        scrolled = False
        for cand in container_candidates:
            try:
                if page.query_selector(cand):
                    page.eval_on_selector(
                        cand,
                        """(el, lo, hi) => {
                            const inc = el.clientHeight * (lo + Math.random() * (hi - lo));
                            el.scrollTop += inc;
                        }""",
                        _SCROLL_INCREMENT_MIN,
                        _SCROLL_INCREMENT_MAX,
                    )
                    scrolled = True
                    break
            except Exception:
                continue
        if not scrolled:
            # Fallback: scroll the window a bit.
            try:
                page.mouse.wheel(0, random.randint(400, 900))
            except Exception:
                pass

        page.wait_for_timeout(random.randint(_SCROLL_MIN_DELAY_MS, _SCROLL_MAX_DELAY_MS))

    # Hit the hard ceiling without a clean stop — report honestly.
    if len(reviews) >= max_reviews:
        return reviews, STATUS_OK, f"reached target {max_reviews} reviews"
    return (
        reviews,
        STATUS_INSUFFICIENT,
        f"hit MAX_SCROLLS={_MAX_SCROLLS} with {len(reviews)}/{max_reviews} reviews",
    )


# ── Output writers ──────────────────────────────────────────────────

def _check_disk() -> str | None:
    try:
        usage = shutil.disk_usage(str(_DATA))
        if usage.free < _MIN_FREE_DISK_BYTES:
            return (
                f"low disk space: {usage.free // (1024 * 1024)} MB free "
                f"(minimum {_MIN_FREE_DISK_BYTES // (1024 * 1024)} MB)"
            )
    except OSError as e:
        return f"could not check disk space: {e}"
    return None


def _business_id_for(competitor_id: str) -> str:
    return competitor_id


def _write_reviews(
    reviews: list[dict],
    competitor_id: str,
    run_ts: str,
) -> None:
    """Write reviews to both the delta (reviews_new) and snapshot layout."""
    # Delta (new reviews for this run).
    reviews_new_dir = _DATA / "reviews_new"
    reviews_new_dir.mkdir(parents=True, exist_ok=True)
    delta_path = reviews_new_dir / f"{competitor_id}_{run_ts}.json"
    _atomic_write(delta_path, reviews)

    # Snapshot (full set) so /api/reviews + /api/overview read it.
    snap_dir = _DATA / "snapshots" / competitor_id
    snap_dir.mkdir(parents=True, exist_ok=True)
    snap_path = snap_dir / f"{run_ts}.json"
    _atomic_write(snap_path, reviews)
    _atomic_write(snap_dir / "latest.json", snap_path.name)


def _atomic_write(path: Path, data) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def _write_summary(summary: dict) -> None:
    _atomic_write(_DATA / "run_summary.json", summary)
    _structured_log(
        summary.get("run_id", ""),
        "run_finish",
        status=summary.get("status"),
        review_count=summary.get("reviewCount"),
        target=summary.get("targetCount"),
        stopped_reason=summary.get("stoppedReason"),
    )


def _build_summary(
    *,
    run_id: str,
    started_at: str,
    business_id: str,
    place_id: str,
    business_name: str,
    reviews: list[dict],
    target: int,
    status: str,
    stopped_reason: str,
    mode: str,
) -> dict:
    return {
        # Dashboard contract (paths.ts / server-data.ts).
        "started_at": started_at,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "success": 1 if status == STATUS_OK else 0,
        "failed": 0 if status in (STATUS_OK, STATUS_INSUFFICIENT) else 1,
        "skipped": 0,
        "new_reviews": len(reviews),
        "total_reviews": len(reviews),
        "errors": [] if status == STATUS_OK else [
            {"competitor_id": business_id, "error": stopped_reason}
        ],
        # Product-path status fields (surfaced by the UI).
        "status": status,
        "businessId": business_id,
        "businessName": business_name,
        "placeId": place_id,
        "scrapedAt": datetime.now(timezone.utc).isoformat(),
        "reviewCount": len(reviews),
        "targetCount": target,
        "stoppedReason": stopped_reason,
    }


# ── Main product flow ───────────────────────────────────────────────

def _read_active_business_id() -> tuple[str | None, str | None]:
    """Read the active business id/name from config/user-business.json (if any)."""
    path = Path("config/user-business.json")
    if not path.exists():
        return None, None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data.get("id"), data.get("name")
    except (json.JSONDecodeError, OSError):
        return None, None


def _sanitize_competitor_id(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_\-]", "_", value.strip())
    return cleaned or "business"


def run_product(
    place_id: str,
    max_reviews: int,
    session: str | None,
    mode: str,
) -> int:
    started_at = datetime.now(timezone.utc).isoformat()
    run_id = _run_id()
    place_id = place_id.strip()

    # Pre-flight: place_id format.
    fmt_err = _validate_place_id_format(place_id)
    if fmt_err:
        summary = _build_summary(
            run_id=run_id, started_at=started_at, business_id="",
            place_id=place_id, business_name="", reviews=[], target=max_reviews,
            status=STATUS_INVALID_PLACE_ID, stopped_reason=fmt_err, mode=mode,
        )
        _write_summary(summary)
        logger.error("INVALID_PLACE_ID: %s", fmt_err)
        return EXIT_INVALID_PLACE_ID

    _preflight_reachability(place_id)

    # Disk health BEFORE doing any work.
    disk_err = _check_disk()
    if disk_err:
        logger.warning("DISK: %s", disk_err)

    # Session requirement — refuse to run anonymously.
    storage_state, cookies = _resolve_session(session)
    if not storage_state and not cookies:
        reason = (
            "no logged-in session found. Set --session <storage_state.json> or the "
            "GBP_MONITOR_STORAGE_STATE / GBP_MONITOR_COOKIES_FILE env vars to a valid "
            "logged-in Playwright session. Anonymous scraping returns null ratings "
            "(RISK-023) and is not allowed."
        )
        summary = _build_summary(
            run_id=run_id, started_at=started_at, business_id="",
            place_id=place_id, business_name="", reviews=[], target=max_reviews,
            status=STATUS_NEED_SESSION, stopped_reason=reason, mode=mode,
        )
        _write_summary(summary)
        logger.error("NEED_SESSION: %s", reason)
        return EXIT_NEED_SESSION

    # Determine competitor_id / business_id.
    active_id, active_name = _read_active_business_id()
    if active_id:
        business_id = active_id
        business_name = active_name or ""
    else:
        business_id = _sanitize_competitor_id(place_id)
        business_name = ""
    competitor_id = _business_id_for(business_id)
    branch_id = competitor_id

    logger.info(
        "Starting product run: place_id=%s business_id=%s target=%d",
        place_id, business_id, max_reviews,
    )
    _structured_log(run_id, "run_start", mode=mode, place_id=place_id,
                    business_id=business_id, target=max_reviews)

    p = browser = context = None
    reviews: list[dict] = []
    try:
        p, browser, context = _launch_browser(storage_state, cookies)
        from harness.browser import setup_page_handlers
        page = context.new_page()
        setup_page_handlers(page, comp_id=competitor_id)

        url = f"https://www.google.com/maps/place/?q=place_id:{place_id}"
        _goto_reviews(page, url)
        # Hard block right after navigation.
        block = _detect_block(page)
        if block:
            status, reason = STATUS_BLOCKED, block
        else:
            _open_reviews_and_sort_newest(page)
            reviews, status, reason = _scroll_and_collect(
                page, _load_selectors(), competitor_id, branch_id, max_reviews, run_id
            )
    except Exception as e:
        logger.exception("Scrape run failed: %s", e)
        status, reason = STATUS_FAILED, f"{type(e).__name__}: {e}"
    finally:
        try:
            if context is not None:
                context.close()
            if browser is not None:
                browser.close()
            if p is not None:
                p.stop()
        except Exception as e:
            logger.warning("Teardown error: %s", e)

    # Write outputs only when we actually collected something (never empty
    # success). Even INSUFFICIENT/BLOCKED writes whatever we got so the UI can
    # render it honestly; NEED_SESSION/INVALID already returned earlier.
    if reviews:
        _write_reviews(reviews, competitor_id, run_id)

    summary = _build_summary(
        run_id=run_id, started_at=started_at, business_id=business_id,
        place_id=place_id, business_name=business_name, reviews=reviews,
        target=max_reviews, status=status, stopped_reason=reason, mode=mode,
    )
    _write_summary(summary)

    exit_code = {
        STATUS_OK: EXIT_OK,
        STATUS_INSUFFICIENT: EXIT_INSUFFICIENT,
        STATUS_BLOCKED: EXIT_BLOCKED,
        STATUS_FAILED: EXIT_FAILED,
    }.get(status, EXIT_FAILED)
    logger.info(
        "Run finished: status=%s reviewCount=%d/%d reason=%s",
        status, len(reviews), max_reviews, reason,
    )
    return exit_code


def _load_selectors() -> dict:
    path = Path("config/selectors.json")
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("Could not load selectors.json: %s", e)
    return {}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="GBP monitor — single-path review scraper (product).",
    )
    parser.add_argument(
        "--business", required=True,
        help="Google Maps place_id to scrape (e.g. ChIJ...).",
    )
    parser.add_argument("--max-reviews", type=int, default=100)
    parser.add_argument(
        "--session", default=None,
        help="Path to a Playwright storage_state.json from a logged-in session.",
    )
    parser.add_argument("--mode", default="live", choices=["live", "fixtures"])
    args = parser.parse_args(argv)

    # Signal-safe teardown flag is unnecessary here; run_product closes its own.
    def _shutdown(signum, _frame):
        logger.warning("Received %s — aborting.", signal.Signals(signum).name)
        sys.exit(EXIT_FAILED)

    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    return run_product(args.business, args.max_reviews, args.session, args.mode)


if __name__ == "__main__":
    sys.exit(main())
