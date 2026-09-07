# Review Collection Verification

## Purpose

Prove whether the scraper is actually collecting **every** review Google
Maps exposes. Previously we could prove "browser automation worked" and
"parser exported N reviews", but we could NOT answer:

> Did we scrape every review available?

Example: Google Maps displays "5,327 reviews" but the scraper exports 6.
The question is where the loss occurs:

- Did scrolling stop early?
- Did Google lazy-load only a few cards?
- Did the parser miss elements?
- Did Google rate-limit loading?
- Did a selector change?
- Did DOM virtualization remove nodes?

This document describes every artifact that answers these questions.

---

## Artifacts

Each competitor's verify directory (`data/verify/{ts}/{competitor_id}/`)
now contains these collection-specific files:

| File | Contents | Proves |
|------|----------|--------|
| `business_metadata.json` | Business name, Google rating, Google review count | What Google reports vs what we collected |
| `scroll_progress.json` | Every scroll iteration with height, visible cards, DOM nodes, stable counter, bottom reason | Whether scrolling reached bottom |
| `parser_efficiency.json` | Google count vs DOM nodes vs parsed vs exported | Whether parser lost any reviews |
| `collection_verdict.json` | PASS/FAIL with human-readable reason | Overall collection health |

The combined `pipeline_summary.json` at the verify root includes per-listing
summaries with `collection_percent` and `verdict` fields.

---

## business_metadata.json

Extracted from the Google Maps page via multiple strategies in priority order:

1. JSON-LD structured data (`<script type="application/ld+json">`)
2. Page title
3. Google Maps CSS selectors (h1, [itemprop='name'])
4. Body text regex

```json
{
    "business_name": "Revolver Espresso Seminyak",
    "google_rating": "4.8",
    "google_review_count": "5327",
    "page_title": "Revolver Espresso Seminyak - Google Maps",
    "page_url": "https://www.google.com/maps/place/..."
}
```

In fixtures mode (no real Google Maps), this will show only `page_title`
and `page_url` — the structured fields will be absent.

---

## scroll_progress.json

Every scroll iteration is recorded:

```json
[
    {
        "iteration": 1,
        "height": 5000,
        "visible_cards": 18,
        "dom_nodes": 18,
        "stable": 0,
        "bottom_reason": null,
        "duration_s": 2.5
    },
    {
        "iteration": 2,
        "height": 10000,
        "visible_cards": 36,
        "dom_nodes": 36,
        "stable": 0,
        "bottom_reason": null,
        "duration_s": 2.6
    },
    {
        "iteration": 10,
        "height": 120000,
        "visible_cards": 5327,
        "dom_nodes": 5327,
        "stable": 3,
        "bottom_reason": "stable_scroll",
        "duration_s": 2.5
    }
]
```

**bottom_reason** values and their meanings:

| Value | Meaning |
|-------|---------|
| `stable_scroll` | scrollHeight unchanged AND DOM node count unchanged for STABLE_THRESHOLD iterations |
| `spinner_finished` | Google's loading spinner disappeared and height is unchanged |
| `sentinel_detected` | A "no more reviews" or "end" text sentinel was found in the DOM |
| `max_scroll` | Hit MAX_SCROLLS=40 limit without stabilizing |
| `timeout` | Wall-clock deadline exceeded |
| `unknown` | Loop exited without a detected reason |

If `bottom_reason` is `max_scroll` or `timeout`, reviews are likely
incomplete — the page has more reviews than the scraper loaded.

---

## parser_efficiency.json

Compares numbers at each pipeline stage:

```json
{
    "google_review_count": "5327",
    "dom_review_nodes": 5327,
    "parsed_reviews": 5327,
    "exported_reviews": 5327,
    "parser_efficiency": 100.0
}
```

**Fields:**

| Field | Source | Meaning |
|-------|--------|---------|
| `google_review_count` | `business_metadata` | What Google displays (may be absent in fixtures mode) |
| `dom_review_nodes` | Max of scroll_progress dom_nodes + review_stats visible_cards | How many review DOM elements existed in captured HTML |
| `parsed_reviews` | Parser output | How many Review objects were created |
| `exported_reviews` | After delta + save | How many were written to snapshot (same as parsed in normal runs) |
| `parser_efficiency` | `exported / dom_nodes * 100` | 100% = all DOM nodes exported |

