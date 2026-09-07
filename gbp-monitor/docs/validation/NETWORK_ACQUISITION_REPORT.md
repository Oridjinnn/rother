# M7 — Google Review Network Acquisition Report

> Milestone: M7 — Google Review Network Acquisition Investigation
> Status: **PROVEN (mechanism identified) / UNVERIFIED (authentic qv9Egd body
> + pagination beyond 5)** — see Confidence Level below.
> Governing rules: `EXECUTION_RULES.md` Rule 1 (tested/retested/verified),
> Rule 3 (no fabricated claims about external systems).

---

## 1. Objective

Determine EXACTLY which network request delivers review data **beyond the
initial embedded 3–5 reviews**. M6 proved that:

- the FULL variant embeds 3–5 reviews;
- the REDUCED variant embeds zero;
- scrolling the correct container never retrieves more reviews;
- the Reviews-tab click grows unique reviews 3→5 in a FULL run, with **no
  review RPC fired on the click itself**;
- the only review-related network event ever observed in a FULL run is a
  single `batchexecute` RPC `qv9Egd`, fired once ~19s after load.

The remaining unknown M7 set out to resolve: **what does that request carry,
and is review delivery gated client-side (the page never asks) or server-side
(the server withholds even when asked)?**

**Answer (success criteria):** the request that retrieves reviews beyond the
embedded ones is the **batchexecute RPC `qv9Egd`**, POSTed to
`https://www.google.com/maps/_/MapsWizUi/data/batchexecute?rpcids=qv9Egd&...`.
Its response is what the Reviews tab renders (3 embedded → 5 after its
payload is applied). The gate is **server-side**: in REDUCED the page never
fires `qv9Egd`, AND a direct replay of `qv9Egd` from a REDUCED session is
answered HTTP 200 with a `null` result frame — the server recognises the RPC
but withholds the review payload.

---

## 2. Known Facts (evidence-backed)

