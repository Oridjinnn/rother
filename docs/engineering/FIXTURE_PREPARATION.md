# Fixture Preparation Guide

**Date:** 2026-07-24
**Purpose:** Document how to promote a live Google Maps capture into a regression
test fixture for the Rother scraper.

---

## Overview

Test fixtures are static HTML files in `gbp-monitor/tests/fixtures/` that simulate
a Google Maps review page. They allow the scraper to run without Playwright or
network access (`python -m orchestration.run_all --fixtures`).

Each fixture file is named `{competitor_id}.html` and contains the raw HTML of a
Google Maps place page with a reviews section.

---

## Workflow: Live Capture → Fixture

```
Live Google Maps page
    ↓ (Playwright capture: python -m orchestration.run_all --verify)
data/verify/{timestamp}/
    ↓ {competitor_id}/page.html + page.png
python -m golden.promote {timestamp}
    ↓
golden-datasets/{competitor_id}_{YYYYMMDD}/
    ↓ (manual review + copy to tests/fixtures/) 
tests/fixtures/{competitor_id}.html
```

### Step 1: Run a verify capture

```powershell
cd gbp-monitor
python -m orchestration.run_all --verify
```

This launches Playwright, captures each competitor's Google Maps page, and saves:
- `data/verify/{timestamp}/{competitor_id}/page.html` — raw HTML capture
- `data/verify/{timestamp}/{competitor_id}/page.png` — screenshot evidence
- `data/verify/{timestamp}/report.json` — verification results per competitor
- `data/verify/{timestamp}/selector_report.json` — per-selector health data

**Limiting to specific competitors:**

```powershell
# Capture only comp-canggu-01
python -m orchestration.run_all --verify --competitor comp-canggu-01

# Capture only the canggu branch
python -m orchestration.run_all --verify --branch cph-canggu
```

### Step 2: Review the evidence

Open `data/verify/{timestamp}/{competitor_id}/page.png` in an image viewer.
Check:
- The page shows a real Google Maps listing (not a captcha, error page, or login)
- The review section is scrolled and visible
- No bot interstitial or rate-limit page is shown

### Step 3: Promote to golden dataset

```powershell
python -m golden.promote {timestamp}
```

This copies evidence to `golden-datasets/{competitor_id}_{YYYYMMDD}/` with:
- `page.html` — raw capture
- `page.png` — screenshot (if available)
- `expected_reviews.json` — automatically parsed review output
- `metadata.json` — capture metadata
- `notes.md` — review checklist template

### Step 4: Manually verify the golden dataset

Open `notes.md` from the golden dataset and go through the checklist:
- [ ] Screenshot shows a real Google Maps listing (not captcha/error)
- [ ] Reviews section is scrolled and visible
- [ ] Raw HTML is >10KB (non-trivial content)
- [ ] Parser ran successfully (expected_reviews.json exists)
- [ ] Parsed review count is plausible (check against screenshot)
- [ ] No obvious extraction errors (missing text, wrong ratings)

### Step 5: Promote to test fixture

```powershell
# Copy the fixture
copy "golden-datasets\{competitor_id}_{YYYYMMDD}\page.html" "tests\fixtures\{competitor_id}.html"
```

Or for a quick edit (e.g., to add realistic `data-review-id` attributes):

```powershell
# Edit the fixture to add review IDs
notepad "tests\fixtures\{competitor_id}.html"
```

### Step 6: Verify the fixture works

```powershell
cd gbp-monitor
python -m orchestration.run_all --fixtures
```

Check that the listing is processed successfully (reviews parsed > 0).

### Step 7: Run baseline tests

```powershell
python -m tests.verify_baseline
```

All 67 tests must pass.

---

## Fixture File Requirements

A valid fixture must:

1. **Contain real Google Maps HTML** — the `page.html` from verify mode is used
   directly. Do NOT manually construct fixture HTML.

2. **Have `data-review-id` attributes** on review elements. The locator's tier 1
   selector targets `[data-review-id]`. If the live capture HTML doesn't have
   these attributes, the self-healing locator falls back to lower tiers.

3. **Be self-contained** — no external CSS, JS, or images. The scraper only reads
   the HTML structure; it does not execute JavaScript or load resources.

4. **Encoding UTF-8** — save files with UTF-8 encoding (no BOM).

---

## Current Fixture Inventory

| Competitor | Fixture | Reviews | Source |
|-----------|---------|---------|--------|
| comp-seminyak-01 | ✅ `comp-seminyak-01.html` | 7 | Hand-crafted |
| comp-seminyak-02 | ❌ Missing | — | — |
| comp-canggu-01 | ✅ `comp-canggu-01.html` | 6 | Hand-crafted |
| comp-canggu-02 | ❌ Missing | — | — |
| comp-ubud-01 | ✅ `comp-ubud-01.html` | 7 | Hand-crafted |
| comp-ubud-02 | ❌ Missing | — | — |
| comp-uluwatu-01 | ❌ Missing | — | — |
| comp-uluwatu-02 | ❌ Missing | — | — |
| comp-nusadua-01 | ❌ Missing | — | — |
| comp-nusadua-02 | ❌ Missing | — | — |
| comp-sanur-01 | ❌ Missing | — | — |
| comp-sanur-02 | ❌ Missing | — | — |

**Coverage: 3/12 (25%)**

---

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Fixture has 0 reviews after parse | HTML structure differs from expected selectors | Check the self-healing locator fallback worked; may need selector update |
| Fixture file is < 1KB | Page failed to load (captcha/error) | Re-capture; check browser console for the URL |
| Fixture has no `data-review-id` attributes | DOM structure differs | The self-healing locator will try lower tiers; verify it works |
| Promoted dataset has missing fields | verify run was interrupted | Re-run verify capture for that competitor |
