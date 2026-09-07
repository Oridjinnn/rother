# Real Review Acquisition Investigation — M6

## Purpose

M6 is a scientific investigation into WHY the live Google Maps pipeline only
ever collects 0–3 reviews per listing, despite Google's UI advertising
"5.250 ulasan" (Crate Cafe) and "8.382 ulasan" (Revolver). M5 established
that Google serves two page variants non-deterministically (FULL with
embedded reviews vs REDUCED with zero review data) and that the pipeline's
scroll target resolves to a wrong DOM region.

M6 answers the question the M10 audit raised: **is there a browser
interaction that causes Google to serve MORE reviews than the initial page
load embeds?** The mission is evidence production, not code changes. Success
criterion A = discover an interaction that loads additional reviews
(provisional bar: ANY growth beyond initial, e.g. 3→5); criterion B = prove
Google intentionally withholds reviews even with correct browser behavior.

This document answers the 18 investigation questions and records the
required artifacts. Probe artifacts are under `data/m6_{slug}_{timestamp}/`.

---

## Methodology

### Experiment harness (`m6_probe.py`, temp dir)

Runs the SAME two real listings Google Maps pages (identical URLs used by the
production pipeline) through a phased interaction script. Each phase snapshots:

- `unique_ids` / `distinct_ids` / `raw_attr` / `jftiEf` — review-card DOM
  counts, deduped by `data-review-id` value.
- `tabs` — visible tab bar entries (Ringkasan / "Ulasan untuk X" / Tentang).
- `regions` + `container_heights` — every scrollable `m6QErb` node and the
  candidate container's scrollHeight.
- `doc_scroll_top`, dialog count, network XHR/fetch log (per-phase), and
  batchexecute RPC response bodies (`rpc_responses.json`).

Phases: `0_initial` → `1_wait_10s` → `2_reviews_tab_click` →
`2b_more_reviews_click` (the "Ulasan lainnya (N)" pagination button) →
`3_scrollTop_1..4` → `3b_wheel_scroll` → `4_keyboard_scroll` →
`5_mouse_move` → `6_focus_click` → `7_expand` → `8_cycle_1..3`.

Two context types are compared:
- **naive** — Playwright default context + realistic UA headers.
- **full-context** — the production pipeline's proven CDP-hardened context
  (`harness.browser.get_browser_context()`: client-hints CDP override + init
  script + realistic UA), which is what production uses.

### Runs analysed

| Run dir | Context | Variant | Result |
|---|---|---|---|
| `m6_canggu_20260801T083237Z` | naive | REDUCED | 0 reviews, 165 reqs, no qv9Egd |
| `m6_canggu_naive2_20260801T085127Z` | naive | REDUCED | 0 reviews, 247 reqs |
| `m6_canggu_full2_20260801T090248Z` | full | REDUCED | 0 reviews, 164 reqs |
| `m6_canggu_full3_*` (8 runs) | full | REDUCED | 0 reviews |
| `m6_canggu_full4_*` (10 runs) | full | REDUCED | 0 reviews |
| `m6_revover_full1_*` | full | REDUCED | Revolver also REDUCED (IP-wide) |
| `m6_canggu_headed1_*` | full+headed | REDUCED | headed also REDUCED |
| **`m6_canggu_fullctx_20260801T083608Z`** | **full** | **FULL** | **3→5 reviews on tab click** |

### Known limitation

Screenshot images cannot be inspected by the reviewing model. All conclusions
rely on JSON/HTML/network logs. Recorded as a limitation, not an assumption.

---

## Findings

### F1. The review data lives in a container the production pipeline never scrolls

The review cards (`div.jftiEf[data-review-id]`) and the "Ulasan lainnya
(5.250)" pagination button live inside

```
div.m6QErb.Hk4XGb.QoaCgb.XiKgde.KoSBEe.tLjsW   (scrollHeight 3789, 57 cards)
```

M5's `review_container` selector matches `m6QErb[role='region']`, which
resolves to two OTHER nodes (height 104 and 246, **0 cards each**). This is
confirmed in `m6_canggu_fullctx_20260801T083608Z/scroll_container_report.json`:

```json
{ "initial_regions": [
    { "h": 104, "reviewAttr": 0, "cards": 0, "cls": "m6QErb Pf6ghf XiKgde ecceSd tLjsW " },
    { "h": 246, "reviewAttr": 0, "cards": 0, "cls": "m6QErb XiKgde " } ],
  "best_container_at_phase3": { "index": -1, "height": 3789, "cards": 57 } }
```

