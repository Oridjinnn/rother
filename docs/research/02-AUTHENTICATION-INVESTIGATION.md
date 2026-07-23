# Authentication Investigation — Experiment Plans

**Status:** DRAFT
**Date:** 2026-07-22
**Context:** B1 Live Verification proved that unauthenticated Google Maps serves a lightweight preview page that lacks review components. Authentication is required for the full Google Maps page with reviews. This document describes structured experiments to determine the most viable authentication approach.

---

## Problem Statement

The existing Playwright-based scraper navigates to a Google Maps URL and receives a lightweight preview page (`/maps/preview/log204` endpoint). The `reviews_tab_button` selector found 0/12 because the reviews tab does not exist on this page variant. All 5 parser tiers returned 0 reviews against live HTML.

**Root cause confirmed:** Authentication gating, not selector drift. The `review_container` selector is healthy (found 12/12, avg 9.3ms) but the container on the preview page has no review content.

---

## Experiment A: Cookie Injection from Authenticated Google Session

### Hypothesis
Injecting a valid Google Maps session cookie (harvested from a real browser) into the Playwright context will cause Google Maps to serve the full interactive page with reviews.

### Prerequisites
- A Google account with access to Google Maps
- A real (non-mock) Google Maps URL
- Ability to extract cookies from a headed browser session

### Experiment Design

#### A1: Cookie Harvesting Procedure

| Step | Action | Expected Result |
|---|---|---|
| 1 | Open Google Chrome (headed, not headless) | — |
| 2 | Navigate to a real Google Maps listing URL | Full listing page with reviews tab |
| 3 | Sign in to Google account if not already | Account avatar visible in top-right |
| 4 | Open DevTools → Application → Cookies → `google.com` | Cookie table shown |
| 5 | Extract the entire cookie jar — copy as JSON (Name, Value, Domain, Path, Secure, HttpOnly, SameSite) | Cookie JSON |
| 6 | Note the session-start timestamp | Reference for expiry measurement |

**Evidence to collect:** Cookie JSON, screenshot of successful authenticated page, timestamp.

#### A2: Cookie Injection Test

| Step | Action | Expected Result |
|---|---|---|
| 1 | Load cookies from A1 into Playwright context via `context.add_cookies(cookies)` | — |
| 2 | Navigate to the same Google Maps URL | Should see full page (not preview) |
| 3 | Wait for `reviews_tab_button` (`button[aria-label*='Reviews']`) | Should be found (not timeout) |
| 4 | If found, click and wait for review container, scroll, capture HTML | Reviews present in HTML |
| 5 | Parse captured HTML with all 5 parser tiers | Should extract reviews (Tier 1 preferred) |

**Success criteria:**

| Criterion | Pass | Fail |
|---|---|---|
| `reviews_tab_button` found on first attempt | ✓ | ✗ — cookie not sufficient, or page still preview |
| Reviews present in captured HTML (verify with `rg "data-review-id" page.html`) | ✓ | ✗ — cookie provides access but page has no reviews (unlikely) |
| At least 1 review parsed by Tier 1 `[data-review-id]` | ✓ — full pipeline confirmed working | ✗ — parser issue independent of authentication |
| page.png shows full listing (reviews tab visible) | ✓ | ✗ — screenshot shows preview or error |

#### A3: Cookie Expiry Measurement

| Step | Action | Expected Result |
|---|---|---|
| 1 | Inject freshly harvested cookies | Works (baseline) |
| 2 | Wait 1 hour, re-run with same cookies (do not harvest fresh ones) | Should still work |
| 3 | Wait 24 hours, re-run with same cookies | Unknown — may work or fail |
| 4 | Continue daily re-runs with the same cookies until failure | Determine expiry window |
| 5 | After expiry, harvest fresh cookies and re-run | Should work again |

**Success criteria:**

| Expiry Window | Assessment |
|---|---|
| < 1 hour | Cookie injection is not viable for daily runs |
| 1–24 hours | Daily cookie refresh needed (manual process) |
| 1–7 days | Weekly cookie refresh acceptable |
| 7–30 days | Cookie refresh is low maintenance |
| > 30 days | Cookie injection is a viable long-term approach |

**Fact:** Cookie expiry is unknown. This experiment must be executed to measure.

#### A4: Cookie Portability Test (Headless vs Headed)

**Hypothesis:** Cookies harvested from a headed Chrome session work in Playwright's headless Chromium.

