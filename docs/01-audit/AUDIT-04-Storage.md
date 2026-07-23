# Architecture Audit 04 — Storage & Delta Detection Subsystem

**Date:** 2026-07-22
**Subsystem:** `gbp-monitor/storage/` + `gbp-monitor/orchestration/run_all.py` (storage portions) + `gbp-monitor/data/` + `src/lib/gbp/` (dashboard-side reader)
**Repository root:** `D:\Documents (D)\Softwares\Rother\Rother - 0.0.1`

---

## Executive Summary

The Storage subsystem is a **JSON-file-based persistence layer** with no database, no caching, and no external dependencies beyond the filesystem. It consists of 3 parts:

| Component | Lines | Role |
|---|---|---|
| `storage/snapshot_store.py` | 92 | Full-snapshot read/write with atomic file operations |
| `storage/delta.py` | 54 | Pure-function `review_id` set-diff delta computation |
| `orchestration/run_all.py` (storage portions) | 8 relevant lines | Orchestrator calls load/save/delta in sequence |
| `data/` directory | 7 files | Actual persisted data (3 snapshots + 3 deltas + 1 summary) |
| `src/lib/gbp/server-data.ts` (dashboard reader) | 161 | TypeScript read-side mirror with defensive fallbacks |
| `src/lib/gbp/paths.ts` | 22 | Hardcoded absolute paths to the Python data directory |

The storage design is simple, intentional, and mostly correct for a zero-cost system:
- **Snapshots** are full copies of all reviews per competitor, overwritten every run
- **Deltas** are timestamped files containing only new reviews per run (written only when non-empty)
- **Run summary** is a single JSON file overwritten each run

Atomic writes via `.tmp` + rename prevent half-written snapshots from corrupting the baseline. The delta files are append-only (new files per run, never modified), providing an immutable audit trail.

The most significant issue is a **path mismatch between production and development environments** — the Python scraper uses relative paths (`data/snapshots/`) while the Next.js dashboard uses absolute paths (`/home/z/my-project/gbp-monitor/data/snapshots/`). The shell build scripts (`build.sh`, `start.sh`) reference yet another path (`/app/db/custom.db` for SQLite).

---

## Scope

### Files Reviewed

| File | Lines | Role |
|---|---|---|
| `gbp-monitor/storage/__init__.py` | 0 | Package marker |
| `gbp-monitor/storage/snapshot_store.py` | 92 | JSON snapshot read/write with atomic operations |
| `gbp-monitor/storage/delta.py` | 54 | Pure-function `review_id` set-diff delta detection |
| `gbp-monitor/orchestration/run_all.py` (storage calls) | 431 | Lines 71-72 (path constants), 260-284 (delta+save) |
| `gbp-monitor/data/run_summary.json` | 11 | Latest run summary (fixtures: 3 success, 0 failed, 9 skipped) |
| `gbp-monitor/data/snapshots/comp-canggu-01.json` | 62 | 6 reviews |
| `gbp-monitor/data/snapshots/comp-seminyak-01.json` | 72 | 7 reviews |
| `gbp-monitor/data/snapshots/comp-ubud-01.json` | 72 | 7 reviews |
| `gbp-monitor/data/reviews_new/comp-canggu-01_20260720T083548Z.json` | 62 | 6 new reviews (first run) |
| `gbp-monitor/data/reviews_new/comp-seminyak-01_20260720T083548Z.json` | — | 7 new reviews (first run) |
| `gbp-monitor/data/reviews_new/comp-ubud-01_20260720T083548Z.json` | — | 7 new reviews (first run) |
| `src/lib/gbp/server-data.ts` | 161 | Dashboard-side TypeScript file readers |
| `src/lib/gbp/paths.ts` | 22 | Hardcoded absolute paths to gbp-monitor data |
| `src/lib/gbp/types.ts` | 217 | TypeScript type definitions mirroring Python schema |

### Excluded from This Audit

- `parser/review_parser.py` — covered in AUDIT-03
- `gbp-monitor/harness/` — covered in AUDIT-02
- `src/app/api/*/route.ts` — dashboard API layer (consumes data, not storage)

---

## Storage Architecture

### Directory Layout on Disk