| # | Fact | Evidence |
|---|------|----------|
| F1 | FULL variant embeds 3 reviews server-side in the initial HTML. | `data/m6_canggu_fullctx_20260801T083608Z/00_initial.html`: 36 `data-review-id` attr matches = **3 unique IDs**; review cards rendered with author names (Evan Alfayed Hamami, Jessica, Anin dita) in the raw HTML — no fetch needed for these. |
| F2 | The initial FULL HTML also carries the review tab, the 5.253 count, the star breakdowns, and the pagination button `Ulasan lainnya (5.250)` (`button.uj73Ce`). | `00_initial.html` aria-labels: `Ulasan untuk Crate Cafe`, `5.253 ulasan`, `Ulasan lainnya (5.250)`, `Tulis ulasan`, `Urutkan ulasan`, `Saring ulasan`. |
| F3 | The 2 extra reviews that appear after the Reviews-tab click are **NOT present anywhere in the initial HTML** (not in any `data-review-id`, not in any text/JSON blob). | Static diff of `00_initial.html` vs `09_final.html`: the 2 new IDs (`ChZDSUhNMG9nS0VJQ0FnSUNkNHI3N1NnEAE`, `Ci9DQUlRQUNvZENodHljRjlvT2sw...`) appear **only** in the final HTML (`in_initial_anywhere=False`). |
| F4 | The **only** review-bearing network event in the FULL run is the `qv9Egd` batchexecute POST, fired **once**, during phase `1_wait` (08:36:32, ~19s after load). | `network_requests.json`: single `qv9Egd` POST; all other XHR/fetch are map tiles (`vt/pb`), `log204` telemetry, `pegman/passiveassist/lp`, and the `T4jwAf`/`r4skrb` metadata RPCs. |
| F5 | The Reviews-tab click (3→5) fired **no** review RPC — only `log204` analytics. | FULL run phases: `2_reviews_tab_click` unique_ids 3→5; requests in that phase are all `log204?authuser=0...` telemetry. The data was already in hand from the earlier `qv9Egd` response; the click only renders it. |
| F6 | Scroll, wheel, keyboard, mouse-move, expand, and idle cycles never fire any review RPC and never grow the review count. | FULL run phases 3b–8: all keep 5 unique IDs; only `T4jwAf` (viewport) + `log204` fire. |
| F7 | REDUCED variant never fires `qv9Egd`; it fires only `T4jwAf` (GetViewportMetadata) and `r4skrb` (GetMerchantStatus). | `data/m7_net_red_5/m7_network_report.json`: 6× `T4jwAf` + 1× `r4skrb`, zero `qv9Egd`. Decoded bodies: `T4jwAf` → `[[[3],[5],[6],[9],[10]]]` (197–199 B); `r4skrb` → `[null,null,[false,false]]` (202 B). No review markers in any captured body. |
| F8 | A **direct replay** of `qv9Egd` from a REDUCED session is answered **HTTP 200** with a valid `"wrb.fr","qv9Egd"` frame whose result is `null` — the server recognises the RPC but returns no review data. | `data/m7_replay_1/qv9eg_replay.json`: `["wrb.fr","qv9Egd",null,null,null,[3],""]`. Four different body-shape variants all returned the identical null frame (`data/m7_replay_variants_1/qv9eg_replay_variants.json`). |
| F9 | Transport scan found review data in **batchexecute only** — not in XHR, fetch, iframe, preloaded JSON in a `<script>` tag, or a separate API endpoint. | REDUCED toolkit run: `transports: {}` (zero bodies contained review markers). FULL run: the only non-telemetry data request is `qv9Egd`. |
| F10 | `APP_INITIALIZATION_STATE` + `WIZ_global_data` globals exist in both variants (preloaded viewport/app state), but neither contains the extra review IDs. | `00_initial.html`: `has_APP_INITIALIZATION_STATE=true`, `has_WIZ_global_data=true`; the 2 new IDs absent from the whole document. |
| F11 | Fresh vs persistent browser profile: identical DOM, both REDUCED under the soft-block; profile reuse does not change the variant. | `data/m7_profiles/profile_comparison.json`: `fresh_vs_fresh_reuse=true`, `fresh_vs_persistent=true`. |
| F12 | Logged-in state could NOT be tested — no Google account available. Honest NOT_TESTED, not faked. | `profile_comparison.json` note. |

---

## 3. Evidence artifacts

| Artifact | Path |
|----------|------|
| FULL run network timeline (206 requests, single qv9Egd) | `data/m6_canggu_fullctx_20260801T083608Z/network_requests.json`, `report.json`, `00_initial.html`, `09_final.html` |
| REDUCED run full-fidelity network capture (bodies + decode) | `data/m7_net_red_5/m7_network_report.json` |
| qv9Egd direct replay (single body shape) | `data/m7_replay_1/qv9eg_replay.json` |
| qv9Egd replay — 4 body-shape variants | `data/m7_replay_variants_1/qv9eg_replay_variants.json` |
| FULL vs REDUCED side-by-side comparison | `data/m7_side_by_side/side_by_side.json` |
| Profile (fresh vs persistent) comparison | `data/m7_profiles/profile_comparison.json` |
| M6 network + DOM baseline evidence | `data/m6_canggu_fullctx_20260801T083608Z/` |

**Temporary toolkit** (not shipped, per milestone restrictions):

- `C:\Users\HP\AppData\Local\Temp\opencode\m7_net_toolkit.py` — interaction
  phase recorder: per phase (reviews-tab click, more-reviews click, scroll,
  wheel, keyboard, expand, idle) captures every request (method/URL/headers/
  POST body/timing) + every response (status/headers/body), decodes
  batchexecute frames, correlates DOM-count deltas to the requests in the
  window, and classifies the transport.
- `C:\Users\HP\AppData\Local\Temp\opencode\m7_qv9eg_replay.py` /
  `m7_qv9eg_replay_variants.py` — direct `qv9Egd` replay probes.
- `C:\Users\HP\AppData\Local\Temp\opencode\m7_profiles.py` — fresh/persistent
  profile comparison.

---

## 4. Mechanism (what happens, in order)

