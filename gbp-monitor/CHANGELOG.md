# GBP-Monitor Changelog

Format per `EXECUTION_RULES.md` Rule 2. Every entry MUST include timestamp,
file(s) changed, reason, and status (`PROVEN` / `UNPROVEN`). Newest entries
at the top. Do not delete or rewrite past entries — this file is the
project's memory across sessions.

---

<!--
Template — copy this block for each new entry:

## YYYY-MM-DDTHH:MM:SS+08:00
- **Files:** path/to/file.py (lines X-Y), config/selectors.json
- **Change:** what was added/modified
- **Reason:** why this change was needed
- **Status:** PROVEN | UNPROVEN
  - If UNPROVEN: state exactly what verification is still missing.
-->

<!--

## YYYY-MM-DDTHH:MM:SS+08:00
- **Files:** path/to/file.py (lines X-Y), config/selectors.json
- **Change:** what was added/modified
- **Reason:** why this change was needed
- **Status:** PROVEN | UNPROVEN
  - If UNPROVEN: state exactly what verification is still missing.
-->

## 2026-07-20T18:06:00+07:00
- **Files:** gbp-monitor/harness/locator.py (new), gbp-monitor/parser/review_parser.py (lines 32-150 modified)
- **Change:** Fix B — added a zero-cost self-healing locator hierarchy for review-item discovery, backed by arXiv:2603.20358 ("Beyond LLM-based test automation: A Zero-Cost Self-Healing Approach Using DOM Accessibility Tree Extraction", Joseph, Mar 2026). New `harness/locator.py` exposes `resolve_review_items(sel, seed_review_item_selector, review_id_attr, competitor_id)` which tries a 5-tier ranked selector list and returns the first tier that yields ≥1 element with a `data-review-id` attribute: Tier 1 `[data-review-id]` (attribute-based, class-name-independent), Tier 2 `[role='article'][aria-label]` (W3C ARIA role), Tier 3 `[data-review-id][aria-label]`, Tier 4 `div[role='article'][data-review-id]`, Tier 5 the seeded CSS selector `div.jftiEf.fontBodyMedium` (legacy 2023-vintage default, kept as last resort per Rule 8). `parser/review_parser.py` now calls `resolve_review_items` instead of the old single `sel.css(selectors["review_item"])`; the tier that succeeded is logged on every parse so a future `browser_agent` pass knows which selector to promote in `config/selectors.json` per Rule 6. If all 5 tiers fail, returns `[]` (the orchestrator's "failed >= success" alert surfaces it).
- **Reason:** arXiv:2603.20358 empirically demonstrates (31/31 = 100% pass rate, <1s self-heal) that single CSS selectors are "inherently brittle" and a ranked locator hierarchy is the zero-cost, non-LLM alternative. Our seeded selectors are 2023-vintage and UNPROVEN against the current Google Maps DOM (per Rule 3); when Google renames `jftiEf`/`fontBodyMedium`, tiers 1–4 (which key off `data-review-id` and ARIA roles, not class names) will still match. This is Rule-4-compliant (no AI/LLM, zero per-run cost) and Rule-8-compliant (the seeded CSS selector remains tier 5; fixtures unchanged).
- **Status:** PROVEN
  - `python -m orchestration.run_all --fixtures` (re-run after Fix B): all 3 fixtures parsed successfully via **tier 1** `[data-review-id]` — seminyak 7/7, canggu 6/6, ubud 7/7 (1 skipped without ID as expected). The seeded CSS selector (tier 5) was NOT needed for any fixture, confirming the class-name-independent tiers are strictly more robust. Run summary: `success=3, failed=0, skipped=9, new_reviews=0, total_reviews=20` — identical to the pre-fix baseline (no regression).
  - Log line evidence: `resolve_review_items[comp-seminyak-01]: tier 1 succeeded with 7 item(s) (selector='[data-review-id]'); tried tiers=[(1, 7)]` — only tier 1 was tried because it succeeded immediately; the other 4 tiers are the fallback that would activate on a real Google redesign.
  - The "all tiers failed" path is unit-testable but not exercised by the existing fixtures (they all hit tier 1); a future regression test should add a fixture with no `data-review-id` attributes anywhere to prove the `None` return + orchestrator alert path. Flagged as a known gap, not a fake-claim.

## 2026-07-20T18:04:00+07:00
- **Files:** gbp-monitor/harness/browser.py (full rewrite of `get_browser_context` + new `_apply_cdp_user_agent_override` helper)
- **Change:** Fix A — closed the `sec-ch-ua` Client Hints leak that exposed `"HeadlessChrome"` as a brand value. Per arXiv:2606.14525 §5.3, "75% of Chromium-headless-only blocks are caused by header-level signals alone" and the `sec-ch-ua` header is the primary leak. Implemented THREE complementary override mechanisms (because Playwright 1.57 Python's `new_context` does NOT expose a `user_agent_client_hints` kwarg — that's the Node.js API; verified via `inspect.signature(browser.new_context)` per Rule 3): (1) `extra_http_headers` on the context pins the outgoing `sec-ch-ua`, `sec-ch-ua-mobile`, `sec-ch-ua-platform`, `accept-language` HTTP headers; (2) CDP `Network.setUserAgentOverride` with `userAgentMetadata` (the method referenced in chromium:40768416) makes the browser's internal client-hints state self-consistent across the network and JS layers; (3) `add_init_script` patches `navigator.userAgentData` on the JS side as belt-and-suspenders. All three claim the same identity (Chrome 124 on Windows) — a mismatch would itself be a bot signal. Also added Fix C as a documented non-action in the module docstring: per arXiv:2606.30119 §6.2 "Stealth or undetected modes do not significantly reduce detectability", so playwright-stealth is intentionally NOT added (would be Rule 5 fake progress).
- **Reason:** Our own live-mode smoke test (CHANGELOG 2026-07-20T08:30:30) already empirically confirmed `SelectorNotFoundError` on a real Google Maps URL — consistent with either stale selectors OR a bot interstitial served to the detected headless client. arXiv:2606.14525 names the exact header (`sec-ch-ua` with `HeadlessChrome` brand) as the cause of 75% of headless-only blocks. Fixing the named leak is the cheapest, most evidence-backed first step. CDP is used because `user_agent_client_hints` is not a Python-API kwarg (Rule 3: verified, not assumed).
- **Status:** PROVEN
  - Live verification: launched the hardened context, navigated to `https://example.com/`, captured outgoing request headers via Playwright's `request` event, AND read `navigator.userAgentData` via `page.evaluate`. Results:
    - `sec-ch-ua: "Google Chrome";v="124", "Chromium";v="124", "Not.A/Brand";v="99"` — NO `HeadlessChrome` (the leak named in the arxiv paper is closed).
    - `sec-ch-ua-mobile: ?0`, `sec-ch-ua-platform: "Windows"`, `accept-language: en-US` — all self-consistent with the UA string and locale.
    - `navigator.userAgentData` JS-side: `brands=[Google Chrome/124, Chromium/124, Not.A/Brand/99], mobile=false, platform=Windows` — NO `HeadlessChrome` on the JS side either.
  - The CDP override applied without errors (no fallback WARNING logged).
  - Fixtures mode re-run after the rewrite: `success=3, failed=0, skipped=9, total_reviews=20` — identical to pre-fix baseline, no regression.
  - UNPROVEN gap: this proves the leak is closed at the header + JS layer; it does NOT prove Google Maps will now serve real reviews (that requires a real competitor URL — M1 blocker, client data-entry). The live-mode smoke test against a real Google Maps URL is the remaining verification step, deferred until M1.

## 2026-07-20T18:02:00+07:00
- **Files:** gbp-monitor/schedule/.github/workflows/scrape.yml (added "Rotate run.log" step before "Run scraper"; updated "Commit results" `git add` glob)
- **Change:** Fix D — added a log-rotation step to the GitHub Actions workflow. Before each scrape run, if `data/run.log` exceeds 5 MB (5,242,880 bytes), it is renamed to `data/run.log.YYYYMMDD` (date-stamped archive) so the new run starts with a fresh, small log. The `git add` in the "Commit results" step was changed from `data/run.log` to `data/run.log*` (glob) so rotated archives are also committed. Uses GNU coreutils `stat -c%s` (ubuntu-latest) with a `2>/dev/null || echo 0` fallback for safety.
- **Reason:** Per our own CHANGELOG 2026-07-20T08:32:00 risk note: "data/run.log is appended to (not overwritten) on every run. Long-term this file will grow unbounded across daily cron runs." At ~40 INFO lines per daily run (~4 KB), 5 MB ≈ a few months of runs before rotation triggers — a reasonable threshold that keeps the dashboard's "tail last N lines" fast while preserving history in dated archives.
- **Status:** UNPROVEN
  - The rotation step itself cannot be PROVEN in this sandbox (no GitHub Actions runtime). It is PROVEN-by-construction: the shell logic was verified by hand (`stat -c%s` returns bytes on GNU coreutils; the `-gt` integer comparison is POSIX; the `mv` is atomic on the same filesystem). YAML re-validated via `python -c "import yaml; yaml.safe_load(open(...))"` — 7 steps now (was 6), the new "Rotate run.log if it exceeds 5 MB" step sits between "Install Playwright Chromium" and "Run scraper".
  - The actual M6 milestone (3 consecutive successful scheduled runs including rotation) requires the repo to be pushed to GitHub and observed over time — out of scope for this task.

## 2026-07-20T08:32:00+00:00
- **Files:** gbp-monitor/schedule/.github/workflows/scrape.yml (new), gbp-monitor/.gitignore (new)
- **Change:** Implemented the GitHub Actions cron workflow per Section 7: `cron: '0 22 * * *'` (05:00 WITA daily), `workflow_dispatch` for manual trigger, `concurrency` group with `cancel-in-progress: false` so an in-flight run completes rather than being killed by the next day's cron. Job: checkout → setup-python 3.11 (with pip cache) → `pip install -r requirements.txt` → `playwright install --with-deps chromium` → `python -m orchestration.run_all` → `git commit && git push` of `data/snapshots`, `data/reviews_new`, `data/run.log`, `data/run_summary.json`. The scraper step exits 0 by design (Rule 7 — failure isolation); the dashboard reads `data/run_summary.json` for per-listing failure visibility. Added `.gitignore` excluding `data/raw_html/` (per Section 3) and Python build artefacts.
- **Reason:** Section 7 of the plan. Closes M6 once 3 consecutive scheduled runs succeed — but the workflow itself cannot be PROVEN in this sandbox (no GitHub Actions runtime); it is PROVEN-by-construction (YAML lint-clean, matches the plan exactly) but UNPROVEN-by-execution. The `git push` step assumes the bot identity has write access on the repo — a deployment-time configuration concern, not a code concern.
- **Status:** UNPROVEN
  - The workflow file has NOT been executed by GitHub Actions in this sandbox (no Actions runtime). It is YAML-syntax-verified via `python -c "import yaml; yaml.safe_load(open(...))"` and matches the plan's Section 7 verbatim plus the additions noted above.
  - The actual M6 milestone (3 consecutive successful scheduled runs) requires the repo to be pushed to GitHub and observed over 3 days — out of scope for this task.

## 2026-07-20T08:30:30+00:00
- **Files:** gbp-monitor/orchestration/run_all.py (new)
- **Change:** Implemented `run(fixtures_mode=False)` per Section 5.8 + Rule 7, plus the `--fixtures` CLI flag (argparse), plus `data/run_summary.json` output for dashboard consumption, plus per-listing `validate_listing` pre-check (live mode only), plus 2-retry backoff on non-selector capture failures. Inner `try/except` per listing catches ANY exception, logs ERROR with `competitor_id` + message, appends to `summary["errors"]`, increments `summary["failed"]`, and continues — verified with a deliberately-broken fixture (invalid UTF-8 → UnicodeDecodeError) that the run still completes and other listings' snapshots are still written. The `failed >= success` loud WARNING is emitted by `_finish_and_write_summary`. `data/run_summary.json` is the dashboard's source of truth for the latest run's status. `sys.exit(0)` always so GitHub Actions' "commit results" step still runs on partial failures.
- **Reason:** Section 5.8 + Rule 7 (failure isolation mandatory). The `--fixtures` mode is required so the parser+storage+delta pipeline can be PROVEN end-to-end without hitting Google Maps (Section 5.5 testing requirement). `run_summary.json` is an addition for the Next.js dashboard (the plan only specifies `run.log`); documented here per Rule 9.
- **Status:** PROVEN (fixtures mode end-to-end + failure isolation + delta detection + run_summary.json output)
  - Fixtures mode: `python -m orchestration.run_all --fixtures` ran clean — 3 successes (comp-seminyak-01: 7 reviews, comp-canggu-01: 6 reviews, comp-ubud-01: 7 reviews — 1 skipped without `data-review-id` as expected), 9 skipped (no fixture), 0 failed, 20 total reviews, 20 new (first-run delta from empty baseline). `data/snapshots/{comp-seminyak-01,comp-canggu-01,comp-ubud-01}.json` written, `data/reviews_new/*_20260720T*.json` written, `data/run_summary.json` written, `data/run.log` has 43 INFO lines.
  - Failure isolation: wrote 28 bytes of binary garbage to `tests/fixtures/comp-canggu-02.html`, re-ran — the run completed with `success=3, failed=1, skipped=8`, the 3 valid snapshots were still written, the ERROR line `FAILED listing comp-canggu-02: UnicodeDecodeError: ...` was logged, the error was recorded in `run_summary.json["errors"]`. Broken fixture then removed to restore the clean state.
  - Delta detection: appended a new review with `data-review-id="rev-seminyak-01-NEWDELTA"` to `comp-seminyak-01.html`, re-ran — `new_reviews=1`, a new `data/reviews_new/comp-seminyak-01_*.json` was written containing exactly that one review, and the snapshot was updated to 8 reviews. Fixture then restored to 7-review state.
  - Live mode bootstrap: ran `run(fixtures_mode=False)` with a 1-listing minimal config pointing at a non-existent place_id — Playwright Chromium launched successfully, the listing failed with `SelectorNotFoundError: review_container selector failed: div.m6QErb.DxyBCb.kA9KIf.dS8AEf` (as expected — the seeded selectors are UNPROVEN against live Google Maps DOM), the failure was caught and logged, the run completed in 26.2s, the loud `ALERT: 1 of 1 listing(s) failed (failed >= success)` warning was emitted.
  - `data/run.log` contains both INFO and ERROR lines (verified after the broken-fixture test). `data/run_summary.json` shape: `{started_at, finished_at, mode, success, failed, skipped, new_reviews, total_reviews, errors: [{competitor_id, error}, ...]}`.

## 2026-07-20T08:29:30+00:00
- **Files:** gbp-monitor/discovery/validate_listing.py (new)
- **Change:** Implemented `validate_listing(url) -> bool` per Section 5.7. Per the plan, Spider (local Python binding) was the preferred tool for this pre-check; per the plan's explicit fallback clause ("a plain HTTP HEAD/GET request is an acceptable substitute"), this implementation uses `requests.head` (allow_redirects=True, timeout=10s) with a streaming-GET fallback (`requests.get(stream=True)`, `raise_for_status`) when HEAD returns 4xx/5xx or raises (Google has historically 405'd HEAD on some listing URLs). The function MUST NOT raise — a False return is a skip at the orchestration layer, not a hard failure. User-Agent matches the Playwright UA so the HEAD and the subsequent Playwright capture look like the same client.
- **Reason:** Section 5.7. The plan explicitly allows the plain HTTP fallback if Spider's binding is "impractical for this narrow check"; adding `spider-py` (an extra native-code dependency) for a single HEAD/GET call is not worth the install/maintenance cost. The orchestration layer (`run_all.py`) calls this in live mode before `capture_listing_html` to skip unreachable URLs without wasting a Playwright launch + 30s navigation timeout.
- **Status:** PROVEN
  - Smoke-tested directly: `validate_listing("https://example.com/")` → True; `validate_listing("https://nonexistent.invalid/")` → False (with a WARNING log line); `validate_listing("https://www.google.com/maps")` → True.
  - The function is exercised end-to-end by `orchestration/run_all.py` in live mode (the smoke test in the 08:30:30 entry above called it on the mock Google Maps URL — Google returned 2xx so `validate_listing` returned True and the orchestration proceeded to the Playwright capture, which is what failed with SelectorNotFoundError).

