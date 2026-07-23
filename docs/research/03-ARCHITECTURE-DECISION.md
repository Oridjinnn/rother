# Architecture Decision Record: Data Acquisition Strategy for GBP Monitor

**Status:** DRAFT — pending experiment results from `02-AUTHENTICATION-INVESTIGATION.md`
**Date:** 2026-07-22

---

## Context

The GBP Monitor scraper uses headless Playwright to scrape Google Maps reviews from competitor listings. B1 Live Verification (2026-07-22T13:07:34Z) conclusively proved that **unauthenticated Google Maps serves a lightweight preview page without review components**. The existing architecture is broken for live data acquisition.

This ADR evaluates four candidate architectures and recommends a path forward, referencing empirical evidence from live verification and risk registers.

---

## Problem Statement

The current scraper:
1. Navigates to a Google Maps URL via unauthenticated Playwright
2. Receives a lightweight preview page (`/maps/preview/log204`) lacking reviews
3. Cannot find the reviews tab (`reviews_tab_button` found 0/12)
4. All 5 parser tiers return 0 reviews against live HTML
5. Produces empty snapshots that overwrite any prior data (RISK-003)

The system is **semantically broken** — it runs without errors but produces zero-value output.

---

## Candidate Options (from 01-DATA-ACQUISITION-OPTIONS.md)

| Option | Description | Avg Score (weighted) | Legal Risk |
|---|---|---|---|
| **A: Places API** | Replace scraping with official Google Places API | **4.3/5** | Low |
| **B: Auth Playwright** | Cookie injection into existing scraper | 2.6/5 | High |
| **C: Hybrid** | API daily + Playwright weekly deep dives | 3.5/5 | Medium |
| **D: Multi-Provider** | Abstracted interface with N providers | 3.4/5 | Medium |
| E: Status Quo | Keep current architecture | 2.8/5 | None |

---

## Recommendation

### Primary Recommendation: Option A (Places API) — Conditionally

**Condition:** Places API returns sufficient review data for the monitoring use case. Specifically, the 5 most-relevant reviews (legacy API) or up to 20 reviews (New API) must be adequate for detecting new negative competitor reviews.

**If condition is met:**

| Aspect | Detail |
|---|---|
| **Data path** | `requests.get(Places API)` → JSON → `Review` dataclass → existing storage/delta pipeline |
| **Playwright dependency** | Eliminated entirely for data acquisition |
| **Parser** | Replace `parsel`-based HTML parser with JSON-to-`Review` conversion |
| **Selectors** | Entire `selectors.json` becomes unnecessary for production (preserved for fixture testing) |
| **Fixture strategy** | Existing HTML fixtures repurposed as regression anchors; add API mock fixtures |
| **Cost** | $0/month at current scale (360 requests/month, $200 free credit) |
| **Legal** | Compliant with Google ToS |

### Secondary Recommendation: Option C (Hybrid) — Fallback

**If** Places API data is insufficient (5 reviews miss too many new posts), **then** adopt Hybrid:

| Aspect | Detail |
|---|---|
| **Primary data path** | Places API for daily rating snapshots, top reviews |
| **Secondary data path** | Authenticated Playwright for weekly full-archive deep dives |
| **Legal posture** | Minimize auth-Playwright usage to reduce legal exposure |
| **Cookie refresh** | Manual, weekly — if expiry window permits (needs Experiment A3) |

---

## Rationale

### Why Not Option B (Auth Playwright only)?

1. **Legal risk is unacceptable** for a production system. Cookie injection to bypass authentication gates likely violates Google ToS and may raise computer-fraud concerns in some jurisdictions. The weighted score (2.6/5) reflects this.
2. **Cookie maintenance burden** is unknown but potentially high. If cookies expire daily, the system requires daily manual intervention.
3. **The anti-bot arms race continues** — even with valid cookies, Google can detect automation patterns and require additional verification.
4. **No data quality advantage** over API for the core use case (if API meets the need).

### Why Not Option D (Multi-Provider)?

1. **Premature abstraction.** Building a multi-provider abstraction before any single provider is proven working adds complexity without validated benefit.
2. **Maintenance burden is highest** (score: 2/5).
3. **Revisit** if the primary provider fails or if requirements demand redundancy.

### Why Not Option E (Status Quo)?

The status quo does not deliver review data. It is not a viable option for production.

### Why Option A is Preferred

1. **Simplest implementation** — a REST API call replaces an entire browser automation pipeline.
2. **Lowest maintenance** — no selectors, no browser updates, no cookie refresh.
3. **Zero cost** at the project's scale.
4. **Highest reliability** — 99.99%+ API SLA vs flaky browser automation.
5. **Compliant** — official API usage with appropriate attribution.
6. **Fast** — 200–500ms per request vs 30–60s per Playwright capture.

---

## Consequences

### Positive

- Eliminates the core risk (RISK-001: selectors UNPROVEN) entirely — no selectors needed
- Eliminates RISK-007 (anti-bot hardening unverified) — no browser needed
- Reduces maintenance burden to near-zero for the acquisition layer
- Enables deterministic, mockable tests
- Speeds up captures from ~30s to <1s per competitor
- Frees GitHub Actions minutes for other work

