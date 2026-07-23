# Architecture Audit 02 — Browser Harness & Capture Pipeline

**Date:** 2026-07-22
**Subsystem:** `gbp-monitor/harness/` + `gbp-monitor/discovery/validate_listing.py` + `gbp-monitor/orchestration/run_all.py` (browser lifecycle portion)
**Repository root:** `D:\Documents (D)\Softwares\Rother\Rother - 0.0.1`

---

## Executive Summary

The Browser Harness subsystem is the data-acquisition frontend of the GBP Monitor. It uses **Playwright** (Python `sync_api`) to launch a headless Chromium browser, navigate to Google Maps competitor listings, dismiss cookie banners, activate the reviews tab, scroll to load all reviews, expand truncated text, and capture the raw HTML for downstream parsing.

The subsystem consists of 4 modules in `gbp-monitor/harness/` plus the URL pre-checker and the orchestration loop that drives it:

| Module | Lines | Responsibility |
|---|---|---|
| `browser.py` | 280 | Browser launch, anti-bot hardening (3-layer Client Hints override) |
| `capture.py` | 131 | Per-listing page orchestration (navigate, cookie, reviews tab, scroll, expand, capture) |
| `scroll.py` | 103 | Review container scrolling with height-stability detection |
| `locator.py` | 169 | Post-capture self-healing locator hierarchy (5-tier CSS fallback for parser) |

The subsystem has never been run against a live Google Maps page in production — only against 3 static HTML fixtures in `--fixtures` mode. The CSS selectors in `config/selectors.json` are 2023 vintage and marked UNPROVEN. The anti-bot hardening (Fix A) is evidence-based (arXiv:2606.14525) but empirically unverified.

---

## Scope

### Files Reviewed

| File | Lines | Role |
|---|---|---|
| `gbp-monitor/harness/__init__.py` | 0 | Package marker |
| `gbp-monitor/harness/browser.py` | 280 | Browser lifecycle + anti-bot hardening |
| `gbp-monitor/harness/capture.py` | 131 | Page-level capture orchestration |
| `gbp-monitor/harness/scroll.py` | 103 | Review container scrolling logic |
| `gbp-monitor/harness/locator.py` | 169 | Post-capture self-healing locator hierarchy |
| `gbp-monitor/discovery/validate_listing.py` | 110 | URL reachability pre-check |
| `gbp-monitor/orchestration/run_all.py` | 431 | Driver loop (browser lifecycle portion only) |
| `gbp-monitor/config/selectors.json` | 16 | CSS selectors and configuration |

### Excluded from This Audit

- `gbp-monitor/parser/` — Post-capture HTML parsing (separate subsystem)
- `gbp-monitor/storage/` — Snapshot and delta storage (separate subsystem)
- `gbp-monitor/schedule/` — GitHub Actions workflow (deployment concern)
- `src/` — Next.js dashboard (separate subsystem)

---

## Architecture

### Component Diagram

```
                         orchestration/run_all.py
                                 │
                     ┌───────────┴───────────┐
                     │                       │
               (live mode)            (fixtures mode)
                     │                       │
                     ▼                       │
          discovery/validate_listing.py      │
            (URL reachability check)         │
                     │                       │
                     ▼                       │
          harness/browser.py                 │
            (Playwright launch +             │
             3-layer anti-bot init)          │
                     │                       │
                     ▼                       │
          harness/capture.py                 │
            (per-listing: navigate,          │
             cookie dismiss, reviews tab,    │
             scroll, expand, capture)        │
                     │                       │
                     ▼                       │
          harness/scroll.py                  │
            (scroll-to-load-more,            │
             height-stability detection)     │
                     │                       │
                     ▼                       │
          Raw HTML string ───────────────────┤
                                            │
                                            ▼
                                   parser/review_parser.py
                                   (uses harness/locator.py)
```

### Lifecycle Ownership

1. **Playwright instance** (`p`) — Created once in `get_browser_context()`, stopped in `finally` block of `run()`.
2. **Browser** — One headless Chromium instance, created once, closed in `finally`.
3. **Browser Context** — One context per run (contains cookies, localStorage, anti-bot headers), created once, closed in `finally`.
4. **Page** — One page per listing, created inside `capture_listing_html()`, closed in its `finally` block.

The ownership chain is explicit: `orchestration/run_all.py:run()` receives `(p, browser, context)` and is responsible for all three levels of teardown.

### Resource Cleanup Sequence

```
Page.close()          — inside capture_listing_html() finally block
Context.close()       — inside run() finally block
Browser.close()       — inside run() finally block
Playwright.stop()     — inside run() finally block
```

Each teardown step is individually wrapped in try/except with WARNING-level logging, so a failure in one step does not prevent subsequent cleanup.

---

## Browser Initialization

### Browser Type

- **Playwright** — Python `sync_api` (synchronous API)
- **Engine** — Chromium (via `p.chromium.launch()`)
- **No other browsers supported** — Firefox, WebKit are not instantiated or configurable

### Launch Options

```python
p.chromium.launch(headless=True)
```

- **Single option:** `headless=True`
- **No additional launch args:** No `--no-sandbox`, `--disable-gpu`, `--disable-setuid-sandbox`, or any other Chromium CLI flags
- **No proxy configuration:** No SOCKS/HTTP proxy support
- **No download path:** No custom download directory

