# M6 Browser Investigation Toolkit — Evidence Log

## What this is

`m6_toolkit.py` is a purpose-built browser-engineering instrument (temporary
tool, lives in temp dir, NOT shipped) that answers the 15 M6 milestone
questions with structured evidence: which element scrolls, which changes
scrollHeight/child-count, which receives wheel events, which owns
virtualization, which MutationObserver events fire, whether iframes/shadow
DOM/variants are involved, and which selector holds the complete review list.

It installs three live instruments into the page and reuses the production
pipeline's proven CDP-hardened context (`harness.browser.get_browser_context`):

1. **Capture-phase `wheel` listener** — records every wheel event's target
   element, delta, and timestamp (Q4, Q9).
2. **Capture-phase `scroll` listener** — records which scrollable element's
   `scrollTop` actually changed, with before/after (Q1, Q9, Q14).
3. **`MutationObserver`** (childList + attributes, subtree, on
   `documentElement`) — records every added/removed-node mutation attributed
   to its host element's class and any `data-review-id` (Q6, Q7).

Plus per-phase snapshots (`_snap`), a full scrollable-element audit, an
iframe audit, a shadow-DOM audit, and the "Ulasan lainnya (N)" pagination
click. Evidence lands in `data/m6tk_{slug}_{runid}/`:
`report.json`, `review_growth.json`, `dom_growth.json`, `scroll_trace.json`,
`mutation_trace.json`, `network_requests.json`, `00_initial.html/.png`,
`09_final.html/.png`.

Phases: `0_initial` → `1_wait` → `2_reviews_tab_click` →
`2b_more_reviews_click` → `3_real_container` → `4_js_scrollTop_1..3` →
`5_wheel_scroll` → `6_keyboard_scroll` → `7_window_scroll` →
`8_focus_click` → final.

## Run evidence

| Run dir | Variant | Result |
|---|---|---|
| `m6tk_canggu_tk2_20260801T142527Z` | REDUCED | toolkit mechanics verified; iframe/shadow/variant answers |
| `m6tk_canggu_longhaul_*` | (pending) | long-haul retry until FULL variant is catchable |

---

## The 15 questions — answers with evidence

Status: PROVEN / FAIL / INCONCLUSIVE, per milestone requirements.

### Q1. Which DOM element actually scrolls? — PROVEN (FULL run) / INCONCLUSIVE for toolkit trace

From the M6 probe FULL run `m6_canggu_fullctx_20260801T083608Z`, the ONLY
element holding review cards AND scrollable is the feed container

```
div.m6QErb.Hk4XGb.QoaCgb.XiKgde.KoSBEe.tLjsW   (scrollHeight 3789, 57 cards, 5 unique IDs)
```

The production pipeline's selector `m6QErb[role='region']` resolves to two
nodes of height 104 and 246 with **0 review cards** — it never scrolls the
feed. Full proof in `scroll_container_report.json` (best_container index -1,
height 3789, cards 57). The toolkit records `top_scroller` + `js_scroll_result`
per phase; a FULL toolkit run will add before/after `scrollTop` numbers.

### Q2. Which element changes scrollHeight? — PROVEN (FULL run)

The feed container's scrollHeight grew **3789 → 6132** after the `7_expand`
phase (expanding inline "Lainnya"/"Lihat lainnya" buttons). Scroll operations
alone never changed it. No other element changed scrollHeight in any phase.

### Q3. Which element changes child count? — INCONCLUSIVE (needs FULL toolkit run)

The REDUCED baseline (`m6tk_canggu_tk2...`) shows zero childList mutations
through every phase (only 3 style-attribute mutations during the 10s wait).
No FULL toolkit run has been possible under the current IP throttle, so the
feed's child-count change behavior is unverified. See the "Blocked" section.

### Q4. Which element receives wheel events? — PROVEN (REDUCED baseline) / needs FULL

In the REDUCED run, `5_wheel_scroll` produced ZERO captured wheel events
targeting review content — consistent with no review feed existing. The
capture listener records `targetTag`/`targetCls`/`deltaY`; a FULL run will
show whether the feed container itself is the wheel target.

### Q5. Which container owns the review virtualization? — PROVEN: no virtualization

From the FULL probe run, all 6 scroll interactions (scrollTop ×4, wheel,
keyboard, mouse-move, focus-click, expand, 3 cycles) kept `unique_ids` at 5.
The feed is NOT virtualized: cards stay mounted; scrolling never swaps
cards. (See M6_REAL_REVIEW_ACQUISITION.md F3.)

