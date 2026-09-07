# M7 — Variant Investigation Framework

## Purpose

M7 is an EXPERIMENTAL framework, not a scraping/parser/instrumentation
milestone. Its sole objective is discovering WHY Google serves either the
FULL review experience (reviews embedded, Reviews tab) or the REDUCED
experience (no review feed at all) for the same listing URL. M6 established
that this decision is made server-side and is not influenced by scrolling or
any DOM interaction; M7 isolates the ENVIRONMENTAL variables that may
correlate with receiving FULL.

The framework is a reusable, controlled-experiment harness. It produces
structured evidence, deterministic classification, per-run reports, and an
aggregate comparison report. It never guesses, never assumes success, and
never claims causation without evidence.

## Architecture

```
gbp-monitor/
└── variant_framework/
    ├── __init__.py          # public API re-exports
    ├── __main__.py          # python -m variant_framework CLI
    ├── spec.py              # VARIABLES registry, baseline_spec, matrix_specs
    ├── context_builder.py   # spec -> Playwright browser + context
    ├── evidence.py          # DOM snapshot + console/request/response/RPC capture
    ├── classifier.py        # deterministic FULL/REDUCED/UNKNOWN rules
    ├── runner.py            # executes ONE configuration, writes variant_report.json
    └── reporting.py         # aggregate comparison report across runs
```

### Module responsibilities

| Module | Responsibility |
|---|---|
| `spec.py` | Defines the 13 investigable variables, their allowed values, defaults, the baseline spec, and the experiment matrix. Adding a new variable = one entry in `VARIABLES` (+ an optional matrix entry). |
| `context_builder.py` | Maps a resolved spec to the exact Playwright `launch`/`new_context` arguments. One variable ↔ one constructor argument (no cross-contamination). |
| `evidence.py` | Passive `page.on(...)` listeners buffering console messages, requests, responses, and batchexecute RPC bodies; plus a DOM snapshot function. |
| `classifier.py` | Deterministic variant classification from a DOM snapshot. No ML. Every rule documented inline. |
| `runner.py` | Orchestrates one run: build context → navigate → wait session age → snapshot → capture evidence → classify → write artifacts + `variant_report.json`. Never raises on page failures. |
| `reporting.py` | Scans a run directory tree, aggregates all `variant_report.json`, and writes `variant_comparison_report.json` with correlation notes (correlation only, never causation). |

## Supported variables (VARIABLES registry)

| # | Variable | Options | Default | Meaning |
|---|---|---|---|---|
| 1 | `profile` | fresh, persistent | fresh | Throwaway vs reused user-data-dir |
| 2 | `auth` | anonymous, logged_in | anonymous | Anonymous vs logged-in (storage_state) |
| 3 | `ip_class` | datacenter, residential | datacenter | Egress IP class (residential needs external proxy) |
| 4 | `locale` | en-US, id-ID, de-DE | en-US | UI locale |
| 5 | `browser_language` | en-US, id-ID, de-DE accept-language | en-US | Accept-Language header |
| 6 | `timezone` | Asia/Makassar, America/New_York, Europe/Berlin, UTC | Asia/Makassar | context timezone_id |
| 7 | `viewport` | 1366x768, 1920x1080, 390x844, 1024x768 | 1366x768 | Viewport WxH |
| 8 | `browser_version` | 124, 120, 128 | 124 | Claimed Chrome version (UA + client hints) |
| 9 | `chrome_channel` | chromium, chrome | chromium | Bundled chromium vs system Chrome |
| 10 | `headed` | headless, headed | headless | Headless vs headed mode |
| 11 | `navigation_path` | place_id_query, full_place_url, search | place_id_query | How the page is reached |
| 12 | `session_age` | 0, 6, 15, 30 (seconds) | 6 | Pre-snapshot wait after load |
| 13 | `cookies` | none, seed | none | Pre-seeded cookies |

External-resource variables (`ip_class=residential`, `chrome_channel=chrome`,
`auth=logged_in`, `cookies=seed`) require the resource to be supplied
(proxy URL, installed Chrome, storage_state file, cookies file). When the
resource is absent the spec records `_skipped_reason`, the report is marked
`NOT_AVAILABLE`, and the run proceeds with the baseline value — the framework
NEVER fakes the unavailable resource.

## Experiment workflow

