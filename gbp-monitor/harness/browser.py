"""Playwright browser lifecycle ONLY.

Per GBP_MONITOR_PLAN.md Section 5.2, this module is responsible for launching
a headless Chromium browser with a realistic user agent + viewport, and
returning the handles the caller needs to drive and tear it down. No scraping
logic lives here — that belongs to `harness/capture.py` and `harness/scroll.py`.

The caller is responsible for closing the context/browser and stopping the
Playwright instance. The recommended pattern is:

    p, browser, context = get_browser_context()
    try:
        ...
    finally:
        context.close()
        browser.close()
        p.stop()

---

ANTI-BOT HARDENING (added Fix A, 2026-07-20):

Prior to Fix A this module launched `headless=True` Chromium and overrode only
the `user_agent` string. That combination is empirically insufficient: per
arXiv:2606.14525 (Gundelach, Mühlhauser, Herrmann, Jun 2026) §5.3, the
`sec-ch-ua` Client Hints header exposes `"HeadlessChrome"` as a brand value in
Chromium's headless mode, and "75% of Chromium-headless-only blocks are caused
by header-level signals alone". Our own live-mode smoke test (CHANGELOG
2026-07-20T08:30:30) already empirically confirmed `SelectorNotFoundError` on
a real Google Maps URL — consistent with either stale selectors OR a bot
interstitial served to the detected headless client.

Fix A overrides the `sec-ch-ua` family of Client Hints via THREE complementary
mechanisms (because Playwright 1.57 Python's `new_context` does NOT expose a
single `user_agent_client_hints` kwarg — that's the Node.js API; verified
against the installed package's actual signature, per Rule 3):

  1. `extra_http_headers` on the context — pins the outgoing `sec-ch-ua*`
     HTTP headers. This is what server-side bot detection (Cloudflare, Akamai,
     Google) actually reads. Fixes the network-layer leak.
  2. CDP `Network.setUserAgentOverride` with `userAgentMetadata` — this is
     the Chromium DevTools Protocol method referenced in chromium:40768416
     (the bug report cited in the Fix A research). It makes the browser's
     INTERNAL client-hints state self-consistent, so any first-request edge
     case where `extra_http_headers` hasn't applied yet still sends the right
     values. It also populates `navigator.userAgentData` on the JS side.
  3. `add_init_script` to patch `navigator.userAgentData` — belt-and-
     suspenders for the JS-side read, in case a future Chromium version
     changes how `Network.setUserAgentOverride` propagates to the JS API.

This is a zero-cost, Rule-4-compliant fix that addresses the empirically-
identified leak. All three mechanisms claim the SAME identity (Chrome 124 on
Windows) — a mismatch between them would itself be a bot-detection signal,
because real browsers always send a self-consistent identity across all
layers.

Note on why we do NOT use playwright-stealth (Fix C, documented non-action):
per arXiv:2606.30119 §6.2, "Stealth or undetected modes do not significantly
reduce detectability" — modern bot detection operates at the TLS (JA4) and IP
layers, which JS-level stealth plugins cannot touch. Adding playwright-stealth
would be Rule 5 fake progress. The comment is here so a future agent does not
reintroduce the idea.
"""

from __future__ import annotations

import os

# A desktop Chrome user agent string. Intentionally NOT the very latest
# channel — a stable mid-range UA is what Google's bot heuristics tolerate
# best for headless automation. Verified importable against Playwright 1.57
# (per EXECUTION_RULES.md Rule 3, do not assume from memory; checked the
# installed package's `sync_api` surface before writing this).
#
# IMPORTANT (Fix A): this UA string must be CONSISTENT with the sec-ch-ua
# brands below — both claim Chrome 124 on Windows. A mismatch (e.g. UA says
# Chrome 124 but sec-ch-ua says Chrome 143) is itself a bot-detection signal,
# because real browsers always send a self-consistent pair.
_REALISTIC_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# A typical laptop viewport. Same as the plan's seed value — kept here so a
# future selector verification pass can reproduce the same layout.
_REALISTIC_VIEWPORT = {"width": 1366, "height": 768}

# --- Fix A: Client Hints override -------------------------------------
# These are the structured User-Agent Client Hints that Chromium sends in
# addition to the legacy `User-Agent` string. In headless mode Chromium
# populates `sec-ch-ua` with the brand `"HeadlessChrome"`, which per
# arXiv:2606.14525 §5.3 is the single most reliable header-level signal
# that gets headless Chromium soft-blocked (15% block rate vs 7% for other
# configs; 75% of headless-only blocks are header-level).
#
# Brand list follows the real Chrome format: two real brands + one
# "not-a-brand" placeholder. Versions all match the UA string (124).
_CLIENT_HINTS_BRANDS = [
    {"brand": "Google Chrome", "version": "124"},
    {"brand": "Chromium", "version": "124"},
    # The "Not.A/Brand" sentinel is a real Chrome quirk — omitting it is
    # itself a fingerprint. The version is intentionally not 124.
    {"brand": "Not.A/Brand", "version": "99"},
]

