# AUDIT-08: Live Acquisition Blockers

## Current State

The scraper has three modes (`--fixtures`, `--verify`, live default). Fixture mode is proven (61/61 tests pass). Verify mode was proven in B1 (12/12 PASS for navigation). Live mode has never been exercised end-to-end — no real place_ids exist in listings.json, and the pipeline gracefully skips all 12 competitors via `validate_listing` returning False on mock URLs.

## Files Audited

| File | Role | Status |
|---|---|---|
| `harness/browser.py` | Playwright lifecycle + anti-bot hardening | Missing dialog handler, crash handler |
| `harness/capture.py` | Navigate → cookie → reviews → scroll → expand → HTML | Missing crash detection, total timeout |
| `harness/scroll.py` | Scroll review container until stable | Working; fallback selectors added |
| `harness/locator.py` | 5-tier self-healing review-item locator | Working; uses resolve_selector |
| `harness/selector_tracker.py` | Per-selector outcome recording | Updated with confidence scoring |
| `harness/selectors.py` | Selector resolution (str/list[str]) | Created, working |
| `orchestration/run_all.py` | Main loop: config → capture → parse → delta → save | Pre-flight checks, progress, structured logging added; no total-capture timeout enforcement |
| `parser/review_parser.py` | Pure HTML → list[Review] | Updated for resolve_selector |
| `config/listings.json` | 12 competitors | All place_id null — no real URLs |
| `config/selectors.json` | 11 selectors with fallbacks | Schema v2, 4 multi-fallback keys |
| `discovery/validate_listing.py` | HTTP HEAD/GET pre-check | Working; returns False on mock URLs |

## Identified Blockers

### Blocker 1: No real place_ids configured (HIGH)
All 12 competitors have `place_id: null`. `_resolve_url()` falls back to mock `gmaps_url` (`place_id:ChIJmock_*`). `validate_listing()` returns False → every listing is skipped in live mode. The run produces `success=0, skipped=12, failed=0` with no errors. A warning is logged ("ALL competitors use mock URLs") but no action is taken.

**Fix**: Add at least one real place_id for testing. The B1 verification used `ChIJ9fhCoBBH0i0R4h17JYdA484`.

### Blocker 2: No unexpected dialog handling (MEDIUM)
Google Maps can show unexpected dialogs: location permission, "Stay updated" prompts, review feedback, cookie consent variants. The context has no `on("dialog")` handler. A blocking dialog prevents all further interactions (selector lookups time out, clicks fail).

**Fix**: Add `context.on("dialog", lambda d: d.accept())` in `get_browser_context()`. Add a more targeted `page.on("dialog")` for dialogs that need specific dismissal (e.g., "Stay updated" → accept).

### Blocker 3: No page crash detection (MEDIUM)
If the Playwright page crashes (OOM, tab crash, renderer crash), Playwright raises a generic `Error: page crashed`. This is caught as a generic Exception in `_capture_with_retries`, retried (which will fail again immediately), and eventually logged as a generic failure. The operator cannot distinguish "page crashed" from "selector not found" without reading the full error message.

**Fix**: Add `page.on("crash", handler)` that raises a `PageCrashError` subclass — caught distinctly, logged as PAGE_CRASH, not retried (crash will recur immediately).

### Blocker 4: No total-capture timeout enforcement (LOW)
`_CAPTURE_TOTAL_TIMEOUT_S = 90` is defined but never enforced. Each step has its own timeout (goto=30s, optional clicks=4s each, scroll=up to 100s, expand=4s). Worst case: ~142s. A hung page could block the pipeline for >2 minutes per competitor.

**Fix**: Use a `threading.Timer` or `concurrent.futures` wrapper to enforce the total timeout. On timeout, close the page and raise.

### Blocker 5: Navigation failure not classified (LOW)
`page.goto(url, timeout=30000)` can fail for DNS, TLS, timeout, HTTP error, or navigation interruption. All are caught and retried identically. No specific error message for each type.

**Fix**: Wrap `page.goto()` in a try/except that classifies the error: `NS_ERROR_UNKNOWN_HOST` → DNS, `net::ERR_TIMED_OUT` → timeout, etc.

### Blocker 6: SelectorTracker not integrated into production (MEDIUM)
`SelectorTracker` is only instantiated in `run_verify()`. Production live mode passes `tracker=None` and never records selector outcomes. Operator has no visibility into selector health during production runs.

**Fix**: Instantiate `SelectorTracker` in production `run()` too. Attach selector health to the run summary. Store as `data/selector_report.json` after each run.

### Blocker 7: Empty capture not distinguished from 0 reviews (LOW)
If `page.content()` returns HTML with no review items, the pipeline reports `total_reviews=0`. No warning about empty capture. The operator can't tell if the page genuinely has no reviews or the capture failed silently.

**Fix**: After parsing, if parsed reviews == 0 but the HTML is nontrivial (>10KB), log a WARNING with a snippet of the HTML structure. If HTML is trivial (<1KB), log ERROR — likely a failed capture.

## Summary

7 blockers identified. 3 HIGH (block live mode entirely), 2 MEDIUM (reduce diagnostic value), 2 LOW (edge cases). Fix order: place_ids → dialog handling → crash detection → selector health → timeout enforcement → empty capture → navigation classification.
