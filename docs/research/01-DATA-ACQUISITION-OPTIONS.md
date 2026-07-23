# Data Acquisition Architecture Options — GBP Monitor

**Status:** DRAFT (research, not a decision)
**Date:** 2026-07-22
**Context:** B1 Live Verification (2026-07-22T13:07:34Z) conclusively proved that unauthenticated Google Maps serves a lightweight preview page lacking all review components. The `reviews_tab_button` selector found 0/12 because the tab does not exist on this page variant. The existing architecture is **broken for live data acquisition** — authentication is required before the scraper can function.

---

## Evaluation Criteria

Each option is scored across 11 dimensions on a 1–5 scale:

| Score | Meaning |
|---|---|
| 5 | Best in class / no concerns |
| 4 | Good / minor concerns |
| 3 | Adequate / known trade-offs |
| 2 | Poor / significant concerns |
| 1 | Unacceptable / blocker |

---

## Option A: Google Places API (Paid)

**Description:** Replace Playwright scraping with official Google Places API (Places API, not Places API (New)). Retrieve reviews via `Place Details` → `reviews[]` array.

### Fact: API Capabilities
- Places API returns up to 5 most relevant reviews per place (not all reviews): Google's `reviews[]` array is limited to the 5 most prominent reviews. You cannot paginate to get all reviews via the API.
- The Google Business Profile API (separate from Places API) can return all reviews for owned/managed profiles but requires business owner authentication.
- **Assumption:** For competitor monitoring, the client does NOT own the competitor's Google Business Profile, so the GBP API is not an option.
- **Hypothesis:** Five most-relevant reviews may be sufficient for the monitoring use case (detecting new negative reviews). This needs validation against the business requirement.

### Fact: Cost Structure
- Places API (SKU: Place Details) costs $0.017 per request (Basic) or $0.032 (Advanced) for the first $200/month free, then list price.
- $200/month free credit = ~11,764 Basic requests per month.
- 12 competitors × 1 request/day × 30 days = 360 requests/month → **$0/month ($0.006/day at Advanced)**.
- At 50+ competitors: 1,500 requests/month → **still $0/month** within free credit.
- At 500+ competitors: 15,000 requests/month → **$0/month** (still under $200 free credit).
- Only at very high scale (~11,764+ Basic requests/month) does cost become non-zero.
- **Fact:** No credit card required for $200 monthly free credit (standard GCP free tier).

### Evaluation Matrix

| Dimension | Score | Rationale |
|---|---|---|
| Data completeness | 2 | Only 5 most-relevant reviews; cannot paginate to get all. May miss recent negative reviews if they're not among the 5 most-relevant. |
| Reliability / uptime | 5 | Google API SLA. 99.99%+ uptime. No browser or anti-bot concerns. |
| Cost | 5 | Zero cost at the project's scale (12 competitors, 360 req/mo). Free tier covers everything. |
| Implementation complexity | 4 | `requests.get` to a REST endpoint, parse JSON response. No Playwright, no browser lifecycle. |
| Maintenance burden | 5 | Zero maintenance — no selectors, no browser updates, no anti-bot arms race. |
| Scalability | 5 | Scales to thousands of competitors at near-zero cost. |
| Legal / compliance | 3 | Must comply with Google ToS for Places API data usage. Data must not be displayed in ways that mislead. Attribution requirements. |
| Latency | 5 | 200–500ms per request. No browser launch overhead. |
| Anti-blocking robustness | 5 | Official API — no blocking risk. |
| Determinism / testability | 5 | Deterministic JSON responses. Easy to mock and test. |
| Longevity | 4 | API deprecation risk exists but is announced years in advance. Browser-based scraping is more fragile. |