1. **Define the spec** — `baseline_spec(place_id, full_url, outdir)` produces
   the production-like baseline. `matrix_specs(...)` produces one spec per
   matrix experiment, each changing exactly one variable.
2. **Run** — `run_experiment(spec)` executes one configuration. The runner:
   - builds the browser/context from the spec (one variable → one arg);
   - navigates via the requested `navigation_path`;
   - waits the `session_age`;
   - snapshots the DOM (review cards, tabs, counts);
   - captures console, requests, responses, batchexecute RPC bodies;
   - saves `page.html`, `page.png`, and all JSON evidence;
   - classifies the variant (FULL/REDUCED/UNKNOWN + confidence + rules);
   - writes `variant_report.json`.
3. **Repeat across the matrix** — each run is an isolated directory so runs
   never overwrite each other.
4. **Aggregate** — `write_aggregate(root)` scans all run dirs and writes
   `variant_comparison_report.json`.

### Running via CLI

```bash
# Single experiment with overrides
python -m variant_framework \
  --url "https://www.google.com/maps/place/?q=place_id:ChIJOaEQDnk40i0Rzhou4NcRx-w" \
  --outdir data/variant_experiments/my_run \
  --variable locale --value id-ID

# Full experiment matrix
python -m variant_framework \
  --url "https://www.google.com/maps/place/?q=place_id:ChIJOaEQDnk40i0Rzhou4NcRx-w" \
  --outdir data/variant_experiments/matrix --matrix
```

External resources are supplied via environment variables:
- `GBP_MONITOR_PROXY` → proxy URL for `ip_class=residential`
- `GBP_MONITOR_STORAGE_STATE` → path to Playwright storage_state JSON for `auth=logged_in`
- `GBP_MONITOR_COOKIES_FILE` → path to cookies JSON for `cookies=seed`

## Report format

### Per-run `variant_report.json`

```json
{
  "schema": "variant_report",
  "schema_version": "1.0",
  "timestamp": "2026-08-01T00:00:00Z",
  "configuration": { "...all variables resolved..." },
  "status": "OK | FAIL | NOT_AVAILABLE",
  "variant": "FULL | REDUCED | UNKNOWN",
  "confidence": 0.0,
  "reason": "REDUCED: 2 tabs (Ringkasan/Tentang only), zero review cards",
  "classification_rules": ["R1: >=2 tabs, no Reviews tab, zero cards"],
  "evidence_paths": { "html": "...", "png": "...", "dom_snapshot": "...",
                      "console": "...", "requests": "...",
                      "responses": "...", "rpc_bodies": "..." },
  "snapshot_summary": { "unique_ids": 0, "raw_attr": 0, "jftiEf": 0,
                        "role_tab_count": 2, "tabs": ["..."], "title": "..." },
  "network_summary": { "requests": 95, "responses": 70, "console_msgs": 1,
                       "rpc_bodies": 2, "review_rpc_qv9Egd_seen": false },
  "notes": [ "..." ],
  "error": null
}
```

### Aggregate `variant_comparison_report.json`

```json
{
  "schema": "variant_comparison_report",
  "run_count": 4,
  "baseline_variant": "REDUCED",
  "rows": [
    { "experiment": "...", "variable": "locale", "value": "id-ID",
      "variant": "REDUCED", "confidence": 0.9, "notes": "..." }
  ],
  "correlations": [
    { "variable": "locale", "baseline_variant": "REDUCED",
      "observed_variants": {"REDUCED": 1}, "differs_from_baseline": false,
      "claim": "no difference observed in this sample" }
  ]
}
```

## Classification rules (deterministic, documented, no ML)

The classifier consumes a DOM snapshot dict and applies these rules in order:

| Rule | Condition | Result | Confidence |
|---|---|---|---|
| F1 | unique `data-review-id` count > 0 | FULL | 1.0 |
| F2 | `div.jftiEf` or raw `data-review-id` matches present, unique = 0 | FULL | 0.5 |
| F3 | Reviews tab (`[role=tab]` label matching /ulasan\|reviews?\|avis/i) present, no cards | FULL | 0.6 |
| R1 | ≥2 tabs, none is a Reviews tab, zero cards | REDUCED | 0.9 |
| U1 | everything else (no cards, <2 tabs, no Reviews tab) | UNKNOWN | 0.0 |