### Headless/Headed Behavior

- **Always headless** — `headless=True` is hardcoded
- **No runtime toggle** — No environment variable or parameter to switch to headed mode for debugging
- **No `headless=new`** — Uses classic headless mode, not the newer "headless = new" mode that is harder to detect

### Configuration

All configuration is **hardcoded** in `browser.py`:

| Setting | Value |
|---|---|
| User-Agent | `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36` |
| Viewport | 1366×768 |
| Locale | `en-US` |
| Extra HTTP headers | `sec-ch-ua`, `sec-ch-ua-mobile`, `sec-ch-ua-platform`, `accept-language` |
| CDP override | Full `userAgentMetadata` block (brands, platform, architecture, etc.) |
| JS init script | Patches `navigator.userAgentData` with `getHighEntropyValues` |

None of these are configurable via environment variables, command-line arguments, or configuration files.

### CDP Override Strategy

The browser initialization applies 3 complementary anti-bot mechanisms in sequence:

1. **`extra_http_headers`** on `new_context()` — pins outgoing `sec-ch-ua*` HTTP headers (addresses network-layer detection identified by arXiv:2606.14525 §5.3)
2. **CDP `Network.setUserAgentOverride`** via a throwaway `about:blank` page — makes browser's internal client-hints state self-consistent (drives both headers and `navigator.userAgentData`)
3. **`add_init_script()`** — JS patch for `navigator.userAgentData` as belt-and-suspenders for the JS-side read

The CDP step (mechanism 2) is wrapped in try/except — if it fails, mechanisms 1 and 3 remain active, and a WARNING is logged.

### Environment Usage

- **No environment variable** is read by the browser initialization code
- **No `.env` file** is consulted
- **`fixtures` vs `live` mode** is controlled by `--fixtures` CLI arg passed to `run_all.py`, not by environment

---

## Navigation Pipeline

### Step-by-Step Flow (per listing, live mode)

```
[Pre-check] discovery/validate_listing.py
    ├── HTTP HEAD to gmaps_url (10s timeout)
    │     ├── 2xx-3xx → reachable, proceed
    │     └── non-2xx → fallback to GET
    ├── HTTP GET (stream=True, headers only)
    │     ├── 2xx → reachable, proceed
    │     └── failure → skip listing (logger.warning, summary["skipped"]++)
    └── Contract: MUST NOT raise
```

```
[Capture] harness/capture.py:capture_listing_html()
    ├── page = context.new_page()
    ├── page.goto(url, timeout=30000)           ← 30s navigation timeout
    ├── _dismiss_cookie_banner(page, selectors)  ← 4s timeout, best-effort
    ├── _click_reviews_tab_if_present(...)       ← 4s timeout + 1.5s settle
    ├── scroll_review_container(page, selectors) ← may raise SelectorNotFoundError
    ├── _expand_truncated_reviews(page, selectors) ← 4s per button, best-effort
    ├── html = page.content()                    ← final HTML capture
    └── finally: page.close()
```

### Navigation Waiting Strategy

- **Primary navigation:** `page.goto(url, timeout=30000)` — waits for the `load` event (DOMContentLoaded + all resources). 30-second timeout.
- **Element waits:** `page.wait_for_selector(selector, timeout=...)` — waits for DOM presence before interaction. Optional elements (`_dismiss_cookie_banner`, `_click_reviews_tab_if_present`) use 4-second timeout.
- **Scroll settle:** `page.wait_for_timeout(2500)` — hard wait between scrolls. No smart wait (no network idle, no mutation observer).
- **Reviews tab settle:** `page.wait_for_timeout(1500)` — hard wait after clicking reviews tab.

### Page Readiness Detection

- **No explicit page readiness detection** beyond `goto`'s `load` event
- **No `domcontentloaded` usage** — the default `load` event is used
- **No network idle detection** — `goto` does not use `wait_until="networkidle"`
- **No custom JS evaluation** to detect when the review panel has rendered

---

## Cookie & Consent Handling

### Implementation

Cookie/consent handling is in `harness/capture.py:_dismiss_cookie_banner()` (lines 66-86).

### Strategy

1. Read XPath selector from `selectors.json` key `"cookie_reject_button"`:
   `//button[contains(., 'Reject all')] | //span[contains(text(), 'Reject all')]`
2. If selector is empty or missing → return (no-op)
3. `page.wait_for_selector(selector, timeout=4000)` — if banner appears within 4s, click it
4. `page.click(selector, timeout=4000)` — click the "Reject all" button
5. If either step throws (banner not present) → catch and log at DEBUG level

### Design Notes

- **EU-specific:** The XPath targets English "Reject all" text. Non-EU locales or non-English Google Maps would not match.
- **Best-effort only:** Failure is swallowed — the system proceeds without dismissing cookies.
- **Single pattern:** Only one selector pattern is attempted. No fallback for variant cookie banner designs (e.g., "Accept all" required, "Customize" flow, or cookie walls that block interaction until dismissed).
- **No consent state tracking:** No variable tracks whether the banner was successfully dismissed. The scroll step proceeds regardless.

### Evidence from Code