```
gbp-monitor/
├── data/
│   ├── snapshots/                          # Full snapshots (one per competitor)
│   │   ├── comp-canggu-01.json             #   6 reviews, 2,440 bytes
│   │   ├── comp-seminyak-01.json           #   7 reviews, 2,946 bytes
│   │   └── comp-ubud-01.json               #   7 reviews, 2,808 bytes
│   ├── reviews_new/                        # Delta files (immutable, timestamped)
│   │   ├── comp-canggu-01_20260720T083548Z.json   #   6 reviews
│   │   ├── comp-seminyak-01_20260720T083548Z.json #   7 reviews
│   │   └── comp-ubud-01_20260720T083548Z.json     #   7 reviews
│   ├── run_summary.json                    # Latest run summary (overwritten)
│   ├── run.log                             # Append-only log
│   ├── run.log.YYYYMMDD                    # Rotated log archives (GitHub Actions only)
│   └── raw_html/                           # Defined path but NEVER WRITTEN TO
└── config/
    ├── listings.json                       # Config (not storage, but source of truth)
    └── selectors.json                      # Config
```

### Naming Conventions

| File type | Pattern | Example | Sort behavior |
|---|---|---|---|
| Snapshot | `{competitor_id}.json` | `comp-canggu-01.json` | Flat, no temporal ordering |
| Delta | `{competitor_id}_{YYYYMMDDTHHMMSSZ}.json` | `comp-canggu-01_20260720T083548Z.json` | Lexical sort = chronological |
| Run summary | `run_summary.json` | — | Single file, always latest |
| Run log | `run.log` | — | Append-only |
| Rotated log | `run.log.{YYYYMMDD}` | `run.log.20260720` | Named by rotation date |
| Raw HTML | (defined but unused) | — | — |

### Persistence Strategy

- **Snapshots**: Overwritten every run. The complete review list is always replaced. No incremental update. This is the "latest state" view.
- **Deltas**: Append-only. Each run produces up to 12 new files (one per competitor with new reviews). These provide the "history" view. Never modified after creation.
- **Run summary**: Overwritten every run. Single JSON file with the latest run's aggregate statistics.
- **Run log**: Append-only text file. Rotated at 5 MB in GitHub Actions (Fix D). Never rotated in development.

### Path Strategy Comparison

| Layer | Path style | Base path | Example |
|---|---|---|---|
| Python scraper | Relative | Working directory (implicit) | `data/snapshots/comp-canggu-01.json` |
| Next.js dashboard (`paths.ts`) | Absolute | `/home/z/my-project/gbp-monitor` | `data/snapshots/comp-canggu-01.json` |
| Shell scripts | Absolute | `/home/z/my-project` | `./db/custom.db` (different directory) |

The Python scraper and the Next.js dashboard **must agree on the base path** for the dashboard to find the data files. The hardcoded path in `paths.ts` points to a sandbox-specific location that may not exist in other environments.

---

## Snapshot Lifecycle

### Creation

```python
# In _process_one_listing(), called for every successful parse:
save_snapshot(comp_id, parsed_dicts)
```

A snapshot is created on the first successful parse for a competitor. `save_snapshot()`:
1. Creates `data/snapshots/` directory if it doesn't exist
2. Writes JSON to a `.tmp` file
3. Renames `.tmp` to `{competitor_id}.json`

### Updates

```python
# Every run overwrites the snapshot completely:
save_snapshot(comp_id, parsed_dicts)
```

- **Full replacement, not merge**: The entire snapshot is replaced with the current parse output
- **Always happens**: `save_snapshot()` is called even if there are zero new reviews (delta was empty). Every successful parse produces a new snapshot.
- **Frequency**: Once per competitor per run (daily in production)

### Retrieval

**Python side** (for delta computation):
```python
old = load_snapshot(comp_id)  # list[dict] or []
```

**Dashboard side** (for visualization):
```typescript
const snapshots = await readAllSnapshots();  // Map<string, Review[]>
```

- `load_snapshot()` returns `[]` if file missing or corrupt
- `readAllSnapshots()` iterates over all `.json` files in `data/snapshots/`
- The dashboard's API routes aggregate across all snapshots

### Archival

**Not supported.** Snapshots are overwritten on every successful run. There is no:
- Version history for snapshots
- Backup mechanism
- Snapshot-to-delta cross-reference
- Retention policy

### Deletion

**Not supported.** No function to delete a snapshot exists. Removing a competitor from `listings.json` would orphan the snapshot and delta files — they would remain on disk indefinitely.

---

## File Integrity

### Atomic Writes

`save_snapshot()` uses a write-to-tmp-then-rename pattern:

```python
path = _snapshot_path(competitor_id)       # data/snapshots/comp-x.json
path.parent.mkdir(parents=True, exist_ok=True)
tmp = path.with_suffix(path.suffix + ".tmp")  # data/snapshots/comp-x.json.tmp
tmp.write_text(json.dumps(reviews, ...))       # write to .tmp
tmp.replace(path)                              # atomic rename → comp-x.json
```

