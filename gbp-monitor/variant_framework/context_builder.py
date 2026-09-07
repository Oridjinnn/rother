"""Build a Playwright browser + context from an ExperimentSpec.

One independent variable per experiment: each variable in the spec is mapped
to exactly the corresponding Playwright constructor argument, and only that.
The default (baseline) configuration mirrors the production pipeline's
hardened context (harness.browser) so matrix runs are comparable to
production behavior.
"""

from __future__ import annotations

import os
from pathlib import Path

from playwright.sync_api import Browser, BrowserContext, Playwright

# Chrome UA/version tables -------------------------------------------------
_UA_BY_VERSION = {
    "120": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
           "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "124": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
           "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "128": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
           "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
}

_SEC_CH_UA_BY_VERSION = {
    "120": '"Google Chrome";v="120", "Chromium";v="120", "Not.A/Brand";v="99"',
    "124": '"Google Chrome";v="124", "Chromium";v="124", "Not.A/Brand";v="99"',
    "128": '"Google Chrome";v="128", "Chromium";v="128", "Not.A/Brand";v="99"',
}


def _brands_for_version(version: str) -> list[dict]:
    return [
        {"brand": "Google Chrome", "version": version},
        {"brand": "Chromium", "version": version},
        {"brand": "Not.A/Brand", "version": "99"},
    ]


def _launch_options(spec) -> tuple[dict, dict]:
    """Return (launch_kwargs, context_kwargs) for this spec."""
    v = spec.get("browser_version", "124")
    launch: dict = {
        "headless": spec.get("headed", "headless") != "headed",
        "args": ["--disable-gpu"],
    }
    if os.environ.get("GBP_MONITOR_NO_SANDBOX", "").lower() in ("true", "1", "yes"):
        launch["args"].append("--no-sandbox")
    channel = spec.get("chrome_channel", "chromium")
    if channel == "chrome":
        # System Google Chrome — only used if installed; failure is handled by
        # the runner (recorded as FAIL, not silently retried).
        launch["channel"] = "chrome"
    # Headed mode needs the "new headless" flag off; Playwright handles this
    # via headless=False automatically.
    if launch["headless"] is False:
        launch["headless"] = False

    ua = _UA_BY_VERSION.get(v, _UA_BY_VERSION["124"])
    sec_ch_ua = _SEC_CH_UA_BY_VERSION.get(v, _SEC_CH_UA_BY_VERSION["124"])
    lang = spec.get("browser_language", "en-US,en;q=0.9")

    w, h = (int(x) for x in spec.get("viewport", "1366x768").split("x"))

    context: dict = {
        "user_agent": ua,
        "viewport": {"width": w, "height": h},
        "locale": spec.get("locale", "en-US"),
        "timezone_id": spec.get("timezone", "UTC"),
        "extra_http_headers": {
            "sec-ch-ua": sec_ch_ua,
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "accept-language": lang,
        },
    }

    # Profile: persistent reuses a user-data-dir.
    profile = spec.get("profile", "fresh")
    if profile == "persistent":
        outdir = spec.outdir
        profile_dir = outdir / "user_data_dir"
        context["storage_state"] = None  # persistent contexts manage this themselves
        return launch, context, profile_dir

    # Auth: logged-in loads a storage_state file (account cookies).
    if spec.get("auth", "anonymous") == "logged_in":
        ss = Path(os.environ.get("GBP_MONITOR_STORAGE_STATE", "")).expanduser()
        if ss.exists():
            context["storage_state"] = str(ss)
        else:
            context["_auth_missing"] = str(ss)

    # Cookies: seed from a cookies JSON file.
    if spec.get("cookies", "none") == "seed":
        cf = Path(os.environ.get("GBP_MONITOR_COOKIES_FILE", "")).expanduser()
        context["_cookies_file"] = str(cf) if cf.exists() else None

    return launch, context, None


def build_context(
    p: Playwright,
    spec,
) -> tuple[Browser | None, BrowserContext | None, str | None]:
    """Launch a browser and return (browser, context, warning).

    ``browser`` is None only in persistent-profile mode (where Playwright's
    ``launch_persistent_context`` owns the browser). ``warning`` carries a
    non-fatal note (e.g. auth storage_state missing) or None.
    """
    launch, ctx_kwargs, profile_dir = _launch_options(spec)
    warning: str | None = None

    if profile_dir is not None:
        profile_dir.mkdir(parents=True, exist_ok=True)
        ctx_kwargs.pop("storage_state", None)
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(profile_dir),
            **{k: v for k, v in ctx_kwargs.items() if not k.startswith("_")},
        )
        return None, context, warning

    browser = p.chromium.launch(**launch)
    context = browser.new_context(
        **{k: v for k, v in ctx_kwargs.items() if not k.startswith("_")}
    )

    if ctx_kwargs.get("_auth_missing"):
        warning = f"auth=logged_in requested but storage_state {ctx_kwargs['_auth_missing']} missing; ran anonymous"
    cookies_file = ctx_kwargs.get("_cookies_file")
    if cookies_file:
        try:
            import json
            cookies = json.loads(Path(cookies_file).read_text(encoding="utf-8"))
            context.add_cookies(cookies)
        except Exception as e:
            warning = f"cookies=seed requested but file failed to load: {e}"
    return browser, context, warning
