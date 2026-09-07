# M7 — FULL Variant Acquisition

> Milestone: M7 — FULL Variant Acquisition
> Status: **PROVEN — a browser-side fix measurably improves FULL acquisition.**
> Governing rules: `EXECUTION_RULES.md` Rule 1 (tested/retested/verified),
> Rule 3 (no fabricated claims). One focused objective: increase the
> probability of consistently receiving the FULL Google Maps page.

## 1. Objective

Obtain FULL pages reliably. Prior milestones proved the bottleneck is
acquisition (server-side variant decision), not page understanding. This
milestone isolated a **reproducible, browser-side lever** that flips the
variant from REDUCED to FULL.

## 2. Finding

**A valid Google `NID` cookie (logged-out identity/entitlement token) is
necessary and sufficient for Google to serve the FULL variant** for Crate Cafe
Canggu (`ChIJOaEQDnk40i0Rzhou4NcRx-w`).

- Direct anonymous navigation (no NID) → **REDUCED 3/3** (+1 timeout of 4 runs).
- Visit a **Google domain first** (google.com or /search) then Maps → the
  warm-up issues `NID` into the context jar → **FULL 5/5**.
- Visit a **non-Google domain** first (bing.com) then Maps → still **REDUCED**
  (no NID issued) — confirms it is the Google-issued cookie, not "any prior nav".
- **Reuse a saved cookie jar** (containing NID) with a fresh browser + DIRECT
  navigation (no warm-up) → **FULL**.
- **NID cookie alone** (only that one cookie seeded, direct nav) → **FULL 3/3**.
- **All other Google cookies but no NID** (AEC + SEARCH_SAMESITE + __Secure-STRP)
  → **REDUCED 3/3**.
- **AEC alone** → REDUCED 2/2. **No cookies** → REDUCED 2/2.

## 3. Ranked hypotheses

| Rank | Hypothesis | Evidence | Confidence | Reproducibility |
|------|-----------|----------|-----------|-----------------|
| 1 | Variant is keyed on the browser carrying a valid `NID` cookie | `NID` alone → FULL 3/3; no-`NID` (other cookies) → REDUCED 3/3; AEC alone → REDUCED 2/2 | **High** (clean single-variable isolation, both directions) | Reproducible; multiple jars/NID values all FULL |
| 2 | Google-domain warm-up produces FULL because it issues `NID` | google.com /search warm-up → FULL 4/4 + homepage 1/1; bing.com → REDUCED | High (consistent; mechanism confirmed by cookie-reuse test) | Reproducible |
| 3 | Direct anonymous navigation is served REDUCED (the soft-block state) | baseline → REDUCED 3/3 + 1 timeout | High for tested window | Reproducible on this IP anonymously |
| 4 | Other browser-context factors change the variant | M7 matrix: 13 variables all REDUCED (but all anonymous/no-NID) | Medium | Not a discriminator; superseded by #1 |
| 5 | Logged-in account required for FULL | NID is a logged-OUT token; FULL achieved anonymously with NID | Low (contradicted) | n/a |
| 6 | Time-of-day / cooldown determines FULL | longhaul all REDUCED while anonymous; NID-keyed FULL immediate | Low | Not tested as independent variable |

Full data: `data/m7_acquisition/ranked_hypotheses.json`.

## 4. Experimental results

All under `data/m7_acquisition/` (recipe.json = browser metadata + DOM snapshot
+ page.html + page.png per run).

| Recipe / subset | Runs | FULL | REDUCED | FAIL |
|-----------------|------|------|---------|------|
| Direct anonymous navigation | 4 | 0 | 3 | 1 (timeout) |
| Google warm-up → Maps (search) | 4 | 4 | 0 | 0 |
| Google homepage → Maps | 1 | 1 | 0 | 0 |
| Bing warm-up → Maps | 1 | 0 | 1 | 0 |
| Saved jar reuse → direct Maps | 1 | 1 | 0 | 0 |
| NID cookie only | 3 | 3 | 0 | 0 |
| No NID (AEC+SEARCH_SAMESITE+STRP) | 3 | 0 | 3 | 0 |
| AEC only | 2 | 0 | 2 | 0 |
| No cookies | 2 | 0 | 2 | 0 |

Browser metadata captured: UA (Chrome 124, hardened), viewport 1366×768,
locale en-US, sec-ch-ua client hints, request headers, cookie jar, DOM
(unique_ids / tabs / jftiEf / raw_attr), final URL. Screenshots + HTML saved
per run.

## 5. Final recommendation — exactly ONE configuration

> **Context MUST carry a valid Google `NID` cookie before the Maps navigation.**

- **How to obtain it:** one-time warm-up — navigate a hardened context
  (production UA/headers/viewport) to `https://www.google.com/` (or
  `/search`), wait ~2–3 s for `NID` to be issued, then persist the
  `storage_state`. Reuse that storage_state on every subsequent Maps run.
- **Why:** `NID` is the single discriminating signal. Anonymous direct →
  REDUCED 3/3+1 timeout; with `NID` → FULL 3/3 subset, 5/5 warm-up, 1/1 reuse.
- **Expected effect:** raises FULL probability from ~0% (anonymous) to ~100%
  (NID present) in the tested window.
- **Practical note:** `NID` is HttpOnly, SameSite=None, Secure, `.google.com`,
  ~6-month expiry. Persisted-jar reuse is the lightweight path; a fresh
  warm-up each run is the most robust against rotation/staleness.

## 6. Smallest next experiment if the fix fails

This milestone produced a working browser-side fix, so no scope expansion is
required now. If `NID` reuse ever stops producing FULL, the smallest next
experiment is to determine the `NID` freshness/rotation window (does a `NID`
issued >N hours ago still unlock FULL?), then test a second (residential) IP
to confirm the gate is cookie-keyed rather than IP-keyed.

## 7. Confidence

- **NID necessary + sufficient: High** — clean single-variable A/B, both
  directions, across independent `NID` values, with full per-run artifacts.
- **Warm-up mechanism: High** — cookie-diff shows warm-up adds AEC+NID; reuse
  test proves nav itself is irrelevant.
- The effect was measured on one IP, one listing, one near-midday window
  (2026-08-04 ~04:29–04:45 UTC). Cross-IP, cross-listing, and NID-rotation
  generalization remain for follow-up — but the fix itself is reproducible.