This ensures:
- If the process crashes during `write_text()`, only the `.tmp` file is corrupt — the original snapshot is intact
- `path.replace()` (Python 3.8+ `PurePath.replace`) is an atomic filesystem operation on most OSes (POSIX `rename()`, Windows `MoveFileEx` with `MOVEFILE_REPLACE_EXISTING`)
- A half-written snapshot file is never visible to readers

### Overwrite Protection

**None.** `save_snapshot()` always overwrites the existing file without:
- Checking if contents changed (redundant writes)
- Creating a backup before overwriting
- Requiring explicit acknowledgement

### Corruption Handling

`load_snapshot()` handles 3 corruption scenarios:

| Scenario | Detection | Recovery |
|---|---|---|
| File missing | `path.exists()` → False | Returns `[]`, treat as first run |
| Invalid JSON | `json.JSONDecodeError` | WARNING log, returns `[]` |
| Non-list top-level | `not isinstance(data, list)` | WARNING log, returns `[]` |
| OSError (permissions, disk full) | `OSError` | WARNING log, returns `[]` |

**Critical observation**: When a corrupted snapshot is treated as empty, **all currently-parsed reviews are flagged as new**. This means every review in the next successful parse will be written as a delta (double-counting). The comment in the code acknowledges this as "the safe direction to err."

### Interruption Scenarios

| Scenario | Snapshot | Deltas | Summary | Impact |
|---|---|---|---|---|
| Crash mid-write (snapshot `.tmp`) | Unchanged (old file intact) | None written yet | Not yet written | Safe — resume normally |
| Crash mid-write (delta) | Not yet written | None or partial | Not yet written | Partial delta lost. Snapshot not updated — delta may be re-computed on next run |
| Crash mid-write (summary) | Already written | Already written | Previous summary exists | Dashboard sees stale summary. Run is lost from history |
| Crash mid-rename | Hard to trigger (atomic ops) | — | — | File system dependent |
| Concurrent read during write | `.tmp` is not visible (`replace` is atomic). Reader sees old file until write completes | No concurrent writes | No concurrent writes | Dashboard may briefly see stale data |

### Delta Write Integrity

`_append_new_reviews()` does **not** use atomic writes:

```python
_REVIEWS_NEW_DIR.mkdir(parents=True, exist_ok=True)
ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
path = _REVIEWS_NEW_DIR / f"{competitor_id}_{ts}.json"
path.write_text(json.dumps(new_reviews, ...), encoding="utf-8")
```

If the process crashes during `write_text()`:
- A partial delta file is left on disk (valid JSON truncated)
- The dashboard's `readJsonFile()` would catch the `JSONDecodeError` and return `[]` — silently losing that run's delta for that competitor
- The snapshot was already updated, so the delta cannot be recomputed

---

## Delta Detection

### Identity Field

The sole identity field is **`review_id`** — an opaque string from Google Maps' `data-review-id` attribute.

### Algorithm

```python
def compute_new_reviews(old: Iterable[dict], new: Iterable[dict]) -> list[dict]:
    new_list = list(new)
    old_ids = {r.get("review_id") for r in old if r.get("review_id")}
    delta = [
        r for r in new_list
        if r.get("review_id") and r["review_id"] not in old_ids
    ]
    return delta
```

Step by step:
1. Materialize `new` into a list (defensive against generators)
2. Build a set of all non-null `review_id` values from `old`
3. Filter `new` to items whose `review_id` is not in the `old` set
4. Items in `new` missing `review_id` are excluded (defensive filter)

### Detection Types

| Review Type | Detection | Explanation |
|---|---|---|
| **New review** | `review_id NOT IN old_ids` | Correctly detected — this is the only case handled |
| **Edited review** | **NOT detected** | An edited review keeps the same `review_id`. The delta algorithm sees it as "already seen" and skips it. The snapshot overwrites with the edited content, but no delta record is created. |
| **Deleted review** | **NOT detected** | A deleted review disappears from the new parse. The snapshot is overwritten without it. No delta record is created. The deletion is silently accepted and cannot be detected from the history. |
| **Duplicate in same run** | **NOT detected** | If Google returns the same review twice in one HTML page, both copies pass the delta filter (neither is in `old_ids`). The snapshot would contain both. |
| **Unchanged review** | Correctly excluded | Same `review_id` is in `old_ids` — filtered out. |

