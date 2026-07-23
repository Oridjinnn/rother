# Golden Dataset Framework

Trusted reference data for regression testing the scraper against known
Google Maps page layouts.

## Philosophy

A Golden Dataset is a **manually verified snapshot** of a real Google Maps
listing at a specific point in time. It includes:

- The raw HTML that the scraper captured
- A screenshot showing what the browser actually rendered
- The expected parser output (extracted reviews)
- Metadata about the capture context

Golden Datasets serve as **regression anchors**. When Google Maps changes
its DOM, the golden datasets tell you:

- What the OLD layout looked like (preserved HTML + screenshot)
- What the NEW layout produces (re-run the scraper, compare with golden)
- Whether the parser still works on old layouts (regression check)

## Directory Structure

```
golden-datasets/
  .gitkeep
  comp-canggu-01_20260722/           # {competitor_id}_{YYYYMMDD}
    page.html                        # Raw HTML from capture
    page.png                         # Full-page screenshot
    metadata.json                    # Dataset metadata
    expected_reviews.json            # Expected parse output (golden)
    notes.md                         # Verification notes
  comp-seminyak-01_20260722/
    ...
```

### Per-Dataset Assets

| File | Required | Purpose |
|---|---|---|
| `page.html` | Yes | Raw HTML as returned by `page.content()`. The exact input to the parser. |
| `page.png` | No (recommended) | Full-page screenshot. Visual evidence of page state at capture time. |
| `metadata.json` | Yes | Structured metadata (see schema below). |
| `expected_reviews.json` | No (recommended) | Expected parser output — the golden list of reviews. |
| `notes.md` | No (recommended) | Human-readable verification notes and observations. |

### metadata.json Schema

```json
{
  "dataset_id": "comp-canggu-01_20260722",
  "competitor_id": "comp-canggu-01",
  "branch_id": "branch-canggu",
  "competitor_name": "Crate Cafe Canggu",
  "capture_date": "2026-07-22T12:00:00+00:00",
  "verify_run": "20260722T120000Z",
  "capture_status": "PASS",
  "google_maps_url": "https://www.google.com/maps/place/...",
  "selector_version": "2026-07-20",
  "verification_status": "verified",
  "verified_by": "jane.doe@example.com",
  "notes": "Selector review_container matches. 247 reviews parsed."
}
```

`verification_status` must be one of:
- `candidate` — freshly promoted, awaiting review
- `verified` — manually inspected and accepted
- `superseded` — replaced by a newer dataset for the same competitor

### expected_reviews.json Format

The expected output matches the production pipeline's parser output exactly.
Each entry is a review dict produced by `parser.schema.review_to_dict()`:

```json
[
  {
    "review_id": "ChdDSUhNMG9nS0VJQ0FnSUN...",
    "reviewer_name": "Alice B.",
    "rating": 5,
    "review_text": "Amazing coffee and great atmosphere...",
    "relative_date": "2 weeks ago",
    "review_timestamp": "2026-07-08",
    "reviewer_review_count": 12,
    "reviewer_url": "https://maps.google.com/...",
    "review_language": "en",
    "review_translated_text": null,
    "response_text": null,
    "response_timestamp": null,
    "review_rating_original": 5,
    "review_rating_max": 5
  }
]
```

## Naming Convention

```
{competitor_id}_{YYYYMMDD}
```

Examples:
- `comp-canggu-01_20260722` — first Canggu competitor, captured 2026-07-22
- `comp-seminyak-01_20260815` — first Seminyak competitor, captured 2026-08-15

Rules:
- `competitor_id` must match a value from `config/listings.json`
- `YYYYMMDD` is the capture date (extracted from the verify run timestamp)
- If the same competitor is captured on the same day, append `_v2`, `_v3`

## Creation Criteria

A capture is eligible for promotion to Golden Dataset when:

1. **Verify run PASSED** — the capture pipeline completed without errors
2. **Screenshot is valid** — shows a real Google Maps listing page, not a
   captcha, error page, or blank screen
3. **Reviews are visible** — the screenshot shows the reviews section
   scrolled into view with review content present
4. **HTML is non-trivial** — `page.html` is at least 10 KB
5. **Parser succeeded** — `expected_reviews.json` was generated with a
   plausible number of reviews
6. **URL was real** — captured against a real Google Maps URL, not a mock

## Manual Verification Process

After running `python -m golden.promote`, each dataset starts as
`verification_status: "candidate"`. The engineer must manually verify
each one.

### Step 1: Inspect the Screenshot

Open `page.png` and confirm:

- [ ] The page shows a real Google Maps listing
- [ ] The listing name matches the expected competitor
- [ ] The reviews section is visible and scrolled
- [ ] No captcha, cookie wall, or error page is shown
- [ ] The screenshot is not blank or partially loaded

### Step 2: Inspect the Raw HTML

Open `page.html` in a text editor or browser and confirm:

- [ ] The HTML contains review text elements
- [ ] Review data-review-id attributes are present
- [ ] Rating elements are present
- [ ] The HTML size is plausible (>10KB)

### Step 3: Review Parse Output

Open `expected_reviews.json` and confirm:

