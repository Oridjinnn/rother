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
"""

from __future__ import annotations

# A desktop Chrome user agent string. Intentionally NOT the very latest
# channel — a stable mid-range UA is what Google's bot heuristics tolerate
# best for headless automation. Verified importable against Playwright 1.57
# (per EXECUTION_RULES.md Rule 3, do not assume from memory; checked the
# installed package's `sync_api` surface before writing this).
_REALISTIC_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# A typical laptop viewport. Same as the plan's seed value — kept here so a
# future selector verification pass can reproduce the same layout.
_REALISTIC_VIEWPORT = {"width": 1366, "height": 768}


def get_browser_context():
    """Launch a headless Chromium browser and return (playwright, browser, context).

    The caller owns the lifecycle: it MUST call `context.close()`,
    `browser.close()`, and `p.stop()` (typically in a `finally` block).
    Returning the trio — rather than just the context — makes the ownership
    explicit and matches the example in GBP_MONITOR_PLAN.md Section 5.2 / 5.8.
    """
    # Imported lazily so that `--fixtures` mode (which never touches Playwright)
    # does not pay the import cost or trigger Playwright's subprocess bootstrap
    # when the binary is not installed. This keeps `python -m
    # orchestration.run_all --fixtures` runnable even in sandboxes without
    # Playwright's browser binaries — only the live mode actually requires it.
    from playwright.sync_api import sync_playwright

    p = sync_playwright().start()
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        user_agent=_REALISTIC_USER_AGENT,
        viewport=_REALISTIC_VIEWPORT,
        locale="en-US",
    )
    return p, browser, context
