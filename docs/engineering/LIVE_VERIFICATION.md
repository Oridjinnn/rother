# Live Verification Guide

Verify the existing scraper against real Google Maps listings **without**
modifying production data (snapshots, deltas, run_summary).

## Purpose

The `--fixtures` mode proves the parser + storage + delta pipeline against
known HTML. But the **capture** step — the Playwright browser driving a real
Google Maps page — has **never been tested** against live DOM. All 11 CSS
selectors are marked `verified_by: "seed"` (2023 vintage, never confirmed on
current Google Maps).

`--verify` is a **non-destructive capture-only mode** that lets you:

- Confirm selectors still match the current Google Maps DOM
- See what the browser sees (screenshot + raw HTML)
- Iterate on selector configs without corrupting production data
- Test scraper behavior against a real Google Maps URL

## Prerequisites

| Item | Requirement |
|---|---|
| Playwright Chromium | `playwright install chromium` |
| Python dependencies | `pip install -r requirements.txt` (playwright, parsel, etc.) |
| Google Maps URL | A real Google Maps place URL (e.g. `https://www.google.com/maps/place/...`) |
| Network | Internet access to `google.com` (no proxy blocks, no VPN interference) |
| Display | Playwright runs in headless mode by default; no display needed |

## Workflow

### 1. Obtain a real Google Maps URL

Find a real Google Maps listing URL. For example, navigate to a coffee shop
on Google Maps and copy the URL from your browser's address bar. The URL
should look like:

```
https://www.google.com/maps/place/Coffee+Shop/@-8.1234,115.1234,17z
```

### 2. Run verification with --url

```powershell
# Test a single URL against all configured competitor entries
python -m orchestration.run_all --verify --url "https://www.google.com/maps/place/..."
```

This uses the URL for **every** competitor listed in `config/listings.json`.
In practice you only need one listing to validate selectors; iterate on
selector configs between runs.

### 3. Inspect evidence

Evidence is written to `data/verify/{timestamp}/{competitor_id}/`:

| File | Contents |
|---|---|
| `page.png` | Full-page screenshot of the captured state |
| `page.html` | Raw HTML as returned by `page.content()` |

Open `page.png` to verify:
- The page loaded (not a captcha, error page, or blank screen)
- The reviews tab is showing (scrolled down, reviews visible)
- Cookie banner was dismissed (if applicable)

The HTML can be fed to the parser offline for debugging:

```powershell
# One-liner to check parse results from captured HTML:
python -c "
from parser.review_parser import parse_reviews
from parser.schema import review_to_dict
import json, sys
html = open('data/verify/20260722T120000Z/comp-canggu-01/page.html').read()
reviews = parse_reviews(html, 'test', 'test', json.load(open('config/selectors.json')))
print(f'{len(reviews)} reviews parsed')
for r in reviews: print(review_to_dict(r).get('review_text','')[:80])
"
```

### 4. Read the verification report

A structured report is written to `data/verify/{timestamp}/report.json`:

```json
{
  "started_at": "2026-07-22T12:00:00",
  "finished_at": "2026-07-22T12:00:45",
  "mode": "verify",
  "url_override": "https://...",
  "total": 12,
  "passed": 1,
  "failed": 11,
  "results": [
    {
      "competitor_id": "comp-canggu-01",
      "branch_id": "branch-canggu",
      "name": "Competitor Name",
      "url": "https://...",
      "status": "PASS"
    },
    {
      "competitor_id": "comp-seminyak-01",
      "branch_id": "branch-seminyak",
      "name": "Competitor Name",
      "url": "https://www.google.com/maps/place/...",
      "status": "FAIL",
      "error": "SelectorNotFoundError: review_container selector failed: ..."
    }
  ]
}
```

The exit code is `0` if all passed, `1` if any failed — suitable for CI
gating.

### 5. Read the selector verification report

`data/verify/{timestamp}/selector_report.json` records the outcome of every
individual selector lookup across all competitors:

```json
{
  "generated_at": "2026-07-22T12:01:00",
  "selectors_configured": 10,
  "selectors_tested": 4,
  "selectors_not_tested": [
    "review_item",
    "review_id_attr",
    "reviewer_name_attr",
    "review_text_selector",
    "rating_selector",
    "rating_attr",
    "relative_date_selector"
  ],
  "healthy": 3,
  "degraded": 0,
  "broken": 1,
  "by_selector": {
    "cookie_reject_button": {
      "status": "broken",
      "total_lookups": 12,
      "times_found": 0,
      "times_not_found": 12,
      "avg_duration_ms": 4000.0,
      "error_examples": ["TimeoutError: ..."]
    },
    "review_container": {
      "status": "healthy",
      "total_lookups": 12,
      "times_found": 12,
      "times_not_found": 0,
      "avg_duration_ms": 1200.5
    }
  },
  "details": [
    {
      "selector_key": "cookie_reject_button",
      "found": false,
      "expected_missing": true,
      "competitor_id": "comp-canggu-01",
      "phase": "dismiss_cookie"
    }
  ]
}
```

Key fields:

| Field | Meaning |
|---|---|
| `selectors_configured` | Number of selector keys in `config/selectors.json` (excluding metadata) |
| `selectors_tested` | How many were actually looked up during the capture pipeline |
| `selectors_not_tested` | Selectors that were not reached — typically parser-only selectors that verify mode does not exercise |
| `by_selector/*/status` | `healthy` (always found), `degraded` (found sometimes), `broken` (never found), `not_evaluated` |
| `by_selector/*/error_examples` | Up to 3 example error messages for broken/degraded selectors |
| `by_selector/*/per_competitor` | Per-listing breakdown showing which competitors succeeded/failed |
| `details` | Chronological log of every individual lookup |

## Interpreting Results

### PASS

The Playwright browser successfully:
1. Navigated to the URL within 30 seconds
2. Attempted cookie banner dismissal (best-effort)
3. Clicked the Reviews tab (if the selector was found)
4. Scrolled the review container
5. Expanded truncated review text
6. Captured a full-page screenshot + raw HTML

**This does NOT guarantee** that the parser produces correct results — it
only proves the capture pipeline reached the reviews state. Inspect
`page.png` and `page.html` to check actual content quality.

### FAIL (SelectorNotFoundError)

The `scroll_review_container` function could not find the review container
element. This means the selector in `config/selectors.json` does not match
the current Google Maps DOM. The most common cause is a Google Maps layout
update.

Check the screenshot (`page.png`) to see what the browser actually loaded
— it may be a captcha, a consent wall, or a different page layout.

### FAIL (other error)

Network timeouts, navigation failures, or unexpected exceptions. Check
`data/run.log` for the full traceback. Inspect the screenshot to see what
state the page was in.

## Interpreting Selector Health

### Healthy selector

Found on every competitor capture. Example: `review_container` with
`times_found=12, times_not_found=0`. The selector value is valid for the
current Google Maps DOM across the tested listings.

### Broken selector

Never found on any competitor. Example: `cookie_reject_button` with
`times_found=0, times_not_found=12`. Two possibilities:

1. **Expected** — the cookie banner is only shown in certain locales, and
   the tested Google Maps URLs were non-EU. Check `expected_missing` in the
   `details` entries. If `expected_missing=true` for all entries, this is
   benign.
2. **Actual breakage** — the selector no longer matches the DOM. If
   `expected_missing=false`, the selector needs updating.

### Degraded selector

Sometimes found, sometimes not. Example: `reviews_tab_button` with
`times_found=8, times_not_found=4`. Inspect the `per_competitor` breakdown
to see a pattern:

- Found on listings that land on the overview tab (needs click)
- Not found on listings that deep-link directly to reviews

This is **normal** — the reviews tab button is expected to be absent when
the URL already opens the reviews panel. The `per_competitor` data confirms
whether the pattern matches this expectation.

### Unused / not evaluated selector

Parser-only selectors (`review_item`, `review_text_selector`, `rating_selector`,
etc.) are listed under `selectors_not_tested`. Verify mode does not run the
parser, so these selectors are never exercised. To test parser selectors, run
the parser offline against a captured `page.html`.

## Known Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Rate limiting** | Google may temporarily block the IP after multiple rapid requests | The 5–10s polite delay is NOT applied in verify mode (unlike production live mode). Run with manual pacing between attempts. |
| **Captcha / bot detection** | Playwright's headless browser may be detected and served a captcha instead of the listing page | Screenshot will show the captcha. Some anti-bot measures require headed mode, which is not supported in --verify. |
| **No polite delay** | Verify mode does not sleep between listings, unlike production live mode | For mass verification, run listings one at a time with `--url` to avoid triggering rate limits. |
| **No reachability pre-check** | Unlike production live mode, `--verify` does not call `validate_listing` before attempting navigation | The 30s navigation timeout still applies; a dead URL wastes 30s before failing gracefully. |
| **Mock URLs still in config** | `config/listings.json` contains mock URLs with `"mock"` in the place_id — these will fail navigation | Always use `--url` to override with a real URL. Do not edit listings.json for verification. |