- [ ] Reviews were extracted (array is not empty)
- [ ] Review count is plausible (compare with screenshot)
- [ ] Review text fields contain readable text (not HTML entities or gibberish)
- [ ] Ratings are within valid range (1-5)
- [ ] Reviewer names look like real names (not empty or all hashes)
- [ ] Relative dates are present and look like real date strings

### Step 4: Sign Off

Update `metadata.json`:

```json
{
  ...
  "verification_status": "verified",
  "verified_by": "your.name@example.com",
  "notes": "247 reviews parsed. Selectors match current DOM."
}
```

Fill in `notes.md` with any observations or anomalies.

### Step 5: Commit

```powershell
git add golden-datasets/
git commit -m "golden: add comp-canggu-01_20260722"
```

## Acceptance Requirements

A dataset is accepted as **verified** only when ALL of these hold:

| Criterion | How to check |
|---|---|
| Evidence is complete | `page.html` + `metadata.json` exist |
| Screenshot is valid | Visually confirm no captcha/error |
| HTML is not empty | `page.html` >= 10 KB |
| Parser ran | `expected_reviews.json` exists |
| Reviews are extracted | Array length > 0 |
| Captured with real URL | `google_maps_url` is not a mock |
| Engineer signed off | `verified_by` is set in `metadata.json` |

If any criterion fails, the dataset should remain `candidate` with a note
explaining the issue, or be deleted if the capture was fundamentally flawed.

## Update Policy

### When to Create a New Dataset

1. **First successful live capture** — create the initial dataset
2. **Google Maps layout changes** — if `review_container` selector breaks
   and must be updated, capture with the new selector and create a new
   dataset
3. **New competitor added** — capture and verify the new listing
4. **Selector config updated** — even if the old dataset still parses,
   creating a new one confirms the new selector works on current DOM

### When to Preserve an Old Dataset

OLD datasets are NEVER deleted. They are preserved as regression anchors:

- Old `selector_report.json` from verify runs + old golden datasets show
  what the old DOM looked like
- If a future selector change breaks old layouts, the golden dataset tells
  you exactly what HTML the parser must still handle
- Set `verification_status: "superseded"` on old datasets rather than
  deleting them

### Replacement Workflow

```
1. Capture with new selectors:   python -m orchestration.run_all --verify --url <URL>
2. Verify the screenshot + HTML   (manual inspection)
3. Promote to golden:            python -m golden.promote <verify_ts>
4. Review and sign off           (set verification_status: "verified")
5. Mark old dataset as superseded:
   - Open old metadata.json
   - Set verification_status: "superseded"
   - Add note: "Replaced by <new_dataset_id>"
6. Commit both changes
```

## Workflow Summary

```
Verify capture
  │
  ▼
python -m golden.promote <ts>
  │
  ▼  (dataset created as "candidate")
Manual review (screenshot + HTML + parse output)
  │
  ├── Accept? → Set verification_status: "verified" in metadata.json
  │             Fill in notes.md
  │             Commit
  │
  └── Reject? → Fix selectors, re-capture, re-promote
                Or delete dataset with explanation
```

## Using Golden Datasets for Regression Testing

Golden datasets support two regression scenarios:

### Parser Regression

Run the current parser against a golden dataset's HTML and compare:

```powershell
# Quick comparison script:
python -c "
import json
from pathlib import Path
from parser.review_parser import parse_reviews
from parser.schema import review_to_dict

ds_dir = Path('../golden-datasets/comp-canggu-01_20260722')
html = (ds_dir / 'page.html').read_text(encoding='utf-8')
selectors = json.load(open('config/selectors.json'))
expected = json.load(open(ds_dir / 'expected_reviews.json'))

parsed = parse_reviews(html, 'golden-check', 'golden-check', selectors)
actual = [review_to_dict(r) for r in parsed]

if actual == expected:
    print('PASS: parser output matches golden dataset')
else:
    print(f'FAIL: {len(actual)} actual vs {len(expected)} expected')
    # Further diff logic here
"
```

### Layout Change Detection

When verify mode produces a `selector_report.json` with broken selectors:

1. Compare `page.png` with old golden screenshots — is the layout visually
   different?
2. Check `page.html` for new CSS class names
3. Update selectors, capture again, promote to new golden dataset
4. Mark the old dataset as `superseded` but KEEP it for regression

## Promotion Script Reference

```
python -m golden.promote --help
```

```
usage: python -m golden.promote <verify_ts> [--competitor COMP_ID] [--dest DIR]

Promote verified captures to Golden Datasets for regression testing.

positional arguments:
  verify_ts             Verify run timestamp under data/verify/

options:
  --competitor COMP_ID  Promote only this competitor_id (default: all)
  --dest DIR            Override destination root (default: ../golden-datasets/)
```

Run from the `gbp-monitor/` directory.

The script:
1. Reads `data/verify/<ts>/report.json` for competitor metadata
2. Reads `config/listings.json` for branch_id/name mapping
3. For each competitor, copies `page.html` and `page.png`
4. Runs the existing parser on `page.html` to produce `expected_reviews.json`
5. Generates `metadata.json` with `verification_status: "candidate"`
6. Creates `notes.md` with a verification checklist template
7. Does NOT modify any production data
