# Parser Validation Report

**Validator:** Senior QA Engineer (automated)
**Date:** 2026-07-30
**Scope:** parser/ module — HTML to list[Review] (capture and storage excluded)
**Evidence:** Clean fixtures-mode run with data purge before execution

---

## 1. Parser Entry Point

| Property | Value |
|---|---|
| File | parser/review_parser.py |
| Function | parse_reviews(html, competitor_id, branch_id, selectors) — line 23 |
| Signature | def parse_reviews(html: str, competitor_id: str, branch_id: str, selectors: dict) -> list[Review] |
| Call chain | run_all.py:_process_one_listing() line 858 to line 927: parsed = parse_reviews(html, comp_id, branch_id, selectors) |
| Upstream caller | orchestration/run_all.py:927 (inside _process_one_listing()) |
| Called by | Two paths: (a) fixture mode — reads tests/fixtures/{id}.html at line 918; (b) live mode — Playwright capture at line 920 |

---

## 2. Parser Input

| Property | Value |
|---|---|
| Type | str |
| Format | Raw HTML document (the full page.content() output from Playwright, or Path.read_text() of a fixture file) |
| Origin (fixtures mode) | tests/fixtures/{competitor_id}.html read at run_all.py:918 |
| Origin (live mode) | capture_listing_html() to page.content() at harness/capture.py:192 |
| Origin (verify mode) | Same as live mode; evidence also saved to data/verify/{ts}/{comp_id}/page.html at harness/capture.py:213 |
| Size range observed | 4,445 bytes (comp-ubud-01 fixture) to 518,570 bytes (comp-canggu-01 fixture) |

**Exactly where input originates (fixtures mode):**
`
orchestration/run_all.py
  858: def _process_one_listing(*, ..., fixtures_mode, ...)
  897:     if fixtures_mode:
  898:         fixture_path = _FIXTURES_DIR / f"{comp_id}.html"
  899:         if not fixture_path.exists():
  900:             summary["skipped"] += 1
  901:             return
  918:         html = fixtures_path(comp_id).read_text(encoding="utf-8")
  927:         parsed = parse_reviews(html, comp_id, branch_id, selectors)
`

**Exactly where input originates (live mode):**
`
orchestration/run_all.py
  858: def _process_one_listing(*, ..., context, fixtures_mode, ...)
  906:     if not fixtures_mode:
  907:         from discovery.validate_listing import validate_listing
  908:         if not validate_listing(gmaps_url):
  909:             summary["skipped"] += 1
  910:             return
  920:         html = _capture_with_retries(context, gmaps_url, selectors, comp_id, tracker=tracker)
  927:         parsed = parse_reviews(html, comp_id, branch_id, selectors)
`

---

## 3. Parser Output

| Property | Value |
|---|---|
| Type | list[Review] |
| Schema | See parser/schema.py — 8 fields |

**Review schema:**

`python
@dataclass
class Review:
    review_id: str          # From data-review-id HTML attribute — gate for inclusion
    competitor_id: str      # Copied from orchestrator parameter
    branch_id: str          # Copied from orchestrator parameter
    reviewer_name: str|None # From aria-label on item element OR None
    rating: float|None      # Parsed from span.kvMYJc aria-label via regex OR None
    text: str|None          # From span.wiI7pd inner text OR None
    relative_date: str|None # From span.rsqaWe inner text OR None
    scraped_at: str         # ISO 8601 timestamp from datetime.now(timezone.utc)
`

**Fields NOT extracted (parser does not capture):**
- Owner reply / owner response
- Photos attached to reviews
- Language of the review
- Review helpfulness count / thumbs
- Reviewer profile URL
- Reviewer total review count
- Review response time

---

## 4. Verification Against Actual Data

### 4.1 Fresh fixtures-mode run (data purged before execution)

Command: python -m orchestration.run_all --fixtures

### 4.2 Extraction results

| Competitor | HTML Size | Items Matched | Items w/ data-review-id | Unique IDs | Reviews Produced |
|---|---|---|---|---|---|
| comp-seminyak-01 | 409,258 bytes | 0 (all 3 tiers failed) | 0 | 0 | 0 |
| comp-canggu-01 | 518,570 bytes | 33 (tier 1) | 33 | 3 | 3 |
| comp-ubud-01 | 4,445 bytes | 7 (tier 1) | 7 | 7 | 7 |