### Defensive Filters

- **Items in `new` without `review_id`**: Excluded from delta (logged by parser as `skipped_without_id`)
- **Items in `old` without `review_id`**: Silently ignored in set construction (they cannot match any well-formed new review)

### Edit Detection Gap

The delta system cannot detect review edits. If a reviewer changes their rating from 4★ to 5★, the delta algorithm sees the unchanged `review_id` and treats it as "already known." The snapshot is updated (so the new rating is reflected in the dashboard), but the history has no record of the edit.

### Deletion Detection Gap

The delta system cannot detect deletions. If Google removes a review (policy violation, reviewer deletion), the snapshot is overwritten without it. The `total_reviews` count drops, but the delta files never record "−1 removed."

---

## Historical Consistency

### Can Previous States Be Reconstructed?

**Partially, with caveats:**

| Time point | Source | Can we reconstruct? |
|---|---|---|
| Latest state (current) | `data/snapshots/{comp}.json` | **Yes** — full snapshot exists |
| First state (initial scrape) | Oldest delta file + nothing | **Yes** — the first delta contains all reviews (old snapshot was empty) |
| State at run N | Snapshot from run N (overwritten) | **No** — snapshot is overwritten every run |
| What changed in run N | `data/reviews_new/{comp}_{ts}.json` | **Yes** — delta files are immutable |
| Full state at run N | Snapshot at run N (NOT available) + delta at run N | **No** — without the snapshot at that point, the full state cannot be reconstructed from deltas alone |
| Review edits over time | Not recorded | **No** |

### Versioning Strategy

**No versioning exists:**
- No schema version field in snapshots or deltas
- No migration mechanism for schema changes
- No file manifest or checksum file
- No timestamp on snapshot files (filename has no date component)
- No cross-reference between snapshot and delta file contents

### Historical Rollback

**Not possible.** There is no mechanism to revert to a previous state. The only way to "go back" would be to restore from a filesystem-level backup.

---

## Parser Interaction

### Consumption Flow

```python
# In _process_one_listing() (run_all.py:265-284):
parsed = parse_reviews(html, comp_id, branch_id, selectors)   # list[Review]
parsed_dicts = [review_to_dict(r) for r in parsed]           # list[dict]
old = load_snapshot(comp_id)                                   # list[dict] or []
delta = compute_new_reviews(old, parsed_dicts)                 # list[dict]

if delta:
    _append_new_reviews(comp_id, delta)                       # writes delta file
save_snapshot(comp_id, parsed_dicts)                           # overwrites snapshot
```

### Empty Parser Result vs Parser Failure

| Scenario | `parse_reviews()` return | `load_snapshot()` | Orchestrator behavior |
|---|---|---|---|
| Normal parse (has reviews) | `[Review, Review, ...]` | Prior snapshot | Delta computed, both saved |
| Empty page (no reviews) | `[]` | Prior snapshot | Delta empty, snapshot overwritten with `[]`. **Not counted as failure.** |
| Corrupt HTML (locator fails) | `[]` (ERROR log) | Prior snapshot | Delta empty, snapshot overwritten with `[]`. **Not counted as failure.** |
| Exception in parser | Uncaught exception | Not called | Counted as listing failure, snapshot unchanged |
| Missing `selectors.json` key | `KeyError` at `selectors["review_item"]` | Not called | Counted as listing failure, snapshot unchanged |

**Critical gap**: An empty parser result (`[]`) is **indistinguishable** from a parser failure from the storage layer's perspective. Both result in `save_snapshot(comp_id, [])`, which overwrites the prior snapshot with an empty array. This permanently loses all previously collected reviews for that competitor.

In the current fixture data, this specific risk is demonstrated:
- `run_summary.json` shows `new_reviews: 0` for the second run (first run already had all reviews)
- Since the first run produced deltas identical to the snapshots (old was `[]`), and the second run computed delta against the first snapshot, the second run correctly found 0 new reviews
- The delta files from the first run preserve the initial review set, but if the second run had produced empty parser output, the snapshot would have been wiped

---

## Data Flow

### Python Scraper → Disk