```python
selector = selectors.get("cookie_reject_button")
if not selector:
    return
try:
    page.wait_for_selector(selector, timeout=_OPTIONAL_ELEMENT_TIMEOUT_MS)
    page.click(selector, timeout=_OPTIONAL_ELEMENT_TIMEOUT_MS)
except Exception as e:
    logger.debug("cookie banner not dismissed (likely not shown): %s", e)
```

---

## Selector System

### Selector Location

All selectors are stored in a single JSON file:
- **Path:** `gbp-monitor/config/selectors.json`
- **Format:** Flat JSON object with string values

### Selector Organization

| Key | Type | Value | Purpose |
|---|---|---|---|
| `cookie_reject_button` | XPath string | `//button[contains(., 'Reject all')] //span[contains(text(), 'Reject all')]` | EU cookie consent dismissal |
| `reviews_tab_button` | CSS string | `button[aria-label*='Reviews']` | Reviews tab activation |
| `review_container` | CSS string | `div.m6QErb.DxyBCb.kA9KIf.dS8AEf` | Scrollable review list container |
| `review_item` | CSS string | `div.jftiEf.fontBodyMedium` | Individual review item (seed, tier 5 in locator) |
| `review_id_attr` | Attribute name | `data-review-id` | Dedup attribute on review items |
| `reviewer_name_attr` | Attribute name | `aria-label` | Reviewer name attribute |
| `review_text_selector` | CSS string | `span.wiI7pd` | Review text element |
| `rating_selector` | CSS string | `span.kvMYJc` | Rating star element |
| `rating_attr` | Attribute name | `aria-label` | Rating value attribute |
| `relative_date_selector` | CSS string | `span.rsqaWe` | Relative date element |
| `expand_text_button` | CSS string | `button.w8nwRe.kyuRq` | "See more" expand button |

### Selector Metadata

```json
{
  "last_verified": "2026-07-20",
  "verified_by": "seed",
  "_verification_note": "Selectors seeded from public reference implementations..."
}
```

- **`verified_by`** — Always `"seed"` (never upgraded to `"browser_agent"` or `"manual_human"`)
- **`last_verified`** — Date of seeding, not actual verification
- **Verification note** — Explicitly states UNPROVEN status

### Fallback Strategy

There are **two distinct fallback mechanisms** in this subsystem:

#### 1. Playwright-level: Self-healing Locator (Parser-side)

Defined in `harness/locator.py`. This is a **post-capture, parser-side** mechanism used during HTML parsing (not during Playwright capture). It provides 5 CSS tiers:

| Tier | Selector | Class-independent? |
|---|---|---|
| 1 | `[data-review-id]` | Yes |
| 2 | `[role='article'][aria-label]` | Yes |
| 3 | `[data-review-id][aria-label]` | Yes |
| 4 | `div[role='article'][data-review-id]` | Yes |
| 5 | `div.jftiEf.fontBodyMedium` (seed from selectors.json) | No |

Tiers 1-4 are class-name-independent so they survive Google DOM class renames.

#### 2. Capture-level: No CSS Fallback

During Playwright capture (`capture.py` and `scroll.py`), there is **no fallback** for the `review_container` selector. If `div.m6QErb.DxyBCb.kA9KIf.dS8AEf` fails to match, `SelectorNotFoundError` is raised and the listing fails.

### Validation Strategy

- **No automated selector validation** in the codebase
- **No periodic verification pass** — the `verified_by` field never transitions from `"seed"`
- **Selector health is inferred passively** — the orchestrator's `failed >= success` warning is the only detection mechanism
- **No diff/comparison** against known-good DOM snapshots

### Versioning

- **No versioning scheme** for selectors
- **`last_verified` date** is the only temporal marker, and it records the seed date (not a verification date)
- **No change history** for individual selector values within the JSON file (the CHANGELOG.md records some selector changes at a high level)

---

## Review Panel Detection

### Technique

The review panel is detected in `harness/scroll.py:scroll_review_container()`.

```python
container_selector = selectors["review_container"]  # "div.m6QErb.DxyBCb.kA9KIf.dS8AEf"
try:
    page.wait_for_selector(container_selector, timeout=10000)
except Exception as e:
    raise SelectorNotFoundError(
        f"review_container selector failed: {container_selector}"
    ) from e
```

### Process

1. Read the `review_container` CSS selector from `selectors.json`
2. Call `page.wait_for_selector(container_selector, timeout=10000)` — waits up to 10 seconds
3. If the element appears → container found, proceed to scroll
4. If the element does not appear within 10s → re-raise as `SelectorNotFoundError`

### Assumptions

- The selector `div.m6QErb.DxyBCb.kA9KIf.dS8AEf` uniquely identifies the review scroll container
- Google Maps renders the reviews container within 10 seconds of navigation
- The container is present in the DOM (not loaded dynamically after user interaction beyond what the reviews-tab click provides)
- Only one container needs to be found (no support for paginated or multi-section review lists)

### Alternatives to the Reviews Tab Click

Before attempting the container selector, `capture.py` calls `_click_reviews_tab_if_present()` which clicks a `button[aria-label*='Reviews']` if it exists. This handles the case where the deep-link URL lands on the listing overview rather than directly on the reviews panel.

