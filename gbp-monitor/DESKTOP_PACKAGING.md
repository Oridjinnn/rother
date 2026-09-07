# Desktop (Tauri) packaging — shipping real data without a Python runtime

The Node sidecar has **no Python or Chromium**, so live scraping must not be
bundled into the installer as an MVP. Instead, produce the data once on a dev
machine and ship it as a Tauri resource.

## One-time (dev machine, real session)

```bash
# 1. Get a logged-in Playwright storage_state (a real Google account):
python - <<'PY'
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(headless=False)
    ctx = b.new_context()
    page = ctx.new_page()
    page.goto("https://www.google.com/maps")
    input("Log in in the browser, then press ENTER…")
    ctx.storage_state(path="storage_state.json")
    b.close()
PY

# 2. Run the single-path scraper for the client's business (>=100 reviews):
export GBP_MONITOR_STORAGE_STATE="$PWD/storage_state.json"
python -m orchestration.run_all --business <place_id> --max-reviews 100
# Verify the gate:
python -m tests.verify_live_baseline   # needs GBP_BASELINE_PLACE_ID + session
```

## Trim + bundle

The dashboard only reads JSON. Drop the raw HTML/PNG evidence before bundling:

```bash
# Keep only JSON under gbp-monitor/data; remove *.html / *.png / raw_html
find gbp-monitor/data -type f \( -name '*.html' -o -name '*.png' \) -delete
rm -rf gbp-monitor/data/raw_html
```

Copy the trimmed `gbp-monitor/data` into the Tauri resource dir (e.g.
`src-tauri/resources/gbp-data`) and point `GBP_ROOT` at it, or copy it into the
standalone `data` dir. The dashboard (`src/lib/gbp/paths.ts`) resolves
`GBP_ROOT` from the env var, so:

```bash
# At app launch / build:
GBP_ROOT=<path-to-bundled-gbp-monitor> npm run start
```

This fixes the "app ships with no data" gap: the client receives a real,
populated desktop app — no live scraping required at runtime.