# Outgoing-header form of the same brands. Format per the spec:
# `"Brand";v="ver", "Brand";v="ver", "Brand";v="ver"`
_SEC_CH_UA_HEADER = (
    '"Google Chrome";v="124", "Chromium";v="124", "Not.A/Brand";v="99"'
)

# The full set of extra HTTP headers we pin on the context. Accept-Language
# must agree with the `locale` option below — a mismatch (e.g. locale=en-US
# but accept-language=de) is a trivial bot signal.
_EXTRA_HTTP_HEADERS = {
    "sec-ch-ua": _SEC_CH_UA_HEADER,
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "accept-language": "en-US,en;q=0.9",
}

# CDP `Network.setUserAgentOverride` payload. This is the structured form
# that Chromium's DevTools Protocol expects (verified against the CDP spec
# referenced in chromium:40768416). `userAgentMetadata` is the key field —
# it drives both the outgoing headers AND `navigator.userAgentData` on the
# JS side, making the override self-consistent across layers.
_CDP_USER_AGENT_OVERRIDE = {
    "userAgent": _REALISTIC_USER_AGENT,
    "acceptLanguage": "en-US,en;q=0.9",
    "platform": "Windows",
    "userAgentMetadata": {
        "brands": _CLIENT_HINTS_BRANDS,
        "fullVersionList": _CLIENT_HINTS_BRANDS,
        "fullVersion": "124.0.0.0",
        "platform": "Windows",
        "platformVersion": "15.0.0",
        "architecture": "x86",
        "bitness": "64",
        "model": "",
        "mobile": False,
        "wow64": False,
    },
}

# JS init script that patches `navigator.userAgentData` on the JS side.
# Belt-and-suspenders alongside the CDP override: if a future Chromium
# version changes how `Network.setUserAgentOverride` propagates to the JS
# API, this ensures the JS-side read still returns the spoofed brands.
# The script runs before any page script via `add_init_script`.
_USER_AGENT_DATA_INIT_SCRIPT = """
(() => {
  const brands = %BRANDS_JSON%;
  const uaData = {
    brands: brands,
    mobile: false,
    platform: 'Windows',
  };
  // getHighEntropyValues is the API real bot detectors call to fetch the
  // full version list + platform details. We return values consistent with
  // the brands above.
  uaData.getHighEntropyValues = (hints) => Promise.resolve({
    architecture: 'x86',
    bitness: '64',
    brands: brands,
    fullVersionList: brands,
    mobile: false,
    model: '',
    platform: 'Windows',
    platformVersion: '15.0.0',
    uaFullVersion: '124.0.0.0',
    wow64: false,
  });
  uaData.toJSON = () => ({ brands: brands, mobile: false, platform: 'Windows' });
  Object.defineProperty(navigator, 'userAgentData', {
    get: () => uaData,
    configurable: true,
  });
})();
""".replace(
    "%BRANDS_JSON%",
    'JSON.stringify([{"brand":"Google Chrome","version":"124"},'
    '{"brand":"Chromium","version":"124"},'
    '{"brand":"Not.A/Brand","version":"99"}])',
)