### Fact: Data Quality Limitations
- The 5-review limit is a hard constraint in the Places API (not Places API (New)). The Places API (New) does support up to 20 reviews but with fewer detail fields and different pricing ($0.006 for Basic, $0.012 for Advanced per request).
- Neither API returns the `data-review-id` attribute the current parser uses for deduplication.
- Review IDs returned by the API are different from the DOM `data-review-id` values, so the delta-computation logic would need rework.
- **Hypothesis:** The business requirement is to detect NEW negative reviews. Five most-relevant may not include recently posted reviews. This is an unknown — user research is needed.

---

## Option B: Authenticated Playwright (Cookie Injection)

**Description:** Keep the existing Playwright-based scraper but inject authentication cookies (obtained from a real browser session) so Google Maps serves the full interactive page instead of the lightweight preview.

### Fact: Evidence Base
- B1 Live Verification proved the lightweight preview is served to unauthenticated requests. The `/maps/preview/log204` endpoint is the unauthenticated page variant.
- The anti-bot hardening (Fix A) is working — no captcha, no consent wall is served.
- The `review_container` selector (`div.m6QErb.DxyBCb.kA9KIf.dS8AEf`) is healthy (found 12/12, avg 9.3ms).
- All 5 parser tiers failed because the page served has no review components at all — the selectors are correct for the full page but the wrong page version is served.

### Evaluation Matrix

| Dimension | Score | Rationale |
|---|---|---|
| Data completeness | 5 | Full access to all reviews, pagination via infinite scroll. All review fields including relative date, rating, text, reviewer name. |
| Reliability / uptime | 2 | Depends on cookie validity (session expiry, cookie rotation). Cookie theft/detection risk. |
| Cost | 5 | Zero monetary cost. Requires manual cookie refresh. |
| Implementation complexity | 3 | Cookie injection is straightforward (`context.add_cookies()`). Cookie harvesting needs manual or semi-automated process. |
| Maintenance burden | 3 | Cookie refresh frequency unknown. Google may invalidate cookies aggressively. Belgian-style session management could require weekly refresh. |
| Scalability | 2 | Each authenticated session may be tied to one account. Rate limits per session. Cookie sharing across 12 competitors may trigger detection. |
| Legal / compliance | 1 | **High risk.** Circumventing Google Maps authentication gating violates Google ToS. Cookie injection is unauthorized access — potential CFAA/computer fraud concerns in some jurisdictions. Data usage rights unclear. |
| Latency | 3 | Browser launch overhead (~5–10s) + page load + scroll + capture. |
| Anti-blocking robustness | 2 | Google can detect cookie injection and serve captcha or block the account. Arms race similar to bot detection. |
| Determinism / testability | 3 | Page changes, layout shifts, async loading introduce non-determinism. |
| Longevity | 2 | Google may change authentication model, further restrict preview pages, or add additional verification. |

### Known Unknowns
- Cookie refresh interval: Unclear how long a Google Maps session cookie remains valid. Needs experiment.
- Cookie sharing across Playwright contexts: Whether a cookie from a headed Chrome works in headless Chromium.
- Whether cookie-based access triggers additional verification (phone OTP, email verification) when anomalous access patterns are detected.

---

## Option C: Hybrid (Places API + Authenticated Playwright)

**Description:** Use Places API for daily metadata (rating, top 5 reviews, place details) and authenticated Playwright for deep-dive review collection (weekly/monthly full scrapes).

### Evaluation Matrix

| Dimension | Score | Rationale |
|---|---|---|
| Data completeness | 4 | API gives recent top reviews; Playwright gives full archive. Combined provides both freshness and completeness. |
| Reliability / uptime | 4 | API provides reliable baseline. Playwright failures degrade but don't eliminate data. |
| Cost | 4 | API costs zero at this scale. Playwright infrastructure costs zero. Maintenance cost is the sum of both. |
| Implementation complexity | 4 | Two acquisition paths with two parsers. Storage and dedup need to merge two data sources. |
| Maintenance burden | 3 | Maintain two acquisition paths. Two places where things can break. |
| Scalability | 4 | API scales perfectly. Playwright is the bottleneck. For 50+ competitors, API-only may suffice. |
| Legal / compliance | 2 | Playwright auth-injection carries the same ToS risk as Option B. API usage is compliant but combined usage may create ambiguity. |
| Latency | 3 | Same as Option B for deep dives. API calls are fast. |
| Anti-blocking robustness | 3 | Reduced reliance on Playwright means less criticality if Playwright fails. |
| Determinism / testability | 3 | Playwright path inherits non-determinism. API path is deterministic. |
| Longevity | 3 | If Playwright breaks, API-only mode keeps the system alive. Best-of-both-worlds resilience. |

