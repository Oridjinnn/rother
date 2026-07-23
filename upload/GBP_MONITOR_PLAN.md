# GBP Competitor Review Monitor — Technical Plan & Coding Instructions

**Client:** Copenhagen Bali (6 cabang)
**Prepared for:** Handoff to AI coding agent (z.ai GLM 5.2)
**Governing rules:** See `EXECUTION_RULES.md` in this same directory — binding
for all work on this project.
**Cost constraint:** Zero recurring cost. No paid APIs. No AI/LLM in this
phase.

---

## 1. Scope & Non-Goals

**In scope (this phase):**
- Automated scraping of competitor Google Business Profile reviews, per
  branch, using free/open-source tools only.
- Delta detection (only new reviews are recorded per run).
- Scheduled execution (daily, via GitHub Actions free tier).
- Structured data output ready for a dashboard to consume later.

**Explicitly NOT in scope (deferred):**
- Dashboard UI (separate phase, not detailed here).
- Any AI/LLM feature — sentiment analysis, summarization, auto-reply
  suggestions. **Do not implement even a basic/free version of this.** It is
  a scope and pricing decision, not a technical one. Deferred until the
  client explicitly requests it.
- Paid proxy/anti-bot services of any kind.
- Support for more than 6 branches without re-scoping.

---

## 2. Architecture Overview

```
discovery (Spider, HTTP-first)
        │
        ▼
harness (Playwright) ── scroll + capture raw HTML
        │
        ▼
parser (Scrapy Selector) ── raw HTML → structured Review records
        │
        ▼
storage (JSON snapshots) ── delta detection vs last run
        │
        ▼
orchestration (run_all.py) ── loops all branches × competitors, error isolation
        │
        ▼
schedule (GitHub Actions cron) ── daily trigger, commits results
```

Each layer has exactly one responsibility. This is intentional: when Google
changes its HTML (which will happen), only `config/selectors.json` and
possibly `parser/review_parser.py` need to change — not the whole pipeline.

---

## 3. Directory Structure (create exactly this layout)

```
/gbp-monitor
  /config
    listings.json
    selectors.json
  /harness
    __init__.py
    browser.py
    scroll.py
    capture.py
  /parser
    __init__.py
    schema.py
    review_parser.py
  /storage
    __init__.py
    snapshot_store.py
    delta.py
  /discovery
    __init__.py
    validate_listing.py
  /orchestration
    __init__.py
    run_all.py
  /schedule
    .github/workflows/scrape.yml
  /data
    raw_html/          # gitignored
    snapshots/
    reviews_new/
  requirements.txt
  README.md
  CHANGELOG.md
```

---

## 4. Config Files

### 4.1 `config/listings.json`

```json
{
  "branches": [
    {
      "branch_id": "REPLACE_ME",
      "branch_name": "REPLACE_ME",
      "competitors": [
        {
          "competitor_id": "REPLACE_ME",
          "name": "REPLACE_ME",
          "gmaps_url": "REPLACE_ME"
        }
      ]
    }
  ]
}
```
This file starts empty/templated. It is populated by the client (Copenhagen
Bali) with real branch and competitor data — this is a data-entry task, not
a coding task, and is a blocker for any real run (mock/sample data can be
used for development and testing before real data arrives).

### 4.2 `config/selectors.json`

Seed this file with best-effort selectors adapted from public reference
implementations (e.g. `gaspa93/googlemaps-scraper`), NOT left as empty
placeholders, per the discussion that led to this plan. Structure:

```json
{
  "last_verified": "REPLACE_WITH_DATE",
  "verified_by": "seed",
  "cookie_reject_button": "//button[contains(., 'Reject all')] | //span[contains(text(), 'Reject all')]",
  "reviews_tab_button": "button[aria-label*='Reviews']",
  "review_container": "div.m6QErb.DxyBCb.kA9KIf.dS8AEf",
  "review_item": "div.jftiEf.fontBodyMedium",
  "review_id_attr": "data-review-id",
  "reviewer_name_attr": "aria-label",
  "review_text_selector": "span.wiI7pd",
  "rating_selector": "span.kvMYJc",
  "rating_attr": "aria-label",
  "relative_date_selector": "span.rsqaWe",
  "expand_text_button": "button.w8nwRe.kyuRq"
}
```

