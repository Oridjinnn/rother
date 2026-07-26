# Data Architecture

**Document ID:** PADR-003
**Date:** 2026-07-24
**Status:** DRAFT — for review

---

## Current Storage Model

```
data/
├── snapshots/
│   ├── comp-seminyak-01/
│   │   ├── latest.json              ← pointer file (contains filename)
│   │   └── 2026-07-24T14-29-52Z.json ← immutable versioned snapshot
│   ├── comp-canggu-01/
│   │   ├── latest.json
│   │   └── 2026-07-24T14-29-52Z.json
│   └── comp-ubud-01/
│       ├── latest.json
│       └── 2026-07-24T14-29-52Z.json
├── reviews_new/
│   ├── comp-canggu-01_20260724T142952Z.json
│   └── comp-ubud-01_20260724T142952Z.json
├── run_summary.json                 ← latest run summary (replaced each run)
├── run.log                          ← append-only structured log
├── selector_report.json             ← latest selector health (replaced)
├── selector_history.json            ← rolling window of last 50 reports
├── .run.lock                        ← lock file (ephemeral)
└── verify/                          ← verify-mode evidence (large, transient)
    └── 20260724T142317Z/
        ├── report.json
        ├── selector_report.json
        ├── comp-canggu-01/
        │   ├── page.png
        │   └── page.html
        └── comp-seminyak-01/
            ├── page.png
            └── page.html
```

---

## Storage Classification

### Permanent (will remain files indefinitely)

| Store | Reason | Evidence |
|---|---|---|
| `config/listings.json` | Human-editable config; source of truth for competitor list | `config/listings.json` |
| `config/selectors.json` | Human-editable config; DOM selectors with health metadata | `config/selectors.json` |
| `golden-datasets/` | Immutable regression evidence; referenced by verify_baseline | `golden/promote.py` |
| `tests/fixtures/*.html` | Static test fixtures; pinned to specific HTML snapshots | `tests/fixtures/` |

**Rationale:** These are source-of-truth files that are edited by humans and consumed by the tool. Moving them to a database would reduce accessibility without benefit.

### Transitional (should become database tables)

| Store | Current | Future |
|---|---|---|
| `data/snapshots/{comp_id}/{ts}.json` | Versioned JSON snapshots | Database table `reviews` with `competitor_id`, `scraped_at` index |
| `data/reviews_new/{comp_id}_{run_id}.json` | Delta files (new reviews per run) | Database query: `SELECT * FROM reviews WHERE scraped_at > last_run` |

**Rationale:** These stores grow linearly with competitors and runs. File-based storage has no indexing, no querying, no relational integrity, and no efficient aggregation. A database replaces both with a single `reviews` table.

### Transient (no long-term persistence needed)

| Store | Current | Future |
|---|---|---|
| `data/run_summary.json` | Latest run summary | API endpoint response; not stored |
| `data/selector_report.json` | Latest selector health | API endpoint response; not stored |
| `data/.run.lock` | Lock file | Replaced by database row lock or Redis lock |
| `data/verify/{ts}/` | Verify-mode evidence | Optional: move to golden-datasets/ if promoted |
| `data/raw_html/` | Gitignored raw captures | Not stored |

### Archives (cold storage)

| Store | Current | Future |
|---|---|---|
| `data/run.log` | Append-only log | Log aggregation system (e.g., ELK) |
| `data/selector_history.json` | Last 50 reports | Database table `selector_history` |

---

## Database Recommendations

### When to Add a Database

**Trigger:** When competitor count exceeds 50 AND either:
- Dashboard is being built (needs fast queries), OR
- File count exceeds 10,000 snapshot files (degrades filesystem performance)

**Estimated timeline:** M14-M16 (after Docker + CLI, before scalability work)

### Which Database

**Recommendation:** SQLite (embedded, zero-config, single-file)

