# M7 — Real Review Acquisition Investigation

> Milestone: M7 — Real Review Acquisition Investigation
> Status: **INCONCLUSIVE (soft-blocked)** — see Decision below.
> Governing rules: `EXECUTION_RULES.md` Rule 1 (tested/retested/verified),
> Rule 3 (no fabricated claims about external systems). Every claim below is
> either PROVEN by an artifact path, UNPROVEN (missing a required test), or
> INCONCLUSIVE (tested but the environment prevented a discriminating result).

---

## 1. Objective

M6 proved that Google serves two page variants for the same listing
non-deterministically:

- **FULL**: reviews are server-embedded (3), clicking the Reviews tab grows to
  5, and a single `batchexecute` RPC `qv9Egd` is the only review-delivery
  request; the gate is **server-side** (direct replay is answered HTTP 200
  with a `null` result).
- **REDUCED**: the Reviews tab, feed, and `qv9Egd` RPC are all omitted by the
  server.

This milestone extends the investigation to the **"Ulasan lainnya (5.250)"**
("More reviews") button and the remaining acquisition questions, aiming to
close one of two success criteria:

- **A:** an evidence-backed method to *consistently* retrieve substantially
  more real reviews (the advertised 5.250), OR
- **B:** an evidence-backed proof that browser automation alone *cannot*
  obtain more reviews under the tested conditions, including the precise
  technical reason.

Seven objectives were defined; each is resolved PROVEN / UNPROVEN /
INCONCLUSIVE below.

---

## 2. Success criteria — Decision

| Criterion | Verdict | Basis |
|-----------|---------|-------|
| A — consistent method for more reviews | **NOT ACHIEVED** | No interaction, URL form, browser state, or environmental variable produced more than the 5 FULL-embedded reviews. Every acquisition path that could be exercised live returned REDUCED. |
| B — proof automation alone cannot | **NOT ACHIEVED (INCONCLUSIVE)** | The decisive experiment (click `Ulasan lainnya (5.250)` in a FULL session and observe its network/DOM effect) **could not be run**: the button exists only in FULL HTML, and no FULL session was catchable under the current per-IP soft-block. The server-side gate on `qv9Egd` is PROVEN (see `NETWORK_ACQUISITION_REPORT.md`), but the More-reviews button represents a distinct, untested navigation path that could fetch additional reviews via a *different* RPC/URL. |

**Milestone result: INCONCLUSIVE.** The 5 known delivery mechanisms (embedded
HTML, `qv9Egd`) are fully characterised; the 6th mechanism (the More-reviews
button, which is a distinct `pane.wfvdle57` handler carrying its own FID
token) is structurally identified but behaviorally untested because of the
soft-block.

---

## 3. Evidence artifacts (new in this milestone)

| Artifact | Path |
|----------|------|
| Browser-state + navigation probe (REDUCED runs: modern URL, legacy URL, modern repeat; cookies/localStorage/sessionStorage/navigator/viewport/locale/UA + More-reviews-button attempt + go_back history test) | `data/m7_state_probe_1/state_probe.json`, `data/m7_state_probe_1/final.png` |
| More-reviews button static analysis of the M6 FULL HTML (selector, `jsaction`, jslog metadata decode, FID token, container) | derived from `data/m6_canggu_fullctx_20260801T083608Z/00_initial.html` (see §4.1) |
| Timing series: 28 longhaul attempts (17:34 → 23:15 WITA), 0 FULL | `m6_longhaul.log` (temp), summarized in §4.7 |
| Prior milestones' evidence reused: `data/m7_net_red_1..5/`, `data/m7_replay_1/`, `data/m7_replay_variants_1/`, `data/m7_side_by_side/`, `data/m7_profiles/`, `data/variant_experiments/matrix_cli/` | see `NETWORK_ACQUISITION_REPORT.md` and `M7_VARIANT_INVESTIGATION_FRAMEWORK.md` |

Investigation-only Python probes (`m7_state_probe.py`, `m7_button_analyze.py`,
etc.) live in the temp dir, **NOT shipped**; no production code changed.

---

## 4. Objective-by-objective findings

### 4.1 More-reviews button: exact selector, handler, metadata, mutation chain

**PROVEN (static analysis of FULL HTML):**

- The button exists **only** in the FULL variant. Exact structure:
  `<button class="uj73Ce" aria-label="Ulasan lainnya (5.250)"
  jsaction="pane.wfvdle57"
  jslog="62394;track:click;mutable:true;metadata:WyIwYWhVS0V3aVoyS3FUZ18tVkF4VUx4VGdHSFpoMk42QVE4QmNJQWlnQSJd">`
  inside `<div class="m6QErb Hk4XGb QoaCgb XiKgde KoSBEe tLjsW">` directly
  after the 3rd (last) review card.
- The `jslog` metadata base64-decodes to `["0ahUKEwiZ2KqTg_-VAxULxTgGHZh2N6AQ8BcIAigA"]` —
  a **Google Maps place FID token**, i.e. the page already carries the
  identity of the target it would navigate to.