**Agent instruction:** These selector values are a starting seed known to be
potentially outdated (last confirmed working ~2023). Before relying on them
in production:
1. If browser/computer-use tooling is available, navigate to one real Google
   Maps listing, inspect the DOM, and update each field. Set `verified_by`
   to `"browser_agent"` and `last_verified` to the actual date.
2. If browser tooling is not available, leave the seed as-is but ensure the
   error handling in Section 6 surfaces selector failures loudly and
   specifically (which field failed, on which listing) so a human can
   correct `selectors.json` without re-deriving the whole file.
3. Under no circumstances silently swap in a different selector without
   logging the change per `EXECUTION_RULES.md` Rule 6.

---

## 5. Module-by-Module Coding Instructions

### 5.1 `parser/schema.py`

Define a single source of truth for the review record shape, e.g. via
`dataclasses` or `TypedDict`:

```python
from dataclasses import dataclass

@dataclass
class Review:
    review_id: str
    competitor_id: str
    branch_id: str
    reviewer_name: str | None
    rating: float | None
    text: str | None
    relative_date: str | None
    scraped_at: str  # ISO 8601
```
All other modules import this type. Do not redefine review fields ad hoc
elsewhere.

### 5.2 `harness/browser.py`

Responsibility: Playwright browser lifecycle only (launch, context, close).
No scraping logic here.

```python
from playwright.sync_api import sync_playwright

def get_browser_context():
    """
    Launches a headless Chromium browser with a realistic user agent and
    viewport. Returns (playwright_instance, browser, context) so the caller
    is responsible for closing them.
    """
    p = sync_playwright().start()
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        ),
        viewport={"width": 1366, "height": 768},
        locale="en-US",
    )
    return p, browser, context
```

### 5.3 `harness/scroll.py`

Responsibility: scroll the review container until stable, i.e. no new
content loads for 3 consecutive scroll attempts, capped at `MAX_SCROLLS`.

```python
MAX_SCROLLS = 40
STABLE_THRESHOLD = 3
SCROLL_WAIT_MS = 2500

def scroll_review_container(page, selectors: dict) -> None:
    """
    Scrolls the review list container until content height stabilizes or
    MAX_SCROLLS is reached. Raises SelectorNotFoundError if the container
    cannot be located — this must propagate up, not be silently swallowed,
    so the orchestration layer can log which listing/selector failed.
    """
    container_selector = selectors["review_container"]
    try:
        page.wait_for_selector(container_selector, timeout=10000)
    except Exception as e:
        raise SelectorNotFoundError(
            f"review_container selector failed: {container_selector}"
        ) from e

    previous_height = 0
    stable_count = 0
    for _ in range(MAX_SCROLLS):
        page.eval_on_selector(
            container_selector,
            "el => el.scrollTop = el.scrollHeight",
        )
        page.wait_for_timeout(SCROLL_WAIT_MS)
        current_height = page.eval_on_selector(
            container_selector,
            "el => el.scrollHeight",
        )
        if current_height == previous_height:
            stable_count += 1
            if stable_count >= STABLE_THRESHOLD:
                break
        else:
            stable_count = 0
        previous_height = current_height


class SelectorNotFoundError(Exception):
    pass
```

**Note on Rule 3 (`EXECUTION_RULES.md`):** the exact Playwright API surface
(`eval_on_selector`, `wait_for_selector`, timeout units) must be verified
against the installed Playwright version's actual documentation before
this is considered done — do not assume the signature from memory without
checking `playwright --version` and the corresponding API reference.

### 5.4 `harness/capture.py`

Responsibility: orchestrate one listing's full capture — open page, dismiss
cookie banner, scroll, expand truncated text, return raw HTML string. Does
NOT parse the HTML — that is `parser/`'s job.

```python
def capture_listing_html(context, url: str, selectors: dict) -> str:
    """
    Opens `url` in a new page within the given browser context, dismisses
    the cookie consent banner if present, scrolls the review container to
    load available reviews, expands any truncated review text, and returns
    the final page HTML as a string.

    Raises SelectorNotFoundError (propagated from scroll.py) if the review
    container cannot be found — this must NOT be caught here; it must be
    caught at the orchestration layer so per-listing failures are isolated
    and logged (see Section 6).
    """
    page = context.new_page()
    page.goto(url, timeout=30000)
    _dismiss_cookie_banner(page, selectors)
    _click_reviews_tab_if_present(page, selectors)
    scroll_review_container(page, selectors)
    _expand_truncated_reviews(page, selectors)
    html = page.content()
    page.close()
    return html
```