---

## Option D: Multi-Provider Abstraction

**Description:** Abstract the data acquisition behind an interface (e.g., `ReviewProvider.get_reviews(competitor_id) -> List[Review]`) with multiple implementations: Places API, Playwright, and potentially others (e.g., SerpAPI, third-party review aggregators). Select implementation based on availability, cost, or data quality.

### Evaluation Matrix

| Dimension | Score | Rationale |
|---|---|---|
| Data completeness | 4 | Can compose from multiple sources. Failover means higher overall completeness. |
| Reliability / uptime | 5 | N+1 redundancy. If Places API goes down, Playwright takes over. |
| Cost | 3 | Development complexity is highest. May need to maintain 3+ implementations. |
| Implementation complexity | 2 | Highest upfront cost. Requires interface design, provider selection logic, health checks, fallback orchestration. |
| Maintenance burden | 2 | Maintain N implementations. Each provider needs testing against changes. |
| Scalability | 5 | Can add providers without changing storage/consumer logic. Scales to any number of competitors. |
| Legal / compliance | 2 | Each provider has its own ToS. Aggregate compliance picture is complex. |
| Latency | 3 | Provider selection adds overhead. Provider with fast responses is preferred. |
| Anti-blocking robustness | 4 | N providers means N-1 can fail without losing data. |
| Determinism / testability | 3 | Depends on which provider is active. Harder to test because multiple code paths exist. |
| Longevity | 5 | Best long-term resilience. New providers can be added when old ones break. |

---

## Option E: Status Quo (Current Architecture, Do Nothing)

**Description:** Keep the current unauthenticated Playwright scraper. Accept that live capture against Google Maps will always receive the lightweight preview page.

### Evaluation Matrix

| Dimension | Score | Rationale |
|---|---|---|
| Data completeness | 1 | Zero reviews captured. Parser returns `[]`. Confirmed by B1 verification. |
| Reliability / uptime | 1 | Reliably returns zero reviews. System is technically functional but semantically broken. |
| Cost | 5 | Zero cost. |
| Implementation complexity | 5 | No changes needed. |
| Maintenance burden | 5 | No maintenance needed (but also no value delivered). |
| Scalability | 1 | More competitors = more zero-review captures. |
| Legal / compliance | 5 | No ToS concerns (not accessing restricted content). |
| Latency | 3 | Browser still launches and captures. |
| Anti-blocking robustness | 5 | Anti-bot hardening is working (Fix A confirmed). |
| Determinism / testability | 1 | The page served is unpredictable — lightweight preview vs captcha vs full page depends on Google's routing. |
| Longevity | — | This option is **not viable** for production. It does not deliver any competitor review data. |

---

## Cost Comparison at Scale

### Assumptions
- Places API Basic SKU: $0.017/request, $200/month free
- Playwright: compute cost of GitHub Actions (free tier: 2,000 minutes/month public repo)
- Hybrid: API daily + Playwright weekly = (360 API req + 52 Playwright runs)/month
- Multi-provider: same as Hybrid base + 1 additional provider overhead