### 4.3 Per-review field extraction (comp-ubud-01, hand-crafted fixture)

All 7 reviews have all fields populated. No missing reviewer_name, rating, text, or relative_date.

### 4.4 Per-review field extraction (comp-canggu-01, live-captured fixture)

All 3 reviews have all fields populated. Ratings parsed as float. Texts contain multilingual content (Indonesian, Korean, mixed).

---

## 5. Expected vs Actual Counts

### 5.1 Per the CHANGELOG (2026-07-20T08:28:30)

| Competitor | Expected (CHANGELOG) | Actual (2026-07-30) | Delta |
|---|---|---|---|
| comp-seminyak-01 | 7 | 0 | -7 CRITICAL |
| comp-canggu-01 | 6 | 3 | -3 |
| comp-ubud-01 | 7 | 7 | 0 |
| Total | 20 | 10 | -10 |

### 5.2 Per the verify_baseline.py expectations

EXPECTED_TOTAL_REVIEWS = 10 — the baseline script has been lowered to match the current broken state. This is a symptom, not a pass.

**Verdict: Count mismatch is a FIXTURE CORRUPTION issue, not a parser logic issue.**

### 5.3 Root cause of count mismatch

The fixture files comp-seminyak-01.html and comp-canggu-01.html have been overwritten with raw live-captured Google Maps HTML (confirmed by examining the file contents).

- comp-seminyak-01.html (409KB): Contains the initial Google Maps page for Revolver Seminyak — has NO review elements in the static HTML. Reviews are loaded dynamically by JavaScript after scroll. All 3 locator tiers matched 0 elements. **The fixture is broken.**
- comp-canggu-01.html (518KB): Contains live-captured HTML — 33 review elements exist (Google renders some inline for crawler compatibility), but only 3 unique IDs due to scroll limitation during capture. **The fixture is degraded.**
- comp-ubud-01.html (4KB): The ONLY remaining hand-crafted fixture. Produces 7 reviews correctly. **This fixture is intact.**

---

## 6. Parser Failure Modes

| # | Failure Mode | Trigger | Detection | Status |
|---|---|---|---|---|
| F1 | Missing data-review-id on items | Google DOM change removes attribute | Tier 1 fails; falls to tier 2, then tier 3 | Known risk — fallbacks exist |
| F2 | All 3 locator tiers fail | Major Google DOM restructure | resolve_review_items() returns None to parser logs ERROR | OBSERVED (comp-seminyak-01) |
| F3 | CSS class rename on review container | Google changes class names | scroll_review_container() raises SelectorNotFoundError | Known risk (not in parser scope) |
| F4 | Missing rating_selector in config | Misconfigured selectors.json | _safe_parse_rating returns None — silent, no log | Silent failure |
| F5 | Missing review_text_selector in config | Misconfigured selectors.json | _safe_parse_text returns None — silent, no log | Silent failure |
| F6 | Missing relative_date_selector in config | Misconfigured selectors.json | _safe_parse_date returns None — silent, no log | Silent failure |
| F7 | aria-label format changes for rating | Google changes aria-label text | _RATING_PATTERN regex fails to match to returns None | Silent failure |
| F8 | HTML is too short (<1KB) | Capture failed / empty page | _validate_capture_output logs ERROR before parser runs | Handled upstream |
| F9 | Invalid/truncated HTML | Network issue, corrupted fixture | parsel.Selector parses silently — may produce 0 items | Silent failure |
| F10 | All items have duplicate review_id | Capture returned same page twice | Dedup loop produces 0 reviews from N items | Partial — logged as 0 from N but no ERROR |
| F11 | html parameter is empty string | Bug in caller | parsel.Selector(text="") to no exception, 0 items | Silent failure |
| F12 | Encoding mismatch | Fixture read with utf-8 but file is otherwise | read_text() may raise UnicodeDecodeError | Handled by generic except |

---

## 7. Silent Failures

