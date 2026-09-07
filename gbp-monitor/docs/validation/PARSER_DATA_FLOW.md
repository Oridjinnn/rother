# Parser Data Flow

## Scope: All files involved in converting captured HTML → structured Review objects

---

## 1. Complete File Inventory

| # | File | Role |
|---|---|---|
| 1 | `parser/review_parser.py` (152 lines) | Main parser entry point |
| 2 | `parser/schema.py` (34 lines) | Review dataclass definition |
| 3 | `harness/locator.py` (87 lines) | Review-item DOM locator with tiered fallback |
| 4 | `harness/selectors.py` (28 lines) | Selector resolution (string, list[0], or list) |
| 5 | `config/selectors.json` (222 lines) | Selector configuration (CSS + attribute selectors) |
| 6 | `orchestration/run_all.py` (1487 lines) | Orchestrator — calls `parse_reviews` at line 927 |
| 7 | `storage/snapshot_store.py` (192 lines) | Downstream — writes parsed output |
| 8 | `storage/delta.py` (54 lines) | Downstream — computes new-vs-old diff |
| 9 | `tests/fixtures/*.html` (3 files) | Test input (static HTML) |
| 10 | `tests/verify_baseline.py` (347 lines) | End-to-end verification script |

---

## 2. Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  UPSTREAM (already validated — NOT in scope)                                │
│                                                                             │
│  capture_listing_html()                                                      │
│  in harness/capture.py:141                                                  │
│    Playwright navigates to Google Maps URL                                  │
│    Scrolls review container (up to 40 scrolls)                              │
│    Clicks "expand text" buttons                                              │
│    Returns page.content() as HTML string                                     │
└─────────────────────┬───────────────────────────────────────────────────────┘
                      │
                      │  HTML string (str)
                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. PARSER ENTRY POINT                                                      │
│                                                                             │
│  orchestration/run_all.py:927                                               │
│  from parser.review_parser import parse_reviews                             │
│                                                                             │
│  Called as:                                                                 │
│    parsed = parse_reviews(html, comp_id, branch_id, selectors)              │
│                                                                             │
│  Where:                                                                     │
│    html       = str returned by capture_listing_html() or fixture read()    │
│    comp_id    = str from listings.json["competitor_id"]                     │
│    branch_id  = str from listings.json["branch_id"]                         │
│    selectors  = dict from config/selectors.json                             │
└─────────────────────┬───────────────────────────────────────────────────────┘
                      │
                      │  html: str, competitor_id: str, branch_id: str, selectors: dict
                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  2. parsel.Selector(text=html) construction                                 │
│     review_parser.py:29                                                     │
│                                                                             │
│     sel = Selector(text=html)                                               │
│       → parses HTML string into lxml-based selector tree                    │
│       → uses parsel 1.11.0 (imported at line 7)                            │
└─────────────────────┬───────────────────────────────────────────────────────┘
                      │
                      │  sel: parsel.Selector
                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  3. Locator — resolve_review_items()                                        │
│     review_parser.py:35-47                                                  │
│                                                                             │
│     Calls: harness/locator.py:33                                            │
│     resolve_review_items(sel, seed_review_item_selector, review_id_attr,    │
│                          competitor_id)                                     │
│                                                                             │
│     Returns LocatorResult(items, tier, selector, tried) or None             │
└──────────┬──────────────────────────────────────────────────────────────────┘
           │
           │  Returns None → parser returns [] (empty list)
           │  review_parser.py:41-47
           │  Logs ERROR: "all locator tiers failed"
           │
           │  Returns LocatorResult → continues
           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  4. Per-item parsing loop                                                   │
