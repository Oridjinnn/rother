# API Reference — Rother

All API routes are served under `/api/`. Unless noted, responses are JSON.

## Authentication

- **GET/HEAD** requests to any `/api/` route do not require authentication.
- **POST/PATCH/PUT/DELETE** requests require `Authorization: Bearer <API_KEY>` when the `API_KEY` environment variable is set.
- If `API_KEY` is not configured (development mode), all requests pass through freely.

## Rate Limiting

- 20 requests per minute per IP per endpoint.
- Exceeded requests return `429 Too Many Requests`.

---

## Health

### `GET /api/health`

Server health check. Lightweight (no DB queries).

```json
{
  "ok": true,
  "timestamp": "2026-07-26T18:00:00.000Z",
  "uptime": 3600,
  "environment": "production",
  "apiKeyConfigured": true,
  "pythonScraperAvailable": true,
  "configPresent": { "listings": true, "selectors": true },
  "dataDirectory": true,
  "version": "0.2.0"
}
```

---

## Dashboard Data

### `GET /api/overview`

Aggregated data for the Overview tab. Returns run summary, selector verification, totals, rating distribution, new reviews per branch/competitor, errors, and alert status.

```json
{
  "runSummary": { "success": 8, "failed": 0, "skipped": 2, "errors": [], "started_at": "...", "finished_at": "..." },
  "selectorVerification": { "verified_by": "browser_agent", "last_verified": "...", "isUnproven": false },
  "totalBranches": 6,
  "totalCompetitors": 12,
  "totalReviews": 342,
  "newReviewsLastRun": 5,
  "ratingDistribution": [{ "rating": 1, "count": 12 }, ...],
  "errors": [],
  "isAlert": false,
  "newReviewsPerBranch": [{ "branch_id": "...", "branch_name": "...", "count": 2 }],
  "competitorStats": [{ "competitor_id": "...", "name": "...", "branch_name": "...", "total_reviews": 28, "average_rating": 4.2, "new_reviews_count": 1, "last_scraped_at": "..." }]
}
```

### `GET /api/branches`

Branch × competitor tree with per-competitor stats (total reviews, avg rating, new reviews, trend, latest review).

```json
{
  "branches": [{
    "branch_id": "cph-seminyak",
    "branch_name": "Copenhagen Bali - Seminyak",
    "total_reviews": 42,
    "new_reviews_count": 2,
    "review_velocity": 0.5,
    "last_scrape": "2026-07-25T10:30:00Z",
    "competitors": [{
      "competitor_id": "comp-1", "name": "Starbucks",
      "total_reviews": 28, "average_rating": 4.2,
      "last_scraped_at": "...", "new_reviews_count": 1,
      "latest_review": { "text": "...", "relative_date": "2 days ago", "rating": 4 },
      "average_review_length": 95,
      "trend_indicator": "up"
    }]
  }],
  "totalCompetitors": 12,
  "totalReviews": 342
}
```

### `GET /api/reviews`

Paginated, filtered reviews list.

| Query param | Type | Default | Description |
|-------------|------|---------|-------------|
| `branch_id` | string | — | Filter by branch |
| `competitor_id` | string | — | Filter by competitor |
| `rating` | string | — | Comma-separated star ratings (e.g. `1,2`) |
| `date_from` | string (ISO) | — | Filter `scraped_at >= date_from` |
| `date_to` | string (ISO) | — | Filter `scraped_at <= date_to` |
| `q` | string | — | Case-insensitive search on reviewer name + text |
| `page` | int | 1 | 1-indexed page number |
| `pageSize` | int | 25 | Results per page (max 100) |

```json
{
  "data": [{ "review_id": "...", "competitor_id": "...", "reviewer_name": "...", "rating": 4, "text": "...", "relative_date": "2 days ago", "scraped_at": "...", "branch_id": "..." }],
  "total": 342,
  "page": 1,
  "pageSize": 25
}
```

### `GET /api/health-trend`

Health sparkline data from run log. Parses run summary lines and builds a chronological array (capped at last 20 runs).

```json
{
  "points": [{ "success": 8, "failed": 0, "skipped": 2, "timestamp": "2026-07-25T10:30:00Z", "level": "healthy" }],
  "latest": { "success": 8, "failed": 0, "skipped": 2, "level": "healthy", "timestamp": "..." },
  "isMultiPoint": true
}
```

### `GET /api/reviews-over-time`

Time series of review counts grouped by scraped date.

```json
{
  "data": [{ "date": "2026-07-20", "new_reviews": 15, "cumulative": 15 }],
  "totalPoints": 5,
  "totalReviews": 342
}
```

### `GET /api/review-lengths`

Distribution of review text lengths (empty, short, medium, long, very long).

```json
{
  "buckets": [
    { "label": "Empty", "range": "0 chars", "count": 12, "color": "oklch(...)" },
    { "label": "Short", "range": "1–80", "count": 45, "color": "oklch(...)" }
  ],
  "stats": { "total": 342, "withText": 330, "average": 95, "median": 72, "min": 0, "max": 1200 }
}
```

### `GET /api/competitor-correlation`

Rating distribution similarity matrix (cosine similarity, capped at 12 competitors).

```json
{
  "competitors": [{ "competitor_id": "...", "name": "...", "branch_name": "...", "distribution": [1, 2, 5, 12, 8] }],
  "matrix": [[1, 0.85, 0.72], [0.85, 1, 0.91], [0.72, 0.91, 1]],
  "maxCompetitors": 12
}
```