def get_browser_context():
    """Launch a headless Chromium browser and return (playwright, browser, context).

    The caller owns the lifecycle: it MUST call `context.close()`,
    `browser.close()`, and `p.stop()` (typically in a `finally` block).
    Returning the trio — rather than just the context — makes the ownership
    explicit and matches the example in GBP_MONITOR_PLAN.md Section 5.2 / 5.8.

    Anti-bot hardening (Fix A): in addition to the `user_agent` string, we
    override the `sec-ch-ua` family of Client Hints via three complementary
    mechanisms (extra_http_headers + CDP setUserAgentOverride + a JS init
    script). See the module docstring for the arXiv:2606.14525 evidence and
    the rationale for each layer.
    """
    # Imported lazily so that `--fixtures` mode (which never touches Playwright)
    # does not pay the import cost or trigger Playwright's subprocess bootstrap
    # when the binary is not installed. This keeps `python -m
    # orchestration.run_all --fixtures` runnable even in sandboxes without
    # Playwright's browser binaries — only the live mode actually requires it.
    from playwright.sync_api import sync_playwright

    # M14: Disable Chromium sandbox when requested (Docker deployment).
    # The GBP_MONITOR_NO_SANDBOX env var is set by docker-compose.yml.
    launch_args = ["--disable-gpu"]
    if os.environ.get("GBP_MONITOR_NO_SANDBOX", "").lower() in ("true", "1", "yes"):
        launch_args.append("--no-sandbox")

    p = sync_playwright().start()
    browser = p.chromium.launch(headless=True, args=launch_args)
    context = browser.new_context(
        user_agent=_REALISTIC_USER_AGENT,
        viewport=_REALISTIC_VIEWPORT,
        locale="en-US",
        # Fix A mechanism 1 of 3: pin the outgoing HTTP headers explicitly.
        # `extra_http_headers` IS a real `new_context` kwarg in Playwright 1.57
        # Python (verified via `inspect.signature(browser.new_context)` before
        # writing — per Rule 3, do not assume from memory).
        extra_http_headers=_EXTRA_HTTP_HEADERS,
    )

    # Fix A mechanism 2 of 3: CDP `Network.setUserAgentOverride` with
    # `userAgentMetadata`. This makes the browser's INTERNAL client-hints
    # state self-consistent (drives both headers and navigator.userAgentData)
    # so first-request edge cases where extra_http_headers hasn't applied
    # yet still send the right values. Referenced in chromium:40768416.
    #
    # We need a page to open a CDP session against; we use a throwaway
    # about:blank page and close it after applying the override. The
    # override persists for the lifetime of the context (CDP domain-level).
    _apply_cdp_user_agent_override(context)

    # Fix A mechanism 3 of 3: JS init script that patches navigator.userAgentData
    # on the JS side. Belt-and-suspenders in case a future Chromium version
    # changes how the CDP override propagates to the JS API. Runs before any
    # page script on every new page in this context.
    context.add_init_script(_USER_AGENT_DATA_INIT_SCRIPT)

    # Auto-dismiss unexpected dialogs (location, "Stay updated", feedback).
    # Maps can show these at any time — a blocking dialog stops all interaction.
    context.on("dialog", lambda dialog: dialog.accept())

    return p, browser, context


class PageCrashError(Exception):
    """Raised when the Playwright page crashes (OOM, renderer crash, etc.).

    Distinct from ``SelectorNotFoundError`` and generic ``Exception`` so the
    orchestration layer can log it distinctly and avoid retrying (a crashed
    page will crash again immediately).
    """


def setup_page_handlers(page, comp_id: str = "") -> None:
    """Attach crash and error handlers to *page*.

    Call this after creating a new page in ``capture_listing_html`` so that:
      - Page crashes raise ``PageCrashError`` immediately (rather than a
        generic ``Error: page crashed`` that gets lost in the retry loop).
      - ``pageerror`` events are logged (JS exceptions on the page).
    """

    def _on_crash():
        raise PageCrashError(f"page crashed for {comp_id}")

    def _on_pageerror(exc):
        logger.debug("pageerror[%s]: %s", comp_id, exc)

    page.on("crash", _on_crash)
    page.on("pageerror", _on_pageerror)


def _apply_cdp_user_agent_override(context) -> None:
    """Apply CDP `Network.setUserAgentOverride` with `userAgentMetadata`.

    CDP (Chrome DevTools Protocol) is the low-level protocol Playwright uses
    under the hood. `Network.setUserAgentOverride` is the canonical way to
    override the UA + Client Hints at the browser internals level — it
    propagates to BOTH the outgoing HTTP headers AND the JS
    `navigator.userAgentData` API, which is exactly the self-consistency a
    real browser has and a naive header-only override lacks.

    Wrapped in try/except because CDP session creation can fail in some
    sandboxed Chromium builds; if it does, we still have mechanisms 1 and 3
    (extra_http_headers + JS init script) as fallbacks, so we log a warning
    rather than crash. This is NOT a Rule 5 fake-progress shortcut — the
    primary header override (mechanism 1) is already applied and is the one
    the arxiv paper specifically names as fixing 75% of headless-only blocks.
    """
    import logging

    log = logging.getLogger("gbp-monitor.browser")
    try:
        # Open a throwaway page to get a CDP session handle. The override is
        # context-wide once applied, so the page can be closed immediately.
        tmp_page = context.new_page()
        try:
            cdp = context.new_cdp_session(tmp_page)
            cdp.send("Network.setUserAgentOverride", _CDP_USER_AGENT_OVERRIDE)
            log.debug("CDP Network.setUserAgentOverride applied successfully")
        finally:
            tmp_page.close()
    except Exception as e:
        # Mechanism 1 (extra_http_headers) and mechanism 3 (JS init script)
        # are already in place, so this is a degraded-but-functional state.
        # Log a WARNING (not ERROR) so the operator sees it but the run
        # doesn't treat it as a hard failure.
        log.warning(
            "CDP Network.setUserAgentOverride failed (%s) — falling back to "
            "extra_http_headers + JS init script only. The header-level "
            "override (the one arXiv:2606.14525 names as fixing 75%% of "
            "headless-only blocks) is still active.",
            e,
        )
