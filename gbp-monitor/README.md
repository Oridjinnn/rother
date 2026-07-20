# GBP Competitor Review Monitor

Automated monitoring of competitor Google Business Profile reviews for
**Copenhagen Bali** (6 branches). Zero recurring cost. No paid APIs.
No AI/LLM features in this phase.

**Governing documents:**
- `EXECUTION_RULES.md` (in `/home/z/my-project/upload/`) — binding rules
- `GBP_MONITOR_PLAN.md` (in `/home/z/my-project/upload/`) — technical plan
- `CHANGELOG.md` (in this directory) — change record per Rule 2

## Quickstart (development)

```bash
cd gbp-monitor
pip install -r requirements.txt
playwright install chromium
python -m orchestration.run_all            # full run (mock listings)
python -m orchestration.run_all --fixtures # run against static HTML fixtures only
```

## Layout

See `GBP_MONITOR_PLAN.md` Section 3 for the canonical directory structure.
Each Python package (`harness`, `parser`, `storage`, `discovery`,
`orchestration`) has exactly one responsibility — do not merge them.

## Dashboard

A Next.js dashboard at the parent project's `/` route visualizes the
snapshots produced by this scraper. It reads from `data/snapshots/`,
`data/reviews_new/`, and `data/run.log`.

## Status

See `CHANGELOG.md` for the current PROVEN/UNPROVEN state of each module.