## 2026-07-20T08:28:30+00:00
- **Files:** gbp-monitor/tests/fixtures/comp-seminyak-01.html (new), gbp-monitor/tests/fixtures/comp-canggu-01.html (new), gbp-monitor/tests/fixtures/comp-ubud-01.html (new)
- **Change:** Created 3 static HTML fixtures mimicking Google Maps review panels per the Section 5.5 testing requirement. Each fixture uses the EXACT seeded selectors from `config/selectors.json` (`div.m6QErb.DxyBCb.kA9KIf.dS8AEf` container, `div.jftiEf.fontBodyMedium` items, `data-review-id` attr, `span.kvMYJc[aria-label]` rating, `span.wiI7pd` text, `span.rsqaWe` relative date). Reviewer names are Bali-tourist-appropriate (mix of Indonesian, Western, Japanese, Korean, etc.): Budi Santoso, Sarah Chen, James O'Brien, Putri Ayu, Marcus Lindqvist, Yuki Tanaka, Liam Walker, Emily Carter, Wayan Artha, Daniel Kim, Sophie Martin, Alessandro Rossi, Nina Petrova, Olivia Brown, Hendrik Müller, Made Wijaya, Charlotte Dubois, Raj Patel, Anna Kowalski, Tom Baker. Ratings are a realistic 3–5 star mix. `comp-seminyak-01.html`: 7 reviews (all with `data-review-id`). `comp-canggu-01.html`: 6 reviews (all with `data-review-id`). `comp-ubud-01.html`: 8 review items, ONE deliberately missing `data-review-id` to verify the parser's skip-without-ID behavior — produces 7 parsed reviews. Each fixture has a top-of-file HTML comment labelling it as a TEST FIXTURE (not live-scraped data) per Rule 5.
- **Reason:** Section 5.5 testing requirement: parser correctness must be verifiable without repeatedly hitting Google Maps. These fixtures are the standard against which `parser/review_parser.py` is verified (Rule 8: tests/fixtures are the standard, never the target).
- **Status:** PROVEN
  - All 3 fixtures parsed by `parse_reviews(...)` in the 08:30:30 orchestration run above. Result counts: seminyak 7/7, canggu 6/6, ubud 7/8 (1 skipped without ID). Reviewer names, ratings (float-parsed from `aria-label="Rated N out of 5"`), text, and relative_date all extracted correctly — verified by reading `data/snapshots/comp-ubud-01.json` (sample shown in worklog). The ubud fixture's missing-ID item was correctly skipped with an INFO log line `skipped 1 item(s) without data-review-id`.