### `GET /api/alerts`

Computed alerts from run failures, new reviews, review spikes, and selector degradation.

```json
{
  "alerts": [{
    "id": "new-reviews-comp-1-20260725T103000Z",
    "type": "new_reviews",
    "severity": "info",
    "title": "New reviews for Starbucks",
    "description": "3 new reviews in the latest scrape",
    "competitor_id": "comp-1",
    "timestamp": "2026-07-25T10:30:00Z",
    "source": "delta",
    "delta_count": 3
  }],
  "total": 1
}
```

---

## Scrape

### `POST /api/scrape/trigger`

Start a scrape run. Requires auth when `API_KEY` is set.

| Query param | Type | Default | Description |
|-------------|------|---------|-------------|
| `mode` | string | `fixtures` | `fixtures` or `live` |

```json
{ "ok": true, "runId": "run_20260725T103000Z" }
```

Error response:
```json
{ "ok": false, "error": "...", "stderr": "", "stage": "spawn_failed", "probable_cause": "...", "suggested_fix": "..." }
```

### `GET /api/scrape/trigger`

Ping — returns `{ "ok": true }`. Useful for quick connectivity checks.

### `GET /api/scrape/status`

Get status of a scrape run.

| Query param | Type | Default | Description |
|-------------|------|---------|-------------|
| `runId` | string | **required** | Run ID from trigger response |

```json
{ "ok": true, "status": "completed", "started_at": "...", "finished_at": "...", "success": 8, "failed": 0, "skipped": 2, "errors": [] }
```

---

## History

### `GET /api/history`

Chronological timeline of all runs that produced new reviews.

```json
{
  "runs": [{
    "run_timestamp": "2026-07-25T10:30:00Z",
    "total_new_reviews": 5,
    "competitors_with_new": 3,
    "branches_affected": ["cph-seminyak", "cph-canggu"],
    "breakdown": [{ "competitor_id": "comp-1", "competitor_name": "Starbucks", "branch_id": "...", "branch_name": "...", "count": 2 }]
  }],
  "totalRuns": 1
}
```

### `GET /api/history/export?format=csv|json`

Export full run history as CSV (default) or JSON download.

### `GET /api/history/compare`

Compare two historical snapshots of a competitor's reviews.

| Query param | Type | Default | Description |
|-------------|------|---------|-------------|
| `competitor_id` | string | **required** | Competitor to compare |
| `older_ts` | string | — | Older snapshot timestamp |
| `newer_ts` | string | — | Newer snapshot timestamp |

If only one timestamp is given, compares against the latest (or previous). If neither, compares latest two.

```json
{
  "competitor_id": "comp-1",
  "competitor_name": "Starbucks",
  "branch_name": "Copenhagen Bali - Seminyak",
  "older": [{ "review_id": "...", "rating": 4, "text": "...", "scraped_at": "..." }],
  "newer": [{ "review_id": "...", "rating": 5, "text": "...", "scraped_at": "..." }],
  "older_timestamp": "2026-07-20T08:00:00Z",
  "newer_timestamp": "2026-07-25T10:30:00Z",
  "older_count": 25,
  "newer_count": 28,
  "new_in_newer": ["review-1", "review-2"],
  "removed_from_newer": [],
  "rating_changed": [{ "review_id": "...", "old_rating": 4, "new_rating": 5 }]
}
```

---

## Config

### `GET /api/config/listings`

Returns the full listings.json (branches + competitors configuration).

### `PATCH /api/config/listings`

Update branch/competitor configuration. Requires auth. Request body must be a JSON object with a `branches` array. Each branch requires `branch_id`, `branch_name`, and `competitors` array (each with `competitor_id`, `name`, `gmaps_url`). Validates uniqueness and required fields; returns `422` on validation failure.

### `GET /api/config/selectors`

Returns the selectors.json with computed `_health` metadata.

---

## Logs

### `GET /api/logs?lines=200`

Tail the scraper run log.

| Query param | Type | Default | Description |
|-------------|------|---------|-------------|
| `lines` | int | 200 | Number of lines to return (max 2000) |

```json
{ "lines": ["2026-07-25 10:30:00,123 INFO starting scrape..."], "totalLines": 500, "requestedLines": 200 }
```

---

## Exports

### `GET /api/reviews/export?format=csv|json&branch_id=&competitor_id=&rating=&q=`

Download all reviews matching filters as CSV (default) or JSON. Same filter semantics as `GET /api/reviews` but no pagination.

### `GET /api/export/branches?format=csv|json`

Export branch summary (branch_id, name, competitor count, total reviews, new reviews, last scrape).

### `GET /api/export/competitors?format=csv|json`

Export per-competitor details (id, name, branch, URL, total reviews, avg rating, new reviews, avg review length, latest review, last scrape).

---

## Error Format

All error responses follow a consistent pattern:

```json
{
  "error": "human-readable error summary",
  "detail": "sanitized technical detail (no filesystem paths or server internals)"
}
```

HTTP status codes:
- `400` — missing/invalid parameters
- `401` — missing/invalid API key
- `404` — resource not found
- `422` — validation failure
- `429` — rate limited
- `500` — internal server error

---

## Response Headers

All data endpoints set `Cache-Control: no-store` to prevent stale dashboard data.