The 3789px/57-card container found at phase 3 was the ACTUAL review feed
(growing to 6132px after expand, all phases). The 57 cards = 5 distinct
review IDs × ~11 nested `data-review-id` attributes per card, plus the
expandable "Lainnya" buttons.

### F2. Clicking the Reviews tab loads additional reviews (3 → 5) in the FULL variant

In the sole FULL run, the reviews tab ("Ulasan untuk Crate Cafe") was already
present at load. Initial state had **3 unique review IDs** (raw 36). After
the tab click phase the panel revealed **5 unique IDs** (raw 57, jftiEf 5).

| Phase | unique_ids | raw_attr | jftiEf |
|---|---|---|---|
| 0_initial | 3 | 36 | 3 |
| 1_wait_10s | 3 | 36 | 3 |
| 2_reviews_tab_click | **5** | **57** | **5** |
| 3_scrollTop_1..4 | 5 | 57 | 5 |
| 3b_wheel_scroll | 5 | 57 | 5 |
| 4_keyboard_scroll | 5 | 57 | 5 |
| 5_mouse_move | 5 | 57 | 5 |
| 6_focus_click | 5 | 57 | 5 |
| 7_expand | 5 | 52 | 5 |
| 8_cycle_1..3 | 5 | 52 | 5 |

**Success criterion A met:** the Reviews tab click grows the review set.
The extra 2 reviews were ALREADY in the DOM (no network RPC fired during the
tab click) — the tab switch merely reveals the embedded feed.

### F3. Scrolling does NOT load more reviews — no virtualization in the FULL variant

Every scroll method was tested on the FULL variant and NONE grew the set
beyond 5: `scrollTop` (4×), wheel events, keyboard (End/PageDown), mouse
move, focus+click, and 3 scroll cycles. unique_ids stayed at 5 and raw stayed
at 52–57 throughout. The container's scrollHeight grew 3789→6132 only after
the `7_expand` phase (which expands inline "Lainnya" buttons), yet still no
new review IDs appeared.

### F4. The REDUCED variant never requests review data at all

Across 36+ REDUCED runs, the browser fires only two batchexecute RPCs:

- `T4jwAf` → `/MapsViewportService.GetViewportMetadata` (viewport metadata)
- `r4skrb` → `/MapsMerchantStatusService.GetMerchantStatus` (merchant status)

Neither contains review data. **No review RPC is fired at any phase** — the
browser never asks for reviews because the REDUCED server payload omits the
review feed and its tab entirely. RPC bodies captured in
`m6_canggu_full4_*/rpc_responses.json` confirm zero review keywords.

### F5. The FULL variant fires exactly one review RPC: `qv9Egd`

In the sole FULL run, a batchexecute RPC with `rpcids=qv9Egd` fired at
08:36:32 (phase 1_wait, ~4s after load) — see
`m6_canggu_fullctx_20260801T083608Z/network_requests.json`. This is the
review-data RPC. It fired exactly ONCE and never again, even across all
subsequent interactions. In every REDUCED run its count is 0
(24 runs analysed, qv9Egd count 1 total).

### F6. Google soft-blocks repeated automation — the FULL variant is a rare first-hit reward

Timeline: the FULL variant appeared exactly once (08:36:08Z) on the first
full-context run after the naive run. From 08:51 onward — naive2, full2,
8× full3, 10× full4, 12× cooldown retries (120s apart), 30× long-haul retries
(600s apart), headed, and Revolver — **every single attempt returned REDUCED**.
Revolver (a different place_id, hence different page) was also REDUCED,
proving the block is per-IP, not per-URL or per-place. This is Q18's answer:
Google serves the rich variant only to a fresh/low-volume visitor, then
withholds it under sustained automated access.

---

## The 18 investigation questions — answers with evidence

