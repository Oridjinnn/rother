"""Browser availability probe for the category-scan live path.

P1 / RISK-023 — make the Playwright/Chromium dependency explicit. The live
capture path in :mod:`discovery.category_scan` needs the Chromium binary AND
network access; this module answers, cheaply, "is a headless Chromium launch
even possible right now?". It is consumed by ``src/app/api/health/route.ts`` so
the dashboard can surface browser availability and gate the live toggle.

The probe attempts a real (but tiny) headless launch with no long-running
page work, so it stays cheap enough to call on a health hit — the result is
cached process-side by the caller. Any failure (missing binary, missing
module, sandbox/launch error) yields ``False`` rather than raising.
"""

from __future__ import annotations

import json


def is_browser_available() -> bool:
    """Return ``True`` only if a headless Chromium launch succeeds.

    Defensive on every layer:
      * Playwright not installed → ``False``
      * binary not downloaded → ``False``
      * launch error (sandbox, missing deps) → ``False``

    Never raises.
    """
    try:
        from playwright.sync_api import sync_playwright
    except Exception:
        return False

    browser = None
    playwright = None
    try:
        playwright = sync_playwright().start()
        browser = playwright.chromium.launch(headless=True, args=["--disable-gpu"])
        return True
    except Exception:
        return False
    finally:
        try:
            if browser is not None:
                browser.close()
        except Exception:
            pass
        try:
            if playwright is not None:
                playwright.stop()
        except Exception:
            pass


if __name__ == "__main__":
    print(json.dumps({"available": is_browser_available()}))
