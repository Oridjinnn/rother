# Rother — Onboarding + Review-Collection Design Brief

Status: **Design ratified + Phase 1 executed (partial).** This document is the
implementation-ready companion to the analysis in `docs/management/MASTER_RISK_REGISTER.md`
(RISK-023, RISK-024, RISK-028) and supersedes the original "login-wall" premise for review
acquisition (see §0 F3).

> **"Do NOT write code" was lifted by the user ("execute").** Phase 1 (onboarding gap-closing)
> + persistence + CSP/attribution fixes are implemented in this repo. Phases 2-8 remain design
> and depend on the open decisions in §5.

## 0. State correction (premises this design changes)

- **F1 — Section 1 (OSM onboarding) is already built** as untracked files:
  `src/app/api/places/route.ts`, `src/lib/places.ts`, `src/components/shell/AutocompleteInput.tsx`,
  `PlaceConfirmCard.tsx`, `PasteFromMapsParser.tsx`, `onboarding.tsx`. Phase 1 is gap-closing,
  not a build.
- **F2 — The OSM→Google bridge does not exist.** Onboarding stores OSM `node/123456`. The
  collector validates `^ChIJ[A-Za-z0-9_-]{20,}$` (`gbp-monitor/orchestration/run_all.py:97`).
  `gmaps_place_id` is only populated when a pasted Maps URL contains a `ChIJ…`. Otherwise
  `scrape-runner.ts:306` passes `--business ""` → `INVALID_PLACE_ID` → guaranteed empty state.
  **No collector work matters until OSM→Google resolution exists (Phase 2).**
- **F3 — The login wall was never the root cause.** In-repo experiment
  `gbp-monitor/data/m7_acquisition/ranked_hypotheses.json` (Rank 1, High confidence):
  > "A valid Google **NID** cookie is NECESSARY and SUFFICIENT for the FULL variant."
  > Anonymous direct: REDUCED 4/4. NID present: FULL 3/3; google.com warm-up: FULL 5/5;
  > jar reuse: FULL 1/1. Rank-5 "logged-in account required" → **contradicted**.
  NID is a **logged-out** token issued by visiting `google.com`, ~6-month expiry. Yet
  `run_all.py:681-697` hard-refuses unless given a logged-in `storage_state`. That gate is
  obsolete and currently blocks every run. Removing it also removes the *worst* legal exposure
  (using a real account = ToS acceptance + termination risk). The "cookie/session pool" should
  be an **anonymous NID warm-up pool**, not an account pool.
- **F4 — 500/branch has never been approached, and there is a legitimate API that hits it.**
  Best real yield on record: **3 unique reviews** (`data/verify/.../review_statistics.json`:
  `unique_ids: 3`); `data/reviews_new/*` are fixtures. Meanwhile the **user's own branches** can
  be read via the sanctioned Google Business Profile (GBP) Reviews API:
  `GET /v4/accounts/*/locations/*/reviews`, `pageSize` max 50, `nextPageToken` pagination, returns
  `totalReviewCount` + `averageRating`; `locations:batchGetReviews` covers many branches at once.
  **500 reviews/branch = 10 sanctioned API pages.**

### Re-cut three-layer model
| Layer | Purpose | Source | Legitimacy |
|---|---|---|---|
| 1 — Discovery | Anchor business + branches | OSM/Photon | ✅ free, legit |
| 2a — **Own** branches | the 500/branch target | **GBP Reviews API** (OAuth) | ✅ sanctioned, paginated |
| 2b — Competitors | comparison content | scrape (NID) / Places API (≤5) | ⚠️ best-effort, ToS-breaching |
| 3 — Looping/stacking | volume + resilience | applies to **2b only** | ⚠️ degradation-first |

## 1. `/api/places` provider + fallback decision [(a)]

**Decision: ratify the existing chain** — Photon primary; MapTiler then Geoapify as opt-in keyed
fallbacks; manual text terminal. Rationale: Photon is the only provider that reliably returns the
`osm_type/osm_id` identifier the whole design anchors on (MapTiler/Geoapify degrade to synthetic
`maptiler/…`/`geoapify/…` IDs that are useless as anchors). Each desktop calls Photon from the
user's own IP, so rate-limiting is per-user — no self-hosting needed until telemetry shows 429s.

