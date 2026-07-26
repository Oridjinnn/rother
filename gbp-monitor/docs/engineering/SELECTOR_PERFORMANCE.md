# Selector Performance — M10 Phase 3

**Source:** `data/selector_report.json` (2026-07-23 M5 live verification) + DOM audit (2026-07-24 M9 live capture)  
**Metrics scope:** 12 competitors × 3–4 pipeline selectors per competitor = 100+ individual lookups

## Per-Selector Performance

### cookie_reject_button

| Metric | Value |
|--------|-------|
| Attempts (total) | 36 |
| Successes | 0 |
| Failures | 36 (expected_missing=36) |
| Hit rate | 0% |
| Avg lookup time | 4010ms |
| Avg per-tier time | ~4000ms (all 3 tiers timeout) |
| Fallback depth used | 3 (all exhausted) |
| Unnecessary waits | 12s × 12 competitors = 144s |

### reviews_tab_button

| Metric | Value |
|--------|-------|
| Attempts (total) | 36 |
| Successes | 0 |
| Failures | 36 (expected_missing=36) |
| Hit rate | 0% |
| Avg lookup time | 4012ms |
| Avg per-tier time | ~4000ms |
| Fallback depth used | 3 (all exhausted) |
| Unnecessary waits | 12s × 12 competitors = 144s |

### review_container

| Metric | Value |
|--------|-------|
| Attempts (total) | 34 |
| Successes | 12 (real pages) |
| Failures | 22 (mock/search pages, timeout) |
| Hit rate | 35.3% |
| Avg lookup time | 6482ms |
| Avg per-tier time | Tier 0: 9ms (success) / 10012ms (timeout), Tier 1: ~10010ms (always timeout), Tier 2: 9ms (always success) |
| Fallback depth used | 2–3 (Tier 0→Tier 2 on mock pages; Tier 0 succeeds immediately on real pages) |

**Breakdown by page type:**
- **Real place page (comp-canggu-01):** Tier 0 succeeds in 9ms. Total container time: 9ms.
- **Mock/search pages (11 competitors):** Tier 0 times out (10s), Tier 1 times out (10s), Tier 2 succeeds (8ms). Total container time: ~20s.

### expand_text_button

| Metric | Value |
|--------|-------|
| Attempts (total) | 36 |
| Successes | 1 (comp-canggu-01, tier 0) |
| Failures | 35 (95% no-match) |
| Hit rate | 2.8% |
| Avg lookup time | 10.4ms (fast failure) |
| Fallback depth used | 1 (tier 0 matches on real page; tiers 1+2 never matched) |

**Note:** Expand buttons only exist on real place pages where reviews have truncated text. On mock/search pages, there are no review items to expand.

### Parser Selectors

| Selector | Matches | Lookup time | Hit rate |
|----------|---------|-------------|----------|
| `review_item` (`div.jftiEf.fontBodyMedium`) | 3 | 1.8ms | 100% |
| `review_text_selector` (`span.wiI7pd`) | 3 | 0.4ms | 100% |
| `rating_selector` (`span.kvMYJc`) | 3 | 0.4ms | 100% |
| `relative_date_selector` (`span.rsqaWe`) | 3 | 0.4ms | 100% |

Parser selectors are offline (parsel, not Playwright) — no timeout penalty. All sub-2ms.

## Waste Analysis

| Selector | Total wasted time (12 competitors) | Cause |
|----------|-----------------------------------|-------|
| `cookie_reject_button` | 144s (2.4min) | Cookie banner does not exist |
| `reviews_tab_button` | 144s (2.4min) | Reviews are in initial HTML |
| `review_container` top 2 tiers | ~220s (3.7min) on mock pages | Tiers 0+1 always timeout |
| **Total waste** | **~508s (8.5min)** | |
| - On real page per competitor | ~24s (cookie 12s + reviews_tab 12s) | |
| - On mock page per competitor | ~44s (cookie 12s + reviews_tab 12s + container 20s) | |

## After-Optimization Projection

| Selector | Improved time | Savings |
|----------|--------------|---------|
| `cookie_reject_button` | 0s (removed) | 144s |
| `reviews_tab_button` | 0s (removed) | 144s |
| `review_container` | 8ms (tier 2 only) | ~220s |
| `expand_text_button` | unchanged | — |
| **Projected total** | **~10s per competitor → ~2min for full run** | **~8min saved** |

## Recommendations

1. **REMOVE** `cookie_reject_button` and `reviews_tab_button` entirely — they serve no purpose and waste 24s per competitor.
2. **REORDER** `review_container`: promote `div.m6QErb[role='region']` to tier 0 (8ms, 100% match). Remove `div[role='feed']` (dead). Demote `div.m6QErb.DxyBCb...` to tier 1 (works on real pages).
3. **KEEP** all parser selectors — they are sub-2ms and 100% accurate.
4. **KEEP** `expand_text_button` tiers 0+1 — they work on real pages and fail fast (~3ms) on pages without expandable reviews.
5. **REMOVE** obsolete locator tiers 2 and 4 (`role='article'` variants).