### Negative

- **Data completeness reduction** — API returns at most 5 (legacy) or 20 (New) reviews per place. If the monitoring requirement is "detect every new review", this may be insufficient.
- **Schema rework needed** — API review IDs differ from DOM `data-review-id`. Delta computation logic in `storage/delta.py` needs updating.
- **Parser module rework** — `parser/review_parser.py` currently takes HTML and returns `Review` objects. With API, it takes JSON. Two code paths needed.
- **Places API dependency** — introduces external dependency. API deprecation or pricing changes could affect the system.
- **Loss of visual evidence** — API JSON doesn't provide screenshots. The verify mode (`--verify`) would need adaptation to maintain visual verification capability.

### Neutral

- **Fixture strategy unchanged** — existing HTML fixtures remain for parser regression testing. API mock fixtures can be added alongside.
- **Dashboard unchanged** — the data format consumed by the dashboard does not change (same `Review` schema).
- **CHANGELOG and documentation** need updates, but this is procedural.

---

## Implementation Guidance (If Option A is Selected)

### Phase 1: API Integration (Estimated: 2–3 days)

1. **Enable Places API** in the GCP project. Generate API key.
2. **Create `api_places/client.py`** — Places API client with `get_place_details(place_id: str, fields: List[str]) -> dict`.
3. **Create `api_places/review_converter.py`** — Convert Places API JSON to `Review` dataclass instances. Handle review ID mapping (API `time` field can serve as review identifier).
4. **Update `orchestration/run_all.py`** — Add API mode alongside existing Playwright mode. Default to API mode.
5. **Update `storage/delta.py`** — Ensure delta computation works with API-style review IDs.
6. **Test** against 2–3 real Google Maps place IDs.

### Phase 2: Deprecate Playwright Acquisition

1. **Set Playwright mode as fallback/legacy** — gated behind `--use-playwright` flag.
2. **Update `--verify` mode** — API mode doesn't need screenshots. Adapt or deprecate verify mode.
3. **Clean up dependencies** — Playwright and parsel can remain as development dependencies for fixture testing.
4. **Update `config/selectors.json`** — Mark as fixture-only.
5. **Remove selectors from production critical path** — all parser selectors become fixture-verification-only.

### Phase 3: Documentation & Testing

1. **Update `README.md`** — Document API key setup, Places API config.
2. **Update `CHANGELOG.md`** — Record the architecture change.
3. **Add API mock fixtures** — JSON fixtures for deterministic parser testing.
4. **Update MASTER_RISK_REGISTER.md** — Close RISK-001, RISK-007, update RISK-003.

### Non-Goals (Future)

- Multi-provider abstraction (revisit if API is insufficient)
- Authenticated Playwright (revisit only if API is insufficient AND legal guidance permits)
- Broker / aggregator API integration (future scope, not recommended now)

---

## Remaining Unknowns (Pre-Decision)

These must be resolved before the recommendation becomes a formal decision:

| Unknown | Resolved By | Status |
|---|---|---|
| Is the 5-review API limit sufficient for detecting new negative reviews? | Experiment B2 (user research + API snapshot comparison) | **Pending** |
| Does Places API (New) provide >5 reviews? | Experiment D1 | **Not started** |
| What is the client's risk tolerance for legal/compliance? | Client conversation | **Not started** |
| Does the client have existing GCP billing setup? | Client conversation | **Not started** |

---

## Timeline

| Step | Responsible | Deadline |
|---|---|---|
| Complete Experiments B1, B2, D1 | Engineering | 2026-07-29 |
| Client conversation: API budget, legal risk tolerance | Product/Client | 2026-08-05 |
| Formal decision recorded (update this ADR) | Engineering | 2026-08-07 |
| If Option A selected: Phase 1 implementation | Engineering | 2026-08-14 |
| If Option A selected: Phase 2 (Playwright deprecation) | Engineering | 2026-08-21 |

---

## References

- **B1 Live Verification:** `gbp-monitor/data/verify/20260722T130734Z/` — 12/12 PASS on capture, 0 reviews extracted
- **Selector report:** `review_container` healthy (12/12), `reviews_tab_button` broken (0/12), all parser selectors unevaluated (0 review items found)
- **01-DATA-ACQUISITION-OPTIONS.md:** Full comparison matrix, cost tables, legal analysis
- **02-AUTHENTICATION-INVESTIGATION.md:** Experiment plans for cookie injection, Places API, proxies
- **MASTER_RISK_REGISTER.md:** RISK-001 (selectors UNPROVEN), RISK-003 (empty overwrite), RISK-007 (anti-bot unverified)
- **AUDIT-01:** Full architecture audit, 10 weaknesses identified
- **CHANGELOG.md:** 2026-07-20T08:30:30 — initial live smoke test; 2026-07-20T18:04:00 — Fix A anti-bot hardening; 2026-07-20T18:06:00 — Fix B self-healing locators