| Factor | SQLite | PostgreSQL | MySQL |
|---|---|---|---|
| Setup cost | Zero (Python stdlib `sqlite3`) | Requires Docker/server | Requires Docker/server |
| Performance (1000 competitors) | Adequate for local queries | Excellent | Excellent |
| Concurrency | Single-writer (adequate for daily cron) | Multi-writer | Multi-writer |
| Backup | Single file copy | pg_dump | mysqldump |
| Complexity | Minimal | Significant | Significant |
| Best for | Internal tool, <500 competitors | Multi-client platform | Multi-client platform |

**Decision:** SQLite for the internal tool phase. PostgreSQL if/when multi-tenancy is needed.

### Proposed Schema

```sql
-- Core review data
CREATE TABLE reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    review_id TEXT NOT NULL UNIQUE,
    competitor_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    reviewer_name TEXT,
    rating REAL,
    text TEXT,
    relative_date TEXT,
    scraped_at TEXT NOT NULL,  -- ISO 8601
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_reviews_competitor ON reviews(competitor_id);
CREATE INDEX idx_reviews_scraped ON reviews(scraped_at);
CREATE INDEX idx_reviews_competitor_scraped ON reviews(competitor_id, scraped_at);

-- Run history
CREATE TABLE runs (
    run_id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    success INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    skipped INTEGER DEFAULT 0,
    new_reviews INTEGER DEFAULT 0,
    total_reviews INTEGER DEFAULT 0
);

-- Config versions (audit trail)
CREATE TABLE config_versions (
    version_id INTEGER PRIMARY KEY AUTOINCREMENT,
    config_type TEXT NOT NULL,  -- 'listings' or 'selectors'
    content TEXT NOT NULL,       -- JSON blob
    created_at TEXT DEFAULT (datetime('now')),
    note TEXT
);
```

### Migration Strategy

**Phase 1 (Dual-write):** Write to both JSON files AND SQLite for 2 weeks.
- All readers continue to use JSON files
- SQLite writer is added alongside existing writers
- Verify SQLite data matches JSON data

**Phase 2 (Read from SQLite):** Switch dashboard and tools to read from SQLite.
- JSON files continue as backup/legacy format
- Verify no regression in data access

**Phase 3 (JSON files optional):** Make JSON writes optional (config flag).
- Keep JSON writes for debugging and transparency
- Default to SQLite-only for performance

---

## Data Flow (Recommended)

```
Current:
  Capture → Parse → JSON Snapshots → JSON Deltas
             ↓                        ↓
      JSON files (unindexed)    JSON files (unindexed)

Recommended:
  Capture → Parse → SQLite Reviews Table
             ↓                  ↓
      JSON Snapshots     SQL Queries for:
      (legacy backup)    - Dashboard
                         - Delta detection
                         - Aggregations
                         - History
```

---

## File Retention Policy

| Store | Retention | Action After |
|---|---|---|
| JSON snapshots | 90 days | Archive to compressed storage or delete |
| JSON deltas | 30 days | Delete (recoverable from SQLite) |
| run.log (local) | 90 days or 5MB | Rotate + compress |
| run.log (CI) | 5MB threshold | Auto-rotate per `scrape.yml:49-62` |
| verify/evidence | 7 days | Delete |
| selector_history | Last 50 entries | Rolling window (already implemented) |
| golden-datasets | Permanent | Immutable regression evidence |

---

## Key Decision Summary

| Decision | Choice | Rationale |
|---|---|---|
| Database type | SQLite | Zero-config, stdlib, adequate for internal tool |
| JSON files during transition | Dual-write for 2 weeks | Ensures no data loss during migration |
| Config files stay as JSON | Permanent | Human-editable source of truth |
| Snapshot files become archival | 90-day retention | Bound storage growth |
| Verify evidence is transient | 7-day retention | Too large for permanent storage |
| Golden datasets remain files | Permanent | Immutable regression evidence |