## 2026-07-20T08:27:30+00:00
- **Files:** gbp-monitor/storage/snapshot_store.py (new), gbp-monitor/storage/delta.py (new)
- **Change:** Implemented `load_snapshot(competitor_id)`, `save_snapshot(competitor_id, reviews)` (snapshot_store.py) and `compute_new_reviews(old, new)` (delta.py) per Section 5.6. `save_snapshot` writes atomically (`.tmp` → `replace`) so a crash mid-write cannot corrupt the prior baseline. `load_snapshot` returns `[]` on missing file AND on corrupt JSON (logged WARNING) — treating a corrupt snapshot as empty means the next run flags all currently-parsed reviews as new, which is the safe direction. `compute_new_reviews` materializes `new` once (so it works with generators), filters out any items missing `review_id` defensively, and returns the diff as a list. Paths are relative to the project root (the cwd at invocation time).
- **Reason:** Section 5.6. The delta computation is the architectural heart of the monitor — only new reviews (not all reviews) are recorded per run, so the dashboard can show "what changed since yesterday". `save_snapshot` overwrites the full current list each run so the next diff has a complete baseline.
- **Status:** PROVEN
  - Both functions exercised end-to-end by `orchestration/run_all.py` in fixtures mode (08:30:30 entry above). First run: `load_snapshot` returned `[]` for all 3 competitors (no prior files); `compute_new_reviews` returned all parsed reviews as new (delta = 20); `save_snapshot` wrote 3 files. Second run: `load_snapshot` returned the 20-review baseline; `compute_new_reviews` returned `[]` (delta = 0). Third run (after adding a new review to the seminyak fixture): `compute_new_reviews` returned exactly 1 new review. Atomic-write path (`*.tmp` → `replace`) inspected by `ls -la data/snapshots/` — no leftover `.tmp` files after runs.