│     review_parser.py:49-94                                                  │
│                                                                             │
│     For each item in locator_result.items:                                  │
│       a) Extract review_id from item.attrib[review_id_attr]                  │
│          Missing → skip (increment skipped_without_id)                      │
│          Duplicate → skip (continue)                                        │
│       b) Build Review dataclass:                                            │
│            Review(                                                          │
│              review_id,          ← from item.attrib                         │
│              competitor_id,      ← passed by orchestrator                   │
│              branch_id,          ← passed by orchestrator                   │
│              reviewer_name,      ← _safe_parse_reviewer_name(item, sel)     │
│              rating,             ← _safe_parse_rating(item, sel)            │
│              text,               ← _safe_parse_text(item, sel)              │
│              relative_date,      ← _safe_parse_date(item, sel)              │
│              scraped_at,         ← datetime.now(timezone.utc)              │
│            )                                                                │
└─────────────────────┬───────────────────────────────────────────────────────┘
                      │
                      │  list[Review]
                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  5. PARSER OUTPUT — list[Review]                                            │
│     review_parser.py:94                                                     │
│                                                                             │
│     Logs: "X review(s) parsed from Y item(s) via tier Z"                   │
│     Returns results list (may be empty)                                     │
└──────────┬──────────────────────────────────────────────────────────────────┘
           │
           │  list[Review] returned to orchestrator
           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  6. Downstream — Orchestrator (run_all.py:928-993)                          │
│                                                                             │
│     parsed = parse_reviews(...)                                              │
│                                                                             │
│     a) Convert to dicts:                                                    │
│          parsed_dicts = [review_to_dict(r) for r in parsed]                 │
│          review_to_dict() in schema.py:26 → dataclasses.asdict()             │
│                                                                             │
│     b) Empty check (line 938-944):                                          │
│          if not parsed_dicts:                                               │
│            check HTML size: <1KB error, <10KB warning, else info           │
│                                                                             │
│     c) Delta computation (line 949-951):                                    │
│          old = load_snapshot(comp_id)                                       │
│            (snapshot_store.py:87 — reads latest.json pointer → JSON file)   │
│          delta = compute_new_reviews(old, parsed_dicts)                     │
│            (delta.py:23 — set-diff on review_id)                            │
│                                                                             │
│     d) Save delta (line 957-960):                                           │
│          if delta:                                                          │
│            _append_new_reviews(comp_id, delta, run_id)                      │
│            → writes data/reviews_new/{comp_id}_{run_id}.json                │
│                                                                             │
│     e) Save snapshot (line 962):                                            │
│          save_snapshot(comp_id, parsed_dicts)                               │
│            (snapshot_store.py:107 — atomic .tmp → replace)                  │
│            → writes data/snapshots/{comp_id}/{timestamp}.json               │
│            → updates data/snapshots/{comp_id}/latest.json                   │
│                                                                             │
│     f) Update summary counters (line 966-967):                              │
│          summary["success"] += 1                                            │
│          summary["total_reviews"] += len(parsed_dicts)                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Detailed File-by-File Breakdown

### File: `parser/review_parser.py`

| Property | Value |
|---|---|
| **Purpose** | Parse Google Maps review HTML into structured Review objects |
| **Entry point** | `parse_reviews(html, competitor_id, branch_id, selectors)` — line 23 |
| **Input** | `html: str` (raw HTML from capture or fixture), `competitor_id: str`, `branch_id: str`, `selectors: dict` |
| **Output** | `list[Review]` (may be empty) |
| **Dependencies** | `parsel.Selector` (line 7), `harness.locator.resolve_review_items` (line 9), `harness.selectors.resolve_selector` (line 10), `parser.schema.Review` (line 11) |
| **Downstream consumers** | `orchestration/run_all.py` lines 927-967, `storage/snapshot_store.py`, `storage/delta.py` |

