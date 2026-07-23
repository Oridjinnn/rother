# Architecture Audit 03 — HTML Parser & Data Extraction Subsystem

**Date:** 2026-07-22
**Subsystem:** `gbp-monitor/parser/` + `gbp-monitor/harness/locator.py` + `gbp-monitor/config/selectors.json` + `gbp-monitor/tests/fixtures/`
**Repository root:** `D:\Documents (D)\Softwares\Rother\Rother - 0.0.1`

---

## Executive Summary

The Parser subsystem is a **pure-function HTML-to-structured-data pipeline** that converts raw Google Maps review panel HTML into `Review` dataclass instances. It consists of:

| Component | Lines | Role |
|---|---|---|
| `parser/schema.py` | 34 | `Review` dataclass definition + serialization |
| `parser/review_parser.py` | 227 | Main parser: HTML → list[Review] via field extraction helpers |
| `harness/locator.py` | 169 | 5-tier self-healing CSS locator hierarchy (review-item discovery in HTML) |
| `config/selectors.json` | 16 | CSS/XPath selectors and attribute names for field extraction |
| `tests/fixtures/` | 3 HTML files | Static test fixtures (3.2–4.4 KB each) |

The parser is **deterministic**, takes no network or I/O dependencies (beyond reading its inputs), and is fully testable against static fixtures. It uses `parsel.Selector` (Scrapy's standalone library) for CSS/XPath queries.

The most architecturally notable feature is the **self-healing locator** (`locator.py`) — a 5-tier fallback hierarchy that lets the parser survive Google DOM class-name changes. Tiers 1–4 are class-name-independent; tier 5 is the legacy `selectors.json` CSS selector.

The parser supports per-listing failure isolation but has **no confidence scoring, no validation layer, and no automated tests**.

---

## Scope

### Files Reviewed

| File | Lines | Role |
|---|---|---|
| `gbp-monitor/parser/__init__.py` | 0 | Package marker |
| `gbp-monitor/parser/schema.py` | 34 | `Review` dataclass, `review_to_dict()` |
| `gbp-monitor/parser/review_parser.py` | 227 | HTML → list[Review], 4 field extraction helpers |
| `gbp-monitor/harness/locator.py` | 169 | 5-tier self-healing locator (used by parser) |
| `gbp-monitor/config/selectors.json` | 16 | Field extraction selectors + metadata |
| `gbp-monitor/storage/delta.py` | 54 | Downstream consumer of parsed output |
| `gbp-monitor/tests/fixtures/comp-canggu-01.html` | 52 | Fixture: Crate Cafe Canggu |
| `gbp-monitor/tests/fixtures/comp-seminyak-01.html` | — | Fixture: Revolver Espresso Seminyak |
| `gbp-monitor/tests/fixtures/comp-ubud-01.html` | — | Fixture: Seniman Coffee Studio Ubud |
| `gbp-monitor/data/snapshots/comp-canggu-01.json` | — | Parsed output (6 reviews) |
| `gbp-monitor/data/snapshots/comp-seminyak-01.json` | — | Parsed output (7 reviews) |
| `gbp-monitor/data/snapshots/comp-ubud-01.json` | — | Parsed output (7 reviews) |

### Excluded from This Audit

- `gbp-monitor/harness/browser.py`, `capture.py`, `scroll.py` — covered in AUDIT-02
- `gbp-monitor/orchestration/run_all.py` — orchestrator (covers lifecycle only)
- `gbp-monitor/storage/snapshot_store.py` — file persistence (downstream)
- `src/lib/gbp/types.ts` — dashboard-side type definitions (mirror, not source)

---

## Parsing Pipeline

### Diagram

```
            ┌──────────────────────────────┐
            │  Raw HTML (string)            │
            │  - from capture.py (live)     │
            │  - from tests/fixtures/*.html │
            └──────────┬───────────────────┘
                       │
                       ▼
            ┌──────────────────────────────┐
            │  parse_reviews(html,          │
            │    competitor_id,             │
            │    branch_id,                 │
            │    selectors)                 │
            │                              │
            │  1. parsel.Selector(text=html)│
            │  2. resolve_review_items(sel) │ ← 5-tier locator
            │     ├── None → return []      │
            │     └── LocatorResult → items │
            │  3. For each item:            │
            │     ├── review_id (required)  │
            │     ├── reviewer_name         │
            │     ├── rating (float)        │
            │     ├── text                  │
            │     ├── relative_date         │
            │     └── scraped_at (auto)     │
            │  4. Return list[Review]       │
            └──────────┬───────────────────┘
                       │
                       ▼
            ┌──────────────────────────────┐
            │  review_to_dict(Review)       │
            │  → dict for JSON serialization│
            └──────────┬───────────────────┘
                       │
                       ▼
            ┌──────────────────────────────┐
            │  Storage (orchestration):     │
            │  ├── compute_new_reviews()   │
            │  ├── save_snapshot()          │
            │  └── append_new_reviews()    │
            └──────────────────────────────┘
```

### Pipeline Steps (detailed)

1. **Input**: Raw HTML string + `competitor_id` + `branch_id` + `selectors` dict
2. **Parsel initialization**: `sel = Selector(text=html)` — creates a parse tree
3. **Review item discovery**: `resolve_review_items(sel, ...)` — tries 5 CSS tiers to find review elements
4. **Required-field filter**: Items without `data-review-id` are skipped (logged at INFO)
5. **Field extraction**: For each eligible item, 4 `_safe_parse_*` helpers extract individual fields
6. **Review construction**: `Review(review_id, competitor_id, branch_id, reviewer_name, rating, text, relative_date, scraped_at)`
7. **Serialization**: `review_to_dict(review)` → plain dict via `dataclasses.asdict()`
8. **Downstream**: Dicts passed to `compute_new_reviews()` and `save_snapshot()`

---

## Module Breakdown

### `parser/schema.py`

| Attribute | Value |
|---|---|
| **Purpose** | Single source of truth for the `Review` record shape |
| **Responsibilities** | Define `Review` dataclass, provide `review_to_dict()` serializer |
| **Inputs** | None (definitional module) |
| **Outputs** | `Review` class, `review_to_dict()` function |
| **Dependencies** | `dataclasses` (stdlib) |
| **Consumers** | `review_parser.py`, all storage modules, orchestration |
| **Maturity** | **Stable** — 7-field dataclass with clear types. `review_to_dict()` uses `dataclasses.asdict()` for correctness. |

### `parser/review_parser.py`

| Attribute | Value |
|---|---|
| **Purpose** | Pure-function HTML-to-Review-list conversion |
| **Responsibilities** | Parse HTML → discover review items → extract 7 fields → return list[Review] |
| **Inputs** | `html: str`, `competitor_id: str`, `branch_id: str`, `selectors: dict` |
| **Outputs** | `list[Review]` |
| **Dependencies** | `parsel`, `harness/locator.py`, `parser/schema.py`, `re`, `datetime` |
| **Consumers** | `orchestration/run_all.py:_process_one_listing()` |
| **Maturity** | **Beta** — All field extractors present, defensive null handling, logging. Missing: confidence scoring, malformed-HTML validation, non-deterministic `scraped_at` per call (not per page load). |

### `harness/locator.py`

| Attribute | Value |
|---|---|
| **Purpose** | Self-healing CSS locator hierarchy for review-item discovery in parsed HTML |
| **Responsibilities** | Try 5 CSS tiers in priority order, return first that yields items with `data-review-id`, log full audit trail |
| **Inputs** | `parsel.Selector`, `seed_review_item_selector`, `review_id_attr`, `competitor_id` |
| **Outputs** | `LocatorResult` or `None` |
| **Dependencies** | `parsel` (via caller), `dataclasses` |
| **Consumers** | `review_parser.py` |
| **Maturity** | **Alpha** — Well-designed 5-tier hierarchy based on arXiv:2603.20358. But the tiers 1–4 selectors are hardcoded, not configurable. Only testable against static fixtures, not proven against live Google Maps DOM. The `review_id_attr` is parameterized but defaults to `"data-review-id"` with no fallback value. |

---

## Extraction Rules

### Field: `review_id`

| Attribute | Value |
|---|---|
| **Source location** | `item.attrib[selectors["review_id_attr"]]` — currently `data-review-id` attribute on the review-item div |
| **Extraction method** | `item.attrib.get(selectors["review_id_attr"])` — direct attribute access |
| **Selector usage** | None (the item element is already matched by the locator; the attribute is read directly) |
| **Validation** | Required field. If missing or empty → item skipped entirely (logged at INFO). |
| **Fallback behavior** | No fallback. If `data-review-id` is absent from all items, all are skipped, 0 reviews returned. |
| **Type** | `str` (non-optional) |

### Field: `competitor_id`

| Attribute | Value |
|---|---|
| **Source location** | Passed as parameter to `parse_reviews()` (from `config/listings.json`) |
| **Extraction method** | Direct parameter propagation — not extracted from HTML |
| **Selector usage** | None |
| **Validation** | None — accepted as-is from caller |
| **Fallback behavior** | No fallback. If the caller passes an empty string, the field is empty. |
| **Type** | `str` (non-optional) |

### Field: `branch_id`

| Attribute | Value |
|---|---|
| **Source location** | Passed as parameter to `parse_reviews()` (from `config/listings.json`) |
| **Extraction method** | Direct parameter propagation — not extracted from HTML |
| **Selector usage** | None |
| **Validation** | None |
| **Fallback behavior** | Same as `competitor_id` — caller-dependent |
| **Type** | `str` (non-optional) |

### Field: `reviewer_name`

| Attribute | Value |
|---|---|
| **Source location** | `aria-label` attribute on the review-item div (same element matched by the locator) |
| **Extraction method** | `item.attrib.get(selectors["reviewer_name_attr"])` — defaults to `"aria-label"` |
| **Selector usage** | `reviewer_name_attr` from `selectors.json` |
| **Validation** | None — stored verbatim including `, original` suffix |
| **Fallback behavior** | `return None` on any exception or missing attribute |
| **Type** | `str \| None` |
| **Notes** | Google's `aria-label` includes `, original` suffix. The parser intentionally preserves it per Rule 3 (evidence for selector verification). The dashboard strips it via `cleanReviewerName()` in `src/lib/gbp/format.ts`. |

### Field: `rating`

| Attribute | Value |
|---|---|
| **Source location** | `aria-label` attribute on the rating star span (`span.kvMYJc[aria-label]`) |
| **Extraction method** | `item.css(rating_selector).attrib.get(rating_attr)` → regex `_RATING_PATTERN` on the label string |
| **Selector usage** | `rating_selector` = `"span.kvMYJc"`, `rating_attr` = `"aria-label"` |
| **Validation** | Regex requires pattern `N out of 5` or `N/5` (case-insensitive). First captured digit extracted as float. |
| **Fallback behavior** | `return None` if element missing, attribute missing, or regex doesn't match |
| **Type** | `float \| None` |
| **Examples** | `"Rated 4 out of 5"` → `4.0`, `"5 out of 5 stars"` → `5.0` |
| **Notes** | Only integer ratings (1.0–5.0) from the regex. Decimal ratings (e.g., "4.5 out of 5") would theoretically match but Google Maps only uses integers for the star display. |

### Field: `text`

| Attribute | Value |
|---|---|
| **Source location** | Inner text of the review body span (`span.wiI7pd`) |
| **Extraction method** | `item.css(review_text_selector)` → `node.xpath("string(.)").get()` → `.strip()` |
| **Selector usage** | `review_text_selector` from `selectors.json` |
| **Validation** | None — stripped string is returned. Empty string or whitespace-only → None (via truthiness check). |
| **Fallback behavior** | `return None` if no element matched or text is empty/whitespace |
| **Type** | `str \| None` |
| **Notes** | Rating-only reviews (no text) are valid Google Maps state. The parser correctly returns None for those, not an error. |

### Field: `relative_date`

| Attribute | Value |
|---|---|
| **Source location** | Inner text of the date span (`span.rsqaWe`) |
| **Extraction method** | `item.css(relative_date_selector)` → `node.xpath("string(.)").get()` → `.strip()` |
| **Selector usage** | `relative_date_selector` from `selectors.json` |
| **Validation** | None — stored verbatim as Google's localized relative date string |
| **Fallback behavior** | `return None` if element missing or text empty |
| **Type** | `str \| None` |
| **Examples** | `"5 days ago"`, `"a week ago"`, `"2 months ago"` |
| **Notes** | Google's relative dates are localized. The parser does not attempt to parse them into absolute dates — that is the dashboard's responsibility. |

### Field: `scraped_at`

| Attribute | Value |
|---|---|
| **Source location** | Generated by parser at call time |
| **Extraction method** | `datetime.now(timezone.utc).isoformat()` — called once per `parse_reviews()` invocation |
| **Selector usage** | None |
| **Validation** | None (stdlib ISO 8601 output) |
| **Fallback behavior** | N/A — always generated |
| **Type** | `str` (ISO 8601 UTC, non-optional) |
| **Notes** | All reviews from one call share the same `scraped_at`. This is correct for a batch parse. |

### Fields NOT Extracted

The parser does **not** extract the following fields, even though they may be present in the HTML:
- **Reviewer profile URL** — Google review items may contain an avatar link
- **Reviewer avatar** — No image URL extraction
- **Review response** — Business owner public replies are not extracted
- **Review local guide badge** — Not captured
- **Review photo count** — Not captured
- **Original language** — Not detected from the review text
- **Star count (raw)** — Only the numeric rating, not the raw ★ string
- **Thumbs up/vote count** — Not captured

---

## Validation Strategy

### Required Fields

Only **`review_id`** is strictly required. If missing from an item:
- The item is skipped (`continue`)
- A counter `skipped_without_id` is incremented
- After the loop, an INFO log reports the count if > 0

**No other field is required** — every field except `review_id` can be `None`.

### Optional Fields

All other fields are optional:
- `reviewer_name: str | None`
- `rating: float | None`
- `text: str | None`
- `relative_date: str | None`

### Missing Value Handling

- **Missing attribute on element** (e.g., no `aria-label` for rating) → `_safe_*` helper's `item.attrib.get()` returns `None` → final field is `None`
- **Missing child element** (e.g., no `span.wiI7pd` for text) → `item.css(selector)` returns empty list → `node.xpath(...).get()` returns `None` or empty → guarded by `if not node: return None`
- **Regex mismatch** (e.g., unexpected rating label format) → `_RATING_PATTERN.search()` returns `None` → `return None`

### Malformed HTML Handling

- **Not validated**: The parser does not check whether the input is well-formed HTML or even resembles a Google Maps page
- **Parsel handles malformed HTML**: `parsel.Selector` is built on `lxml` which is lenient with malformed markup — it will produce a parse tree from any string
- **If entirely wrong HTML is provided** (e.g., a JSON response or error page): The locator will find zero matching items, all 5 tiers will fail, `resolve_review_items` returns `None`, the parser returns `[]` (empty list), and an ERROR log is emitted. The downstream orchestrator counts this as a successful parse of 0 reviews (not a failure), unless the orchestrator detects issues via other signals.

### Duplicate Handling

- **The parser does NOT deduplicate** — it returns every item found in the HTML, including duplicates if the same review appears multiple times
- **Deduplication happens downstream** in `storage/delta.py:compute_new_reviews()` which compares `review_id` sets between old and new snapshots
- **If the same `review_id` appears twice within a single parse** (e.g., Google Maps duplicated the review item), both copies are returned. The snapshot would contain both. `compute_new_reviews()` would only detect the first occurrence as new against the prior snapshot.

### Partial Parsing Support

- **Yes**: The parser processes items independently. A single malformed item (e.g., missing rating element) does not affect other items.
- **No transaction/batch semantics**: If the HTML contains 100 items and the first 99 parse successfully while item 100 causes an unhandled exception in a `_safe_parse_*` helper (each wrapped in try/except, so this is unlikely), only item 100 would be lost.

---

## Confidence & Correctness

### Confidence Scoring

**Not implemented.** The parser has no confidence scoring:
- No score for how many fields were successfully extracted per item
- No score for how many items succeeded vs. failed the `review_id` check
- No score for locator tier quality (though the tier number is logged)
- No score for rating distribution plausibility (e.g., all 5.0 ratings might indicate a parsing bug)

### Correctness Validation

**Not implemented.** There is no validation layer that:
- Checks that `rating` is within the 1.0–5.0 range (though the regex inherently limits the range)
- Checks that `reviewer_name` looks like a plausible name
- Checks that `relative_date` matches expected patterns
- Cross-validates extracted data against known-good snapshots
- Detects field-level corruption (e.g., text appearing in the rating field)

### Evidence from Code

The parser relies entirely on the orchestrator's `failed >= success` alert for correctness signals. If the parser silently returns 0 reviews because of a selector mismatch, the orchestrator sees `success += 1` with `total_reviews += 0`, which does not trigger the alert (failed=0, success=1, condition `failed >= success` is False).

---

## Error Handling

### Exception Handling Strategy

Every field extraction is wrapped in `try/except Exception` with `logger.debug()` and `return None`:

```python
def _safe_parse_rating(item, selectors):
    try:
        # ... extraction logic ...
        return result
    except Exception as e:
        logger.debug("rating parse failed: %s", e)
        return None
```

### Exception Scope

- **`reviewer_name`** — `KeyError` if `selectors` missing `rating_selector` key (wait, the reviewer_name function uses `selectors.get("reviewer_name_attr", "aria-label")` with a default, and `item.attrib.get()` returns None by default — this is the safest helper)
- **`rating`** — `KeyError` if `selectors` missing `rating_selector` key (uses `selectors["rating_selector"]` with bracket access, no `.get()`)
- **`text`** — `KeyError` if `selectors` missing `review_text_selector` key (bracket access)
- **`date`** — `KeyError` if `selectors` missing `relative_date_selector` key (bracket access)

**Observation**: Three of the four helpers use bracket access (`selectors["key"]`) which raises `KeyError` on missing keys. Only `reviewer_name` uses `.get()`. This means a missing selector key for rating, text, or date would be caught by the `try/except` and silently return `None` — the exception is only logged at DEBUG, making debugging more difficult.

### Per-Item Exception Behavior

- Individual field failure → field becomes `None`
- Item-level unhandled exception → not possible within current code (all field helpers are try/except, and `Review()` dataclass construction has no validation that could raise)
- Locator-level failure → caught by `parse_reviews()`, returns `[]`
- Caller-level exception → caught by `_process_one_listing()` in orchestrator, counted as failure, next listing continues

### Logging

| Logger | Level | Event |
|---|---|---|
| `gbp-monitor.parser` | INFO | Review count summary, skipped-without-ID count, locator tier used |
| `gbp-monitor.parser` | ERROR | All locator tiers failed |
| `gbp-monitor.parser` | DEBUG | Each individual field extraction failure |
| `gbp-monitor.locator` | INFO | Tier resolution success (tier number, item count, tried tiers) |
| `gbp-monitor.locator` | WARNING | All tiers failed, per-tier selector exception |

### Recovery Behavior

- **Field extraction failure**: Field becomes `None`, item retained
- **Locator failure**: Returns `[]` (empty list), logging at ERROR level
- **Corrupt HTML**: Parsel produces a parse tree from any input; locator returns `[]` if no matching elements
- **Missing selectors.json keys**: `KeyError` → caught by individual helpers → `None` fields. However, `selectors["review_item"]` at the locator call site (line 87) and `selectors["review_id_attr"]` (line 88) use bracket access with **no try/except** — a `KeyError` here would propagate up to `_process_one_listing()` and be counted as a listing failure.

---

## Fixtures & Test Assets

### Fixture Files

| File | Size | Competitor | Scenario |
|---|---|---|---|
| `comp-canggu-01.html` | 3,271 B | Crate Cafe Canggu | 6 reviews, ratings 3–5, English + Indonesian text, range "5 days ago" to "a month ago" |
| `comp-seminyak-01.html` | 4,025 B | Revolver Espresso Seminyak | 7 reviews, ratings 3–5, English + Indonesian, range "3 days ago" to "2 months ago" |
| `comp-ubud-01.html` | 4,445 B | Seniman Coffee Studio Ubud | 7 reviews, ratings 3–5, English + Indonesian, range "2 days ago" to "2 months ago" |

### Represented Scenarios

- Multiple reviewers per competitor (6–7 per fixture)
- Mixed rating values (3.0, 4.0, 5.0)
- Mixed languages (English, Indonesian)
- Multiple date ranges (days to months)
- All reviews have text + rating + reviewer name
- Standard `data-review-id` attribute on each review item
- Class-based review container (`div.m6QErb.DxyBCb.kA9KIf.dS8AEf`)
- Class-based review items (`div.jftiEf.fontBodyMedium`)

### Missing Scenarios

- **Empty reviews panel** (no reviews at all)
- **Rating-only reviews** (no text body)
- **Anonymous reviewers** (no `aria-label`)
- **Null/missing ratings**
- **Expandable/truncated text** (text with "…More" button)
- **Reviews with very long text**
- **Non-English locale patterns** for dates and labels
- **Missing `data-review-id` on some items**
- **Non-standard DOM structure** (different class names, different nesting)
- **Malformed HTML** (unclosed tags, truncated page)
- **Cookie-consent-overlay HTML** (banner obscuring reviews)
- **Google Maps A/B variant DOM**
- **Error/not-found pages** (page that doesn't contain reviews)
- **CAPTCHA or bot-block pages**
- **Mobile viewport HTML**

### Completeness

The fixtures are **adequate for proving the parser+storage+delta pipeline end-to-end** but are **not comprehensive by any standard**:
- All fixtures are structurally identical (same class names, same element hierarchy, same attribute patterns)
- All fields are populated (no test for partial extraction)
- No fixture exercises edge cases (nulls, missing elements, corrupted data)
- The fixtures are **hand-written** (indicated by the comment "Reviews below are synthetic but realistic"), not captured from live Google Maps

### Realism

The fixtures use realistic Bali cafe review content with authentic-sounding names and mixed English/Indonesian text. However:
- The HTML structure is **idealized** — every review item has the same perfect structure
- Real Google Maps HTML contains additional wrapper divs, inline styles, event handlers, tracking attributes, and dynamic class names that the fixtures do not represent
- The fixtures are **flat** — no iframes, no shadow DOM, no lazy-loaded images, no expandable sections

### Maintenance Status

- All 3 fixtures were created during Task 2-a (2026-07-20)
- No changes recorded since creation
- No mechanism exists to regenerate fixtures from real captures (the `GBP_RAW_HTML_DIR` path is defined but never written to)
- No fixture for the remaining 9 mock competitors (only 3 of 12 have fixtures)

---

## Output Format

### Schema

```python
@dataclass
class Review:
    review_id: str          # Opaque token from data-review-id attribute
    competitor_id: str      # From listings.json config
    branch_id: str          # From listings.json config
    reviewer_name: str | None  # From aria-label (includes ", original" suffix)
    rating: float | None    # 1.0–5.0, parsed from rating aria-label
    text: str | None        # Review body, stripped whitespace
    relative_date: str | None  # Google's localized relative date string
    scraped_at: str         # ISO 8601 UTC, set at parse time
```

### Field Meanings

| Field | Semantics |
|---|---|
| `review_id` | Dedup key. Opaque string from Google's `data-review-id` attribute. **Not a URL or human-readable identifier.** |
| `competitor_id` | Logical grouping key. Matches `listings.json` competitor entries. **Not a globally unique ID** — only unique within this project's config. |
| `branch_id` | Branch affiliation. Matches `listings.json` branch entries. |
| `reviewer_name` | Raw `aria-label` value including Google's `, original` suffix. Dashboard normalizes by stripping the suffix. |
| `rating` | Star rating (1-5 integer scale, stored as float). Null if not parseable. |
| `text` | Full review body text. May include line breaks. Null for rating-only reviews. |
| `relative_date` | Google's localized relative timestamp (e.g., "5 days ago", "2 months ago"). **Not an absolute date** — must be converted downstream. |
| `scraped_at` | When the parser ran (UTC ISO 8601). All reviews from one parse call share this value. |

### Optional Fields

5 of 7 fields are optional (can be `None`). Only `review_id`, `competitor_id`, `branch_id`, and `scraped_at` are always present.

### Stability

- The schema has not changed since creation
- The `review_to_dict()` function provides a stable serialization boundary
- The Python `Review` dataclass and the TypeScript `Review` interface in `src/lib/gbp/types.ts` are structurally identical (both have the same 7 fields with the same types)

### Versioning

- **No schema version field** — the JSON output has no `_schema_version` or `_format` indicator
- **No migration mechanism** — if fields are added or removed, all existing snapshots would need manual migration
- **Backward compatibility relies on the downstream consumer being tolerant** — the dashboard's `server-data.ts` uses `readJsonFile<T>()` which parses whatever fields are present via TypeScript's structural typing

---

## Data Flow

### Parser Output → Downstream

```
parse_reviews() → list[Review]
        │
        ▼
review_to_dict() → list[dict]
        │
        ▼
orchestration/run_all.py:_process_one_listing()
        │
        ├── compute_new_reviews(old, parsed_dicts)   ← delta detection (review_id set diff)
        │     │
        │     ├── [delta non-empty] → append delta to data/reviews_new/*.json
        │     └── [delta empty]     → skip write
        │
        └── save_snapshot(comp_id, parsed_dicts)      ← overwrite full snapshot
              │
              └── data/snapshots/{competitor_id}.json

---- Dashboard (separate process) ----

data/snapshots/{comp_id}.json  ──→  src/lib/gbp/server-data.ts:readAllSnapshots()
                                            │
                                            ▼
                                    src/app/api/*/route.ts  (15 API routes)
                                            │
                                            ▼
                                    src/components/dashboard/*  (React components)
```

### Delta-Consumption Flow

```
parser output → dicts
       │
       ▼
storage/delta.py:compute_new_reviews(old_snapshot_dicts, new_parsed_dicts)
       │
       └── Set comparison on "review_id" keys
       │
       └── Returns only dicts whose review_id NOT in old set
       │
       └── Written to data/reviews_new/{comp_id}_{timestamp}.json
```

---

## Current Maturity

### Component Classification

| Component | Classification | Evidence |
|---|---|---|
| **`schema.py` — Review dataclass** | **Stable** | 7 fields with clear types, `review_to_dict()` serializer, consumed across all layers. No changes needed. |
| **`review_parser.py` — Main parser** | **Beta** | All field extractors present and working. Defensive null handling. Proven against 3 fixture files end-to-end. Missing: confidence scoring, input validation, malformed-HTML detection. |
| **`review_parser.py` — Individual extractors** | **Alpha** | Each `_safe_parse_*` helper is structurally sound but never tested against real Google Maps HTML. The `rating_selector` and `relative_date_selector` may use outdated class names (2023 vintage). |
| **`locator.py` — Self-healing locator** | **Alpha** | Excellent design (5-tier hierarchy, arXiv-backed). But all tier selectors are hardcoded (not from `selectors.json` except tier 5). Only tested against fixtures where tier 5 succeeds. Unknown whether tiers 1–4 actually work on real Google Maps HTML. |
| **`config/selectors.json` — Selectors** | **Prototype** | All selectors 2023 vintage, marked UNPROVEN. The `expand_text_button` selector is defined but never used by the parser (it is used by `capture.py` pre-capture). |
| **`tests/fixtures/` — Test assets** | **Prototype** | 3 hand-written fixtures covering only the happy path. No edge cases, no null data, no malformed HTML. No test runner or test automation. |

### Overall Subsystem Maturity: **Alpha**

The parser can parse the 3 fixture files correctly and the pipeline (parse → delta → store) is PROVEN in `--fixtures` mode. However:

- The parser has never been tested against real captured Google Maps HTML
- The fixture HTML is idealized (all class names match, all fields present, no structural variation)
- No edge cases are tested (null fields, missing elements, non-standard DOM, truncated HTML)
- No automated test exists — the only "test" is running `python -m orchestration.run_all --fixtures` and inspecting the output

---

## Technical Debt

### Critical

| Finding | Evidence | Location |
|---|---|---|
| **No automated tests for any parser behavior** | No test file, no test runner, no `pytest` dependency. The fixtures exist but are only exercised manually via `--fixtures` mode. | Entire parser subsystem |
| **Selector keys use bracket access without fallback for 3 of 4 helpers** | `selectors["rating_selector"]`, `selectors["review_text_selector"]`, `selectors["relative_date_selector"]` raise `KeyError` if missing. Only `reviewer_name` uses `.get()` with a default. | `review_parser.py:178,179,199,220` |
| **Locator tier selectors hardcoded** | Tiers 1–4 are hardcoded as string literals in `_build_tier_list()`. The `seed_review_item_selector` (tier 5) is the only configurable selector. If Google changes how `data-review-id` or `role="article"` are used, all tiers fail simultaneously. | `locator.py:76-86` |

### High

| Finding | Evidence | Location |
|---|---|---|
| **Fixtures only cover happy path** | All 3 fixtures have identical DOM structure: all fields present, all class names match, no nulls, no edge cases, no structural variation. | `tests/fixtures/*.html` |
| **Expand-text button selector defined but not used by parser** | `selectors["expand_text_button"]` is defined for use by `capture.py` but also sent to the parser. The parser ignores it. The selector's name suggests it should be post-capture (parsing expanded text), but it's actually a pre-capture automation step. | `config/selectors.json` |
| **`sel.css(selector)` in locator re-parses from root for every tier** | Each tier call to `sel.css(selector)` re-scans the entire document. For large HTML (real Google Maps pages can be 2+ MB), this is wasteful — earlier-tier context could constrain later tiers. | `locator.py:119` |
| **Locator result `items` returns ALL matched, not just validated ones** | `resolve_review_items` returns `matched` (all elements matching the tier selector) rather than `with_id` (only elements with the `review_id_attr`). The parser re-filters for `review_id` in its own loop, doubling the filter work. | `locator.py:155` |
| **`scraped_at` set at parse time, not capture time** | In live mode, `scraped_at` reflects when `parse_reviews()` was called (post-capture), not when the page was actually captured. For the fixture path, it reflects the read time. | `review_parser.py:76` |

### Medium

| Finding | Evidence | Location |
|---|---|---|
| **Review `items_success_tier` attribute is assigned but never read** | `items_success_tier = locator_result.tier` is assigned on line 107 with `# noqa: F841` (suppressing the unused-variable warning). The value is never used by any caller. | `review_parser.py:107` |
| **`_RATING_PATTERN` cannot match decimal ratings** | Regex `(\d(?:\.\d)?)` supports an optional decimal portion, but Google Maps only uses integer star ratings for the aria-label. The decimal support appears defensive but untested. | `review_parser.py:42` |
| **`text` extraction uses `xpath("string(.)")` on the matched element** | This returns all text inside the element including child elements (e.g., inline `<span>` tags). If Google nests elements inside the review text span, text from non-review elements could leak in. | `review_parser.py:205` |
| **No type coercion on selectors dict values** | The `selectors` dict values are assumed to be strings. If a value were accidentally `None` or `int`, the bracket-access extracts would raise `TypeError` instead of `KeyError`. | `review_parser.py:178,179,199,220` |
| **`from harness.locator import resolve_review_items` creates cross-package dependency** | The parser imports from `harness.locator`, creating a dependency from `parser/` to `harness/`. The locator is semantically a parser concern (CSS selection on parsed HTML) but lives in the harness package. | `review_parser.py:34` |

### Low

| Finding | Evidence | Location |
|---|---|---|
| **Docstring says "We do NOT trim the suffix" but dashboard does** | This is correct behavior, but the comment could confuse future maintainers into thinking the suffix is never handled. | `review_parser.py:19-23` |
| **`_RATING_PATTERN` compiled at import time** | Minor: if the pattern needs locale-specific adjustments, the hardcoded module-level compile prevents configuration. | `review_parser.py:42` |
| **`parsel` import is top-level (not lazy)** | Unlike Playwright imports (which are lazy to support `--fixtures` mode), `parsel` is imported at module top. This is fine because `parsel` is pure Python with no binary dependencies, but inconsistent with the project's lazy-import pattern. | `review_parser.py:32` |
| **`reviewer_name` attribute read uses `selectors.get()` but other helpers use `selectors[]`** | Inconsistent access pattern. `reviewer_name` uses `.get()` with a default; all others use bracket access. | `review_parser.py:163` vs `review_parser.py:178,179,199,220` |

---

## Risks

### Confirmed Risks

| Risk | Evidence |
|---|---|
| **Selectors will not match current Google Maps DOM** | All extraction selectors (`span.wiI7pd`, `span.kvMYJc`, `span.rsqaWe`, `div.jftiEf.fontBodyMedium`) are 2023 vintage. Google has likely renamed these classes. The parser has never been tested against a live capture. |
| **Self-healing locator tiers 1–4 may not match either** | The class-independent tiers rely on `data-review-id`, `role="article"`, and `aria-label`. If Google changes the attribute names or removes them from review items, all 5 tiers fail. Tier 1 (`[data-review-id]`) is the most robust, but `data-review-id` is a Google-implementation detail, not a standard HTML attribute. |
| **Parser returns 0 reviews on unknown HTML without raising** | If fed a completely wrong HTML (error page, CAPTCHA, login wall), the parser returns `[]` silently. This is counted as `success += 1` with `total_reviews += 0` by the orchestrator — not a failure. The `failed >= success` alert would not trigger. |

### Potential Risks

| Risk | Evidence |
|---|---|
| **Relative dates are not convertible to absolute dates** | The parser stores Google's relative date strings verbatim. The dashboard has no relative-to-absolute conversion logic. Over time, "a month ago" becomes ambiguous without a reference point. |
| **`reviewer_name` with `, original` suffix may confuse analytics** | The dashboard strips the suffix, but any direct consumer of snapshot JSON files (e.g., CSV export) would see the raw suffix. |
| **`scraped_at` precision (microseconds) inconsistent with `data-review-id` filenames** | The delta files use `YYYYMMDDTHHMMSSZ` (second precision). The `scraped_at` field includes microseconds. This inconsistency is cosmetic but could cause confusion in time-based analyses. |
| **No maximum text length** | Review text is stored as-is. A single extremely long review (thousands of characters) would be stored in full in the JSON file and served in full by the dashboard API. |
| **No language detection** | The parser stores mixed-language text. The dashboard's "Language Distribution" chart in `review-language-distribution.tsx` uses a client-side script-detection heuristic (detecting Unicode scripts), which may be unreliable for mixed-language reviews. |

### Unknown Risks

| Risk | Notes |
|---|---|
| **Google Maps A/B test impact** | Unknown whether Google serves different DOM variants to different users. The parser could work for one session and fail for another. |
| **Impact of Google Maps UI redesign on `data-review-id`** | Unknown whether `data-review-id` is a stable attribute or subject to change. This attribute is the parser's primary dedup key. |
| **Behavior with non-English Google Maps locale** | The rating regex expects English patterns (`"out of"`, `"/"`). Google localizes the rating label. A non-English locale would cause all `rating` fields to be `None`. |
| **Impact of truncated review HTML in live captures** | The `scroll.py` module may capture an incomplete DOM if the page is still loading. The parser would process whatever HTML it receives. |

---

## Missing Tests

### Parser Behaviors That Are Untested

| Test Scenario | Current Gap |
|---|---|
| **Empty HTML input** | No test for `parse_reviews("", ...)` or `parse_reviews("<html></html>", ...)` |
| **All-tiers-fail HTML** | No test for HTML with no matching review items |
| **Single review item** | No test for minimal input (1 review) |
| **Zero review items** | No test for a valid reviews container with 0 items |
| **Missing `data-review-id` on some items** | No test for skipped-without-id logging |
| **Missing `data-review-id` on ALL items** | No test for 0-reviews return |
| **Null rating (no rating element)** | No fixture for rating-only missing element |
| **Null text (empty text element)** | No fixture for `<span class="wiI7pd"></span>` |
| **Null reviewer name (no aria-label)** | No fixture for `<div data-review-id="x">` without `aria-label` |
| **Very long review text** | No fixture for text > 1000 characters |
| **Non-English rating label** | No fixture for `"Valorado 4 de 5"` or `"5 von 5"` |
| **Unexpected rating label format** | No fixture for `"4.5 stars"` or non-matching patterns |
| **Malformed HTML (unclosed tags)** | No fixture for truncated/corrupt HTML |
| **HTML with cookie consent overlay** | No fixture with cookie banner present |
| **HTML with expanded vs. truncated text** | No fixture testing `...More` button state |
| **Duplicate `review_id` in same HTML** | No test for dedup edge case |
| **Locator tier 1 success** | No fixture where `[data-review-id]` matches but seed selector doesn't |
| **Locator tier 5 success only** | No fixture where only the seed CSS class matches |
| **Locator all-tiers-fail** | No fixture with no matching elements |
| **cross-package import test** | No test that `from harness.locator import resolve_review_items` works |
| **Performance with large HTML** | No benchmark for HTML > 100KB |
| **`review_to_dict()` round-trip** | No test that `review_to_dict()` produces JSON-serializable output |

**There is no test runner, no test configuration, and no test command.** The `tests/` directory exists with fixtures but no actual test files.

---

## Missing Documentation

| Documentation Gap | Details |
|---|---|
| **Parser architecture** | No document explaining the parser design, the self-healing locator, or the extraction rules |
| **Field extraction reference** | No document listing all extracted fields, their source selectors, expected formats, and edge cases |
| **Fixture maintenance guide** | No instructions for creating new fixtures, updating existing ones, or capturing real HTML for fixture regeneration |
| **Selector update procedure** | No guide for how to update `selectors.json` when Google changes its DOM (which selectors to change, how to test, how to PROVE) |
| **Parser error interpretation** | No guide explaining what parser log messages mean (tier numbers, skip counts, field failures) |
| **Adding a new field** | No documented process for adding a new extraction field to the `Review` schema |
| **Locale/i18n considerations** | No documentation of how non-English Google Maps locales would affect the parser |
| **Output schema versioning** | No documented schema versioning strategy for the snapshots and delta files |

---

## Questions

1. **Why is `locator.py` in `harness/` instead of `parser/`?** It is only used by the parser for post-capture CSS selection on a `parsel.Selector` tree. It has nothing to do with Playwright browser automation. This cross-package dependency is architecturally confusing.

2. **Is the `expand_text_button` selector intended for post-capture parsing?** It is defined in `selectors.json` but never used by the parser. If the capture step (`capture.py`) already expands truncated text before `page.content()`, the expand button would not be present in the HTML sent to the parser — making the selector unnecessary for the parser. If expansion fails mid-capture, the parser receives unexpanded HTML but has no way to detect or handle it.

3. **Should the `_safe_parse_*` helpers use `selectors.get()` for consistency?** Three of four helpers use bracket access (`selectors["key"]`) which raises on missing keys. The `reviewer_name` helper uses `.get()`. This inconsistency suggests either a copy-paste oversight or an intentional but undocumented design.

4. **Could `scraped_at` be set by `capture.py` instead of by the parser?** Currently `scraped_at` reflects the parse time, not the capture time. For long captures (many listings), the parse could happen minutes after the actual page load. Should this timestamp reflect when the page was seen, not when it was parsed?

5. **What is the expected concurrency model for the parser?** The parser is synchronous and single-threaded. If the orchestrator is ever parallelized (multiple listings in parallel), each call to `parse_reviews` sets `scraped_at` independently — this is correct but means timestamps would not be strictly ordered within a run.

6. **Why are there only 3 fixtures for 12 competitors?** The remaining 9 mock competitors (uluwatu, nusadua, sanur × 2 each) have no fixture files. Running `--fixtures` mode skips all of them. Is this intentional (only 3 fixtures needed to prove the pipeline)?

7. **Is the `relative_date` field ever converted to an absolute date anywhere?** The dashboard stores it verbatim. The `formatTimestamp()` utility in `src/lib/gbp/format.ts` expects ISO 8601 timestamps, not relative dates. Relative dates like "2 months ago" would break the formatting pipeline — is this a known gap?

8. **Does the parser need to handle the case where Google returns "No reviews" text instead of a review list?** Some Google Maps listings have zero reviews. The HTML would contain a "No reviews" message instead of review items. The locator would return `None`, the parser would return `[]` — this is technically correct (0 reviews parsed) but the orchestrator would count it as `success += 1` rather than a failure.

9. **Why does `_safe_parse_date` extract text via `xpath("string(.)")` instead of `.get()`?** The text and date helpers both use `node.xpath("string(.)").get()` to get inner text. The `review_parser.py:205` comment says "`::text` would be cleaner but `css` already returns the matched element; `.get()` returns its HTML." This is a correct workaround for parsel's API, suggesting the author encountered a limitation worth documenting.

10. **Is the `_RATING_PATTERN` regex robust enough for all Google Maps locales?** The regex matches `N out of 5` and `N/5`. Google Maps localizes this pattern (e.g., Spanish: "4 de 5", French: "4 sur 5", German: "4 von 5"). The regex only handles English patterns. A non-English locale would silently produce `None` for all ratings.

---

## Recommended Next Audit

### Priority: `gbp-monitor/storage/` — Snapshot Storage & Delta Detection Subsystem

**Justification:**

1. **Storage is the direct consumer of parser output** — `compute_new_reviews(old, new)` operates on the parser's dict output. Understanding how snapshots are loaded, deltas are computed, and files are persisted completes the data pipeline from capture → parse → store.

2. **The storage layer has the most complex I/O** — atomic writes, file existence checks, corruption recovery, path resolution. These are high-risk areas that could silently lose data.

3. **Storage is the bridge to the dashboard** — the JSON file formats produced here must exactly match the TypeScript types in `src/lib/gbp/types.ts`. Any schema mismatch would cause silent dashboard failures.

4. **Storage handles data integrity decisions** — how corrupted snapshots are treated (empty vs. error), how concurrent writes are prevented, how file naming affects sort order for the history API.

5. **Storage is the smallest remaining subsystem** (2 small modules: `snapshot_store.py` + `delta.py`, ~150 lines combined) and can be audited quickly. After storage, the `src/lib/gbp/` data layer (dashboard side) would complete the end-to-end data flow audit.
