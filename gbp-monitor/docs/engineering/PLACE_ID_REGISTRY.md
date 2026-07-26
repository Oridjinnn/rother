# M11 Phase 2 — Place ID Registry

**Generated:** 2026-07-24
**Method:** Format validation + URL construction + evidence-based business verification
**Source:** `config/listings.json`, `data/golden/place_validation.json`

---

## 1. Registry

| Competitor | place_id | Valid? | Generated URL | Business Verified? | Source |
|------------|----------|--------|---------------|-------------------|--------|
| comp-canggu-01 | `ChIJOaEQDnk40i0Rzhou4NcRx-w` | ✅ | [Link](https://www.google.com/maps/place/?q=place_id:ChIJOaEQDnk40i0Rzhou4NcRx-w) | ✅ Crate Cafe Canggu | Wanderlog MOBX state |
| comp-seminyak-01 | `ChIJ9fhCoBBH0i0R4h17JYdA484` | ✅ | [Link](https://www.google.com/maps/place/?q=place_id:ChIJ9fhCoBBH0i0R4h17JYdA484) | ✅ Revolver Espresso Seminyak | Captured HTML + Wanderlog |
| comp-seminyak-02 | `null` | ❌ | Mock fallback | ❌ | — |
| comp-canggu-02 | `null` | ❌ | Mock fallback | ❌ | — |
| comp-ubud-01 | `null` | ❌ | Mock fallback | ❌ | — |
| comp-ubud-02 | `null` | ❌ | Mock fallback | ❌ | — |
| comp-uluwatu-01 | `null` | ❌ | Mock fallback | ❌ | — |
| comp-uluwatu-02 | `null` | ❌ | Mock fallback | ❌ | — |
| comp-nusadua-01 | `null` | ❌ | Mock fallback | ❌ | — |
| comp-nusadua-02 | `null` | ❌ | Mock fallback | ❌ | — |
| comp-sanur-01 | `null` | ❌ | Mock fallback | ❌ | — |
| comp-sanur-02 | `null` | ❌ | Mock fallback | ❌ | — |

---

## 2. Place ID Details

### comp-canggu-01 — Crate Cafe Canggu

- **place_id:** `ChIJOaEQDnk40i0Rzhou4NcRx-w`
- **Format:** `ChIJ` + 23 base64 chars = 27 chars ✅
- **URL:** `https://www.google.com/maps/place/?q=place_id:ChIJOaEQDnk40i0Rzhou4NcRx-w`
- **Business evidence:**
  - Wanderlog (`https://wanderlog.com/place/details/454099/crate-cafe`):
    - `window.__MOBX_STATE__.placeMetadata.placeId = "ChIJOaEQDnk40i0Rzhou4NcRx-w"`
    - Name: "Crate Cafe"
    - Address: "Jl. Sempol No.8, Pererenan, Kec. Mengwi, Kabupaten Badung, Bali 80351"
    - Rating: 4.2 (5,216 reviews)
  - Note: Crate Cafe has moved from Jl. Canggu Padang Linjong to Pererenan. Place_id still resolves.
- **Uniqueness:** Unique across config ✅
- **Review availability:** Pending live verification

### comp-seminyak-01 — Revolver Espresso Seminyak

- **place_id:** `ChIJ9fhCoBBH0i0R4h17JYdA484`
- **Format:** `ChIJ` + 23 base64 chars = 27 chars ✅
- **URL:** `https://www.google.com/maps/place/?q=place_id:ChIJ9fhCoBBH0i0R4h17JYdA484`
- **Business evidence:**
  - Captured HTML (`data/verify/20260724T121337Z/comp-canggu-01/page.html`):
    - "Revolver" mentioned 21 times
    - "Crate Cafe" mentioned 0 times
    - Title tag: "Revolver Espresso" 
  - Wanderlog search: explicitly maps to Revolver Seminyak, Jl. Kayu Aya No.51
  - HTML `GURL` variable: `'/maps/place/?q=place_id:ChIJ9fhCoBBH0i0R4h17JYdA484'`
- **Uniqueness:** Unique across config ✅
- **Review availability:** Verified via M9 live captures ✅

---

## 3. Source Code References

- Listing config: `config/listings.json`
- Place validation data: `data/golden/place_validation.json`
- URL construction: `orchestration/run_all.py:_resolve_url()` (lines 338-361)
- Pre-flight place_id detection: `orchestration/run_all.py:_preflight_checks()` (lines 276-306)

---

## 4. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Crate Cafe's place_id may change after their move to Pererenan | Capture resolves to old/nonexistent location | Verify with live Playwright capture before certifying|
| Remaining 10 competitors lack place_ids | Cannot run live capture for them | Blocked on client data entry |
| Google may redirect place URLs | Generated URL may not match final landing page | Check redirect chain during live verification |
