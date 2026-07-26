# Scalability Report — GBP Monitor

**Date:** 2026-07-24
**Current Scale:** 12 competitors, 4 branches

---

## Current Architecture

```
Sequential per-listing pipeline:
  [Browser Launch] → [Capture] → [Parse] → [Delta] → [Save] → [Delay] → [Next]
                   ↑                                    ↓
              Single context                   Single thread
```

### Resource Profile (per competitor at 12-scale)

| Resource | Per Competitor | 12 Competitors Total |
|---|---|---|
| Capture time | ~15s (real) / ~0.03s (fixtures) | ~3 min (real) |
| Parse time | ~0.1s | ~1.2s |
| Delta computation | ~0.01s | ~0.12s |
| Snapshot write | ~0.05s | ~0.6s |
| HTML size in memory | ~500 KB | ~6 MB |
| Disk per snapshot | ~500 KB | ~6 MB |
| Browser launch | 1.25s (one-time) | 1.25s |

---

## Scale Estimates

### Assumptions
- Sequential processing (current architecture)
- 15s average capture time per listing (M10-optimized, from `SELECTOR_CHANGELOG.md`)
- 500KB average HTML size
- 5-10s random polite delay between listings
- Daily runs
- Versioned snapshots stored per run (365 runs/year)

### CPU

| Competitors | CPU Time (sequential) | Wall Clock |
|---|---|---|
| 12 (current) | ~5 min | ~5 min |
| 50 | ~21 min | ~21 min |
| 100 | ~42 min | ~42 min |
| 500 | ~3.5 hr | ~3.5 hr |
| 1000 | ~7 hr | ~7 hr |

**Analysis:** At 50+ competitors, sequential processing exceeds the GitHub Actions 30-min timeout (`scrape.yml:29`). At 100+, wall clock exceeds practical daily window.

**Finding SC-1:** Sequential processing is the #1 scalability bottleneck. At 50 competitors, runtime exceeds CI timeout.

### Memory

| Competitors | Peak RSS (sequential) | Peak RSS (3-worker concurrent) |
|---|---|---|
| 12 | ~200 MB | ~400 MB |
| 50 | ~300 MB | ~700 MB |
| 100 | ~400 MB | ~1 GB |
| 500 | ~1.5 GB | ~4 GB |
| 1000 | ~3 GB | ~8 GB |

**Finding SC-2:** Memory is not a bottleneck for sequential processing (each page released before next). But Playwright's Chromium process uses ~150 MB baseline regardless of page count.

### Disk

| Competitors | Per Run | Per Year (365 runs) |
|---|---|---|
| 12 | ~6 MB | ~2.2 GB |
| 50 | ~25 MB | ~9 GB |
| 100 | ~50 MB | ~18 GB |
| 500 | ~250 MB | ~91 GB |
| 1000 | ~500 MB | ~183 GB |

**Finding SC-3:** Annual disk usage at 1000 competitors reaches 183 GB — significant for a monitoring tool. No retention policy exists to bound storage.

### Snapshot File Count

| Competitors | Files per Run | Files per Year |
|---|---|---|
| 12 | 12 | 4,380 |
| 100 | 100 | 36,500 |
| 1000 | 1000 | 365,000 |

**Finding SC-4:** At 1000 competitors with daily runs, the filesystem will contain 365,000+ snapshot files after one year. Directory listing performance degrades with >100K files on most filesystems.

### Dashboard Responsiveness

**Note:** Dashboard is not yet implemented. Estimated based on reading JSON files:

| Competitors | Latest Snapshot Read | Full History Load |
|---|---|---|
| 12 | <100ms | ~200ms |
| 100 | ~200ms | ~1s |
| 500 | ~1s | ~5s |
| 1000 | ~2s | ~10s+ |

**Finding SC-5:** Without indexing or database, loading full review history for 1000 competitors will be slow. Consider SQLite backend for dashboard.

---

## Bottlenecks

### Bottleneck 1: Sequential Processing (HIGH)

**Location:** `orchestration/run_all.py:458-488`
```python
for branch in listings.get("branches", []):
    for comp in branch.get("competitors", []):
        _process_one_listing(...)
```

**Impact:** At scale, each competitor adds ~15-25s. 1000 competitors = 7+ hours.

**Recommendation:**
```python
from concurrent.futures import ThreadPoolExecutor
with ThreadPoolExecutor(max_workers=3) as pool:
    futures = [pool.submit(_process_one_listing, ...) for ...]
```
Each worker gets its own browser context. Cap at 3-4 workers to avoid IP-level rate limiting.

### Bottleneck 2: No Snapshot Retention (HIGH)

**Location:** `storage/snapshot_store.py:107-125`
**Impact:** 365,000 files/year at 1000 competitors. No cleanup mechanism.

**Recommendation:**
```python
# Add retention policy
MAX_SNAPSHOT_AGE_DAYS = 90
def prune_snapshots(competitor_id: str, max_age_days: int = 90):
    """Remove snapshots older than max_age_days."""
    ...
```

### Bottleneck 3: No Caching (MEDIUM)

**Location:** `harness/capture.py:141-213`
**Impact:** Every live run re-downloads all competitor pages. At 1000 competitors × 500KB = 500MB per run.

**Recommendation:** Add an in-memory HTTP cache keyed by URL that expires after 1 hour. Skip re-download if page hasn't changed (use ETag or Last-Modified).

### Bottleneck 4: No Data Indexing (MEDIUM)

**Impact:** Reading all snapshots for dashboard requires scanning directories and parsing JSON files. No indexing.

**Recommendation:** Add an SQLite database that mirrors snapshot data with indexes on `competitor_id`, `scraped_at`, `review_id`. Write to both JSON (for backup/compatibility) and SQLite (for fast queries).

---

## Recommended Architecture for Scale

### Short-term (< 100 competitors)

```
┌──────────────────┐
│  Sequential loop  │  ← OK within CI timeout
│  (current)        │
└──────────────────┘
```

Changes: Add snapshot retention policy (keep 90 days).

### Medium-term (100-500 competitors)

```
┌───────────────────┐
│  ThreadPoolExecutor│  ← 3 workers, each with own browser
│  max_workers=3     │
└───────────────────┘
   ↕          ↕
Browser 1  Browser 2  Browser 3
```

Changes:
- Parallelize with 3 workers
- Add snapshot retention (keep 30 days)
- Add HTTP caching (1 hour TTL)
- Increase CI timeout to 60 min

### Long-term (500-1000+ competitors)

```
┌─────────────────────┐
│  Work Queue          │  ← Redis/SQS for distributed processing
│  (distributed)       │
└─────────────────────┘
   ↕        ↕        ↕
Worker 1  Worker 2  Worker N
```

Changes:
- Distributed processing with work queue
- Database-backed storage (PostgreSQL/TimescaleDB)
- Dashboard with pagination and search
- Snapshot archival to S3/blob storage
- Monitoring and alerting infrastructure

---

## Recommendations (Priority Order)

| Priority | Change | Impact | Effort |
|---|---|---|---|
| P1 | Add snapshot retention (90 day max) | Saves disk, prevents 365K files | 1 day |
| P2 | Parallelize with ThreadPoolExecutor (3 workers) | 3x throughput at 100+ scale | 2 days |
| P3 | Add HTTP caching (1 hour TTL) | Reduces bandwidth, speeds re-runs | 1 day |
| P4 | Increase CI timeout from 30 min to 60 min | Enables 50-100 competitors | 5 min |
| P5 | Add SQLite index for fast dashboard | Enables responsive dashboard at scale | 3 days |
| P6 | Implement distributed processing | Enables 500+ competitors | 2 weeks |