**Internal functions:**
- `_first(selectors, key, default)` — line 18 — resolves selector key to first candidate string
- `_safe_parse_reviewer_name(item, selectors)` — line 97 — extracts `aria-label` attribute from the review item element
- `_safe_parse_rating(item, selectors)` — line 106 — CSS-selects rating element, reads `aria-label`, regex-extracts numeric rating
- `_safe_parse_text(item, selectors)` — line 125 — CSS-selects text span, extracts inner text via XPath `string(.)`
- `_safe_parse_date(item, selectors)` — line 140 — CSS-selects date span, extracts inner text via XPath `string(.)`

### File: `parser/schema.py`

| Property | Value |
|---|---|
| **Purpose** | Single source of truth for Review record shape |
| **Entry point** | `Review` dataclass (line 14), `review_to_dict(review)` (line 27) |
| **Input** | Constructor args (7 fields), or a Review instance |
| **Output** | Review instance, or dict from `review_to_dict()` |
| **Dependencies** | None external (stdlib: `dataclasses`) |
| **Downstream consumers** | `review_parser.py`, `orchestration/run_all.py` |

**Schema fields:**

| Field | Type | Source | Always present? |
|---|---|---|---|
| `review_id` | str | `item.attrib[review_id_attr]` | Yes (gate for inclusion) |
| `competitor_id` | str | orchestrator parameter | Yes |
| `branch_id` | str | orchestrator parameter | Yes |
| `reviewer_name` | str \| None | `_safe_parse_reviewer_name()` | Can be None |
| `rating` | float \| None | `_safe_parse_rating()` | Can be None |
| `text` | str \| None | `_safe_parse_text()` | Can be None |
| `relative_date` | str \| None | `_safe_parse_date()` | Can be None |
| `scraped_at` | str | `datetime.now(timezone.utc).isoformat()` | Always |

### File: `harness/locator.py`

| Property | Value |
|---|---|
| **Purpose** | Tiered review-item locator — tries 3 CSS selectors in rank order |
| **Entry point** | `resolve_review_items(sel, seed_review_item_selector, review_id_attr, competitor_id)` — line 33 |
| **Input** | `sel: parsel.Selector`, selectors + IDs as strings |
| **Output** | `LocatorResult \| None` |
| **Dependencies** | `harness.selectors.resolve_selector` (line 7) |

**Tier list (from `_build_tier_list` at line 20):**

| Tier | Selector | Purpose |
|---|---|---|
| 1 | `[data-review-id]` | Attribute-based — class-name-independent |
| 2 | `[data-review-id][aria-label]` | Attribute intersection — stricter filter |
| 3 | `{seed_review_item_selector}` | CSS class fallback (default: `div.jftiEf.fontBodyMedium`) |

**Logic:** For each tier, CSS-select. Filter matches to those with a `review_id_attr`. If any remain, return ALL matches (not just filtered) as `LocatorResult`. If all tiers fail, return `None`.

### File: `harness/selectors.py`

| Property | Value |
|---|---|
| **Purpose** | Resolve selector configuration values |
| **Entry point** | `resolve_selector(selectors, key)` — line 4, `resolve_selectors(selectors, key)` — line 13 |
| **Input** | `selectors: dict` (from `config/selectors.json`), key string |
| **Output** | String or list of strings |
| **Dependencies** | None |

**Logic:**
- `resolve_selector`: if value is str, return it. If list, return first element. Else None.
- `resolve_selectors`: if value is str, return `[str]`. If list, return `list[str]` filtered to strings. Else `[]`.

### File: `config/selectors.json`

Contains 9 selector keys. Each key maps to either a string (single selector) or an array (fallback list).

| Key | Type | Current value |
|---|---|---|
| `review_container` | list[2] | `["div.m6QErb[role='region']", "div.m6QErb.DxyBCb.kA9KIf.dS8AEf"]` |
| `review_item` | string | `"div.jftiEf.fontBodyMedium"` |
| `review_id_attr` | string | `"data-review-id"` |
| `reviewer_name_attr` | string | `"aria-label"` |
| `review_text_selector` | string | `"span.wiI7pd"` |
| `rating_selector` | string | `"span.kvMYJc"` |
| `rating_attr` | string | `"aria-label"` |
| `relative_date_selector` | string | `"span.rsqaWe"` |
| `expand_text_button` | list[2] | `["button.w8nwRe.kyuRq", "button:has-text('More')"]` |