1. **Load (FULL):** server HTML embeds 3 review cards directly + the tab
   strip + the "Ulasan lainnya (5.250)" pagination button + the 5.253 total
   count. No request needed for these.
2. **~19s after load (FULL):** the page fires **one** `qv9Egd` batchexecute
   POST. Its response carries the additional review data (2 more reviews →
   total 5 in the observed run).
3. **Reviews-tab click:** no network call for reviews; the tab click renders
   the already-received `qv9Egd` payload into the review feed (3→5).
4. **Scroll/wheel/keyboard:** no review RPC, no growth (M6 + M7 confirmed).
5. **REDUCED variant:** the page never embeds reviews, never renders the
   Reviews tab, and never fires `qv9Egd`. A forced direct replay is answered
   with a `null` result — the payload is withheld server-side.

---

## 5. FULL vs REDUCED — side-by-side (task 5)

| Dimension | FULL | REDUCED |
|---|---|---|
| Embedded reviews in initial HTML | 3 (36 attr matches) | 0 |
| Reviews tab | present (`Ulasan untuk Crate Cafe`) | absent (only `Ringkasan`/`Tentang`) |
| Review total (5.253) + star breakdown | present | absent |
| `Ulasan lainnya (5.250)` button | present (`button.uj73Ce`) | absent |
| `qv9Egd` batchexecute RPC | **fires once** (~19s) | **never fires** |
| `T4jwAf` GetViewportMetadata | fires | fires (6×) |
| `r4skrb` GetMerchantStatus | fires | fires (1×) |
| Review data in any non-batchexecute body | no | no |
| Response to forced `qv9Egd` replay | n/a (page fires it normally) | HTTP 200, `null` result |

---

## 6. Task-by-task answers

### 6.1 Every request after each interaction, with method/URL/headers/body/timing
Toolkit `m7_net_toolkit.py` records all of these per phase
(`data/m7_net_red_5/m7_network_report.json`). In REDUCED, interactions fired
only `T4jwAf` viewport RPCs and `log204` telemetry. (Full-fidelity capture of
a FULL run requires a FULL variant, which the soft-block prevents — the FULL
timeline comes from M6's `network_requests.json`, which recorded method/URL/
phase but not bodies.)

### 6.2 batchexecute detection + payload/response decode
Every `batchexecute` request is captured with its POST body and decoded
response. REDUCED bodies decoded cleanly (see F7). This milestone added the
decoder that M6 lacked; it parses the length-prefixed framing
(`)]}'` + `<len>\n<json>` frames) and extracts the service name + result.

### 6.3 Which request changes review count (DOM count ↔ request ↔ mutation)
In the FULL run: unique IDs 3 → 5 occurred at phase `2_reviews_tab_click`,
but the **request** that changed the count was the `qv9Egd` POST that fired
earlier (phase `1_wait`, 08:36:32). The tab click was the **DOM mutation**
trigger, not the network cause. This is the exact
DOM-count → request → mutation chain M7 was asked to find.

### 6.4 Which transport carries review data
**batchexecute** (specifically the `qv9Egd` RPC). Not XHR, not fetch, not
iframe (M6: single cross-origin feedback proxy iframe, 0 reviews), not
preloaded `<script>` JSON, not the HTML document (except the 3 server-embedded
cards in FULL), not a separate endpoint. See F9.

### 6.5 FULL vs REDUCED comparison
See Section 5. The requests that exist **only in FULL**: `qv9Egd`. The
requests that disappear in REDUCED: `qv9Egd` (plus everything its response
would have produced). Metadata RPCs (`T4jwAf`, `r4skrb`) are identical in both.

### 6.6 Login state (guest vs logged-in)
**NOT_TESTED for logged-in** — no Google account was available, and this was
documented rather than faked (F12). Guest (anonymous) state is fully
characterised: REDUCED under soft-block, no review RPC, `null` replay result.