- If the tab is found and clicked → 1500ms settle wait, then scroll
- If the tab is not found → proceed immediately (assumes already on reviews panel)
- If the reviews tab was needed but missing → the 10s container wait will timeout and raise `SelectorNotFoundError`

---

## Scrolling Strategy

### Algorithm

Implemented in `harness/scroll.py:scroll_review_container()`.

```
container = wait_for_selector(review_container, timeout=10s)

previous_height = 0
stable_count = 0

for i in range(MAX_SCROLLS=40):
    eval_on_selector(container, "el => el.scrollTop = el.scrollHeight")
    wait_for_timeout(SCROLL_WAIT_MS=2500)
    current_height = eval_on_selector(container, "el => el.scrollHeight")

    if current_height == previous_height:
        stable_count += 1
        if stable_count >= STABLE_THRESHOLD=3:
            break  # stabilized
    else:
        stable_count = 0
    previous_height = current_height
else:
    # hit MAX_SCROLLS without stabilizing
    log "scroll hit MAX_SCROLLS=40 without stabilizing"
```

### Stopping Conditions

1. **Height stability** — 3 consecutive scrolls with no height change → `break`
2. **Hard cap** — 40 scrolls max → `for/else` logs a warning
3. **`SelectorNotFoundError`** — If container not found → raised immediately (not caught in scroll module)

### Tuning Constants

| Constant | Value | Source |
|---|---|---|
| `MAX_SCROLLS` | 40 | Per Section 5.3 of GBP_MONITOR_PLAN.md |
| `STABLE_THRESHOLD` | 3 | Chosen to filter out momentary height fluctuations |
| `SCROLL_WAIT_MS` | 2500 | Time for Google Maps to lazy-load more items after scroll |

### Scroll Mechanism

Uses `page.eval_on_selector(container_selector, "el => el.scrollTop = el.scrollHeight")`:
- Evaluates a JavaScript expression on the matched element
- Sets `scrollTop` to `scrollHeight` to jump to the bottom
- No smooth scrolling — instant jump each time
- No incremental scrolling — always jumps to the full container height

### Retry Logic

- **No retry within the scroll module** — scroll failures are not retried at this level
- **Retry at orchestration layer** — the capture pipeline has up to 2 retries for non-`SelectorNotFoundError` exceptions (network/timeout). See `run_all.py:_capture_with_retries()`
- **`SelectorNotFoundError` is NOT retried** — per Section 6 of the plan, a broken selector should not be retried (waste of time, looks like a bot)

### Assumptions

- Google Maps lazy-loads reviews in a **single scroll container** (not paginated via "Next page" buttons)
- Review list grows downward — scroll to bottom triggers more loading
- Height increases monotonically as more items load
- 3 consecutive identical heights = no more items (no lazy-loading gap at the end)
- 2500ms is sufficient for Google Maps to load the next batch
- 40 scrolls (~100 seconds total) is enough to load all reviews for any competitor

### Current Limitations

| Limitation | Impact |
|---|---|
| No "Next page" button support | Paginated review lists would not be fully captured |
| No incremental scrolling | Jump-to-bottom may skip items in some infinite-scroll implementations |
| Hard wait (2500ms) between scrolls | Wastes time on fast-loading listings; may be insufficient on slow connections |
| No network-idle detection | Scrolling may proceed before new items are fully rendered |
| No mobile viewport consideration | Google Maps mobile uses a different layout with different container selectors |
| Single container assumption | Does not handle multi-column or tabbed review layouts |
| No abort/stop signal | Cannot be interrupted mid-scroll (except via Python KeyboardInterrupt) |

---

## Capture Pipeline

### HTML Capture

Performed in `harness/capture.py:capture_listing_html()`.

```python
html = page.content()
return html
```

- Uses Playwright's `page.content()` which returns the full DOM HTML as a string
- **No XHR/network response body capture** — only the rendered DOM
- **No raw HTML capture** — Playwright serializes the current DOM state after JavaScript execution
- **No iframe content capture** — `page.content()` only captures the top-level document

### Screenshot Capture

- **No screenshot** is taken at any point in the capture pipeline
- **No visual evidence** of page state is saved

### Storage Locations

After `capture_listing_html()` returns the HTML string:
- **Fixtures mode:** HTML is read from `tests/fixtures/{competitor_id}.html` (not captured)
- **Live mode:** HTML string is returned to `_process_one_listing()`, passed to `parse_reviews()`, then discarded
- **No raw HTML is saved to disk** for live captures (the `_RAW_HTML_DIR` in `paths.ts` exists only as a path constant — `GBP_RAW_HTML_DIR` — but is never written to by any current code)

### File Naming

The subsystem does not write HTML files directly. The downstream storage layer writes:
- **Snapshots:** `data/snapshots/{competitor_id}.json` (parsed reviews, not HTML)
- **Deltas:** `data/reviews_new/{competitor_id}_{YYYYMMDDTHHMMSSZ}.json` (new reviews only)
- **Logs:** `data/run.log` (appended)

### Metadata

No metadata is captured alongside the HTML:
- **No page title** saved
- **No URL** saved (the URL is known from the config, but not stored with the capture)
- **No HAR (HTTP Archive)** recorded
- **No console logs** captured
- **No timing data** recorded
- **No screenshot** saved