| Step | Action | Expected Result |
|---|---|---|
| 1 | Harvest cookies from headed Chrome (with Google account signed in) | — |
| 2 | Launch Playwright headless Chromium (same config as production: `headless=True`, Fix A hardening) | — |
| 3 | Inject cookies and navigate to Google Maps | Should work — cookies are domain-scoped, not browser-scoped |
| 4 | If fails, try with `headless=False` | Determines whether headless detection is separate from cookie authentication |

**Known limitation:** Google may bind session tokens to browser fingerprint (TLS fingerprint, HTTP/2 settings, screen resolution). A mismatch between the harvesting browser and the Playwright browser could invalidate the session.

---

## Experiment B: Places API Viability Assessment

### Hypothesis
The Places API returns sufficient review data (ratings, top reviews) for the chosen monitoring use case, and the 5-review limit does not materially impact the system's ability to detect new negative reviews.

### Prerequisites
- A Google Cloud Platform project with Places API enabled
- A valid API key
- Real Google Maps place IDs for at least 2 competitors

### Experiment Design

#### B1: API Endpoint Verification

```python
import requests

url = "https://maps.googleapis.com/maps/api/place/details/json"
params = {
    "place_id": "ChIJ...",  # Real place ID
    "fields": "place_id,name,rating,reviews,user_ratings_total",
    "key": "YOUR_API_KEY"
}
response = requests.get(url, params=params)
data = response.json()
print(f"Rating: {data['result']['rating']} / {data['result']['user_ratings_total']} reviews")
print(f"Returned reviews: {len(data['result'].get('reviews', []))}")
for r in data['result'].get('reviews', []):
    print(f"  - {r['author_name']}: {r['rating']}★, {r.get('relative_time_description')}")
```

**Success criteria:**

| Criterion | Pass | Fail |
|---|---|---|
| API returns 200 status | ✓ | ✗ — API key or project setup issue |
| `reviews` array contains 1–5 entries | ✓ | ✗ — returns 0 for a known listing with reviews (unusual) |
| Review data includes rating, text, author, time | ✓ | ✗ — field selection issue |
| `place_id` in response matches request | ✓ | ✗ — place not found |

#### B2: 5-Review Adequacy Assessment

**Objective:** Determine whether the 5 most-relevant reviews from Places API are sufficient for detecting new negative reviews from competitors.

| Step | Action | Expected Result |
|---|---|---|
| 1 | Call Places API for 5+ competitor listings | 5 reviews each |
| 2 | Note the `time` field of the oldest API review | Establishes the recency window |
| 3 | Compare API reviews with actual listing (via manual browser inspection) | Determines whether API returns are representative |
| 4 | For each competitor, check how many new reviews appeared in the last 7 days | If a competitor gets >5 reviews/week, API will miss some |

**Assessment criteria:**

| Finding | Conclusion |
|---|---|
| API returns mostly old (pre-2026) reviews | API likely insufficient for fresh review detection |
| API returns reviews from the last 1–7 days | API may be sufficient depending on threshold |
| 0 reviews returned for a busy listing | API is insufficient (data gap) |
| API misses a negative review that appeared in the last 24h | API is insufficient for early warning |

#### B3: API Cost Projection at Current Scale

```python
# Per-day cost for 12 competitors, 1 request/day
requests_per_day = 12  # 1 per competitor
requests_per_month = 12 * 30  # = 360
cost_per_request = 0.017  # USD (Basic SKU)
monthly_cost = requests_per_month * cost_per_request
free_credit = 200
print(f"Monthly cost: ${monthly_cost:.3f} (covered by ${free_credit} free credit)")
```

**Fact:** $0/month at the current scale (12 competitors, daily checks). Cost only exceeds free credit at ~11,764 requests/month (~326 competitors @ 1/day).

---

## Experiment C: Proxy / Residential IP Assessment

### Hypothesis
If cookie injection is rejected on legal grounds and Places API is rejected on data-completeness grounds, a residential proxy network with unauthenticated Playwright may bypass the lightweight preview gate.

### Prerequisites
- Access to a residential proxy provider (BrightData, Oxylabs, Smartproxy, etc.)
- Budget for proxy testing (~$50–$100 for evaluation)

### Experiment Design

#### C1: Proxy Test

| Step | Action | Expected Result |
|---|---|---|
| 1 | Configure Playwright to route through a residential proxy | — |
| 2 | Navigate to a Google Maps URL without authentication | Unknown — may get full page or preview |
| 3 | Check which page variant is served (preview vs full) | Determines whether IP reputation affects page variant |
| 4 | If full page, run the full capture pipeline | Tests whether proxy alone is sufficient |

