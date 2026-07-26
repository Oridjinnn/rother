# SELECTOR_CHANGELOG — M10 Selector Audit & Certification

## 2026-07-24 — M10 Targeted Improvements

### Removed selectors (obsolete)

| Selector | Reason | Evidence |
|----------|--------|----------|
| `cookie_reject_button` (all 3 tiers) | No cookie banner served in Indonesia for en-US locale | 0 matches across 12 competitors, 0 text occurrences in 517KB HTML |
| `reviews_tab_button` (all 3 tiers) | Reviews are server-side rendered in initial HTML — no tab click needed | 33 `data-review-id` elements found without any interaction |
| `review_container` tier 1 (`div[role='feed']`) | Google removed `role='feed'` from review containers | 0 matches across all page types |
| `expand_text_button` tier 2 (`button:has-text('See more')`) | "See more" text removed from Google Maps review expansion | 0 matches, 0 text occurrences |

### Restructured selectors

| Selector | Before | After |
|----------|--------|-------|
| `review_container` tier 0 | `div.m6QErb.DxyBCb.kA9KIf.dS8AEf` (4 auto-generated classes) | `div.m6QErb[role='region']` (semantic `role='region'`) |
| `review_container` tier 1 | `div[role='feed']` (obsolete) | `div.m6QErb.DxyBCb.kA9KIf.dS8AEf` (demoted from tier 0) |
| `review_container` tier 2 | `div.m6QErb[role='region']` (promoted to tier 0) | *removed* |

### Updated locator tiers (harness/locator.py)

| Tier | Before | After |
|------|--------|-------|
| 1 | `[data-review-id]` | `[data-review-id]` (unchanged) |
| 2 | `[role='article'][aria-label]` | `[data-review-id][aria-label]` (was tier 3) |
| 3 | `[data-review-id][aria-label]` | seed CSS (was tier 5) |
| 4 | `div[role='article'][data-review-id]` | *removed* |
| 5 | seed CSS | *removed* |

### Performance impact

| Metric | Before | After | Δ |
|--------|--------|-------|---|
| Captue time (real page) | ~55s/comp | ~15s/comp | -73% |
| Captue time (search page) | ~55s/comp | ~35s/comp | -36% |
| Full run (12 competitors) | ~11min | ~2min | -82% |
| Obsolete selector waste | 288s | 0s | -100% |

### Configuration version

- `config/selectors.json` schema version: 3 → 4
- Removed 2 top-level keys, removed 1 container tier, removed 1 expand tier
- All backward compatibility preserved — `_fallback_click` gracefully handles missing keys via `resolve_selectors` returning `[]`.