| # | Location | Scenario | What happens | Engineer can detect? |
|---|---|---|---|---|
| S1 | _safe_parse_rating() | rating_selector key missing from config | Returns None — DEBUG log only | No — DEBUG logging off by default (INFO level) |
| S2 | _safe_parse_text() | review_text_selector key missing | Returns None — DEBUG log only | No |
| S3 | _safe_parse_date() | relative_date_selector key missing | Returns None — DEBUG log only | No |
| S4 | _safe_parse_rating() | _RATING_PATTERN fails to match new format | Returns None — DEBUG log only | No |
| S5 | _safe_parse_rating() | CSS matches but node has no aria-label | Returns None — no log | No |
| S6 | parse_reviews() | All tiers fail, returns [] | Logs ERROR | Yes — ERROR level |
| S7 | parse_reviews() | Duplicate review_id skipped | Silent (no log per item) | Partial — count log but not which duplicates |
| S8 | _safe_parse_text() | CSS matches but xpath returns empty string | Returns None — no log | No |
| S9 | resolve_review_items() | sel.css(selector) raises exception | Logs WARNING | Yes — WARNING level |
| S10 | Parser receives empty string as html | Caller bug | Selector(text="") to no items to returns [] | No — INFO only |

**Criticality:** S1-S5 and S7-S10 are single-field omissions. The review IS still counted (it has a valid review_id), but the missing field is silently None. The most dangerous is if rating_selector changes and ALL reviews silently get rating: null.

---

## 8. Diagnostic Adequacy Assessment

### 8.1 Parser logs (what engineer sees on failure)

| Scenario | Log Level | Message | Can engineer diagnose? |
|---|---|---|---|
| All tiers fail | ERROR | all locator tiers failed | Yes |
| Successful parse | INFO | N review(s) parsed from M item(s) via tier Z | Yes |
| Items skipped without ID | INFO | skipped N item(s) without data-review-id | Yes |
| Locator tier succeeded | INFO | tier N succeeded with M item(s) | Yes |
| All locator tiers failed | WARNING | ALL N tiers failed | Yes |
| Rating parse failure | DEBUG | rating parse failed: ... | No |
| Text parse failure | DEBUG | text parse failed: ... | No |
| Date parse failure | DEBUG | date parse failed: ... | No |
| Reviewer name parse failure | DEBUG | reviewer_name parse failed: ... | No |

### 8.2 Gaps

1. **Field-level failures are DEBUG-only.** If rating_selector becomes invalid, the engineer sees no WARNING or ERROR — only DEBUG messages. The review is silently recorded with rating: null.
2. **Empty-string HTML produces no ERROR.** If the caller passes html="", the parser returns [] with a normal INFO log, indistinguishable from a legitimate 0-review page.
3. **Missing selector keys produce no warning.** If rating_selector is removed from config, _first() returns default value "", finds no CSS match, returns None. No log at INFO or higher.

---

## 9. Downstream Trace

| Step | Function | File | Line | What happens |
|---|---|---|---|---|
| Parser output | parse_reviews(html, ...) | review_parser.py | 94 | Returns list[Review] |
| Convert to dicts | review_to_dict(r) for r in parsed | run_all.py | 933 | list[Review] to list[dict] |
| Load old snapshot | load_snapshot(comp_id) | snapshot_store.py | 87 | Reads data/snapshots/{id}/latest.json to JSON file to list[dict] |
| Compute delta | compute_new_reviews(old, parsed_dicts) | delta.py | 23 | Set-diff on review_id to list[dict] |
| Write delta | _append_new_reviews(comp_id, delta, run_id) | run_all.py | 958 | Writes data/reviews_new/{id}_{run_id}.json |
| Write snapshot | save_snapshot(comp_id, parsed_dicts) | snapshot_store.py | 107 | Atomic write to data/snapshots/{id}/{ts}.json |
| Update summary | summary["success"] += 1 | run_all.py | 966 | Increments run summary counters |
| Final summary write | _finish_and_write_summary(summary) | run_all.py | 1183 | Writes data/run_summary.json |
| Live mode only | tracker.get_report(...) | run_all.py | 834 | Writes data/selector_report.json |

**Downstream consumers:**

| Consumer | What it reads | File |
|---|---|---|
| Next.js dashboard (future) | data/run_summary.json, data/snapshots/, data/reviews_new/ | Not implemented |
| verify_baseline.py test | data/snapshots/, data/reviews_new/, data/run_summary.json | tests/verify_baseline.py |
| GitHub Actions commit step | data/snapshots/, data/reviews_new/, data/run.log, data/run_summary.json | schedule/.github/workflows/scrape.yml:91 |
| Docker healthcheck | data/ structure and playability | orchestration/health.py |