- That FID token appears **nowhere else** in the FULL HTML (0 occurrences of
  `0ahUKEw`), meaning the "more reviews" destination is not a preloaded blob
  on this page — it is resolved at click time.
- The button handler namespace is `pane.wfvdle57`, distinct from the review
  actions (`pane.wfvdle56` ×19 = expand/share/photo/open-original). `wfvdle57`
  occurs exactly once in the document — it is the More-reviews action.
- The FULL HTML also carries the pieces the modern Maps URL needs:
  hex CID `0x2dd238790e10a139:0xecc711d7e02e1ace` (from the
  `/maps/preview/place?pb=!1m14!1s0x2dd238790e10a139:0xecc711d7e02e1ace...`
  canonical link) and coordinates `-8.6408826,115.1339577` (from `!3d...!4d...`).
  The `place_id:ChIJOaEQDnk40i0Rzhou4NcRx-w` CID was verified to decode to the
  same value as the hex CID, so all three identifiers reference the same place.
- No continuation/pagination token is embedded next to the button; Google
  Maps lazy-loads review batches via RPC (the `qv9Egd` family), so a
  continuation token (if any) would arrive in the RPC response, not the HTML.

**UNPROVEN (blocked):** the click itself — its navigation target, DOM
mutations, and any RPC it fires. The M6 FULL run never clicked this button
(its phases 2–8 are tab click, scroll, wheel, keyboard, mouse-move, expand,
idle — none target `uj73Ce`). Live clicks were attempted in the state probe
(§4.3) but the button never rendered because every live session was REDUCED.

**INCONCLUSIVE:** whether the button navigates to a modern-format place URL
(new page load, likely with a fresh server-rendered review set + its own
`qv9Egd`/pagination RPCs) or expands in-place. The structural evidence (FID
token + handler namespace distinct from the review actions) favours a
navigation; no behavioral proof was obtainable.

### 4.2 Network capture after every interaction; pagination/continuation tokens

**PROVEN (this + prior milestone):**

- `qv9Egd` is the *only* review-bearing network event ever observed; it fires
  once ~19s after load in FULL, and its response is what the tab click later
  renders (3→5). Full request/response bodies, batchexecute framing decode,
  and per-phase DOM↔request correlation are in `data/m7_net_red_1..5/`.
- Replay of `qv9Egd` from a REDUCED session → HTTP 200, `["wrb.fr","qv9Egd",
  null,null,null,[3],""]` across 4 body shapes — server-side gate confirmed.
- No continuation/pagination request was ever observed because no live session
  ever contained a reviews list long enough to paginate (max 5 unique IDs).

**UNPROVEN (blocked):** an authentic `qv9Egd` request+response body from a
live FULL session (would reveal whether a continuation token exists), and any
pagination request after clicking `Ulasan lainnya`. Both require a FULL
variant, which the soft-block prevents.

### 4.3 Browser-state comparison FULL vs REDUCED

**PROVEN (state probe — REDUCED side):** `data/m7_state_probe_1/state_probe.json`:

- Both the legacy `?q=place_id:...` URL and the modern `@lat,lng` URL **redirect
  to the identical canonical URL** `https://www.google.com/maps/place/Crate+Cafe/@-8.6408826,115.1339577,17z/data=!3m1!4b1!4m6!3m5!1s0x2dd238790e10a139:0xecc711d7e02e1ace!8m2!3d-8.6408826!4d115.1339577!16s%2Fg%2F11j0s3k2ml`. The URL form is not a lever.
- Cookies: exactly 2 — `__Secure-STRP` and `NID` (both `.google.com`, anonymous).
- `localStorage`: only Maps plumbing keys (`tup`, per-session epoch keys
  `NNNctx`, `NNN`, `NNNhjsv`, `cdids`) — no review state, no persisted variant
  marker. `sessionStorage`: empty.
- `navigator`: `id-ID` locale, `Asia/Makassar` TZ, 1366×768, no plugins
  surfaced, `webdriver=false` for the probe's default UA; `PRODUCT_ID=81`,
  `APP_INITIALIZATION_STATE` + `WIZ_global_data` present.
- All three visits (modern / legacy / modern-repeat) produced **identical**
  REDUCED DOM (Ringkasan+Tentang tabs only, 0 review cards, 0 more-reviews
  buttons) and identical state shape.

**UNPROVEN (blocked):** the FULL-side equivalent capture for a side-by-side
diff. The M6 FULL run predates the full state-capture toolkit, so its cookies/
storage are not on file; and no new FULL session is catchable. The variant
framework's 13-variable matrix (locale, language, timezone, viewport, UA
version, channel, headless, profile, session age, navigation path, cookies,
IP class, auth) all returned REDUCED under the soft-block — so no tested
browser-state variable discriminates, but the comparison is confounded by the
block.

**INCONCLUSIVE:** whether some untested state differs between FULL and REDUCED
(e.g. a consent/cookie from a first FULL page in a warm browser). The M6 FULL
run used a realistic Chrome UA + `en-US`; the state probe used default UA +
`id-ID`. That confound is real but was already matrix-tested as `locale` and
`browser_version` (both REDUCED under block).

