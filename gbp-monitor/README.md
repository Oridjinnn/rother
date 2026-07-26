# GBP Competitor Review Monitor

Automated monitoring of competitor Google Business Profile reviews for
**Copenhagen Bali** (6 branches). Zero recurring cost. No paid APIs.
No AI/LLM features in this phase.

**Governing documents:**
- `CHANGELOG.md` (in this directory) — change record per Rule 2

## Quickstart (development)

```bash
cd gbp-monitor
pip install -r requirements.txt
playwright install chromium      # only needed for live mode
python -m orchestration.run_all --fixtures  # test with static fixtures
```

## Live Scraping

Before running live mode, you need valid Google Maps `place_id` values:

1. Get place_ids for each competitor (see `docs/engineering/LIVE_SCRAPING_GUIDE.md`)
2. Set them in `config/listings.json`
3. Run: `python -m orchestration.run_all`

The scraper validates place_id format (must start with `ChIJ`, ≥25 chars).
Invalid/missing place_ids fall back to mock URLs and skip gracefully.

## Baseline Verification

After setup, verify the scraper works:

```bash
cd gbp-monitor
python -m tests.verify_baseline
```

Expected output: 67 checks pass, exit code 0.

## Fixture Preparation

After a successful live capture, promote evidence to a golden dataset:

```bash
python -m golden.promote {verify_timestamp}
```

See `docs/engineering/FIXTURE_PREPARATION.md` for the full workflow.

## Layout

```
gbp-monitor/
├── orchestration/run_all.py   # Main entry point: capture → parse → store
├── harness/                    # Browser lifecycle, capture, scrolling, selectors
├── parser/                     # Review parsing (parsel.Selector)
├── storage/                    # Versioned snapshot persistence
├── discovery/                  # URL reachability pre-checks
├── config/                     # listings.json, selectors.json
├── tests/                      # 3 HTML fixtures + verify_baseline.py
├── golden/                     # promote.py — evidence → golden dataset
├── data/                       # Runtime data: snapshots, deltas, logs
└── docs/                       # Guides (see docs/engineering/)
```

## Status

See `CHANGELOG.md` for the current PROVEN/UNPROVEN state of each module.