## Limitations

1. **No parse verification built in** — `--verify` captures evidence but does
   NOT run the parser or validate review extraction quality. The raw HTML is
   saved for offline analysis; manual or scripted parse verification is left
   to the operator.

2. **No delta/snapshot comparison** — Verify mode does not load existing
   snapshots or compute deltas. It is purely a capture-mode test.

3. **No headless/headed toggle** — Playwright runs in its default headless
   mode. If a selector only works in headed mode, `--verify` will fail.

4. **Single URL override applies to all competitors** — `--url` replaces
   EVERY competitor's URL with the same value. To test multiple different
   real URLs, run multiple invocations or temporarily edit `listings.json`.

5. **No automatic fixture generation** — If verification succeeds, the
   captured HTML is NOT automatically promoted to a fixture file. Manual
   copy to `tests/fixtures/{competitor_id}.html` is required.

6. **Evidence stored on local disk** — Screenshots and HTML are written to
   `data/verify/`. No cloud storage or external pipeline is involved.

## Verification Checklist

Use this checklist when running live verification for the first time or
after a Google Maps layout change.

### Setup

- [ ] Playwright Chromium binary is installed (`playwright install chromium`)
- [ ] `pip install -r requirements.txt` has been run recently
- [ ] You have a real Google Maps place URL (not a mock URL)
- [ ] `config/selectors.json` contains the selectors you want to test
- [ ] You are on a network that can reach `google.com`

### Execution

- [ ] Run `python -m orchestration.run_all --verify --url "<real-URL>"`
- [ ] Exit code is `0` (all passing) or `1` (some failed)

### Evidence Inspection

- [ ] `data/verify/` contains a timestamped directory
- [ ] `page.png` shows a real Google Maps listing (not a captcha/error)
- [ ] `page.png` shows the reviews section scrolled into view
- [ ] `page.html` is non-trivial size (>10KB typical, >50KB with reviews)
- [ ] `page.html` contains review text elements (look for `class="review"` etc.)
- [ ] `report.json` correctly reflects the PASS/FAIL status of each listing
- [ ] `selector_report.json` exists in the verify directory
- [ ] `selector_report.json` shows `healthy`/`degraded`/`broken`/`not_evaluated` counts

### Selector Health Review

- [ ] Which selectors are `broken`? Are they expected to be missing?
- [ ] Which selectors are `degraded`? Does the per-competitor breakdown match expectations?
- [ ] Which selectors are `not_evaluated`? (Parser selectors — expected.)
- [ ] Are any healthy selectors unexpectedly slow (>5s average)?

### Post-Verification

- [ ] If verification fails, inspect the screenshot to understand why
- [ ] If selectors need updating, edit `config/selectors.json` and re-run
- [ ] Document any selector changes in the audit documents
- [ ] If successful, consider promoting HTML to a fixture:
      `Copy-Item data/verify/<ts>/<comp_id>/page.html tests/fixtures/<comp_id>.html`
- [ ] For regression assets, promote to a Golden Dataset:
      `cd gbp-monitor; python -m golden.promote <ts>`
      (See `docs/engineering/GOLDEN_DATASET.md` for the review workflow)

## When to Use --verify vs --fixtures

| Scenario | Mode |
|---|---|
| Testing parser/storage/delta pipeline | `--fixtures` |
| Verifying selectors on current Google Maps | `--verify` |
| Debugging a capture failure | `--verify --url <URL>` |
| CI / cron production run | `live` (default, no flags) |
| Reproducing a bug from known HTML | `--fixtures` |
| Confirming a selector change before deploying | `--verify --url <URL>` |

## Comparison with Production Live Mode

| Aspect | Production `live` | `--verify` |
|---|---|---|
| Writes snapshots | Yes | No |
| Writes deltas | Yes | No |
| Writes run_summary | Yes | No |
| Runs parser | Yes | No |
| Polite delay (5–10s) | Yes | No |
| URL pre-check | Yes (`validate_listing`) | No |
| Screenshot evidence | No | Yes (page.png) |
| Raw HTML saved | No | Yes (page.html) |
| Selector report | No | Yes (selector_report.json) |
| Per-selector outcome tracking | No | Yes |
| Exit code | Always 0 | 0 if all pass, 1 if any fail |
| Affects production data | Yes | No |
