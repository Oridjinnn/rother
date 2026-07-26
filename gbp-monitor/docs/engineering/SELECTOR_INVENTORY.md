# Selector Inventory — M10 Phase 2

**Classification Guide:**
- **Stable:** Consistently matches target elements across page types and over time
- **Semi-stable:** Matches in most cases but has fragility concerns (auto-generated classes)
- **Fragile:** Matches inconsistently, depends on dynamic content
- **Deprecated:** Was functional but is no longer useful for the target dataset
- **Obsolete:** Never matches current DOM; should be removed
- **Unknown:** Insufficient evidence to classify

## Inventory

### 1. cookie_reject_button
| Field | Value |
|-------|-------|
| **Classification** | **Obsolete** (for en-US / Indonesia) |
| **Purpose** | Dismiss EU cookie consent banner |
| **Confidence** | 100% obsolete — 0 matches across 12 competitors, 0 text occurrences |
| **Live evidence** | 36 attempts, 0 found, 0 expected missing (reclassified — these timeouts ARE failures, not expected absences) |
| **Last verified** | 2026-07-23 (M5), 2026-07-24 (M9) |
| **Verification method** | Playwright `wait_for_selector` (4000ms timeout per tier), offline DOM text search |
| **Fallback depth** | 3 tiers, all exhausted on every competitor |
| **Time wasted** | 12s per competitor (36 × 4000ms = 144s across all 12) |

### 2. reviews_tab_button
| Field | Value |
|-------|-------|
| **Classification** | **Obsolete** |
| **Purpose** | Click the "Reviews" tab in Google Maps sidebar |
| **Confidence** | 100% obsolete — reviews are embedded in initial HTML |
| **Live evidence** | 36 attempts, 0 matches, 33 `data-review-id` elements found in raw HTML without any tab click |
| **Last verified** | 2026-07-23, 2026-07-24 |
| **Verification method** | Playwright `wait_for_selector` (4000ms timeout), offline DOM analysis |
| **Fallback depth** | 3 tiers, all exhausted on every competitor |
| **Time wasted** | 12s per competitor (144s across all 12) |

### 3. review_container
| Field | Value |
|-------|-------|
| **Classification** | **Semi-stable** |
| **Purpose** | Identify scrollable review container for lazy-load triggering |
| **Confidence** | 35.3% (overall, degraded by Tier 1) |
| **Live evidence** | Tier 0 matches on real pages (9ms), fails on search/mock pages (10s timeout). Tier 1 never matches. Tier 2 matches reliably (8ms, `role='region'`). |
| **Last verified** | 2026-07-23, 2026-07-24 |
| **Verification method** | Playwright `wait_for_selector` (10000ms timeout per tier) |
| **Fallback depth** | 3 tiers. Tiers 0→1→2. Tier 2 (`div.m6QErb[role='region']`) is the actual working fallback. |
| **Time wasted** | ~10s on pages where Tier 0 fails (mock/search pages). ~20s when Tier 1 also fails. |

#### Tier analysis:
- Tier 0 `div.m6QErb.DxyBCb.kA9KIf.dS8AEf`: **Fragile** — 4 auto-generated classes that change with Google deployments. Works on real place pages (9ms), fails on search pages (10s).
- Tier 1 `div[role='feed']`: **Obsolete** — Google removed `role='feed'` from containers. 0 matches everywhere.
- Tier 2 `div.m6QErb[role='region']`: **Stable** — Uses semantic `role='region'`. Only 1 auto-generated class (`m6QErb`). Matches reliably (8ms) on both page types.

### 4. review_item
| Field | Value |
|-------|-------|
| **Classification** | **Stable** |
| **Purpose** | Seed CSS selector for parsing review card elements |
| **Confidence** | 100% |
| **Live evidence** | 3 matches on real HTML, 1.8ms lookup. 100% match rate for all parser fields. |
| **Last verified** | 2026-07-24 |
| **Verification method** | Offline parsel CSS analysis against cached live capture |
| **Fallback depth** | 1 tier (single selector) |
| **Classes** | `jftiEf`, `fontBodyMedium` — look stable (not auto-generated pattern) |

### 5. review_id_attr
| Field | Value |
|-------|-------|
| **Classification** | **Stable** |
| **Purpose** | HTML attribute holding unique review identifier |
| **Confidence** | 100% |
| **Live evidence** | 33 `[data-review-id]` elements found. 3 unique IDs extracted from review cards. |
| **Last verified** | 2026-07-24 |
| **Verification method** | Offline attribute presence analysis |
| **Attribute** | `data-review-id` |

