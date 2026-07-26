# Selector Certification — M10 Phase 4

**Certification ID:** M10-20260724  
**Certified by:** browser_agent (offline DOM audit + Playwright live capture)  
**Date:** 2026-07-24  
**Evidence source:** `data/verify/20260724T121337Z/comp-canggu-01/page.html` (517KB, real place_id)  
**Machine-readable report:** `data/golden/selector_certification.json`

## Certification Summary

| Metric | Value |
|--------|-------|
| Total selectors evaluated | 15 (including tiers and locators) |
| Certified **Stable** | 6 |
| Certified **Semi-stable** | 2 |
| Certified **Fragile** | 2 |
| Certified **Obsolete** | 6 |
| Certified **Unknown** | 0 |
| Overall confidence | 0.77 (77%) |

## Certified Stable (no changes needed)

| Selector | Match rate | Evidence |
|----------|-----------|----------|
| `review_item` (`div.jftiEf.fontBodyMedium`) | 100% (3/3) | DOM: `<div class="jftiEf fontBodyMedium" data-review-id="...">` |
| `review_id_attr` (`data-review-id`) | 100% (33/33) | 33 `data-review-id` elements in 517KB HTML |
| `reviewer_name_attr` (`aria-label`) | 100% (301/301) | 301 `[aria-label]` elements |
| `review_text_selector` (`span.wiI7pd`) | 100% (3/3) | DOM: `<span class="wiI7pd">Vibes na enak banget...</span>` |
| `rating_selector` + `rating_attr` | 100% (3/3) | DOM: `<span class="kvMYJc" aria-label="5 bintang">` |
| `relative_date_selector` (`span.rsqaWe`) | 100% (3/3) | DOM: `<span class="rsqaWe">seminggu lalu</span>` |

## Certified Semi-stable

| Selector | Confidence | Evidence |
|----------|-----------|----------|
| `review_container` tier 2 (`div.m6QErb[role='region']`) | 0.9 | Matches 2 containers, 8ms lookup. Semantic selector + 1 auto-generated class. |
| `expand_text_button` tier 1 (`button:has-text('More')`) | 0.7 | Playwright text matcher. ≈3 text occurrences. Resistant to class changes. |

## Certified Fragile

| Selector | Confidence | Evidence |
|----------|-----------|----------|
| `review_container` tier 0 (4-class variant) | 0.5 | Works on real pages (9ms), fails on search pages (10s). 4 auto-generated classes. |
| `expand_text_button` tier 0 (`button.w8nwRe.kyuRq`) | 0.5 | Works on real page (262ms, 5 buttons). Auto-generated classes. |

## Certified Obsolete (should be removed)

| Selector | Evidence |
|----------|----------|
| `cookie_reject_button` (all 3 tiers) | 0 matches, 0 text occurrences. No cookie banner in Indonesia. |
| `reviews_tab_button` (all 3 tiers) | 0 matches. Reviews are embedded in initial HTML. |
| `review_container` tier 1 (`div[role='feed']`) | 0 matches. Google removed `role='feed'`. |
| `expand_text_button` tier 2 (`button:has-text('See more')`) | 0 matches. "See more" text removed from UI. |
| Locator tier 2 (`[role='article'][aria-label]`) | 0 matches. `role='article'` removed. |
| Locator tier 4 (`div[role='article'][data-review-id]`) | 0 matches. `role='article'` removed. |

## Performance Impact

| Metric | Before | After (projected) | Improvement |
|--------|--------|-------------------|-------------|
| Per-competitor captue time (real page) | ~55s | ~15s | 73% |
| Per-competitor captue time (mock page) | ~55s | ~35s | 36% |
| Full run (12 competitors) | ~11min | ~2min | 82% |
| Obsolete selector waste | 288s (4.8min) | 0s | 100% |

## Verification Evidence

### HTML snippets from live capture:

**review_item with all fields:**
```html
<div class="jftiEf fontBodyMedium" data-review-id="Ci9DQUlRQUNvZENodHljRjlvT2xkSWMyTnlVMFkzYlZaYU1sRmpkSGRKVnpsZk4zYxAB" aria-label="Chelvy Soetanto">
  <span class="kvMYJc" aria-label="5 bintang"></span>
  <span class="wiI7pd">Vibes na enak banget, vintage n unik...</span>
  <span class="rsqaWe">seminggu lalu</span>
</div>
```

**review_container:**
```html
<div class="m6QErb DxyBCb kA9KIf dS8AEf" role="region" ...>
```

**Screenshot:** `data/verify/20260724T121337Z/comp-canggu-01/page.png` (full-page screenshot)

## Recommendations for Phase 5

1. **Remove** `cookie_reject_button` and `reviews_tab_button` from `config/selectors.json`
2. **Restructure** `review_container`: tier 0 = `div.m6QErb[role='region']`, tier 1 = the 4-class variant
3. **Remove** `expand_text_button` tier 2
4. **Remove** locator tiers 2 and 4 from `harness/locator.py`
5. **Preserve** all parser selectors unchanged
6. **Update** `_meta.selector_health` metadata to reflect new certifications
