# Live Browser Instrumentation

## Purpose

Every phase of the live Google Maps scraping pipeline is instrumented so a
future engineer can open **one verify run** and determine within two minutes:

1. Did browser automation work?
2. Did the Reviews dialog open?
3. How many review cards became available?
4. How many reviews were parsed?
5. If counts differ, exactly where the discrepancy occurred.

This document describes every artifact, log line, and validation step added
by the /PITFALLS + /KILLCRITIC instrumentation pass (2026-07-30).

---

## Architecture

Instrumentation is implemented via `PipelineInstrument` in
`harness/instrument.py`. It is:

- **Optional** — every method accepts `instrument: PipelineInstrument | None`
  and short-circuits when `None`. Removing instrumentation later means
  dropping the `instrument=` parameter at ~8 call sites.
- **Thread-safe enough** — not explicitly thread-safe, but the verify mode is
  single-threaded per listing. No locking needed.
- **Self-logging** — every event is written to both the `PipelineInstrument`
  object AND the standard `gbp-monitor.*` logger, providing redundant evidence.

### The PipelineInstrument class

```
PipelineInstrument(competitor_id)
├── start_phase(phase) / end_phase(status, detail)
│   └── Logs: PHASE[<id>] <phase> — <status> (<duration>s) [— <detail>]
├── phase_result(phase, status, detail)  # start + end in one call
├── record_selector(key, primary, fallback_used, matched, count, ...)
│   └── Logs: SELECTOR[<id>] <key> primary=... fallback=... matched=... count=...
├── record_screenshot(phase, path)
│   └── Logs: SCREENSHOT[<id>] <phase> -> <path>
├── set_review_stats(stats)
│   └── Logs: REVIEW_STATS[<id>] visible=... unique_ids=... ratings=... text=... ...
├── set_business_metadata(metadata)
│   └── Logs: BUSINESS_META[<id>] google_review_count=... google_rating=... ...
├── to_dict() -> dict   # Full serializable state
└── pipeline_summary() -> dict  # Human-readable PASS/FAIL summary
```

---

## Log Line Reference

All instrumentation log lines use the `gbp-monitor.instrument` logger and are
prefixed with a tag for easy grepping.

### PHASE lines

Every significant browser action is wrapped in `start_phase` / `end_phase`.

Format:
```
PHASE[<competitor_id>] <phase_name> — starting
PHASE[<competitor_id>] <phase_name> — <status> (<duration>s) [— <detail>]
```

Phases emitted during a normal capture (in order):

| Phase | Triggered by | Detail |
|-------|-------------|--------|
| `navigation` | `page.goto()` | URL loaded |
| `cookie_dialog` | `_fallback_click` cookie_reject | Whether cookie dialog was handled |
| `reviews_tab_click` | `_fallback_click` reviews_tab_button | Whether Reviews button was clicked |
| `reviews_dialog_verify` | `_verify_reviews_dialog()` | Whether Reviews dialog was confirmed open |
| `scroll_resolve_container` | `_resolve_container_with_fallback` | Which container selector matched |
| `scroll_iteration_N` | Each scroll loop iteration | height, visible_cards, stable count |
| `scroll_complete` | After scroll loop exits | Total scrolls, max visible, final height |
| `expand_reviews` | `_fallback_expand` | Whether "More" buttons were clicked |
| `html_capture` | `page.content()` | HTML byte size |
| `business_metadata` | `_capture_business_metadata()` | Extracted review count and rating |
| `parse_locator` | `resolve_review_items()` | Which locator tier succeeded, item count |
| `parse` | `parse_reviews()` (inner field parsing) | |

### SELECTOR lines

Every selector resolution is logged with its outcome.

Format:
```
SELECTOR[<competitor_id>] <key> primary=<primary> fallback=<bool> matched=<bool> count=<N>
```

Selector keys logged:
- `cookie_reject_button` — cookie dialog dismiss
- `reviews_tab_button` — Reviews tab click
- `review_container` — scroll container selector resolution
- `review_dialog` — Reviews dialog presence check
- `expand_text_button` — "More" text expansion
- `review_container` — scroll container (in scroll.py)

### SCROLL lines

Scroll iterations log per-iteration statistics:

```
SCROLL[<id>] iteration <N> height=<h> visible=<N> (duration)
SCROLL_COMPLETE[<id>] <N> scroll iteration(s), max visible cards=<N>, final height=<h>, total_time
```

### REVIEW_STATS lines

After parsing, a comprehensive summary is emitted:

```
REVIEW_STATS[<competitor_id>] visible=<N> unique=<N> ratings=<N> text=<N> missing=<N> skipped=<N> parsed=<N>
```

Fields:
| Field | Meaning |
|-------|---------|
| `visible` | Total review-card elements in the captured HTML (from locator) |
| `unique` | Unique data-review-id values (duplicates counted once) |
| `ratings` | Cards with a successfully-parsed rating |
| `text` | Cards with non-empty review text |
| `missing` | Cards missing a rating field |
| `skipped` | Cards skipped due to missing data-review-id |
| `parsed` | Total Review objects produced |
| `exported` | Reviews that flowed to the snapshot (same as parsed for normal runs) |