**If parser_efficiency < 100%:** The parser is losing reviews. Check:
1. Are items missing `data-review-id`? (logged as WARNING)
2. Did the locator fail to match certain items? (check locator tier logs)
3. Are there duplicate IDs? (parsed once, duplicates skipped)

---

## collection_verdict.json

Human-readable PASS/FAIL with exact reason:

```json
{
    "status": "PASS",
    "reason": "All 5327 DOM reviews parsed successfully | Browser collected 5327/5327 Google reviews (100.0%)",
    "collection_percent": 100.0
}
```

Failure examples:

```json
{
    "status": "FAIL",
    "reason": "Browser only collected 143 of 5327 Google reviews (2.68%) | All 143 DOM reviews parsed successfully",
    "collection_percent": 2.68
}
```

```json
{
    "status": "FAIL",
    "reason": "No review DOM nodes found — page may not have loaded reviews",
    "collection_percent": null
}
```

---

## How to Inspect Failures

### Step 1: Check the verdict

```bash
grep "VERDICT" data/run.log
```

If status=PASS, all reviews that were available in the DOM were parsed.

### Step 2: If FAIL, check where the loss is

**Loss in browser (Google count >> DOM nodes):**
- Open `scroll_progress.json`
- Look at `bottom_reason` — if `max_scroll` or `timeout`, the scraper didn't reach the end
- Look at max `dom_nodes` — if it's far below Google's count, the page didn't load all reviews
- Possible causes:
  - Google rate-limited the browser (check for CAPTCHA in screenshots)
  - Page is very large (>40 scrolls needed)
  - Network latency (increase `_CAPTURE_TOTAL_TIMEOUT_S`)
  - Bot detection (check `01-business-loaded.png` for interstitial pages)

**Loss in parser (DOM nodes >> parsed):**
- Check `parser_efficiency.json` — if <100%, parser is losing reviews
- Check `review_statistics.json` — look at `skipped` and `missing_fields`
- Grep for "WARNING" in the log:
  ```bash
  grep -E "skip.*without|reviewer_name.*failed|rating.*failed" data/run.log
  ```

**Loss in exporter (parsed >> exported):**
- Currently `parsed == exported` in all cases. If they diverge in the future,
  check the delta computation in `storage/delta.py`.

### Step 3: Reproduce

```bash
# Run a full verify pass
python -m orchestration.run_all --verify

# Open the artifacts
ls data/verify/*/
cat data/verify/*/pipeline_summary.json
cat data/verify/*/collection_verdict.json
```

---

## Grep Quick-Reference

```bash
# Collection verdicts
grep "VERDICT" data/run.log

# Parser efficiency
grep "PARSER_EFF" data/run.log

# Business metadata
grep "BUSINESS_META" data/run.log

# Scroll bottom reason
grep "SCROLL_COMPLETE" data/run.log

# Per-iteration scroll progress
grep "SCROLL_ITER" data/run.log

# Parser warnings (potential loss)
grep -E "(WARNING|skip|failed)" data/run.log | grep -i parser

# All failures
grep "FAILURE" data/run.log
```

---

## Known Limitations

1. **Fixtures mode**: Google review count is not available (no real page
   loaded). Efficiency metrics show `google_count=None` and verdict is
   based on dom_nodes vs parsed only.

2. **Google review count extraction**: The extraction relies on regex
   matching page text. If Google changes how review counts are displayed
   (e.g., only in JSON-LD or behind an API), the count may be missing.
   The verdict handles this gracefully: without Google's count, it
   checks dom_nodes vs parsed only.

3. **DOM node counting**: The JS-based `_collect_dom_stats` counts
   elements matching `[data-review-id]` or `div.jftiEf` inside the
   container. If Google changes the class or attribute names, this
   count may be incorrect but the parser's locator tiers will adapt.

4. **Virtual scrolling**: Google Maps uses DOM virtualization — only
   visible review cards exist in the DOM at any time. The `dom_nodes`
   count may be much lower than Google's total count even after
   reaching the bottom, because old cards get removed from the DOM.
   In this case, look at scroll progress: if `bottom_reason` is
   `stable_scroll` and the page was scrolled to the end, the scraper
   DID reach the bottom even with fewer DOM nodes than Google's count.