---

## 10. PASS/FAIL Table

| # | Component | Status | Evidence |
|---|---|---|---|
| 1 | HTML Input (type and format) | PASS | Parser accepts str, uses parsel.Selector(text=html) at line 29 |
| 2 | Locator — tier 1 ([data-review-id]) | PASS | Works for comp-canggu-01 (33 items) and comp-ubud-01 (7 items) |
| 3 | Locator — tier 2 ([data-review-id][aria-label]) | UNPROVEN | Never exercised — tier 1 always succeeds when data is present |
| 4 | Locator — tier 3 (CSS class fallback) | UNPROVEN | Never exercised — tier 1 always succeeds when data is present |
| 5 | Locator — all-tiers-fail path | PASS | Returns None, parser returns [] with ERROR log (comp-seminyak-01) |
| 6 | Review ID extraction | PASS | Correctly extracts data-review-id from all matched items |
| 7 | Duplicate review_id dedup | PASS | 33 items to 3 reviews (30 duplicates filtered) — seen_ids set |
| 8 | Items missing review_id are skipped | PASS | Code review: line 57-59 — skips with INFO log |
| 9 | Reviewer name extraction | PASS | 10/10 reviews have non-null reviewer_name |
| 10 | Rating extraction | PASS | 10/10 reviews have non-null rating, all float in 1-5 range |
| 11 | Rating regex handles English and Indonesian | PASS | English "Rated 5 out of 5" pattern and Indonesian data both work |
| 12 | Text extraction | PASS | 10/10 reviews have non-null text |
| 13 | Relative date extraction | PASS | 10/10 reviews have non-null relative_date (English and Indonesian) |
| 14 | Empty review handling (truly 0 reviews on page) | UNPROVEN | No test fixture with valid HTML but zero review elements |
| 15 | Fixture corruption detection | FAIL | Parser produces 0 or 3 reviews from corrupted fixtures without detecting corruption |
| 16 | Missing selector key warning | FAIL | Missing rating_selector/review_text_selector produces no ERROR/WARNING |
| 17 | Field-level parse failures at INFO+ level | FAIL | All field-level parse failures logged at DEBUG only |
| 18 | Empty string HTML handling | FAIL | Selector(text="") produces 0 reviews with no ERROR |
| 19 | Snapshot output (downstream) | PASS | save_snapshot writes valid JSON arrays with correct field names |
| 20 | Delta output (downstream) | PASS | compute_new_reviews correctly identifies new vs old reviews |

**Summary:**

| Metric | Count |
|---|---|
| PASS | 13 |
| FAIL | 4 |
| UNPROVEN | 3 |
| TOTAL | 20 |

---

## 11. Key Findings

### Finding 1: Fixture Corruption (CRITICAL)
Two of three fixture files (comp-seminyak-01.html, comp-canggu-01.html) have been overwritten with raw live-captured Google Maps HTML. The comp-seminyak-01.html fixture contains NO review data at all. The verify_baseline.py expected count of 10 (not 20) confirms that the baseline has been adjusted to match broken fixtures instead of fixing them. **This is not a parser bug but makes the fixture-based test suite unreliable.**

### Finding 2: All field-level failures silently degrade to DEBUG (MEDIUM)
If rating_selector, review_text_selector, or relative_date_selector become invalid (Google DOM change), the parser still produces Review objects with None values for those fields. The failure is logged at DEBUG level only — invisible at the default INFO level. The engineer sees "7 review(s) parsed" and has no idea that all 7 ratings are null.

### Finding 3: Missing selector keys produce zero diagnostics (MEDIUM)
If a selector key is deleted from config/selectors.json, _first() returns the default value (either empty string or a hardcoded fallback). The resulting CSS selector matches nothing. No WARNING or ERROR is logged.

### Finding 4: Three-selector tier covers only review-items, not fields (LOW)
The tiered locator (harness/locator.py) only applies to the review-item discovery. The field-level extraction (rating, text, date) uses single selectors with no fallback tiers. A Google DOM change that renames span.wiI7pd (review text) would silently make all texts None.

### Finding 5: Tier 2 and 3 never exercised (LOW)
All successful parses use tier 1 ([data-review-id]). Tiers 2 and 3 are UNPROVEN — the code paths exist but have never been tested against actual data.