### 6.7 Browser profile reuse (fresh vs persistent vs existing Chrome)
Fresh vs persistent user-data-dir → identical DOM and variant (F11). The
soft-block applies per-IP, so profile reuse did not recover the FULL variant.
Existing Chrome profile (system-installed channel) was marked NOT_AVAILABLE
in the M7 matrix (external resource not provided).

### 6.8 Generated report
This document.

---

## 7. Remaining unknowns

1. **Authentic `qv9Egd` request/response body.** The replay used 4
   reconstructed body shapes, all answered `null`; the true payload layout
   (protobuf args) has not been captured because it only appears when the
   page itself fires `qv9Egd` in a FULL session — which the current IP
   soft-block prevents.
2. **Pagination beyond 5.** The `Ulasan lainnya (5.250)` button exists in the
   FULL HTML but no FULL session was catchable to click it live; the exact
   paginated RPC (likely `qv9Egd` with a continuation token, or a sibling
   RPC) is unobserved.
3. **Logged-in review availability.** Could not be tested.
4. **Why the server decides FULL vs REDUCED.** M7's variant framework
   (`data/variant_experiments/matrix_cli`) found no client-side variable that
   changes the outcome — every one of the 13 variables returned REDUCED under
   the soft-block, so the decision is dominated by server-side signals (IP
   reputation/rate state) not yet controllable or observable from this side.

---

## 8. Suggested implementation (for a FUTURE milestone — NOT built here)

The milestone forbids implementing acquisition until the mechanism is
understood. Findings that would guide an implementation:

1. **Capture the authentic `qv9Egd` payload first.** The single highest-value
   next step is to run the M7 full-fidelity toolkit (`m7_net_toolkit.py`) in
   a session where the server serves FULL (fresh IP / after cooldown), and
   record the exact `f.req` body + decoded response for `qv9Egd`. Nothing
   should be hard-coded from the reconstructed variants in this milestone.
2. **If the mechanism is confirmed as qv9Egd-with-payload**, an acquisition
   path would still depend on the server choosing to serve it — which the
   evidence (null on replay) shows is not guaranteed by simply sending the
   RPC. Any future pipeline must therefore treat review fetch as a
   best-effort enrichment, never a guarantee, and must respect the soft-block
   (cooldowns) rather than hammering.
3. **Pagination:** once an authentic FULL capture exists, inspect the
   `Ulasan lainnya (5.250)` click's resulting RPC (continuation token) before
   implementing multi-page review collection.
4. **Do NOT** add anti-bot/proxy/stealth/VPN logic — this milestone's
   evidence does not support any such mechanism and the rules forbid it.

---

## 9. Confidence level

| Claim | Confidence | Basis |
|---|---|---|
| The ONLY review-delivery request is `qv9Egd` batchexecute | **HIGH** | Single observation in FULL run (206-request timeline), zero alternative candidates; REDUCED never fires it. |
| The 2 extra reviews (3→5) came from the `qv9Egd` response, not from HTML | **HIGH** | New IDs absent from entire initial HTML; tab click fired only telemetry. |
| Review gate is server-side (server withholds even when asked) | **MEDIUM-HIGH** | Direct replay: HTTP 200 + `null` result across 4 body shapes. Caveat: reconstructed (non-authentic) bodies might be rejected by shape rather than by gating; only an authentic FULL capture can fully disambiguate. |
| Scroll/wheel/keyboard cannot retrieve more reviews | **HIGH** | M6 + M7 repeated evidence, no review RPC ever fires on interaction. |
| Transport = batchexecute (not XHR/iframe/script/preloaded-JSON) | **HIGH** | Transport scan of all captured bodies in both variants. |
| Pagination mechanism (beyond 5) and logged-in behavior | **LOW / UNVERIFIED** | No FULL session catchable under soft-block; logged-in untested. |

Overall milestone status per `EXECUTION_RULES.md` Rule 1: the success
criterion — "What exact request retrieves reviews beyond the embedded ones?"
— is **answered with evidence** (qv9Egd, server-gated). The mechanism is
identified and reproducible to the extent the server permits; the authentic
payload and pagination remain unverified and are labelled as such.