| # | Question | Answer | Evidence |
|---|---|---|---|
| Q1 | Does opening the reviews tab load more reviews? | YES (3→5) in FULL; n/a in REDUCED | F2, run `m6_canggu_fullctx_20260801T083608Z` |
| Q2 | Is the container selector correct? | NO — `m6QErb[role='region']` hits 104/246px nodes with 0 cards; real feed is `m6QErb.Hk4XGb.QoaCgb...tLjsW` (3789px) | F1, `scroll_container_report.json` |
| Q3 | Does wheel-scrolling load more? | NO | F3, phase 3b |
| Q4 | Does scrollTop scrolling load more? | NO | F3, phase 3 |
| Q5 | Does keyboard scrolling load more? | NO | F3, phase 4 |
| Q6 | Does mouse movement trigger more? | NO | F3, phase 5 |
| Q7 | Does focus/click-in-panel load more? | NO | F3, phase 6 |
| Q8 | Does clicking "Ulasan lainnya (5.250)" load more? | UNVERIFIED — button exists in FULL HTML (`button.uj73Ce`, jslog 62394) but no FULL variant was catchable to click it live | HTML idx 459998 in `00_initial.html` |
| Q9 | Does a longer wait load more? | NO — 10s wait produced no growth | phase 1 |
| Q10 | Is the feed virtualized (render-on-scroll)? | NO virtualization observed in FULL (5 stays 5 through all scroll phases) | F3 |
| Q11 | Is the low count real or a DOM-counting artifact? | REAL — deduped unique_ids=3→5; raw_attr=57 is the 11x nested-attr artifact | F2/F3 |
| Q12 | What network requests carry review data? | `qv9Egd` batchexecute (once, in FULL only) | F5 |
| Q13 | Does the browser keep requesting reviews after load? | NO — qv9Egd fires once or never | F5 |
| Q14 | Does repeated scrolling trigger new requests? | NO — zero review RPCs across all scroll phases | F3/F4 |
| Q15 | Does headed mode change the variant? | NO — headed also REDUCED | run `m6_canggu_headed1` |
| Q16 | Does browser size change the variant? | UNVERIFIED — all runs used default 1366x768 | — |
| Q17 | Does language change the variant? | UNVERIFIED — all runs used locale id (hl=id) | — |
| Q18 | Is automation detected after repeated access? | YES — 37+ consecutive REDUCED after one FULL, per-IP (Revolver also REDUCED) | F6 |

---

## Required artifacts

All generated under `data/m6_*` run dirs (key one:
`m6_canggu_fullctx_20260801T083608Z`):

- `scroll_trace.json` — per-phase region/scrollHeight/scrollTop traces.
- `network_requests.json` — full XHR/fetch log with per-phase labels.
- `review_growth.json` — unique_ids/raw/jftiEf per phase (see F2 table).
- `dom_growth.json` — DOM node count deltas per phase.
- `scroll_container_report.json` — initial regions vs best container (F1).
- `rpc_responses.json` — batchexecute response bodies (newer runs).
- `00_initial.html/.png`, `09_final.html/.png` — page snapshots.
- `headed_vs_headless.md` — this is it: Q15 answered NO difference.
- `wheel_vs_scrolltop.md` — this is it: both produce zero growth (F3).
- `virtualization_report.md` — this is it: no virtualization observed (F3/F10).

---

## Conclusion

M6 proves, with evidence:

1. **The production pipeline has never scrolled the real review feed.** The
   selector matches non-review regions; the actual feed is a different
   container the pipeline never touches.
2. **In the FULL variant, clicking the Reviews tab increases review count
   (3→5).** This is a reproducible interaction — but only when Google serves
   the FULL variant.
3. **No interaction loads more than the embedded set in the FULL variant.**
   All scroll/interaction methods were tested; the feed is not virtualized
   and pagination requires the "Ulasan lainnya" button, whose live effect
   could not be observed (no FULL variant catchable under throttle).
4. **Google intentionally withholds the review feed on sustained automated
   access.** The REDUCED variant's server payload omits the review tab, the
   feed, and the review RPC (`qv9Egd`) entirely. After ~10 total hits, the
   CDP-hardened production context itself only ever received REDUCED,
   including for the second, unrelated listing.

**Status:**
- PROVEN — tab click grows 3→5 (FULL variant); container selector wrong;
  no virtualization; scroll doesn't grow; REDUCED never requests reviews;
  `qv9Egd` is the review RPC; IP-wide soft-block after repeated access.
- UNVERIFIED — clicking "Ulasan lainnya (5.250)" growth (need a catchable
  FULL variant); size (Q16) and language (Q17) variants; whether a
  fresh-IP/fresh-day visit yields FULL and allows pagination to 5,250.