**Implemented in Phase 1:**
- `mode=business|address` query param. `business` sends Photon `layer=venue` (biases toward
  shops/amenities instead of streets); `address` does a plain geocode. This is what finally makes
  `AddressAutocomplete` meaningful and fixes "search my business, get a street".
- Provider merge + POI preference in `queryChain`: results are merged across providers; in
  `business` mode a provider that returns no POI-class hit is skipped in favour of the next.
- Cache TTL + single-flight: positive TTL 30d, negative TTL 10m, stale-on-failure; concurrent
  identical queries coalesce to one upstream call (`inflight` map). Disk write unchanged in shape
  but keyed by `(q,lat,lng,limit,mode)`.
- **Server-side Maps short-link expansion** at `/api/places?path=expand&q=<link>`: follows
  redirects for `maps.app.goo.gl`/`goo.gl`/`google.com` (browser can't reach Google under CSP),
  extracts `ChIJ…` or `@lat,lng`, then forward-geocodes coordinates into an OSM-backed place.
  Keeps the "client only calls same-origin" contract.

**Open refinements (deferred):** honour 429/`Retry-After` with per-provider cooldown; debounce
disk writes; verify tile rendering in a packaged build on all 3 OSes (D12 exit gate).

## 2. Onboarding component breakdown + data captured [(b)]

Components exist; Phase 1 wires the gaps.

| Component | State | Work done / required |
|---|---|---|
| `AutocompleteInput` | built | `mode=business`; debounce + ↑/↓/Enter already present |
| `AddressAutocomplete` | **wired (Phase 1)** | now used in onboarding step 2 with `mode=address` + HQ `biasLat/biasLng` |
| `PlaceConfirmCard` | built | **+ OSM attribution** ("© OpenStreetMap contributors") added |
| `PasteFromMapsParser` | partial | short-link expansion now server-side (§1); still surface which ID recovered |
| `CategorySelect` | built | auto-fill + editable — correct |
| Manual fallback | built | never blocks — correct |
| `GoogleLinkStatus` chip | **new, deferred** | `verified / unresolved / manual` explaining collection reachability |

**Branch kinds (new in Phase 1):** `BranchDraft` and `BranchConfig` gain `branch_kind:
"business" | "address"`. Step 2 now accepts both a named-place branch and an address-only branch
(partial typing → live suggestions). Address-only branches are plot-only until resolved to a
`place_id`.

**Data captured per business/branch** (`ActiveBusiness`/`BranchConfig`): `osm_place_id` (canonical
anchor, always present unless manual), `name/formatted_address/lat/lng/city/country/postcode`,
`category` (OSM) + `categoryId` (app, editable), `provider`, `unverified`, `gmaps_place_id`,
`branch_kind`, and (Phase 2) `gmaps_resolution {status, method, confidence, resolved_at,
verified_name}`, `gbp_location_name`, `total_review_count`.

**OSM→Google resolver (Phase 2, F2) — tiered, never blocking:**
T1 paste (exists) → T2 Places API Find Place (name + lat/lng bias, cross-checked by the existing
`validate_place_id()`) → T3 scrape-based (flagged, best-effort) → T4 none (store OSM anchor,
`status: unresolved`, honest empty state). Never blocks onboarding.

## 3. Collector pipeline design [(c)]

### C1. Two collectors
- **Collector A — own branches (GBP Reviews API).** The only path that legitimately delivers
  500/branch. OAuth (desktop loopback), token in OS keychain (not `.env`/JSON). Per branch: page
  `reviews.list` at `pageSize=50`, follow `nextPageToken` to target or exhaustion;
  `batchGetReviews` for multi-branch. Coverage = `collected / totalReviewCount` (honest by
  construction). Sequential paging; respect 429. **Friction: project allowlisting is a human
  review; locations must be verified; user must be owner/manager.**
- **Collector B — competitors (browser, best-effort).** Extends `gbp-monitor`. Everything below is
  Collector B.

### C2. Fix three blockers before adding machinery
1. Replace `NEED_SESSION` with self-service NID warm-up (F3).
2. Raise the target: `scrape-runner.ts:308` hardcodes `--max-reviews 100`; make it per-branch,
   default `min(500, total_review_count)`.
3. Fix parser loss before scaling. Verdict `FAIL — 30 of 33 DOM nodes not exported` with 3 unique
   IDs: `_collect_dom_stats` shows Google repeats `data-review-id` ~11×/card, so 33 nodes ≈ 3
   reviews. The DOM was genuinely REDUCED. Re-measure under NID before touching selectors.

### C3. Stacking — ranked acquisition paths
| # | Path | Notes |
|---|---|---|
| S1 | NID warm-up + place panel + sort=Newest | baseline (+F3 fix) |
| S2 | alternate sorts (Relevant/Highest/Lowest) | union raises coverage when one traversal truncates — cheapest real win |
| S3 | locale variants (`hl=en-US`/`id-ID`) | parameterize `run_all.py:304` |
| S4 | search-side entry (`ludocid` reviews panel) | different gating |
| S5 | internal `listugcposts` RPC replay | highest yield/page, highest brittleness — evidence-gated, off by default |

Reuse `config/selectors.json` + `selector_tracker.py` (with RISK-033 fix) and the existing
`variant_framework` axes (`ip_class`, `cookies`, `locale`, `session_age`) as the offline ranker.

### C4. Looping — rotation, backoff, budgets
- Identity = self-consistent tuple `{proxy?, UA, client-hints brands, viewport, locale,
  accept-language, timezone, NID jar}`. Rotate **whole tuples**, never individual fields
  (mismatched layers are themselves a fingerprint — `harness/browser.py` docstring). `get_browser_context()`
  currently has no `proxy` kwarg → new work.
- Escalation on 429/CAPTCHA/REDUCED/null-rating≥90% (detectors at `run_all.py:376-405`):
  `retry+jitter → new NID jar → next identity tuple → next stacking path → cooldown → honest partial`.
- Exponential backoff with full jitter, per-identity cooldown, circuit breaker, hard budgets
  (per-branch wall clock, per-identity request count, global daily cap). Sequential branches with
  inter-branch jitter. **BYO proxies only** (D3).

### C5. Dedupe + accumulator + storage
- Dedupe already works (`seen` set, `run_all.py:432-455`). **Accumulator does not exist and
  current storage destroys volume:** `_write_reviews` points `latest.json` at the run set, so a
  later 120-review run supersedes an earlier 500.
- Design: cumulative per-branch store `data/users/{businessId}/branches/{branchId}/reviews/index.json`
  as `review_id → record` map + append-only delta shards; runs write deltas only; merge step
  produces cumulative. `latest.json` points at the **merge**. Keep atomic tmp+replace.
- Accumulator state: `{target, unique_collected, total_review_count, coverage_pct, per_path_yield,
  last_cursor, seen_bloom}` → enables resume across sessions (500 accrues over time).
- Convert `relative_date` → absolute date at parse time (`src/lib/gbp/format` exists). Salted
  `reviewer_hash` + display label instead of raw `reviewer_name` (D2). Keep `JSONLOG
  collection_progress` `progress:"N/M"` shape; add `branch_id`, `cumulative`, `coverage_pct`.
- Multi-branch: `run_all.py` takes one `--business`; add a Node branch queue (only one run today)
  reporting `branch i/N` + per-branch status.

### C6. Empty states are first-class
`NEED_OAUTH`, `UNRESOLVED_PLACE`, `BLOCKED`, `INSUFFICIENT (n/500, why)`, `NOT_VERIFIED`,
`QUOTA_EXCEEDED`. Extend `run_all.py` status model; mirror `run-screen.tsx:15-16` ("a scrape
failure must NEVER block navigation").

## 4. Legal / anti-bot risk register [part of (d)] — see MASTER_RISK_REGISTER.md additions

D1 scraping ToS · D2 stored PII (GDPR/CCPA) · D3 controller/processor (local-first = user is
controller; no vendor proxy/collection/telemetry) · D4 Places API ≤5 can't meet 500 · D5 GBP
allowlisting human gate · D6 account termination (avoid via NID, never use accounts) · D7
CAPTCHA/IP/decay (detectors + rotation; **no CAPTCHA-solving services**) · D8 selector drift ·
D9 500 unproven by 2 orders of magnitude · D10 storage overwrite destroys accumulation · D11 OSM
attribution/tile policy (fixed in Phase 1) · D12 CSP divergence (fixed in Phase 1) · D13 secrets
(server-side keys correct; OAuth → keychain; scrub live-looking `API_KEY` from `.env.example`).

## 5. Open decisions (block Phases 2-8) — RESOLVED (2026-08-16)

All four were decided at the recommended option; this unblocks Phases 2-8.

1. **Adopt GBP API as primary for own branches → YES.** Only legitimate 500 path; unblocks Phase 4.
2. **Ship competitor scraping → (a) OFF-BY-DEFAULT + disclosed.** Capability kept but never enabled
   silently; preserves local-first / user-is-controller posture (D1/D3). Unblocks Phases 5-8.
3. **BYO proxies only → CONFIRMED.** No vendor egress, no vendor-side collection/telemetry; user owns
   IP/proxy. Ruled into `harness/browser.py` as a hard boundary. Unblocks Phase 7.
4. **Reviewer names → pseudonymize by default** (salted hash + display label; raw name never
   persisted; retention TTL applies to the hash). Privacy-by-design (D2). Unblocks Phase 3.

Next step: Phase 3 (cumulative storage + accumulator, D10) and Phase 4 (Collector A OAuth/keychain)
are now design-ready and unblocked; Phase 4 additionally awaits the human GBP allowlisting gate (D5).

## 6. Phase plan + status

| Phase | Scope | Status |
|---|---|---|
| 0 — Unblock | GBP allowlisting; ratify provider; align CSP; OSM attribution | **CSP + attribution done (D11/D12); allowlisting pending user** |
| 1 — Onboarding gaps | `AddressAutocomplete` wiring; `mode=business/address`; short-link expansion; cache TTL/single-flight; `branch_kind`; `GoogleLinkStatus` (deferred) | **Executed (2026-08-16)** |
| 2 — Resolver bridge (F2) | T1→T4 OSM→Google; `gmaps_resolution` | **Executed (2026-08-16)** — `src/lib/gbp/resolve.ts` + `src/app/api/resolve-gmaps/route.ts` (T2, key-gated); wired into `onboarding.tsx` `submit`/`finish`; `PasteFromMapsParser` routes short links through server expansion |
| 3 — Storage + accumulator (D10) | cumulative store, delta, merge, resume, absolute dates, `reviewer_hash`, retention | Design ready |
| 4 — Collector A (own) | OAuth + keychain; `reviews.list` pagination; `batchGetReviews` | Design ready; needs allowlisting |
| 5 — Collector B baseline | remove `NEED_SESSION`; NID warm-up; target from config; re-measure parser | Design ready |
| 6 — Stacking S2/S3 | sort union; locale variants; per-path health | Design ready |
| 7 — Looping | identity tuples; BYO proxy; backoff; circuit breakers; budgets; branch queue | Design ready |
| 8 — S4/S5 (optional) | search entry; RPC replay (flagged) | Evidence-gated |

## 7. Files touched in Phase 1 (2026-08-16)
- `src/app/api/places/route.ts` — `mode`, POI merge, cache TTL + single-flight, short-link expansion.
- `src/lib/places.ts` — `mode` in `fetchPlaces`; `expandGmapsLink`; `getPlaceFromCoords`.
- `src/components/shell/onboarding.tsx` — `AddressAutocomplete` (step 2, HQ bias); `branch_kind`.
- `src/components/shell/AutocompleteInput.tsx` — `AddressAutocomplete` (already present; now wired).
- `src/components/shell/PlaceConfirmCard.tsx` — OSM attribution.
- `src/lib/gbp/types.ts` — `BranchConfig.branch_kind`.
- `next.config.ts` — dropped dead `connect-src *.openstreetmap.org`.
- `src-tauri/tauri.conf.json` — prod CSP now allows `*.tile.openstreetmap.org`/`*.openstreetmap.org`.