Implement `_dismiss_cookie_banner`, `_click_reviews_tab_if_present`, and
`_expand_truncated_reviews` as small private functions, each wrapped in a
try/except that logs a warning and continues if the element simply isn't
present (these are optional UI states, not hard requirements) — but do NOT
swallow errors from `scroll_review_container` itself.

### 5.5 `parser/review_parser.py`

Responsibility: pure function, HTML string in, `list[Review]` out. No
network calls, no browser, fully testable with a static HTML fixture.

```python
from parsel import Selector
from datetime import datetime, timezone
from .schema import Review

def parse_reviews(
    html: str,
    competitor_id: str,
    branch_id: str,
    selectors: dict,
) -> list[Review]:
    sel = Selector(text=html)
    items = sel.css(selectors["review_item"])
    scraped_at = datetime.now(timezone.utc).isoformat()

    results = []
    for item in items:
        review_id = item.attrib.get(selectors["review_id_attr"])
        if not review_id:
            continue  # cannot deduplicate without an ID — skip, log at caller
        results.append(Review(
            review_id=review_id,
            competitor_id=competitor_id,
            branch_id=branch_id,
            reviewer_name=item.attrib.get(selectors["reviewer_name_attr"]),
            rating=_safe_parse_rating(item, selectors),
            text=_safe_parse_text(item, selectors),
            relative_date=_safe_parse_date(item, selectors),
            scraped_at=scraped_at,
        ))
    return results
```

Each `_safe_parse_*` helper must catch its own exceptions and return `None`
on failure rather than crashing the whole parse — a single missing field
(e.g. rating) should not discard the whole review. Log which field failed
at debug level, but do not treat it as a hard failure per Rule 1 unless
`review_id` itself is unobtainable for the majority of items in a run (that
is a signal the selector itself is broken, and should surface loudly).

**Testing requirement per `EXECUTION_RULES.md` Rule 1:** this function must
be tested against a saved static HTML fixture (a real captured page, saved
once to `tests/fixtures/sample_listing.html`), not just against live scrapes.
This is what allows verifying parser correctness without hitting Google
Maps repeatedly.

### 5.6 `storage/snapshot_store.py` and `storage/delta.py`

```python
# snapshot_store.py
import json
from pathlib import Path

def load_snapshot(competitor_id: str) -> list[dict]:
    path = Path(f"data/snapshots/{competitor_id}.json")
    if not path.exists():
        return []
    return json.loads(path.read_text())

def save_snapshot(competitor_id: str, reviews: list[dict]) -> None:
    path = Path(f"data/snapshots/{competitor_id}.json")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(reviews, indent=2))
```

```python
# delta.py
def compute_new_reviews(old: list[dict], new: list[dict]) -> list[dict]:
    """
    Returns items in `new` whose review_id is not present in `old`.
    Pure function — no I/O — fully unit-testable with plain lists.
    """
    old_ids = {r["review_id"] for r in old}
    return [r for r in new if r["review_id"] not in old_ids]
```

### 5.7 `discovery/validate_listing.py`

Responsibility: cheap pre-check using Spider (local mode, not Spider Cloud)
to confirm a listing URL still resolves before committing to a full
Playwright capture. If Spider's Python binding proves impractical for this
narrow check, a plain HTTP HEAD/GET request is an acceptable substitute —
document the decision in `CHANGELOG.md` either way; do not silently drop
this step.

### 5.8 `orchestration/run_all.py`

Responsibility: the only place that loops over branches/competitors, and
the only place responsible for failure isolation (Rule 7).