### 4.4 Browser history / repeated visits

**PROVEN (state probe):** in-session `go_back()` from the modern page landed on
`about:blank` (no prior entry in that fresh context). Revisiting the same URL
three times in one session yielded the identical REDUCED variant — repeated
visits do not flip the variant.

**PROVEN (prior milestone):** fresh vs persistent profile = identical DOM, both
REDUCED (`data/m7_profiles/profile_comparison.json`).

**UNPROVEN:** long-tail repeated visiting (hours/days) across sessions to
trigger a FULL serving — the longhaul series (§4.7) partially addresses this
but all 28 attempts stayed REDUCED.

### 4.5 Login state

**NOT TESTED (documented honestly).** No Google account is available, so the
`auth=logged_in` matrix experiment could not run (its `storage_state` file is
missing; the live matrix run FAILed with a transient context error). Logged-in
behavior — including whether a signed-in session unlocks the full review feed
or the More-reviews pagination — remains unknown. This is a deliberate
NOT_TESTED, not a negative result.

### 4.6 Geolocation / locale

**PROVEN (matrix, `data/variant_experiments/matrix_cli/variant_comparison_report.json`):**
`locale` (id-ID vs en-US), `browser_language` (id-ID vs en-US), and `timezone`
(NY vs Makassar) were each the *sole* changed variable vs baseline; all ran
REDUCED conf 0.9 under the soft-block. Locale/language/timezone do not
discriminate in the current environment.

**UNPROVEN:** Playwright's `geolocation` (lat/lng permissions) — no experiment
in the matrix varied real geolocation, only `timezone_id`. A geolocation probe
was not added because (a) the matrix already showed every browser-context
variable REDUCED, and (b) the soft-block confound would make any single-variable
claim weak. Explicitly flagged as a future test if a FULL session ever
reappears.

### 4.7 Timing

**PROVEN (timing series):** the m6 longhaul logged 28 attempts from 17:34 to
23:15 WITA (≈5.7 h), of which **0 were FULL** (27 REDUCED + 1 timeout), with
600 s cooldowns. Combined with the M6/M7 FULL appearances at 08:36 Z and the
matrix runs, the evidence shows a sustained per-IP soft-block, not a
time-of-day pattern: FULL was last seen in the morning; every afternoon/evening
attempt stayed REDUCED.

**INCONCLUSIVE:** whether FULL serving is correlated with wall-clock time,
time-since-last-request, or request rate. The longhaul uses a fixed 600 s
cooldown; no experiment varied cooldown length. The variance is dominated by
the soft-block state, so a timing claim cannot be separated from IP reputation.

---

## 5. Conclusion

- **Known delivery mechanisms** (embedded HTML + `qv9Egd` server-gated RPC) are
  fully PROVEN and characterised in `NETWORK_ACQUISITION_REPORT.md`.
- **The More-reviews button** is structurally PROVEN (selector `button.uj73Ce`,
  handler `pane.wfvdle57`, its own FID token, absent from REDUCED) but its
  behavior is UNPROVEN because no FULL session was catchable under the
  soft-block to click it. This is the single experiment that would close
  criterion A or B.
- **No tested lever** (URL form, browser state, history, locale/timezone/
  language/viewport/UA, session age, profile, cookies) recovered more reviews
  or flipped the variant.
- **Login** is untestable without an account (NOT_TESTED).

### Recommended next step (what would unblock this milestone)

1. Obtain one more FULL session (fresh IP or extended cooldown / different day).
2. In that session, click `Ulasan lainnya (5.250)` with the full-fidelity
   toolkit (`m7_net_toolkit.py` phase `3_more_reviews_click`), capturing the
   resulting URL/navigation, every request/response body, any new RPC, and the
   DOM mutation chain.
3. If the button yields additional reviews → criterion A is met (document the
   exact method). If it returns 0 growth or an equivalent null gate → criterion
   B is met with the precise reason.
4. Optionally, with an account, repeat the click logged-in (criterion: login
   unlocks pagination).

---

## 6. Confidence

| Claim | Confidence | Why |
|-------|-----------|-----|
| More-reviews button exists only in FULL, selector `button.uj73Ce`, handler `pane.wfvdle57`, carries its own FID token | **High (PROVEN)** | direct static extraction from FULL HTML, token decoded, distinct from review-action namespace |
| Button behavior is unknown | **High (UNPROVEN)** | never clickable in a live run; structurally distinct from all tested interactions |
| All 13 tested browser/environment variables do not discriminate variant (under soft-block) | **Medium** | matrix evidence valid, but confounded by the block; a clean-IP rerun is required to generalise |
| Server-side gate on `qv9Egd` | **High (PROVEN)** | direct replay, 4 body shapes, all `null` — see NETWORK_ACQUISITION_REPORT.md |
| Timing: no FULL in 28 afternoon/evening attempts | **Medium** | single IP, fixed cooldown; can't separate time-of-day from soft-block |
| Logged-in behavior | **None** | NOT_TESTED — no account |