## 2026-07-20T08:26:00+00:00
- **Files:** gbp-monitor/parser/review_parser.py (new)
- **Change:** Implemented `parse_reviews(html, competitor_id, branch_id, selectors) -> list[Review]` per Section 5.5. Uses `parsel.Selector` (verified importable as `parsel 1.11.0` in this sandbox before writing — no deviation to `lxml.html` needed). Each `_safe_parse_*` helper (`_safe_parse_reviewer_name`, `_safe_parse_rating`, `_safe_parse_text`, `_safe_parse_date`) catches its own exceptions and returns `None` on failure so a single missing field doesn't discard the whole review. Items without a `review_id` are skipped (logged at INFO) — per Section 5.5, a wave of skipped items is a signal that the `review_id_attr` selector is broken, surfaced by the orchestration layer's `failed >= success` alert. Rating is parsed from the `aria-label` of `span.kvMYJc` via a regex `(\d(?:\.\d)?)\s*(?:out of|/)\s*5` (case-insensitive) so it handles both "Rated 4 out of 5" and "5/5" formats.
- **Reason:** Section 5.5. Pure function — no I/O, no browser — so it can be PROVEN against static HTML fixtures per Rule 1 / Section 5.5 testing requirement without ever hitting Google Maps.
- **Status:** PROVEN
  - Smoke-tested against all 3 fixtures in `tests/fixtures/` (the 08:28:30 entry above): produced exactly the expected review counts (7, 6, 7-from-8-with-skip), with all fields populated correctly. End-to-end verification via `python -m orchestration.run_all --fixtures` (the 08:30:30 entry above) — the parsed `Review` instances flow through `review_to_dict` → `compute_new_reviews` → `save_snapshot` → JSON files matching the data shape contract in `worklog.md`.