```
parser/review_parser.py
    │
    ▼
list[Review] dataclass instances
    │
    ▼ review_to_dict()
    │
list[dict]  (parsed_dicts)
    │
    ├── storedelta.py:compute_new_reviews(old_snapshot_dicts, parsed_dicts)
    │       │
    │       └── Set diff on "review_id"
    │       │
    │       └── list[dict]  (delta)
    │           │
    │           ├── [non-empty] → _append_new_reviews()
    │           │       │
    │           │       └── data/reviews_new/{comp_id}_{ts}.json
    │           │
    │           └── [empty] → skipped, no file written
    │
    └── snapshot_store.py:save_snapshot(comp_id, parsed_dicts)
            │
            ├── data/snapshots/{comp_id}.json.tmp  (atomic write)
            └── rename → data/snapshots/{comp_id}.json

orchestration summary:
    │
    └── _finish_and_write_summary()
            │
            └── data/run_summary.json
```

### Disk → Dashboard

```
data/snapshots/{comp_id}.json          ──┐
data/reviews_new/{comp_id}_{ts}.json   ──┤
data/run_summary.json                  ──┤
data/run.log                           ──┤
config/listings.json                   ──┤
config/selectors.json                  ──┤
                                         │
                                    src/lib/gbp/server-data.ts
                                         │
                                    readJsonFile<T>() / readAllSnapshots() / tailLog()
                                         │
                                    ┌────┴────┐
                                    │         │
                              API Routes    Direct reads
                              (16 routes)   (N/A)
                                    │
                                    ▼
                              React Components
```

### Diagram: Run N vs Run N+1

```
RUN N (initial):
  old = load_snapshot("comp-x") → [] (empty, first run)
  parsed = parse_reviews(html) → [R1, R2, R3]
  delta = compute_new_reviews([], [R1,R2,R3]) → [R1, R2, R3]  (all new)
  _append_new_reviews → data/reviews_new/comp-x_N.json  (3 reviews)
  save_snapshot → data/snapshots/comp-x.json  (3 reviews)

RUN N+1:
  old = load_snapshot("comp-x") → [R1, R2, R3]
  parsed = parse_reviews(html) → [R1, R2, R3, R4]  (one new review)
  delta = compute_new_reviews([R1,R2,R3], [R1,R2,R3,R4]) → [R4]  (one new)
  _append_new_reviews → data/reviews_new/comp-x_N+1.json  (1 review)
  save_snapshot → data/snapshots/comp-x.json  (4 reviews)

RUN N+2 (parser failure — returns []):
  old = load_snapshot("comp-x") → [R1, R2, R3, R4]
  parsed = parse_reviews(bad_html) → []  (ERROR logged but no exception)
  delta = compute_new_reviews([R1,R2,R3,R4], []) → []  (empty)
  (no delta file written)
  save_snapshot → data/snapshots/comp-x.json  []  ← DATA LOST
```

---

## Current Maturity

### Component Classification

| Component | Classification | Evidence |
|---|---|---|
| **`snapshot_store.py`** | **Beta** | Atomic writes via `.tmp` + rename. Defensive loading with 3 corruption scenarios handled. Clean API surface (load, save). Missing: directory existence check on load, integrity hash, backup-before-overwrite. |
| **`delta.py`** | **Stable** | Correct set-diff algorithm for its stated purpose. Defensive filtering for missing `review_id`. Clean pure-function design (no I/O, no side effects). Handles generators correctly via `list(new)`. |
| **`_append_new_reviews()` (orchestration)** | **Alpha** | No atomic write. Timestamp collision possible (same-second runs). Single-threaded only — no concurrency protection. |
| **`_finish_and_write_summary()` (orchestration)** | **Alpha** | Overwrites summary without atomic write. Errors list omitted from log (correct for readability) but included in file (correct for dashboard). |
| **`data/` on-disk layout** | **Alpha** | Functionally works for the 3-competitor fixture set. Missing: organization for large-scale, cleanup mechanism, backup strategy. |
| **`server-data.ts` (dashboard reader)** | **Beta** | Defensive fallbacks for every read. Type-safe via generics. Proper async file I/O. |
| **`paths.ts`** | **Prototype** | Hardcoded absolute paths tied to one sandbox environment. No environment variable configuration. A deployment to any other machine would require source code edits. |

### Overall Subsystem Maturity: **Alpha**

The storage layer is functionally complete for the current 3-competitor fixture set. The core atomic-write and delta-detection mechanisms are correct. However:

- The empty-parse-overwrites-snapshot vulnerability is a critical data-loss risk
- Paths are not portable across environments
- Delta files lack atomic write protection
- No backup, archival, or recovery mechanism exists
- The `raw_html` path is defined but never written to (dead path constant)

---

## Technical Debt

### Critical