### File: `storage/snapshot_store.py`

| Property | Value |
|---|---|
| **Purpose** | Persist and retrieve versioned review snapshots |
| **Entry points** | `load_snapshot(competitor_id)` — line 87, `save_snapshot(competitor_id, reviews)` — line 107 |
| **Input** | competitor_id string, or competitor_id + list[dict] |
| **Output** | list[dict] from load, None from save |
| **Dependencies** | stdlib only (json, pathlib) |

### File: `storage/delta.py`

| Property | Value |
|---|---|
| **Purpose** | Compute diff between old and new review lists |
| **Entry point** | `compute_new_reviews(old, new)` — line 23 |
| **Input** | `old: Iterable[dict]`, `new: Iterable[dict]` |
| **Output** | `list[dict]` — items in new whose review_id is not in old |
| **Dependencies** | stdlib only (logging, typing) |

---

## 4. Data Transformations (Input → Output)

### Input: raw HTML (str)
```
"<!DOCTYPE html><html>...<div class=\"jftiEf fontBodyMedium\" data-review-id=\"...\">..."
```

### After `parsel.Selector(text=html)`:
→ lxml Element tree — queryable via CSS selectors and XPath

### After `resolve_review_items()`:
→ `LocatorResult(tier=1, selector="[data-review-id]", items=[SelectorList of 33 elements], tried=[(1, 33)])`
→ or `None` — all tiers failed

### After per-item parsing loop:
→ `list[Review]` with each Review containing extracted fields

### After `review_to_dict()`:
→ `list[dict]` — JSON-serializable:
```json
[
  {
    "review_id": "Ci9DQUlRQUNvZENodHljRjlvT2xk...",
    "competitor_id": "comp-canggu-01",
    "branch_id": "cph-canggu",
    "reviewer_name": "Chelvy Soetanto",
    "rating": 5.0,
    "text": "Vibes na enak banget...",
    "relative_date": "seminggu lalu",
    "scraped_at": "2026-07-30T12:24:34.117514+00:00"
  }
]
```

---

## 5. Call Chain Summary

```
run_all.py:run() or run_verify()
  → for each competitor:
    → _process_one_listing() [line 858]
      → parse_reviews(html, comp_id, branch_id, selectors) [line 927]
        → Selector(text=html) [line 29]
        → resolve_review_items(sel, seed, attr, comp_id) [line 35]
          → _build_tier_list(seed) [locator.py:20]
          → for each tier: sel.css(selector) [locator.py:44]
            → filter by attrib.get(review_id_attr) [locator.py:57]
        → for each item:
          → _safe_parse_reviewer_name(item, selectors) [line 97]
          → _safe_parse_rating(item, selectors) [line 106]
          → _safe_parse_text(item, selectors) [line 125]
          → _safe_parse_date(item, selectors) [line 140]
          → Review(review_id, ..., scraped_at) [line 65]
      → review_to_dict(r) for r in parsed [line 933]
      → load_snapshot(comp_id) [line 949]
      → compute_new_reviews(old, parsed_dicts) [line 950]
      → _append_new_reviews(comp_id, delta, run_id) [line 958]
      → save_snapshot(comp_id, parsed_dicts) [line 962]
```

## 6. Parser Input Sources

| Source | Context | Path |
|---|---|---|
| Playwright capture (live mode) | `_capture_with_retries()` → `page.content()` | `harness/capture.py:192` |
| Fixture file read (fixtures mode) | `fixtures_path(comp_id).read_text()` | `run_all.py:918` |
| Verify mode evidence | Already-captured `page.html` in `data/verify/{ts}/{comp_id}/` | `harness/capture.py:213` |