---

## Error Handling

### Retry Strategy

| Exception Type | Retry? | Max Attempts | Backoff | Location |
|---|---|---|---|---|
| `SelectorNotFoundError` | **No** | 1 (fails immediately) | N/A | `run_all.py:_capture_with_retries()` |
| Any other `Exception` from `capture_listing_html()` | **Yes** | 3 (1 initial + 2 retries) | 3s, 7s | `run_all.py:_capture_with_retries()` |
| Cookie banner interaction failure | **No** | 1 (swallowed) | N/A | `capture.py:_dismiss_cookie_banner()` |
| Reviews tab click failure | **No** | 1 (swallowed) | N/A | `capture.py:_click_reviews_tab_if_present()` |
| Expand button click failure | **No** | 1 (individual buttons skipped) | N/A | `capture.py:_expand_truncated_reviews()` |
| Page close failure | **No** | 1 (swallowed with warning) | N/A | `capture.py:finally` block |
| Browser/context/Playwright teardown | **No** | 1 (swallowed with warning each) | N/A | `run_all.py:finally` block |

### Exception Types

| Exception | Module | Meaning |
|---|---|---|
| `SelectorNotFoundError` | `scroll.py` (custom) | Review container CSS selector failed to match — signals DOM change |
| `playwright._impl._errors.TimeoutError` | Playwright | Element wait or navigation timed out |
| `playwright._impl._errors.Error` | Playwright | Generic Playwright error (element not found, strict mode violation, etc.) |
| `Exception` (catch-all) | Multiple | Per-listing failure isolation boundary |

### Logging

All modules use Python's `logging` with the `"gbp-monitor.*"` logger hierarchy:

| Logger Name | Level | Output |
|---|---|---|
| `gbp-monitor.run_all` | INFO+ | File + stderr |
| `gbp-monitor.browser` | DEBUG+ | File + stderr |
| `gbp-monitor.capture` | DEBUG+ | File + stderr |
| `gbp-monitor.scroll` | DEBUG+ | File + stderr |
| `gbp-monitor.locator` | INFO+ | File + stderr |
| `gbp-monitor.discovery` | DEBUG+ | File + stderr |

- All log levels configured by `logging.basicConfig(level=logging.INFO)` in `run_all.py`
- File output goes to `data/run.log` (append mode)
- Stderr output at WARNING+ (via `StreamHandler(sys.stderr)`)
- DEBUG-level messages are visibly absent from the run.log due to the INFO-level threshold

### Recovery Behavior

- **Per-listing failure isolation** — every listing wrapped in try/except in `_process_one_listing()`. One listing's failure does not affect others.
- **Graceful degradation** — if the CDP override fails, mechanisms 1 and 3 remain active.
- **Page leak prevention** — `page.close()` in `finally` ensures no tab leaks per listing.
- **No partial-data recovery** — if a listing fails mid-capture, no partial data is saved. The previous snapshot remains unchanged.

---

## Resource Management

### Browser Closing

In `run_all.py:run()`:
```python
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
```

- **Order:** Context → Browser → Playwright (reverse of creation order)
- **Each step individually wrapped in try/except** — a failure in one step does not block subsequent steps
- **`finally` block** — guaranteed to execute even if the listing loop raises (though per-listing errors are caught, so this path is unlikely)

### Context Disposal

- One context per live run
- Disposed via `context.close()` — clears cookies, storage, and closes all pages
- If the context was never created (fixtures mode), disposal is skipped

### Page Disposal

- One page per listing
- Disposed inside `capture_listing_html()` finally block
- If `context.new_page()` succeeds but subsequent steps fail, the page is still closed

### Temporary Files

- **No temporary files** are created by the browser harness
- **No screenshots** saved
- **No download directory** configured
- **No HAR or trace files** recorded
- The CDP override uses a throwaway `about:blank` page which is closed immediately

---

## Data Flow

### Live Mode Data Flow

```
orchestration/run_all.py:run()
    │
    ├── Load config/listings.json
    ├── Load config/selectors.json
    │
    ├── get_browser_context()
    │     ├── playwright.start()
    │     ├── chromium.launch(headless=True)
    │     ├── new_context(ua, viewport, locale, extra_http_headers)
    │     ├── CDP Network.setUserAgentOverride (throwaway page)
    │     └── context.add_init_script(UA spoof)
    │
    ├── For each branch → for each competitor:
    │     │
    │     ├── validate_listing(gmaps_url)  ← best-effort pre-check
    │     │     └── HEAD|GET → True/False
    │     │
    │     ├── [if not reachable] → skip listing (summary["skipped"]++)
    │     │
    │     ├── _capture_with_retries(context, url, selectors, comp_id)
    │     │     ├── [attempt 1] capture_listing_html(context, url, selectors)
    │     │     │     ├── page = context.new_page()
    │     │     │     ├── page.goto(url, timeout=30000)
    │     │     │     ├── _dismiss_cookie_banner(page, selectors)  ← best-effort
    │     │     │     ├── _click_reviews_tab_if_present(...)       ← best-effort
    │     │     │     ├── scroll_review_container(page, selectors) ← may raise
    │     │     │     │     └── repeat up to 40×:
    │     │     │     │           scrollTop = scrollHeight
    │     │     │     │           wait 2500ms
    │     │     │     │           check if height stable (3×)
    │     │     │     ├── _expand_truncated_reviews(page, selectors) ← best-effort
    │     │     │     ├── html = page.content()
    │     │     │     └── finally: page.close()
    │     │     │
    │     │     ├── [on SelectorNotFoundError] → re-raise immediately (no retry)
    │     │     └── [on other Exception] → retry up to 2× with backoff (3s, 7s)
    │     │
    │     ├── [success] → html string
    │     │     └── parse → delta → store (outside this audit's scope)
    │     │
    │     └── [failure] → summary["errors"] append, summary["failed"]++
    │
    └── finally:
          ├── context.close()
          ├── browser.close()
          └── playwright.stop()
```

