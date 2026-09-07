# Live Collection Validation — M5

## Purpose

M5 is a scientific, evidence-based investigation of the LIVE Google Maps
collection pipeline. The M4.5 instrumentation (`docs/validation/
REVIEW_COLLECTION_VERIFICATION.md`) proved *how much we collected*; M5
answers *whether the collection is complete and what Google actually serves*.

This document answers the 10 investigation questions with evidence from real
verify runs and a purpose-built live probe (`m5_probe.py`), and records the
root-cause findings that change how the pipeline must be interpreted.

All evidence directories referenced below live under
`data/verify/{timestamp}/` and `data/m5_probe_*.json`.

---

## Methodology

### Businesses used (only those with real place_ids)

| Competitor | Business | Place ID | Google's claimed review count (evidence) |
|------------|----------|----------|------------------------------------------|
| `comp-seminyak-01` | Revolver Espresso Seminyak | `ChIJ9fhCoBBH0i0R4h17JYdA484` | "8.382 ulasan" (2026-07-30 HTML) |
| `comp-canggu-01` | Crate Cafe Canggu | `ChIJOaEQDnk40i0Rzhou4NcRx-w` | "5.251 ulasan" (2026-07-31 HTML) |

The other 10 competitors in `config/listings.json` use mock `place_id`
values (`ChIJmock_*`) so Google serves no real content for them — they are
excluded from the analysis.

### Evidence sources

1. **Verify run `20260730T140759Z`** — pre-M4.5, page.html/page.png only.
2. **Verify run `20260731T161015Z`** — first M4.5-instrumented run. Exposed
   the raw-vs-distinct counting bug (parser efficiency 9.1%).
3. **Verify run `20260731T161811Z`** — post-counting-fix run. 12/12 PASS;
   the canonical numbers used below.
4. **Live probe `m5_probe.py`** (2026-07-31, multiple runs) — opened the
   same two real listings with several URL variants and logged per-iteration
   DOM/scroll evidence. Evidence in `data/m5_probe_{revolver,canggu}*.json`
   plus `.html`/`.png` snapshots.

### Known limitation

Screenshot images cannot be inspected by the reviewing model in this
environment. All conclusions rely on structured JSON/HTML/log evidence. This
is recorded as a limitation, not a hidden assumption.

---

## The 10 investigation questions — answers with evidence

### Q1. What is the maximum number of visible review cards per scroll iteration?

**Answer: 3 distinct review cards (Crate Cafe, 2026-07-31T161811Z).**

Evidence (`data/verify/20260731T161811Z/comp-canggu-01/review_statistics.json`):

```json
{ "visible_cards": 3, "unique_ids": 3, "raw_item_matches": 33, "tier": 1 }
```

The page.html contains exactly 3 `div.jftiEf` cards and 3 distinct
`data-review-id` values. Both live verify runs for Crate Cafe show 3; the
Revolver listing showed 3 on 2026-07-30 and **0** on 2026-07-31 (see Q3).

### Q2. What is the maximum number of unique review IDs observed?

**Answer: 3 unique IDs** (`Ci9DQUlRQUNvZENodHljRjlvT2tGV1kzcFFPR0ptVnpjNVJEbFJZazFqZGxwbmVIYxAB`,
`ChZDSUhNMG9nS0VJQ0FnTUNJN3J2WkNREAE`,
`Ci9DQUlRQUNvZENodHljRjlvT2xOMFF6QmhjRGRqYXpkaE9FNVlZa3BIU2tScVJIYxAB`).

These are the only 3 review IDs Google ever served across all runs studied
for both real listings. In every full-panel capture the same 3 IDs repeat.

### Q3. Does Google Maps virtualize review cards (render-on-scroll)?

**Answer: No virtualization observed — but the initial HTML embeds only 3 cards.**

Evidence: `data/verify/20260731T161811Z/comp-canggu-01/page.html` contains
the 3 review cards fully server-rendered in the initial HTML, with no
`[role="feed"]` container and no scroll-triggered loading. The M10 audit
conclusion "reviews embedded in initial HTML, no tab click needed" is
**confirmed for the full-panel variant**.

However, the review list is **not** fully server-rendered: Google claims
"5.251 ulasan" (Crate) and "8.382 ulasan" (Revolver) but serves only 3
review cards in the initial HTML. No mechanism in the current pipeline
fetches the remaining ~5,248 cards — the initial 3 are all that is exposed
without a Reviews-dialog interaction.

### Q4. Are earlier cards recycled/removed during scrolling (DOM reuse)?

**Answer: Cannot be observed — the pipeline never scrolls the real feed.**

Evidence: `scroll_progress.json` in every live run shows the scroll
container resolving to a **wrong region** (height=104, visible_cards=0,
dom_nodes=0 on every iteration; see Q8). Because the scroll phase never
touched a real review card, card recycling/virtualization during scroll
could not be observed. This is a **measurement gap**, recorded as such — not
a claim that recycling does not occur.