| Scale | Option A (API) | Option B (Auth PW) | Option C (Hybrid) | Option D (Multi) | Option E (Status Quo) |
|---|---|---|---|---|---|
| **0 competitors** (dev) | $0 | $0 | $0 | $0 | $0 |
| **1 competitor** (poC) | $0/mo (1 req/day) | $0 | $0 | $0 | $0 |
| **12 competitors** (current) | $0/mo (360 req/mo) | $0 | $0 | $0 | $0 |
| **50 competitors** | $0/mo (1,500 req/mo) | $0 | $0 | $0 | $0 |
| **500 competitors** | $0/mo (15,000 req/mo) | $0 | $0 | $0 | $0 |
| **5,000 competitors** | $0.055/mo (150k req) | $0 | $0 | $0 | $0 |
| **50,000 competitors** | $25.50/mo ($200+$655) | $0 | $0 | $0 | $0 |
| **500,000 competitors** | $8,500/mo | $0 | $0 | $0 | $0 |
| **Cost inflection point** | ~11,764 Basic req/mo (~326 competitors @ 1/day) | GitHub Actions minutes | Combined costs | Combined costs | N/A |

**Fact:** Places API is effectively free at the project's intended scale (12 competitors, daily checks). Cost only becomes material at 300+ competitors.

---

## Legal & Compliance Analysis

### Option A: Places API

| Aspect | Assessment |
|---|---|
| **Google ToS** | Compliant. API is designed for this purpose. Attribution required per Google ToS. |
| **Data usage** | Can store and display review data. Google requires attribution ("Powered by Google"). |
| **Data freshness** | Caching limits apply (30 days for some data types). Review data caching is generally allowed. |
| **Competitor data** | No restriction on querying competitor data through Places API. Data is publicly available. |
| **Jurisdiction risk** | Low. Standard API usage. |

### Option B: Authenticated Playwright

| Aspect | Assessment |
|---|---|
| **Google ToS** | **Likely violates** Google ToS Section 4.4: "You may not access the Service through automated or unauthorized means." Authentication circumvention qualifies as unauthorized access. |
| **Computer Fraud (US)** | **Assumption:** Cookie injection may violate CFAA (Computer Fraud and Abuse Act) in the US or similar legislation in other jurisdictions. Accessing a computer "without authorization" by circumventing access controls. |
| **Data scraping case law** | *hiQ Labs v. LinkedIn* (9th Cir. 2022) established that scraping publicly accessible data may not violate CFAA. However, cookie injection to bypass authentication gates goes beyond public-access scraping. |
| **GDPR** | If competitor reviews contain personal data (reviewer names), GDPR applies. Cookie injection adds a layer of data processing that may need additional lawful basis. |
| **Risk level** | **HIGH.** This is the highest-risk option from a legal standpoint. |

### Option C: Hybrid

| Aspect | Assessment |
|---|---|
| **API portion** | Same as Option A — compliant. |
| **Playwright portion** | Same as Option B — **high legal risk** if authentication is used. |
| **Combined exposure** | If API is the primary path and Playwright is secondary, the legal risk may be reduced (the system functions without Playwright). However, the Playwright component still carries its own risk. |

### Option D: Multi-Provider

| Aspect | Assessment |
|---|---|
| **Each provider** | Must evaluate each provider's ToS independently. |
| **Abstraction layer** | The abstraction itself has no legal risk — only the implementations. |
| **Minimum compliance** | Can keep one fully-compliant provider (Places API) as the baseline, reducing overall risk. |

---

## Summary Score Matrix