### Fixtures Mode Data Flow (for comparison)

```
orchestration/run_all.py:run()
    │
    ├── [skip browser initialization entirely]
    │
    ├── For each competitor:
    │     ├── [no fixture file] → skip listing (summary["skipped"]++)
    │     └── [fixture exists] → html = read fixture file
    │           └── parse → delta → store
    │
    └── [no browser teardown needed]
```

---

## Current Maturity

### Component Maturity Classification

| Component | Classification | Evidence |
|---|---|---|
| **Browser initialization** | **Alpha** | Anti-bot hardening is evidence-based but never empirically verified against real Google Maps. CDP override has try/except fallback (actively expects failure in some environments). No configuration options. |
| **Navigation pipeline** | **Alpha** | Single hardcoded URL per listing, no support for redirect chains or auth walls. 30s hard timeout. No network-idle wait. Only tested against 3 mock fixture files. |
| **Cookie consent handling** | **Prototype** | Single XPath for English "Reject all" button. No support for variant banners, "Accept all" flows, or non-EU consent. Never tested against a real Google Maps cookie banner. |
| **Reviews tab detection** | **Prototype** | Single CSS selector for `button[aria-label*='Reviews']`. Assumes English locale. No fallback for alternative tab structures. |
| **Scrolling strategy** | **Alpha** | Algorithm is standard for infinite-scroll pages. Constants are informed by the plan but never tuned against real Google Maps. No support for paginated review lists. |
| **Expand truncated text** | **Prototype** | Clicks all matching expand buttons without verification that text was actually expanded. No check for animation completion. |
| **HTML capture** | **Beta** | Uses standard `page.content()`. Works correctly for captured DOM. No support for shadow DOM or iframes. |
| **Self-healing locator** | **Alpha** | 5-tier CSS hierarchy is well-designed based on arXiv research. Only testable against static HTML fixtures (not live DOM). The locator operates post-capture (parser side), not during Playwright capture — it cannot help the capture phase survive a Google DOM change. |
| **URL reachability pre-check** | **Beta** | Standard HEAD → GET fallback. Appropriate timeouts. Clean contract (no raise). But uses mock URLs that will never resolve, effectively untested in live mode. |
| **Resource cleanup** | **Beta** | Proper `finally` blocks at all levels. Each teardown step individually wrapped in try/except. Pages cannot leak per the capture function's `finally` block. |
| **Error handling & retry** | **Beta** | Clean separation of retryable vs non-retryable errors. Per-listing failure isolation (Rule 7). Appropriate backoff. But retry count constants have no empirical basis. |
| **Logging** | **Alpha** | Structured logger hierarchy. But the INFO threshold hides DEBUG messages that would be valuable for debugging scroll behavior and selector matching. |

### Overall Subsystem Maturity: **Alpha**

The browser harness is structurally sound but empirically **unproven against its target environment** (live Google Maps). Every "live mode" code path has either:
- Never been executed (cookie banner, reviews tab, expand text, scrolling)
- Only been tested against mock URLs (pre-check)
- Been theoretically validated via arXiv papers (anti-bot hardening)

---

## Technical Debt

### Critical

| Finding | Evidence | Location |
|---|---|---|
| **Anti-bot hardening never verified** | 3-layer Client Hints override is based on arXiv:2606.14525 but the smoke test referenced in the docstring confirmed `SelectorNotFoundError` on a real Google Maps URL. The fix may or may not change that outcome — it has not been re-tested. | `browser.py:21-62` |
| **UNPROVEN selectors against live DOM** | `selectors.json` is marked `verified_by: "seed"`. The review container selector `div.m6QErb.DxyBCb.kA9KIf.dS8AEf` is a 2023-vintage class triplet that may no longer exist. | `config/selectors.json` |
| **No screenshot or DOM evidence captured on failure** | When a capture fails, no evidence is saved. The operator has the error message but cannot inspect the page state at the time of failure. | `capture.py` |

### High