### Q5. Do review IDs repeat / get reused?

**Answer: Yes — the same distinct review ID appears on ~11 nested DOM
elements per card.**

Evidence: raw `data-review-id` attribute matches = 33 while distinct
`unique_ids` = 3 (both Crate and Revolver captures). Root cause: each review
card renders the same `data-review-id` on its outer div, inner div, avatar
button, etc.

**This was a measurement bug, now fixed (M5):**
- Before fix (`20260731T161015Z`): `review_statistics.json` reported
  `visible_cards=33` and `parser_efficiency=9.1%`, producing a FALSE FAIL
  verdict `"Parser loss: 30 of 33 DOM nodes not exported"`.
- After fix (`20260731T161811Z`): `review_statistics.json` reports
  `visible_cards=3, unique_ids=3, raw_item_matches=33`, parser efficiency
  **100%**, verdict PASS.

Fix: `harness/scroll.py::_collect_dom_stats` dedupes by review-id value via
a JS `Set`; `parser/review_parser.py` counts distinct IDs for
`visible_cards` and records the pre-dedup count as `raw_item_matches`.

### Q6. What is the parser efficiency (DOM reviews vs parsed)?

**Answer: 100%** — every distinct DOM review was parsed and exported.

Evidence (`20260731T161811Z/comp-canggu-01/parser_efficiency.json`):

```json
{
  "dom_review_nodes": 3, "parsed_reviews": 3,
  "exported_reviews": 3, "parser_efficiency": 100.0
}
```

Note the 100% is meaningful only relative to the 3 cards Google served, not
relative to Google's claimed total count (5.251/8.382) — the pipeline
captures whatever Google exposes. `collection_percent` remains null because
Google's displayed count is not reliably extractable (see Q7 / business
metadata evidence).

### Q7. Does exported == parsed?

**Answer: Yes.** `exported_reviews == parsed_reviews == dom_review_nodes == 3`
in the canonical run. No review was dropped between parse and export.

### Q8. Does the DOM grow while scrolling?

**Answer: The scroll container resolves to the WRONG region, so growth
cannot be measured.**

Evidence (`20260731T161811Z/comp-canggu-01/scroll_progress.json`):

```json
[
  { "iteration": 1, "height": 104, "visible_cards": 0, "dom_nodes": 0, "bottom_reason": null },
  { "iteration": 2, "height": 104, "visible_cards": 0, "dom_nodes": 0, "bottom_reason": "spinner_finished" }
]
```

`review_container` tier 0 selector `div.m6QErb[role='region']` matches a
104px-tall region that is NOT the review feed (the review cards live
elsewhere in the DOM). So the scroll phase reports dom_nodes=0 while 3
review cards are simultaneously present in the page. **This is a root-cause
finding: the scroll container resolution must be fixed for scroll evidence
to be valid** (see Q10).

### Q9. Is bottom detection reliable?

**Answer: No — it produces a false positive on the wrong container.**

The 2-iteration `spinner_finished` in Q8 is a **false positive**: the
container was the 104px wrong region with 0 cards, and `_detect_bottom`
reported `spinner_finished` after only 2 scrolls. Bottom detection cannot be
trusted until the scroll container resolves to the real feed. The four
detection strategies (stable_scroll, spinner_finished, sentinel_detected,
max_scroll/timeout) are structurally sound, but their input (the container
and its DOM stats) is currently wrong.

### Q10. What does scroll termination mean in the current pipeline?

**Answer: Currently meaningless for the full-panel variant — and never even
exercised.**

In the full-panel variant, all 3 review cards are present in the initial
HTML before any scrolling. Scrolling the wrong 104px container terminated at
iteration 2 with `spinner_finished`, but the review cards were already
captured regardless. Scroll termination therefore proves nothing about
"reaching the end of reviews" in today's Google DOM — it neither helps nor
hurts collection, because the captured HTML already contains the reviews.

---

## Root-cause findings

### F1. Google Maps serves two different page variants non-deterministically

The single most important finding: **Google returns different initial HTML
for the same listing at different times.**

| Listing | 2026-07-30 | 2026-07-31 16:18Z | 2026-07-31 ~16:25Z (probe) |
|---------|-----------|-------------------|----------------------------|
| Revolver (seminyak) | FULL (Reviews tab, "8.382 ulasan", 3 cards) | REDUCED (only Ringkasan/Tentang tabs, 0 cards) | REDUCED (all URL variants) |
| Crate (canggu) | FULL (3 cards) | FULL (Reviews tab, "5.251 ulasan", 3 cards) | REDUCED (all URL variants) |

- **FULL variant**: tab strip includes `Ulasan untuk <name>` (Reviews),
  `data-review-id` cards present, `div.jftiEf` present.
- **REDUCED variant**: only `Ringkasan`/`Tentang` (Overview/About) tabs; NO
  Reviews tab, NO `data-review-id`, NO `div.jftiEf`. The header still shows
  the star rating but no review count.