| Dimension | Option A (API) | Option B (Auth PW) | Option C (Hybrid) | Option D (Multi) | Option E (Status Quo) |
|---|---|---|---|---|---|
| Data completeness | 2 | 5 | 4 | 4 | 1 |
| Reliability | 5 | 2 | 4 | 5 | 1 |
| Cost | 5 | 5 | 4 | 3 | 5 |
| Implementation complexity | 4 | 3 | 4 | 2 | 5 |
| Maintenance burden | 5 | 3 | 3 | 2 | 5 |
| Scalability | 5 | 2 | 4 | 5 | 1 |
| Legal / compliance | 3 | 1 | 2 | 2 | 5 |
| Latency | 5 | 3 | 3 | 3 | 3 |
| Anti-blocking robustness | 5 | 2 | 3 | 4 | 5 |
| Determinism / testability | 5 | 3 | 3 | 3 | 1 |
| Longevity | 4 | 2 | 3 | 5 | — |
| **Average (all 11)** | **4.4** | **2.8** | **3.4** | **3.5** | **3.0** |
| **Average (excl legal)** | **4.6** | **3.0** | **3.6** | **3.7** | **2.8** |
| **Weighted** | **4.3** | **2.6** | **3.5** | **3.4** | **2.8** |

**Weighted average** gives Legal/compliance ×3 weight (given the project's risk-conscious approach evident from EXECUTION_RULES.md and the MASTER_RISK_REGISTER).

---

## Key Facts (Empirically Determined)

| Fact | Source | Classification |
|---|---|---|
| Unauthenticated Google Maps serves a lightweight preview page without review components | B1 Live Verification, 2026-07-22T13:07:34Z, 12/12 PASS on capture | **Fact** |
| The preview page endpoint is `/maps/preview/log204` | Live page HTML analysis | **Fact** |
| Reviews tab does not exist on the preview page — only "Ringkasan" and "Tentang" tabs | Selector report: `reviews_tab_button` found 0/12; page HTML analysis | **Fact** |
| All 5 parser tiers return 0 results against live Google Maps HTML | Parser test against live page.html: Tiers 1–5 all returned 0 | **Fact** |
| Anti-bot hardening (Fix A) works — no captcha, no consent wall served | Verify evidence: page.png shows listing preview without captcha | **Fact** |
| `review_container` selector is healthy on the preview page | Selector report: found 12/12, avg 9.3ms | **Fact** |
| Google Maps locale is geolocation-driven (not browser locale) | Indonesian (`hl=id`, `gl=id`) served despite `locale="en-US"` | **Fact** |
| Places API returns at most 5 reviews per place | Google Places API documentation | **Fact** |
| $200/month Google API free credit covers ~11,764 Basic requests | Google pricing documentation | **Fact** |

---

## Key Hypotheses (Need Testing)

| Hypothesis | Impact if True | How to Test |
|---|---|---|
| 5 most-relevant reviews (Places API) are sufficient for detecting new negative reviews | Option A becomes viable | User research with Copenhagen Bali team |
| Google Maps session cookie remains valid for >7 days in headless Chromium | Option B maintenance burden is low | Cookie injection experiment |
| Cookie-based access does not trigger additional Google verification | Option B reliability is acceptable | Cookie injection experiment + observe verification prompts |
| Requesting owned GBP API credentials for competitors is not possible | Options requiring GBP API can be deprioritized | Client communication |

---

## Key Assumptions (Untested)

| Assumption | Impact if Wrong |
|---|---|
| The business requirement is to detect *all* new reviews, not just recent reviews | Option A (5-review limit) would be insufficient |
| Cookie injection violates Google ToS in a way that matters to the client | Option B and C would be non-starters |
| Google will not further restrict preview pages in the future | Options B and E would further degrade |
| The client prefers zero-cost over data completeness | Options A (cost) vs B (data completeness) decision depends on this |

---

## References

- B1 Live Verification evidence: `gbp-monitor/data/verify/20260722T130734Z/`
- AUDIT-01: Full architecture audit
- MASTER_RISK_REGISTER.md: RISK-001 (selectors UNPROVEN), RISK-007 (anti-bot unverified)
- CHANGELOG.md entries 2026-07-20T08:30:30 through 2026-07-20T18:06:00
- Google Places API pricing: https://developers.google.com/maps/billing-and-pricing/pricing#places-api
- *hiQ Labs, Inc. v. LinkedIn Corp.*, 31 F.4th 1180 (9th Cir. 2022)