| Finding | Evidence | Location |
|---|---|---|
| **`GBP_RAW_HTML_DIR` defined but never written** | `paths.py` defines `GBP_RAW_HTML_DIR` but no code writes to it. Live-mode captures discard the HTML string after parsing. | `gbp-monitor/lib/gbp/paths.py` (dashboard), no equivalent in Python |
| **No retry for expand-text failures** | `_expand_truncated_reviews` clicks buttons but never verifies expansion succeeded or retries failed clicks. | `capture.py:109-131` |
| **DEBUG logging effectively disabled** | `logging.basicConfig(level=logging.INFO)` in `run_all.py` suppresses all DEBUG messages. Scroll stabilization info, CDP override success, and cookie banner status are all logged at DEBUG level and thus invisible. | `run_all.py:57` |
| **Hardcoded browser config** | UA, viewport, locale, and anti-bot values are module-level constants. Cannot be changed without editing source code. | `browser.py:77-84` |
| **`headless=True` hardcoded** | No way to run in headed mode for debugging without modifying code. | `browser.py:207` |

### Medium

| Finding | Evidence | Location |
|---|---|---|
| **Cookie consent assumes English "Reject all"** | The XPath targets English text only. Google Maps serves localized cookie banners based on the `Accept-Language` header and IP geo. | `config/selectors.json` |
| **Reviews tab selector assumes English `aria-label`** | `button[aria-label*='Reviews']` assumes English. Google Maps localizes the tab label. | `config/selectors.json` |
| **Playwright imported lazily but not exception-safe** | `from harness.browser import get_browser_context` is inside a try block. If the import itself fails (e.g., Playwright not installed), it is caught and counted as a summary failure. But the import at `_capture_with_retries` is also inside `_process_one_listing` — not at module top — and would be silently caught. | `run_all.py:137-155` |
| **No page event listeners** | No `page.on("console")`, `page.on("pageerror")`, or `page.on("response")` listeners are attached. Runtime JS errors and API responses are invisible. | `capture.py` |
| **Scroll constants not validated** | `MAX_SCROLLS=40`, `STABLE_THRESHOLD=3`, `SCROLL_WAIT_MS=2500` are taken from the plan without empirical validation against Google Maps. | `scroll.py:21-23` |
| **No network condition simulation** | No throttling or offline simulation. The capture assumes a responsive network. | `browser.py` |

### Low

| Finding | Evidence | Location |
|---|---|---|
| **`verify=False` in locator** | `with_id` filter assumes `review_id_attr` exists. If Google ever renames the attribute, all 5 tiers would fail. | `locator.py:137-138` |
| **No `--headed` CLI flag** | `run_all.py` has `--fixtures` but no `--headed` for debugging. | `run_all.py:401-419` |
| **Selector metadata not consumed by code** | `last_verified` and `verified_by` fields are only read by the dashboard for display. No code uses them to trigger re-verification. | `selectors.json` |
| **Expand button selector assumes class names** | `button.w8nwRe.kyuRq` is a class-based selector — vulnerable to Google class renames. No self-healing equivalent exists for expand buttons. | `selectors.json` |

---

## Risks

### Confirmed Risks

| Risk | Evidence |
|---|---|
| **Selectors will fail on live Google Maps** | The `review_container` and `review_item` selectors are 2023 vintage. Google Maps DOM changes frequently. The project has never verified they work. |
| **Headless Chromium may be blocked** | Even with Fix A's 3-layer Client Hints override, the system has never been tested against a real Google Maps page post-fix. The earlier smoke test (pre-fix) confirmed `SelectorNotFoundError`. |
| **URL pre-check cannot reach mock URLs** | All competitor URLs in `listings.json` are mock/placeholder values. The pre-check in live mode will skip every listing as "not reachable" — the live mode loop would produce `skipped=12, failed=0, success=0`. |

### Potential Risks

| Risk | Evidence |
|---|---|
| **EU cookie banner may block all interaction** | The "Reject all" XPath may not match modern Google Maps cookie banners. If the banner is not dismissed, subsequent selectors may fail because the reviews container is hidden behind the consent overlay. |
| **Scroll may never stabilize** | Google Maps uses virtualization for large review lists. The container height may fluctuate as items are recycled in and out of DOM. The stability threshold of 3 identical heights may never trigger. |
| **30s navigation timeout may be insufficient** | Google Maps pages are heavy (multiple MB of JS/CSS, fonts, images). On cold caches or slow connections, 30s may not be enough. |
| **Single browser context shares cookies across listings** | All listings share one browser context. Cookies (including any Google session/consent cookies set by the first listing) persist across all subsequent listings. This could be intentional (consent applied once) or problematic (rate-limiting counters shared). |
| **No stealth mode for expand buttons** | The expand button click uses Playwright's `click()` without stealth. Google's bot detection could flag rapid sequential clicks on many small buttons. |

### Unknown Risks

| Risk | Notes |
|---|---|
| **Google Maps rate-limiting behavior** | Unknown how many sequential requests Google tolerates from a single IP before serving CAPTCHA or blocking. The 5-10s polite delay is a guess. |
| **Playwright browser binary availability in GitHub Actions** | The workflow installs Playwright Chromium with system deps (~150MB). If the GitHub Actions runner environment changes, the install step may fail. |
| **Memory usage on large review counts** | A competitor with thousands of reviews would require 40 scrolls × 2.5s = ~100s per listing. For 12 listings that's ~20 minutes of continuous browser runtime. Memory/heap usage over that duration is unknown. |
| **Google Maps A/B testing** | Google frequently serves different DOM variants to different users. The selectors may work for some sessions and fail for others. |

---

## Missing Tests