### 6. reviewer_name_attr
| Field | Value |
|-------|-------|
| **Classification** | **Stable** |
| **Purpose** | HTML attribute holding reviewer display name |
| **Confidence** | 100% |
| **Live evidence** | 301 `[aria-label]` elements. 3 reviewer names successfully parsed (Chelvy Soetanto, hannah ko, Ashfia Pramita Nurfitriani). |
| **Last verified** | 2026-07-24 |
| **Verification method** | Offline attribute presence + sample extraction |

### 7. review_text_selector
| Field | Value |
|-------|-------|
| **Classification** | **Stable** |
| **Purpose** | CSS selector for review text content |
| **Confidence** | 100% |
| **Live evidence** | 3 matches, 0.4ms lookup. Full text extracted from all 3 reviews. |
| **Last verified** | 2026-07-24 |
| **Verification method** | Offline parsel CSS + `xpath('string(.)')` extraction |
| **Selector** | `span.wiI7pd` |

### 8. rating_selector + rating_attr
| Field | Value |
|-------|-------|
| **Classification** | **Stable** |
| **Purpose** | CSS selector + attribute for numeric star rating |
| **Confidence** | 100% |
| **Live evidence** | 3 matches (0.4ms). All ratings parsed correctly: "5 bintang", "1 bintang", "5 bintang". |
| **Last verified** | 2026-07-24 |
| **Verification method** | Offline CSS + attribute extraction |
| **Selector** | `span.kvMYJc` + `aria-label` attribute |

### 9. relative_date_selector
| Field | Value |
|-------|-------|
| **Classification** | **Stable** |
| **Purpose** | CSS selector for relative date text |
| **Confidence** | 100% |
| **Live evidence** | 3 matches (0.4ms). Dates parsed: "seminggu lalu", "sebulan lalu", "2 bulan lalu". |
| **Last verified** | 2026-07-24 |
| **Verification method** | Offline CSS + text extraction |
| **Selector** | `span.rsqaWe` |

### 10. expand_text_button
| Field | Value |
|-------|-------|
| **Classification** | **Semi-stable** |
| **Purpose** | Click "expand" / "see more" buttons on truncated reviews |
| **Confidence** | 2.8% (overall — only 1/36 attempts succeeded) |
| **Live evidence** | Tier 0 matched 5 buttons (262ms) on real page. Tier 1/2 never matched. On mock/search pages, all 3 tiers produced 0 matches (fast failure at ~3ms each). |
| **Last verified** | 2026-07-23, 2026-07-24 |
| **Verification method** | Playwright `query_selector_all` + click |

#### Tier analysis:
- Tier 0 `button.w8nwRe.kyuRq`: **Fragile** — Works on real page (262ms, 5 buttons) but fails on mock pages. Auto-generated classes `w8nwRe`, `kyuRq`.
- Tier 1 `button:has-text('More')`: **Semi-stable** — Text matching is resilient to class changes. "More" appears in other contexts (navigation), could have false positives.
- Tier 2 `button:has-text('See more')`: **Obsolete** — Google Maps removed this text from review expansion. 0 matches everywhere.

### 11. Locator Tiers (resolve_review_items)

| Tier | Classification | Notes |
|------|---------------|-------|
| 1 `[data-review-id]` | **Stable** | 33 matches, primary active tier |
| 2 `[role='article'][aria-label]` | **Obsolete** | `role='article'` removed by Google. 0 matches. |
| 3 `[data-review-id][aria-label]` | **Stable** (unused) | 24 matches, tier 1 wins first |
| 4 `div[role='article'][data-review-id]` | **Obsolete** | `role='article'` removed. 0 matches. |
| 5 seed CSS | **Stable** | 3 matches, correct fallback |

## Summary

| Selector | Classification | Action |
|----------|---------------|--------|
| cookie_reject_button | **Obsolete** | Remove |
| reviews_tab_button | **Obsolete** | Remove |
| review_container tier 0 | **Fragile** | Demote to tier 2 |
| review_container tier 1 | **Obsolete** | Remove |
| review_container tier 2 | **Stable** | Promote to tier 0 |
| review_item | **Stable** | No change |
| review_id_attr | **Stable** | No change |
| reviewer_name_attr | **Stable** | No change |
| review_text_selector | **Stable** | No change |
| rating_selector | **Stable** | No change |
| rating_attr | **Stable** | No change |
| relative_date_selector | **Stable** | No change |
| expand_text_button tier 0 | **Fragile** | Keep (works on real pages) |
| expand_text_button tier 1 | **Semi-stable** | Keep |
| expand_text_button tier 2 | **Obsolete** | Remove |
| Locator tier 2 | **Obsolete** | Remove |
| Locator tier 4 | **Obsolete** | Remove |

**Stable selectors: 6** | **Semi-stable: 2** | **Fragile: 2** | **Obsolete: 6** | **Deprecated: 0**