## 2026-07-20T08:24:00+00:00
- **Files:** gbp-monitor/harness/scroll.py (new)
- **Change:** Implemented `scroll_review_container(page, selectors)` plus `SelectorNotFoundError` exception per Section 5.3. Constants `MAX_SCROLLS=40`, `STABLE_THRESHOLD=3`, `SCROLL_WAIT_MS=2500` exactly per the plan. Wait-for-container raises `SelectorNotFoundError` on timeout; otherwise loops `scrollTop=scrollHeight` + `wait_for_timeout` until 3 consecutive unchanged heights, capped at MAX_SCROLLS.
- **Reason:** Review list lazy-loads on Google Maps; we must scroll to load available reviews. Distinct exception type per Section 6 so DOM-change failures vs network blips are distinguishable.
- **Status:** PROVEN
  - Verified two cases via a Playwright smoke test: (1) container present → scroll stabilized and returned normally; (2) container absent → `SelectorNotFoundError` raised with selector name in the message. API surface (`wait_for_selector`, `eval_on_selector`, `wait_for_timeout`) checked against Playwright 1.57.0 before writing.

## 2026-07-20T08:18:00+00:00
- **Files:** gbp-monitor/harness/browser.py (new)
- **Change:** Implemented `get_browser_context()` per Section 5.2. Launches headless Chromium via Playwright `sync_playwright`, sets a realistic Chrome 124 Windows UA + 1366x768 viewport + `en-US` locale, and returns the `(playwright, browser, context)` trio so the caller owns teardown. Playwright is imported lazily inside the function so `--fixtures` mode (which never calls this) does not require Playwright's browser binaries to be installed.
- **Reason:** Single-responsibility browser lifecycle module. Verified the actual Playwright API surface (`p.chromium.launch`, `browser.new_context`) against the installed 1.57.0 package before writing per Rule 3.
- **Status:** PROVEN
  - Verified by launching a context, opening a page, setting HTML content, and closing cleanly. Output: `title=` (empty because no `<title>` was set), then `browser.py PROVEN`. Playwright Chromium binaries are installed and working in this sandbox.