| Finding | Evidence | Location |
|---|---|---|
| **Empty parser result overwrites snapshot with `[]`, permanently losing data** | `save_snapshot(comp_id, parsed_dicts)` is called unconditionally after the parser, even if `parsed_dicts` is empty. The prior snapshot is permanently replaced. An empty parse from a transient error would destroy the review baseline. | `run_all.py:282` |
| **Delta files written without atomic protection** | `_append_new_reviews()` calls `path.write_text()` directly. A crash mid-write leaves a partial/truncated file on disk. The dashboard's `readJsonFile()` returns `[]` on `JSONDecodeError`, silently losing that delta. | `run_all.py:351` |
| **Summary file written without atomic protection** | `_finish_and_write_summary()` calls `path.write_text()` directly on `_SUMMARY_PATH`. Same partial-write risk. | `run_all.py:384-386` |

### High

| Finding | Evidence | Location |
|---|---|---|
| **No environment-variable override for GBP data paths** | `paths.ts` hardcodes `/home/z/my-project/gbp-monitor` as `GBP_ROOT`. The Python scraper uses relative paths (`data/snapshots/`). If the dashboard runs on a different machine, it cannot find the data. | `src/lib/gbp/paths.ts:11` |
| **Empty parse indistinguishable from successful parse of 0 reviews** | `parse_reviews()` returns `[]` for both "no reviews on page" and "parser cannot find any review items." Both cases result in `save_snapshot(comp_id, [])` — no exception, no failure count increment. | `run_all.py:265-282` |
| **Snapshot overwritten even when contents haven't changed** | `save_snapshot()` is called every successful run regardless of whether the parsed reviews differ from the prior snapshot. Unnecessary disk I/O and wear. | `run_all.py:282` |
| **`data/raw_html/` path constant defined but never used** | `GBP_RAW_HTML_DIR` exists in `paths.py` (Python) and `paths.ts` (TypeScript). No code writes to it. The live-capture HTML string is discarded after parsing. | `src/lib/gbp/paths.ts:17`, Python `run_all.py` (implied) |

### Medium

| Finding | Evidence | Location |
|---|---|---|
| **No snapshot deletion/orphan cleanup** | Removing a competitor from config leaves its snapshot and delta files on disk forever. No mechanism to purge them. | `snapshot_store.py` (absent) |
| **Delta filename timestamp collision risk** | Two runs in the same second would overwrite the same delta file. The comment acknowledges this but accepts it "for a daily cron job." In a CI retry scenario, this could silently overwrite history. | `run_all.py:344-346` |
| **No golden-file integrity check on snapshots** | No checksum or schema-version field in snapshot JSON. A future schema change would break the dashboard's type assumptions without detection. | `snapshot_store.py` (absent) |
| **`load_snapshot()` does not create the snapshot directory** | `load_snapshot()` calls `os.path.exists()` without creating the directory. The first run relies on `save_snapshot()` to create it, which is correct, but a direct call to `load_snapshot()` before any save would fail silently (returns `[]`). | `snapshot_store.py:48-49` |
| **No concurrency protection** | Multiple processes running `run_all.py` simultaneously would race on snapshot writes, delta writes, and summary writes. No file locking. | Entire subsystem |

### Low

| Finding | Evidence | Location |
|---|---|---|
| **Snapshot size not bounded** | A competitor with thousands of reviews would have a multi-megabyte snapshot file. No pagination, streaming, or compression. | `snapshot_store.py` |
| **`run_summary.json` errors list hidden from dashboard** | The dashboard reads `run_summary.json` which includes the full `errors` list, but the Python-side log strips it. Only the error count is logged. | `run_all.py:368-370` |
| **Delta file JSON is indented** | `json.dumps(reviews, indent=2)` produces human-readable but larger files. For thousands of competitors and hundreds of runs, this adds unnecessary size. | `run_all.py:351-352` |

---

## Risks

### Confirmed Risks

| Risk | Evidence |
|---|---|
| **Empty parser output permanently erases all reviews for a competitor** | `save_snapshot(comp_id, [])` overwrites the prior snapshot if `parse_reviews()` returns `[]`. One bad parse (transient capture error, wrong selectors) destroys the accumulated review database. No undelete mechanism. | `run_all.py:265-282` |
| **Dashboard cannot find data on non-sandbox machines** | `paths.ts` hardcodes `/home/z/my-project/gbp-monitor`. This path is specific to the development sandbox. Any production deployment would need source modification. | `src/lib/gbp/paths.ts:11` |
| **Partial delta files from mid-write crashes silently discarded** | `_append_new_reviews()` writes directly without atomic protection. The dashboard reads with `readJsonFile()` which returns `[]` on `JSONDecodeError` — the run is silently erased from history. | `run_all.py:348-355`, `server-data.ts:98` |