| Behavior | Test Gap |
|---|---|
| **Browser launch** | No test that `get_browser_context()` successfully launches Chromium and returns 3 handles |
| **CDP override** | No test that the CDP `Network.setUserAgentOverride` is applied correctly or that fallback works |
| **Cookie banner dismissal** | No test with a real or mock cookie banner HTML |
| **Reviews tab click** | No test with a page that requires (or does not require) the reviews tab click |
| **Scroll stabilization** | No test that the scroll algorithm stops under various height-growth patterns |
| **SelectorNotFoundError propagation** | No test that this specific exception type is not retried and is correctly counted as a failure |
| **Page leak prevention** | No test that pages are always closed regardless of the exception path |
| **Retry backoff** | No test that retries happen with the correct delay sequence |
| **Polite delay** | No test that the random sleep between listings is in the expected range |
| **Expand text buttons** | No test with mock expand buttons |
| **Headless detection mitigation** | No test that the 3-layer fix actually prevents detection (would require a detection test page) |
| **URL pre-check** | Only tested by the `stream=True` GET path. The HEAD → GET fallback logic is untested. |
| **Full end-to-end live capture** | No test that exercises the complete `capture_listing_html()` pipeline against a real or simulated Google Maps page |

The project has **3 static HTML fixtures** in `tests/fixtures/` but **no test runner, no test file, and no test command**. The fixtures are only consumed manually via `python -m orchestration.run_all --fixtures`.

---

## Missing Documentation

| Documentation Gap | Details |
|---|---|
| **Anti-bot strategy verification procedure** | No document describes how to verify the 3-layer fix works (e.g., what test page to use, what headers to inspect) |
| **Selector maintenance procedure** | No guide for how to update selectors when Google changes its DOM |
| **Browser debugging guide** | No instructions for running in headed mode, capturing screenshots, or inspecting Playwright traces |
| **Scroll constant tuning guide** | No guidance on when/how to adjust `MAX_SCROLLS`, `STABLE_THRESHOLD`, or `SCROLL_WAIT_MS` |
| **Cookie consent variants** | No documentation of known cookie banner variants or how to add support for new ones |
| **Playwright version compatibility** | No pinned Playwright version or compatibility notes |
| **Rate-limiting expectations** | No documentation of expected Google Maps rate-limiting behavior or how to adjust the polite delay |

---

## Questions

1. **Has the anti-bot hardening (Fix A) been re-tested against a real Google Maps page since implementation?** The docstring cites a pre-fix smoke test that confirmed `SelectorNotFoundError`. The post-fix state is unverified.
2. **What happens when Google Maps serves a CAPTCHA?** There is no CAPTCHA detection logic. The capture would likely time out or produce nonsensical HTML that the parser would silently parse into zero reviews.
3. **Is the `GBP_RAW_HTML_DIR` path constant intended for future use?** It is defined but never written to. Will raw HTML capture be implemented in a future phase?
4. **Should the scroll module use `wait_for_function` with a `MutationObserver` instead of hard `wait_for_timeout`?** The current 2.5s hard wait is wasteful on fast connections and potentially insufficient on slow ones.
5. **Are the 3 fixture files (`tests/fixtures/comp-*.html`) representative of the current Google Maps DOM?** They were captured at an unknown date from unknown HTML sources. Their fidelity to production is unknown.
6. **Why is `_OPTIONAL_ELEMENT_TIMEOUT_MS = 4000` the same for cookie banner, reviews tab, AND expand buttons?** These interactions have very different expected timing characteristics but share the same timeout.
7. **Could the `validate_listing` pre-check become a blocking liability?** If Google blocks the sandbox IP, the pre-check would skip all listings before any Playwright capture attempt, masking the actual cause (IP block vs URL issue).
8. **Should there be a `--headed` flag for development debugging?** Currently the only way to run in headed mode is to edit `browser.py`.
9. **What is the expected maximum number of reviews per competitor?** The scroll constants (40 scrolls × 2.5s) were chosen based on an estimate, but no empirical data exists for real competitor listings.
10. **Does the expand-text button click trigger any animation that could interfere with the HTML capture?** The expand button may trigger CSS transitions. The code does not wait for animations to complete before calling `page.content()`.

---

## Recommended Next Audit

### Priority: `gbp-monitor/parser/` — HTML Parsing Subsystem

**Justification:**

1. **The parser is the bridge** between the browser harness (this audit) and the storage layer. The 5-tier self-healing locator (`locator.py`) lives on the parser side. Auditing the parser will complete the understanding of how raw HTML becomes structured data.

2. **The parser is where selectors are actually consumed** — the browser harness's capture-phase selectors (container, cookie, reviews tab) are distinct from the parser-phase selectors (review item, text, rating, date). A full selector audit requires understanding both phases.

3. **The parser has the most complex logic** after the browser harness: field extraction with regex fallbacks, multiple selector patterns, defensive null handling, and the LocatorResult audit trail.

4. **Parser correctness directly affects data quality** — the dashboard's KPIs, charts, and tables are only as good as the parsed reviews. Errors in the parser (wrong field extraction, missed reviews) would silently corrupt the dashboard without any capture error being raised.

5. **The parser code has more lines** (227 in `review_parser.py` + 34 in `schema.py`) than any single harness module, making it the next highest-value audit target.