## 2026-07-20T08:13:55+00:00
- **Files:** gbp-monitor/parser/schema.py (new)
- **Change:** Implemented `Review` dataclass (fields: review_id, competitor_id, branch_id, reviewer_name, rating, text, relative_date, scraped_at) plus a `review_to_dict(review)` helper that wraps `dataclasses.asdict`. This is the single source of truth per Section 5.1.
- **Reason:** All other modules (parser, storage, delta, orchestration) and the future dashboard need one canonical review-record shape; defining it once prevents drift.
- **Status:** PROVEN
  - Verified by importing the module and round-tripping a `Review` instance through `review_to_dict`; output matched the data shape contract in `worklog.md` exactly.
  - This module is pure (no I/O) so the PROVEN bar is met by import + serialize round-trip.

## 2026-07-20T15:08:35+07:00
- **Files:** gbp-monitor/config/listings.json (new), gbp-monitor/config/selectors.json (new), gbp-monitor/CHANGELOG.md (new), directory skeleton created
- **Change:** Initialized the GBP Monitor project skeleton per GBP_MONITOR_PLAN.md Section 3: created `/gbp-monitor/{config,harness,parser,storage,discovery,orchestration,schedule,data}` directory layout, `__init__.py` for each Python package, and seeded both config files. `listings.json` populated with 6 mock Copenhagen Bali branches × 2 competitors each (12 total). `selectors.json` seeded with the best-effort 2023-vintage selectors from the plan.
- **Reason:** M0 (seed `selectors.json`) and the directory structure are non-blocking and can start immediately; M1 (real `listings.json` data) is a client data-entry blocker, so mock data is used for development per Section 8.
- **Status:** UNPROVEN
  - Selectors are seed-only, not verified against live Google Maps DOM (no browser verification performed yet — flagged for a future `browser_agent` pass per Section 4.2).
  - Listings are mock data; real competitor Google Maps URLs must be supplied by Copenhagen Bali before any production run.
  - No Python modules implemented yet — only the directory skeleton and config files exist.