Rationale per rule:
- **F1/F2**: Google's FULL variant embeds review cards in the initial HTML
  (M6 evidence: 3–5 unique `data-review-id` values). Unique IDs are the
  trusted signal; raw matches (F2, lower confidence) can include
  expandable-button duplicates.
- **F3**: M6 evidence shows the FULL variant displays the "Ulasan untuk X"
  tab at load even before cards render.
- **R1**: M6 evidence shows REDUCED serves only Ringkasan/Tentang tabs and
  never embeds reviews.
- **U1**: deliberately conservative — the page may be mid-load, an
  interstitial, an error page, or a layout we have not seen. UNKNOWN is never
  guessed.

## Interpreting results

- The aggregate report identifies CORRELATIONS only. `differs_from_baseline`
  means "in this sample, the variable's runs produced a different variant
  than the baseline" — it is a correlation signal that must be confirmed with
  repeated runs before any stronger claim. The milestone forbids claiming
  causation without evidence, and the framework's wording enforces that.
- Confidence reflects the classifier's rule strength, NOT the statistical
  significance of the correlation. A FULL result with confidence 1.0 is a
  high-trust classification of that single run; aggregate conclusions still
  need multiple runs per variable.
- The `--matrix` runner executes the baseline (all-defaults) run FIRST; it is
  the reference for `differs_from_baseline`. A matrix run without a baseline
  reports `baseline_variant: null` and every correlation claim reads "no
  baseline run available — correlations undetermined" rather than guessing.
- `NOT_AVAILABLE` and `FAIL` runs are excluded from correlation counts. A
  `NOT_AVAILABLE` run proceeded with the baseline value (its variable was
  never exercised); a `FAIL` run never produced a real observation. Counting
  either would attribute a non-test observation to a variable. They still
  appear in `rows` with their status visible.
- `qv9Egd` in `network_summary` is the review-data RPC fingerprint discovered
  in M6 (fires once in FULL, never in REDUCED). It is recorded but does NOT
  drive classification.

## Adding new experiments / variables

1. Add the variable to `VARIABLES` in `spec.py`:
   ```python
   "my_variable": {
       "description": "...",
       "options": ["a", "b"],
       "default": "a",
   },
   ```
2. If the variable maps to a Playwright context/launch argument, extend
   `_launch_options` in `context_builder.py` (one variable → one argument).
3. Add a matrix entry in `EXPERIMENTS` to include it in `--matrix` runs:
   ```python
   {"variable": "my_variable", "value": "b", "label": "My variable: b vs a",
    "note": "Correlation being probed."},
   ```
4. If the variable needs an external resource, handle it in `build_context`
   and set `_skipped_reason` when unavailable.
5. Add offline tests in `tests/verify_variant_framework.py` covering the new
   variable's defaults and one-variable-per-experiment invariant.
6. Record in `CHANGELOG.md` per Rule 2.

## Verification

```bash
cd gbp-monitor
python -m tests.verify_variant_framework   # 29 offline checks (classifier/spec/reporting)
python -m tests.verify_baseline            # 84 production checks, no regressions
```

## Known limitations

1. **Google rate-limit / soft-block**: during M6/M7 the egress IP was
   soft-blocked (37+ consecutive REDUCED runs). A single experiment is a
   single observation; a REDUCED run under throttle does not prove the
   variable is irrelevant — it proves that particular run. Repeat runs over
   time (and across IPs if available) are required before drawing
   conclusions.
2. **One variable per run, but the server decides**: the framework isolates
   client-side variables. It cannot randomise or control the server-side
   decision, so confounds (IP reputation, cookies set mid-session, rate
   limiter state) are outside its control. This is why results are reported
   as correlations, never causation.
3. **External resources**: residential IP, system Chrome, logged-in account,
   and seeded cookies are only exercised when the resource is supplied. Runs
   without them are `NOT_AVAILABLE` for that variable and proceed with the
   baseline.
4. **`search` navigation path**: currently a placeholder URL (search results
   landing page) — result-clicking is not yet implemented. Prefer
   `place_id_query` / `full_place_url` for current experiments.
5. **Screenshots**: `page.png` is a viewport screenshot, not full-page. It is
   evidence of layout at snapshot time, not a DOM audit.
6. **Classification confidence is per-run**: `UNKNOWN` confidence 0.0 means
   the page did not fit any known rule — investigate before trusting a run
   labelled UNKNOWN.