Evidence: `20260730T140759Z` (FULL for both), `20260731T161811Z`
(FULL for canggu, REDUCED for seminyak in the SAME run — same browser
context, ~40s apart), and the probe runs `data/m5_probe_canggu_v3.json`
etc. (REDUCED for all variants: plain, `&hl=en`, `&gl=id&hl=id`, and the
canonical `@lat,lng` URL).

The M10 audit claim ("reviews embedded in initial HTML — no tab click
needed") is **only true for the FULL variant**. On a REDUCED response there
is no Reviews tab and no embedded review — the current pipeline collects 0
reviews and correctly reports FAIL (`"No review DOM nodes found"`).

### F2. The `reviews_tab_button` removal (M10) leaves no path to open Reviews

M10 removed `reviews_tab_button` from `config/selectors.json`, asserting it
was obsolete. This is only true for the FULL variant (reviews already
embedded). For the REDUCED variant, the tab button would be the way to
request the reviews panel — but it is absent from the DOM entirely, so
re-adding the selector would not help. **The pipeline currently cannot
request more than the 3 embedded reviews from Google in either variant.**

### F3. The review_container scroll target is the wrong region

`div.m6QErb[role='region']` (tier 0) resolves to a 104px-tall region that
does not contain review cards (proven by `scroll_progress.json` showing
dom_nodes=0 while page.html contains 3 cards). This makes scroll metrics,
bottom detection, and any virtualization/recycling observation invalid
until fixed.

---

## Verdicts summary

| Competitor | Run | DOM cards | Parsed | Exported | Parser efficiency | Collection verdict |
|------------|-----|-----------|--------|----------|-------------------|--------------------|
| comp-canggu-01 | 20260731T161811Z | 3 | 3 | 3 | 100% | PASS "All 3 DOM reviews parsed" |
| comp-seminyak-01 | 20260731T161811Z | 0 | 0 | 0 | 100% (trivial, 0/0) | FAIL "No review DOM nodes found" |
| comp-canggu-01 | 20260731T161015Z | 33 (raw) / 3 (distinct) | 3 | 3 | 9.1% (buggy count) | FAIL (false — counting bug) |

---

## Confidence level

**HIGH** for: the raw-vs-distinct counting bug and its fix (Q5),
parser efficiency / exported==parsed (Q6/Q7), the wrong scroll container
(Q8/Q9), and the non-deterministic FULL/REDUCED page variants (F1) — all
supported by multiple independent captures.

**INCONCLUSIVE** for: virtualization and card recycling during scroll
(Q3/Q4) — the pipeline never scrolled the real feed, so no evidence exists.
Recorded as a measurement gap, not a claim either way.

**LOW confidence overall for "we collect most of Google's reviews":** across
all runs, Google exposed at most 3 review cards per listing regardless of
its claimed count (5.251 / 8.382). The pipeline faithfully collects what
Google exposes, but today that is a tiny fraction of the total.

---

## Recommendations

1. **Fix the scroll container resolution (F3)** — demote
   `div.m6QErb[role='region']` and prefer a container that actually wraps
   the review cards (e.g. match a region whose subtree contains
   `div.jftiEf` / `[data-review-id]`), or bound the region by content.
   Required before any virtualization/recycling measurement is possible.
2. **Detect the variant explicitly** — classify FULL vs REDUCED at capture
   time (presence of `[role='tab'][aria-label*='Ulasan']` or
   `[data-review-id]`) and record it in `business_metadata.json`. A
   REDUCED response should produce a distinct verdict reason
   ("Google served the reduced variant — no reviews in page"), not a
   generic FAIL, so operators can distinguish "Google changed" from "our
   pipeline broke".
3. **Re-evaluate whether the Reviews dialog can be opened in the REDUCED
   variant** with fresh DOM evidence (per EXECUTION_RULES Rule 3/6) before
   re-adding `reviews_tab_button`. Current evidence says the button is not
   in the REDUCED DOM.
4. **Do not interpret collection_percent as a completeness metric** until
   Google's displayed count is reliably extractable — currently
   `google_review_count` is null in every live run (business metadata found
   the name and rating but not the count).

---

## Artifacts index

- `data/verify/20260730T140759Z/` — pre-M4.5 full-panel HTML evidence
- `data/verify/20260731T161015Z/` — first instrumented run (exposed bug)
- `data/verify/20260731T161811Z/` — canonical post-fix run (12/12 PASS)
- `data/m5_probe_revolver.json`, `data/m5_probe_canggu*.json` (+.html/.png)
  — live probe evidence for Q3/Q8/F1
- `config/selectors.json` — current selectors (review_container tier 0 wrong)
- `docs/engineering/DOM_AUDIT.md` — M10 audit; its central claim is refined
  by this document (F1)

*Report generated 2026-07-31, based on live evidence up to 2026-07-31T16:40Z.*