**Hypothesis:** The lightweight preview is served based on Google account authentication state, not IP reputation. If true, proxies will not help. If false (preview is served to suspicious IPs only), proxies could bypass without authentication.

#### C2: Cost Projection

| Provider | Approx. Cost/MB | Monthly Cost (12 comps, daily) |
|---|---|---|
| BrightData residential | $8.40/GB | ~$0.10–$0.50/month |
| Oxylabs residential | $12/GB | ~$0.15–$0.75/month |
| Smartproxy residential | $5.50/GB | ~$0.07–$0.35/month |

**Fact:** Bandwidth cost is negligible. The question is whether proxies provide any benefit over direct connections given the auth-gating behavior.

---

## Experiment D: Places API (New) Assessment

### Hypothesis
The Places API (New) may offer more reviews (up to 20) or better data quality for the monitoring use case compared to the legacy Places API.

### Prerequisites
- Same GCP project with Places API (New) enabled
- Valid API key

### Experiment Design

#### D1: API Endpoint Test

The Places API (New) uses a different endpoint:

```python
url = "https://places.googleapis.com/v1/places/PLACE_ID"
headers = {
    "X-Goog-Api-Key": "YOUR_API_KEY",
    "X-Goog-FieldMask": "id,displayName,rating,reviews,userRatingCount"
}
response = requests.get(url, headers=headers)
```

**Key difference:** Places API (New) supports `pageSize` parameter for reviews (max 20 per request) and `pageToken` for pagination.

**Success criteria:** Same as Experiment B1 + verify that pagination actually returns more than 5 reviews.

**Fact:** The Places API (New) documentation claims up to 20 reviews per page. This is a meaningful improvement over the legacy API's 5-review limit.

---

## Recommended Experiment Order

| Priority | Experiment | Rationale | Estimated Effort |
|---|---|---|---|
| **1** | **B1 — Places API endpoint verification** | Lowest risk, highest compliance. If API meets data needs, it's the best option. | 30 min |
| **2** | **B2 — 5-review adequacy assessment** | Determines whether Option A is viable. Critical for architecture decision. | 1 day |
| **3** | **A2 — Cookie injection test** | If API is insufficient, cookie injection is the next easiest experiment. Demonstrates whether authentication can work at all. | 2 hours |
| **4** | **D1 — Places API (New) test** | If legacy API 5-review limit is insufficient, test whether New API provides more. | 30 min |
| **5** | **A3 — Cookie expiry** | Only if A2 succeeds. Determines maintenance burden of cookie approach. | 1–4 weeks (ongoing) |
| **6** | **C1 — Proxy test** | Lowest priority. Unlikely to help if the gate is auth-based, not IP-based. | 2 hours (if proxy available) |

---

## Success Criteria for the Investigation

The investigation is complete when:

1. **At least one experiment** demonstrates a working data acquisition path (either Places API returns sufficient reviews, or cookie injection returns the full page).
2. **Cost and legal trade-offs** are quantified for the working approach.
3. **The recommended architecture** (from `03-ARCHITECTURE-DECISION.md`) references this empirical evidence.

---

## Risk Register for This Investigation

| Risk | Impact | Mitigation |
|---|---|---|
| Cookie injection experiment triggers Google account security verification | Account may be temporarily locked or flagged | Use a throwaway Google account (not the client's real account) |
| All experiments fail — no viable data acquisition path emerges | The project cannot enter production | Broaden investigation to third-party review data sources, or engage client on acceptable paid alternatives |
| Places API data quality is insufficient | Decision deferred until experiments completed | No mitigation needed — this is the purpose of the investigation |
| Cookie expires during A4 headless test, giving false negative | Wrong conclusion that cookies don't work in headless | Re-harvest cookies immediately before each A4 re-run; log expiry timing |

---

## References

- B1 Live Verification report: `gbp-monitor/data/verify/20260722T130734Z/report.json`
- Selector report: `gbp-monitor/data/verify/20260722T130734Z/selector_report.json`
- AUDIT-01: Architecture audit
- EXECUTION_RULES.md: Rule 3 (verify, don't assume), Rule 5 (no fake progress)
- Google Places API documentation: https://developers.google.com/maps/documentation/places/web-service/overview
- Google Places API (New) documentation: https://developers.google.com/maps/documentation/places/web-service/op-overview