### Potential Risks

| Risk | Evidence |
|---|---|
| **The `data/` directory structure assumes all competitors have a representative in the repository** | Currently only 3 of 12 competitors have snapshot+delta files. The remaining 9 produce no data in `--fixtures` mode. If live mode is run and fails for some competitors, the directory would have mixed presence. |
| **No backup before snapshot overwrite** | A bug in the parser (e.g., injects empty reviews, swaps competitor IDs) would immediately corrupt the snapshot with no way to recover. |
| **Delta files accumulate without bound** | Each run adds up to 12 delta files. Over months of daily runs, thousands of files would accumulate in `data/reviews_new/`. No cleanup or archival mechanism. |
| **`run.log` unbounded growth outside GitHub Actions** | The 5 MB rotation (Fix D) only runs in the GitHub Actions workflow. Local/manual runs do not rotate the log. |
| **Timezone ambiguity in delta filenames** | The `Z` suffix in `YYYYMMDDTHHMMSSZ` indicates UTC, but the `datetime.now(timezone.utc)` call confirms it. However, the `run_summary.json` timestamps use `+00:00` (ISO 8601 format), while delta filenames use `Z`. This inconsistency could confuse automated tooling. |

### Unknown Risks

| Risk | Notes |
|---|---|
| **Filesystem behavior of `Path.replace()` across platforms** | Python's `Path.replace()` is atomic on POSIX and modern Windows. The behavior on network filesystems (NFS, SMB) or FUSE mounts is unknown. |
| **Impact of filesystem permissions on write operations** | The scraper expects write access to `data/`. In a GitHub Actions runner, permissions are well-known. In other deployment targets, this is unknown. |
| **Concurrent dashboard reads during scraper writes** | The dashboard's auto-refresh (30s interval) could read snapshot files while the scraper is writing them. Atomic writes mitigate this for snapshots, but delta files (non-atomic) and the run summary (non-atomic) are at risk. |
| **Max files per directory limits** | With daily runs for 12 competitors, `data/reviews_new/` accumulates ~4,380 files per year. Some filesystems have per-directory file count limits (ext3: 32K, FAT32: 65K). |
| **What happens when `data/` is under version control (git)** | The GitHub Actions workflow commits data files back to the repo. Over time, the git history would bloat with JSON data. The current `data/` directory is NOT in `.gitignore`. |

---

## Missing Tests

### Storage Behaviors That Appear Untested

