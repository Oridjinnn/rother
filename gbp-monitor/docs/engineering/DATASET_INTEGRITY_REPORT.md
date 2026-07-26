# M11 Phase 1 — Configuration Audit: Dataset Integrity Report

**Audit Date:** 2026-07-24
**Audited By:** browser_agent
**Source:** `config/listings.json` (schema: branches × competitors)

---

## 1. Executive Summary

The configuration audit inspected all 12 competitors across 6 branches. **2 critical issues** were found:

| Severity | Count | Description |
|----------|-------|-------------|
| CRITICAL | 1 | Place_id `ChIJ9fhCoBBH0i0R4h17JYdA484` attributed to wrong competitor (Crate Cafe Canggu) — actually resolves to Revolver Espresso Seminyak |
| MEDIUM | 10 | Competitors without place_ids — live scraping unavailable until client data entry |
| PASS | 3 | Fixture files + snapshots exist for comp-canggu-01, comp-seminyak-01, comp-ubud-01 |
| PASS | 0 | No duplicate place_ids, malformed IDs, orphan competitors, or invalid branch refs |

---

## 2. Methodology

Each competitor entry was checked for:

- **Duplicate place_ids** — identical values across entries
- **Malformed place_ids** — does not match `ChIJ[base64]{25,30}` pattern
- **Missing place_ids** — null/empty placeholder
- **Duplicate Google URLs** — identical `gmaps_url` values
- **Orphan competitors** — competitor_id referenced in snapshots/fixtures but not in listings
- **Invalid branch references** — branch_id not matching any defined branch
- **Place_id correctness** — ID resolves to the expected business name

---

## 3. Full Audit Table

| # | competitor_id | branch_id | Business Name | place_id | place_id OK? | Fixture? | Snapshot? | Issues |
|---|---------------|-----------|---------------|----------|-------------|----------|-----------|--------|
| 1 | comp-seminyak-01 | cph-seminyak | Revolver Espresso Seminyak | `ChIJ9fhCoBBH0i0R4h17JYdA484` | ✅ Fixed M11 | ✅ | ✅ | Was misattributed to comp-canggu-01 — now corrected |
| 2 | comp-seminyak-02 | cph-seminyak | Anomali Coffee Seminyak | null | ❌ Missing | ❌ | ❌ | Needs place_id from client |
| 3 | comp-canggu-01 | cph-canggu | Crate Cafe Canggu | `ChIJOaEQDnk40i0Rzhou4NcRx-w` | ✅ Fixed M11 | ✅ | ✅ | Was pointing to Revolver — now corrected |
| 4 | comp-canggu-02 | cph-canggu | The Shady Shack Canggu | null | ❌ Missing | ❌ | ❌ | Needs place_id from client |
| 5 | comp-ubud-01 | cph-ubud | Seniman Coffee Studio Ubud | null | ❌ Missing | ✅ | ✅ | Needs place_id from client |
| 6 | comp-ubud-02 | cph-ubud | Kafe Ubud | null | ❌ Missing | ❌ | ❌ | Needs place_id from client |
| 7 | comp-uluwatu-01 | cph-uluwatu | Single Fin Uluwatu | null | ❌ Missing | ❌ | ❌ | Needs place_id from client |
| 8 | comp-uluwatu-02 | cph-uluwatu | Suluban Cliffs Uluwatu | null | ❌ Missing | ❌ | ❌ | Needs place_id from client |
| 9 | comp-nusadua-01 | cph-nusadua | Bumbu Bali Nusa Dua | null | ❌ Missing | ❌ | ❌ | Needs place_id from client |
| 10 | comp-nusadua-02 | cph-nusadua | Salsa Nusa Dua | null | ❌ Missing | ❌ | ❌ | Needs place_id from client |
| 11 | comp-sanur-01 | cph-sanur | Byrd House Sanur | null | ❌ Missing | ❌ | ❌ | Needs place_id from client |
| 12 | comp-sanur-02 | cph-sanur | Lilla Pantai Sanur | null | ❌ Missing | ❌ | ❌ | Needs place_id from client |

---

## 4. Critical Issue — Place ID Misattribution

### Issue M11-CRIT-001
- **Old assignment:** `ChIJ9fhCoBBH0i0R4h17JYdA484` → comp-canggu-01 (Crate Cafe Canggu)
- **Actual business:** Revolver Espresso Seminyak (comp-seminyak-01)
- **Evidence:**
  1. Captured HTML (`data/verify/20260724T121337Z/comp-canggu-01/page.html`) contains "Revolver" 21 times, "Crate" 0 times
  2. Wanderlog search result maps this place_id to Revolver Seminyak at Jl. Kayu Aya No.51, Seminyak
  3. HTML title tag contains "Revolver Espresso"
- **Fixed:** Moved to comp-seminyak-01

### Issue M11-CRIT-002 (Resolved)
- **New assignment:** `ChIJOaEQDnk40i0Rzhou4NcRx-w` → comp-canggu-01 (Crate Cafe Canggu)
- **Evidence:**
  1. Wanderlog `window.__MOBX_STATE__.placeMetadata.placeId = "ChIJOaEQDnk40i0Rzhou4NcRx-w"`
  2. Wanderlog name field: "Crate Cafe"
  3. Wanderlog address: "Jl. Sempol No.8, Pererenan, Kec. Mengwi, Kabupaten Badung, Bali 80351"
- **Status:** Applied

---

## 5. Schema Validation

| Check | Result |
|-------|--------|
| Config parseable JSON | ✅ |
| 6 branches defined | ✅ |
| 2 competitors per branch | ✅ |
| All competitor_ids unique | ✅ |
| All branch_ids reference valid branches | ✅ |
| All gmaps_urls present | ✅ |
| No duplicate gmaps_urls | ✅ |
| No duplicate place_ids | ✅ |
| All place_ids valid ChIJ format | ✅ (2 valid, 10 null) |
| Fixture-to-listing consistency | ✅ (3 fixtures match 3 listings) |

---

## 6. Recommended Actions

1. **✅ Done** — Move `ChIJ9fhCoBBH0i0R4h17JYdA484` from comp-canggu-01 to comp-seminyak-01
2. **✅ Done** — Assign `ChIJOaEQDnk40i0Rzhou4NcRx-w` to comp-canggu-01 (Crate Cafe Canggu)
3. **🔲 PENDING** — Obtain place_ids for remaining 10 competitors
4. **🔲 PENDING** — Run live capture for comp-seminyak-01 (now correctly has place_id)
5. **🔲 PENDING** — Run live capture for comp-canggu-01 (now has correct place_id)
6. **🔲 PENDING** — Update production_dataset.json with corrected place_id metadata