```python
import json
import random
import time
import logging
from pathlib import Path

from harness.browser import get_browser_context
from harness.capture import capture_listing_html
from harness.scroll import SelectorNotFoundError
from parser.review_parser import parse_reviews
from storage.snapshot_store import load_snapshot, save_snapshot
from storage.delta import compute_new_reviews

logging.basicConfig(
    filename="data/run.log",
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("gbp-monitor")

def run():
    listings = json.loads(Path("config/listings.json").read_text())
    selectors = json.loads(Path("config/selectors.json").read_text())

    p, browser, context = get_browser_context()
    summary = {"success": 0, "failed": 0, "new_reviews": 0, "errors": []}

    try:
        for branch in listings["branches"]:
            for comp in branch["competitors"]:
                try:
                    html = capture_listing_html(context, comp["gmaps_url"], selectors)
                    parsed = parse_reviews(
                        html, comp["competitor_id"], branch["branch_id"], selectors
                    )
                    old = load_snapshot(comp["competitor_id"])
                    new = compute_new_reviews(old, [r.__dict__ for r in parsed])

                    if new:
                        _append_new_reviews(comp["competitor_id"], new)
                        summary["new_reviews"] += len(new)

                    save_snapshot(comp["competitor_id"], [r.__dict__ for r in parsed])
                    summary["success"] += 1

                except Exception as e:
                    summary["failed"] += 1
                    summary["errors"].append(
                        {"competitor_id": comp["competitor_id"], "error": str(e)}
                    )
                    logger.error(f"Failed on {comp['competitor_id']}: {e}")
                    continue  # isolation: one failure must not stop the run

                time.sleep(random.uniform(5, 10))
    finally:
        context.close()
        browser.close()
        p.stop()

    logger.info(f"Run summary: {json.dumps(summary)}")
    if summary["failed"] > 0 and summary["failed"] >= summary["success"]:
        logger.warning(
            "More than half of listings failed this run — possible selector "
            "breakage. Check config/selectors.json."
        )

if __name__ == "__main__":
    run()
```

The `if summary["failed"] >= summary["success"]` check is the cheap,
zero-cost "alert" mechanism discussed earlier — no external service needed,
just a loud log line that's easy to grep for.

---

## 6. Error Handling Requirements (mandatory, not optional)

- Every per-listing exception is caught at the orchestration layer only —
  inner layers (`harness`, `parser`) should raise, not swallow, so the
  orchestration layer has full information for logging.
- `SelectorNotFoundError` must be a distinct exception type from generic
  timeouts/network errors, so log messages can distinguish "Google changed
  its DOM" from "temporary network blip."
- Retries: at most 2 retries on network/timeout errors, with a short delay
  between attempts. Do not retry `SelectorNotFoundError` — retrying a
  broken selector wastes time and looks like a bot hammering the page.

---

## 7. Scheduling — `schedule/.github/workflows/scrape.yml`

```yaml
name: GBP Review Monitor
on:
  schedule:
    - cron: '0 22 * * *'   # 05:00 WITA daily
  workflow_dispatch: {}
jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -r requirements.txt
      - run: playwright install --with-deps chromium
      - run: python -m orchestration.run_all
      - name: Commit results
        run: |
          git config user.name "gbp-monitor-bot"
          git config user.email "bot@localhost"
          git add data/snapshots data/reviews_new data/run.log
          git commit -m "chore: scraper run $(date -u +%Y-%m-%dT%H:%M:%SZ)" || echo "no changes"
          git push
```

---

## 8. Milestones

| ID | Deliverable | Blocking dependency |
|----|---|---|
| M0 | `selectors.json` seeded + best-effort verified | None — can start immediately |
| M1 | `listings.json` populated with real branch/competitor data | Client (Copenhagen Bali) data entry |
| M2 | `harness/` implemented, capture works on ≥1 sample listing | M0 |
| M3 | `parser/` implemented, tested against saved HTML fixture | M2 |
| M4 | `storage/` implemented, delta detection verified over 2 simulated runs | M3 |
| M5 | `orchestration/run_all.py` implemented, failure isolation verified | M2, M3, M4 |
| M6 | GitHub Actions workflow running, 3 consecutive successful scheduled runs | M5, M1 |
| M7 | Dashboard (separate future phase, not detailed in this document) | M6 |

M1 is the only external blocker — everything else can proceed with
mock/sample data in `config/listings.json` for development purposes.

---

## 9. Explicit Reminders for the Coding Agent

1. Read `EXECUTION_RULES.md` before writing any code. It governs how work is
   verified and logged, not just what to build.
2. Do not add any paid dependency. Do not add any LLM/AI call. These are
   scope violations, not implementation details to improve on your own
   initiative.
3. Every file in Section 5 must be implemented as its own module with a
   single responsibility — do not merge `harness` and `parser` logic into
   one file for convenience.
4. Log every change to `CHANGELOG.md` as you make it, per Rule 2 — not in a
   single batch at the end of a session.
5. If something cannot be verified (e.g. no browser tooling available to
   check selectors against live Google Maps), say so explicitly in the
   changelog as `UNPROVEN` rather than presenting it as done.
