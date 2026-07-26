# Production Acceptance Report

**Date:** 2026-07-25
**Run ID:** 20260725T043144Z (live), 20260725T044712Z (fixture verification)

## 1. Dataset Completeness

| Metric | Value |
|--------|-------|
| Branches configured | 6 (cph-seminyak, cph-canggu, cph-ubud, cph-uluwatu, cph-nusadua, cph-sanur) |
| Total competitors | 12 |
| Competitors with valid place_id | 2 |
| Competitors without place_id | 10 |

## 2. Competitors Verified

| Competitor | Branch | place_id | Live Capture | Reviews Parsed |
|------------|--------|----------|-------------|----------------|
| comp-seminyak-01 | cph-seminyak | ChIJ9fhCoBBH0i0R4h17JYdA484 | Blocked — Google login wall | 0 |
| comp-canggu-01 | cph-canggu | ChIJOaEQDnk40i0Rzhou4NcRx-w | Success | 3 |
| comp-seminyak-02 | cph-seminyak | null | Not attempted | — |
| comp-canggu-02 | cph-canggu | null | Not attempted | — |
| comp-ubud-01 | cph-ubud | null | Not attempted | — |
| comp-ubud-02 | cph-ubud | null | Not attempted | — |
| comp-uluwatu-01 | cph-uluwatu | null | Not attempted | — |
| comp-uluwatu-02 | cph-uluwatu | null | Not attempted | — |
| comp-nusadua-01 | cph-nusadua | null | Not attempted | — |
| comp-nusadua-02 | cph-nusadua | null | Not attempted | — |
| comp-sanur-01 | cph-sanur | null | Not attempted | — |
| comp-sanur-02 | cph-sanur | null | Not attempted | — |

## 3. Competitors Missing place_ids

10 of 12 competitors lack place_ids. Blocked on client data entry per `listings.json` comment. Pipeline correctly skips these (falls back to mock gmaps_url which gracefully fails capture).

## 4. Capture Success Rate

- **Live mode:** 2/2 competitors attempted (100% pipeline success) — 1 with 3 reviews, 1 blocked by Google login wall
- **Fixture mode:** 3/12 have fixtures (comp-canggu-01, comp-seminyak-01, comp-ubud-01), all 3 parse successfully

## 5. Selector Health

| Selector | Status | Active Tier | Active Selector |
|----------|--------|-------------|-----------------|
| review_container | live | tier 0 | div.m6QErb[role='region'] |
| review_item | live | tier 1 | [data-review-id] |
| review_id_attr | live | tier 0 | data-review-id |
| reviewer_name_attr | live | tier 0 | aria-label |
| review_text_selector | live | tier 0 | span.wiI7pd |
| rating_selector | live | tier 0 | span.kvMYJc |
| rating_attr | live | tier 0 | aria-label |
| relative_date_selector | live | tier 0 | span.rsqaWe |
| expand_text_button | live | tier 0 | button.w8nwRe.kyuRq |

All selectors confirmed working on comp-canggu-01 live capture (518KB HTML, 33 review items found, 3 parsed).

## 6. Dashboard Correctness

No dashboard API exists — the product is a CLI-only tool. Dashboard verification is not applicable at this time. The pipeline outputs structured JSON logs and `run_summary.json` for downstream consumption.

## 7. Export Correctness

No export feature exists. The pipeline produces snapshots, deltas, and run logs as structured data.

## 8. Regression Results

| Suite | Result |
|-------|--------|
| verify_baseline.py (Phase 1-3 artifact checks) | 63/63 PASS |
| Security regression tests (Phase 4) | 17/17 PASS |
| Health endpoint (orchestration.health) | PASS — all 5 checks green |
| Backup script (scripts/backup.py) | PASS — creates valid zip with data + config |
| Restore script (scripts/restore.py) | PASS — dry-run lists correct files |
| CI workflow | EXISTS — `.github/workflows/ci.yml` |

## 9. Remaining Blockers

| # | Blocker | Severity | Status |
|---|---------|----------|--------|
| 1 | 10 competitors without place_ids | HIGH | Blocked on client data entry |
| 2 | comp-seminyak-01: Google Maps login wall | MEDIUM | Google serves limited view without login — no reviews accessible |
| 3 | No dashboard UI | MEDIUM | N/A — product is CLI-only (per Architecture Decision M13A: "Internal Company Tool") |
| 4 | verify_baseline.py encoding bug on Windows | LOW | Resolved — added explicit `encoding="utf-8"` |

## 10. Recommendation: NOT READY

**Evidence:**

1. Only 2/12 competitors have place_ids (16.7% dataset completeness) — insufficient for meaningful production monitoring
2. comp-seminyak-01 (one of the 2 valid competitors) is blocked by Google Maps login wall — the capture pipeline succeeds but produces 0 reviews
3. Only 1 competitor (comp-canggu-01) is fully functional end-to-end with real live data
4. The pipeline, selectors, storage, backup/restore, health check, and regression suite are all verified working — the core infrastructure is sound
5. Once the 10 remaining place_ids are provided and the login wall issue is investigated, the system can retest

**Condition for promotion to READY FOR PILOT:**
- All 12 competitors must have valid place_ids
- comp-seminyak-01 login wall must be resolved (or documented as expected for the target market)
- A full live capture pass must achieve ≥10/12 successful review parses
- 63/63 regression suite must pass