| Test Scenario | Current Gap |
|---|---|
| **Atomic write correctness** | No test that a simulated crash during `save_snapshot()` leaves the original file intact |
| **Corrupt snapshot recovery** | No test that `load_snapshot()` returns `[]` for various corruption types (truncated JSON, invalid content, non-array) |
| **Delta computation with empty old set** | No test for `compute_new_reviews([], [R1,R2])` (first-run scenario) |
| **Delta computation with empty new set** | No test for `compute_new_reviews([R1,R2], [])` (empty-parse scenario) |
| **Delta computation with no changes** | No test for `compute_new_reviews([R1,R2], [R1,R2])` |
| **Delta computation with duplicates in input** | No test for same `review_id` appearing twice in `new` |
| **Delta computation with missing review_id in old** | No test for items without `review_id` in `old` |
| **Delta computation with missing review_id in new** | No test for items without `review_id` in `new` |
| **Delta computation with generator input** | No test that generator inputs are consumed correctly |
| **Snapshot write + read round-trip** | No test that `save_snapshot()` data can be read back with `load_snapshot()` |
| **Multiple runs without data loss** | No test simulating N sequential runs and verifying total review count |
| **Concurrent read/write scenario** | No test for dashboard reads during scraper writes |
| **`readAllSnapshots()` empty directory** | No test when `data/snapshots/` is missing or empty |
| **`readLatestDelta()` with multiple delta files** | No test that the correct (newest) delta is returned when multiple exist |
| **`readAllDeltas()` sorting** | No test that deltas are sorted newest-first |
| **Parsed-then-empty overwrites snapshot** | No test for the data-loss scenario (parser returns `[]`, snapshot wiped) |
| **Environment variable override for paths** | Not tested (doesn't exist yet) |
| **File permission edge cases** | No test for read-only snapshots or unwritable data directory |

**There is no test runner, no test configuration, and no test command for the Python project.** The entire storage subsystem is functionally tested only by running `python -m orchestration.run_all --fixtures` and manually inspecting the output.

---

## Missing Documentation

| Documentation Gap | Details |
|---|---|
| **Data format specification** | No single document defining the JSON schema for snapshots, deltas, and run summaries. The types are only documented in code comments and TypeScript type definitions. |
| **Storage layout guide** | No document describing the directory structure, naming conventions, or file lifecycle. |
| **Backup and recovery procedure** | No documented process for backing up data or recovering from a corrupted snapshot. |
| **Schema migration strategy** | No documented process for adding/removing fields from the Review schema. |
| **Deployment path configuration** | No document explaining how to configure paths for different environments. The hardcoded path in `paths.ts` is a known gap with no documented workaround. |
| **Delta accumulation and cleanup** | No retention policy or cleanup procedure for delta files. |
| **Data verification procedure** | No documented process for verifying that stored data matches expected values (e.g., run counts, review totals, delta integrity). |
| **`raw_html` path purpose** | The `raw_html` directory path is defined but never used. No documentation explains whether it's for future use or a leftover from an earlier design. |

---

## Questions

1. **Why does `save_snapshot()` always overwrite the snapshot, even when the parser returns an empty list?** This is the single most dangerous architectural decision in the storage layer. Was the unconditional save intentional (to represent "no reviews exist") or an oversight?

2. **Is the `data/raw_html/` path a placeholder for a future feature?** It exists in both `paths.py` (Python) and `paths.ts` (TypeScript) but no code writes to it. Should this path be removed or will raw HTML capture be added later?

3. **How should the hardcoded `GBP_ROOT` path be made configurable?** The path `/home/z/my-project/gbp-monitor` is sandbox-specific. Should it be an environment variable, a command-line argument, or a symlink?

4. **What should happen when snapshots and deltas are out of sync?** If a snapshot is corrupted and reset to `[]`, the next run's delta would contain ALL reviews as new — doubling the total. Should the system detect this and alert?

5. **Are delta files intended to be append-only permanently, or should they be archived/compressed after some threshold?** Daily runs for months would accumulate thousands of small JSON files.

6. **Should `_append_new_reviews()` use atomic writes like `save_snapshot()` does?** The inconsistency (atomic for snapshots, non-atomic for deltas) suggests deltas were an afterthought.

7. **Why is the `run_summary` written with `write_text()` instead of the atomic `.tmp` + rename pattern?** The summary file is read by the dashboard concurrently with writes. Without atomicity, a read during a write could get a partial file.

8. **Is the `data/` directory intended to be committed to git?** The current `data/` contains fixture-generated files. The GitHub Actions workflow commits data changes. Should the entire `data/` directory be in `.gitignore` except for an initial seed?

9. **What is the expected maximum delta file age?** Old delta files are never cleaned up. Should there be a retention policy (e.g., keep last 90 days)?

10. **Should `load_snapshot()` create the snapshots directory if it doesn't exist?** Currently it silently returns `[]`. The directory is only created by `save_snapshot()`. This means the first `load_snapshot()` always returns `[]`, which is correct for first-run detection but inconsistent with the fail-silent pattern.

---

## Recommended Next Audit

### Priority: `src/lib/gbp/` — Dashboard Data Layer

**Justification:**

1. **Completes the data flow audit**: The three Python-side audits (Browser Harness AUDIT-02, Parser AUDIT-03, Storage AUDIT-04) are complete. The final link is the **dashboard-side data layer** — `server-data.ts`, `paths.ts`, `types.ts`, `format.ts`, and `app-mode.ts`. Auditing this module closes the "capture → parse → store → serve" chain.

2. **Path mismatch risk**: The hardcoded path in `paths.ts` is a critical risk identified in this audit. The `server-data.ts` read functions are the sole bridge between Python output and TypeScript consumers. A detailed audit of path handling, type alignment, and error handling would produce actionable findings.

3. **Type alignment verification**: The TypeScript `Review` type in `types.ts` must exactly mirror the Python `Review` schema in `schema.py` and the JSON output files. Any mismatch would cause silent data corruption in the dashboard. Verifying this alignment is a high-value audit task.

4. **Consumer complexity**: `server-data.ts` is consumed by 15 API routes and indirectly by 30+ dashboard components. A defect in any read function would affect multiple parts of the dashboard simultaneously.

5. **Smallest remaining scope**: After `src/lib/gbp/`, the only un-audited major area would be the dashboard API routes (`src/app/api/`) and presentation components (`src/components/dashboard/`), which can be audited in subsequent passes.