### SCREENSHOT lines

```
SCREENSHOT[<competitor_id>] <phase> -> <filepath>
```

### BUSINESS_META lines

```
BUSINESS_META[<competitor_id>] google_review_count=<str> google_rating=<str> cards_loaded=<N>
```

Note: `google_review_count` and `google_rating` are extracted from page text
via regex. They may be `?` or missing if the text pattern does not match
(Google may render this data in JSON-LD or other structures not covered by
the current simple regex). The `cards_loaded` field is from the JS-side
visible-card count in the scroll container.

---

## Verify Artifacts

When running with `--verify`, each competitor's evidence directory
(`data/verify/{ts}/{competitor_id}/`) now contains:

| File | Source | Contents |
|------|--------|----------|
| `page.png` | Existing | Full-page screenshot |
| `page.html` | Existing | Captured raw HTML |
| `01-business-loaded.png` | **New** | Viewport screenshot after `page.goto()` |
| `02-reviews-opened.png` | **New** | Viewport screenshot after Reviews button click |
| `03-after-scroll.png` | **New** | Viewport screenshot after scroll completes |
| `04-final-state.png` | **New** | Viewport screenshot before HTML capture |
| `browser_log.json` | **New** | Full `PipelineInstrument.to_dict()` — all phases, selector decisions, screenshots |
| `review_statistics.json` | **New** | `PipelineInstrument.review_stats` dict |
| `pipeline_summary.json` | **New** | `PipelineInstrument.pipeline_summary()` — human-readable PASS/FAIL summary |

At the verify root (`data/verify/{ts}/`):

| File | Source | Contents |
|------|--------|----------|
| `report.json` | Existing | Top-level verify report (passed/failed counts) |
| `selector_report.json` | Existing | `SelectorTracker.get_report()` |
| `pipeline_summary.json` | **New** | Combined summary: overall PASS/FAIL + per-listing breakdown |

---

## Pipeline Summary Format

The `pipeline_summary.json` (per-competitor) contains:

```json
{
  "overall": "PASS",
  "competitor_id": "comp-seminyak-01",
  "total_duration_s": 12.5,
  "phases_ok": true,
  "selectors_ok": true,
  "reviews_parsed": true,
  "phases_total": 14,
  "phases_failed": 0,
  "failed_phases": [],
  "selectors_total": 8,
  "selectors_failed": 0,
  "cards_loaded": 182,
  "cards_parsed": 182,
  "cards_missing": 0,
  "google_review_count": "5,231",
  "google_rating": "4.3"
}
```

The combined `pipeline_summary.json` at the verify root:
```json
{
  "run_id": "20260730T...",
  "overall": "PASS",
  "total_listings": 3,
  "total_passed": 3,
  "listings": [ ... per-listing summaries ... ]
}
```

### Interpreting PASS vs FAIL

**Overall PASS** means ALL of:
- Every phase completed with status `"success"`
- Every selector matched at least once (unless legitimately absent, like cookie dialog)
- Review statistics were produced

**Overall FAIL** means at least one:
- A phase failed (e.g., `reviews_dialog_verify` flagged the dialog as not detected)
- A required selector (e.g., `review_container`) never matched
- No review statistics (parser returned 0 reviews)

---

## Grep Quick-Reference

```bash
# All phases for a competitor
grep "PHASE\[comp-seminyak-01\]" data/run.log

# All selector decisions
grep "SELECTOR" data/run.log

# Scroll summary
grep "SCROLL_COMPLETE" data/run.log

# Review statistics
grep "REVIEW_STATS" data/run.log

# Business metadata
grep "BUSINESS_META" data/run.log

# FAIL events (any phase)
grep "PHASE.*fail" data/run.log

# Reviews dialog detection
grep "REVIEWS_DIALOG" data/run.log

# Any detected problems
grep -E "(WARNING|ERROR|FAIL|ALERT)" data/run.log
```

---

## Removal Guide

Instrumentation is designed to be removable with minimal effort. To remove:

1. Delete `harness/instrument.py`
2. In `harness/capture.py`: remove `instrument` parameter from
   `capture_listing_html`, `_fallback_click`, `_fallback_expand`, and all
   convenience functions. Remove calls to `_capture_business_metadata()`,
   `_verify_reviews_dialog()`, `_safe_screenshot()`, and all
   `if instrument:` blocks.
3. In `harness/scroll.py`: remove `instrument` parameter from
   `scroll_review_container`, `_resolve_container_with_fallback`. Remove all
   `if instrument:` blocks and `collect_visible_review_count()` if not needed.
4. In `parser/review_parser.py`: remove `instrument` parameter from
   `parse_reviews()`. Remove all `if instrument:` blocks.
5. In `orchestration/run_all.py`: remove `instrument` from
   `_capture_with_retries`, `_process_one_listing`, and `run_verify`.
   Remove the artifact-writing code for `browser_log.json`,
   `review_statistics.json`, and `pipeline_summary.json`.

Estimated effort: 30 minutes.