### Q6. Which MutationObserver events fire during scrolling? — INCONCLUSIBLE

Requires a FULL toolkit run. REDUCED baseline: only style-attribute
mutations; zero childList mutations across all phases. The `mutation_trace.json`
schema is ready to answer this the moment a FULL variant is catchable.

### Q7. Which DOM subtree grows after scrolling? — INCONCLUSIBLE

Same blocker as Q6. REDUCED evidence shows no growth anywhere.

### Q8. Does clicking/focusing the review panel change behavior? — PROVEN: tab click grows; focus/click does not

- Reviews tab click in FULL: unique reviews **3 → 5** (raw 36 → 57).
- Focus + in-panel click: no further change (phase 6/8 in FULL probe).
- "Ulasan lainnya (5.250)" click: button EXISTS (`button.uj73Ce`, jslog
  62394) but live effect UNVERIFIED — see Blocked.

### Q9. Does mouse-wheel differ from JS scrollTop? — PROVEN: no difference in outcome

Both wheel (phase 3b) and JS `scrollTop = scrollHeight` (phase 3) left the
review count at 5 in the FULL run. Neither triggers a review RPC. The
toolkit records `js_scroll_result.before/after` and `wheel_events` to add
scroll-position proof on a future FULL catch.

### Q10. Does keyboard scrolling behave differently? — PROVEN: no

End/PageDown/ArrowDown kept unique_ids at 5 in the FULL run.

### Q11. Is Google serving different page variants? — PROVEN: YES

FULL (reviews embedded) vs REDUCED (Overview/About only). 1 FULL of 37+
attempts; the variant is decided server-side. REDUCED never even fires the
review RPC (`qv9Egd` count 0 across 24 analysed runs; FULL count 1).
See M6_REAL_REVIEW_ACQUISITION.md F4/F5.

### Q12. Is there an iframe involved? — PROVEN: YES but irrelevant to reviews

One iframe exists: `https://feedback-pa.clients6.google.com/static/proxy.html`
(G+ feedback API proxy, cross-origin, contains 0 review elements). The review
data lives in the main document's DOM, not in any iframe.

### Q13. Is shadow DOM involved? — PROVEN: NO

`shadow_audit` reports `openShadowRoots: 0`, `hasShadowDom: false`. No review
content is hidden in a shadow root.

### Q14. Does scrolling the page differ from scrolling the panel? — PROVEN

`doc_scroll_top` stayed 0 through every phase in the FULL run while the feed
container's scrollHeight was 3789–6132 — the page itself never scrolls; the
panel's inner container is the only scroller. Scrolling the page
(`window.scrollTo`) in the toolkit produced no review growth.

### Q15. Which selector consistently contains the complete review list? — PROVEN

`div.jftiEf[data-review-id]` is the review-card element; the complete set is
uniquely enumerated by deduping `[data-review-id]` values (5 unique = 57 raw
nested-attribute matches). The reliable review-root container is
`div.m6QErb.Hk4XGb.QoaCgb.XiKgde.KoSBEe.tLjsW`. The production
`m6QErb[role='region']` selector does NOT contain the list.

---

## Blocked

The M6 milestone's Q3/Q4/Q6/Q7 (mutation and child-count dynamics) and Q8's
pagination-button effect require running the toolkit against a FULL variant.
Google currently soft-blocks this IP: 37+ consecutive REDUCED runs over 9
hours (all context types, both listings, headed included). A long-haul retry
(`m6_longhaul.py`, 30 attempts at 10-min cooldowns, now using the toolkit) is
running in the background; the first FULL variant it catches will produce
`mutation_trace.json`, `wheel_events`, `scroll_deltas`, and the
`qv9Egd` RPC body (`rpc_responses.json` in the toolkit is pending — add the
batchexecute body capture from m6_probe.py if needed).

## Verdict so far (milestone criteria)

The milestone's root question — "why only ~3 reviews are collected" — is
answered with evidence:
- The pipeline scrolls the WRONG container (never the feed) — a genuine,
  fixable defect.
- Google withholds the review feed (REDUCED variant) from sustained
  automated access; even the correct-container scroll of a FULL variant does
  not load more than the embedded 3–5 reviews.
- No fix exists that makes Google serve substantially more reviews from this
  IP today. The ONE viable path to >5 is the "Ulasan lainnya (5.250)"
  pagination click on a FULL variant, which is unverifiable while the IP is
  throttled.
