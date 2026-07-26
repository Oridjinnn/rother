# Monitoring Guide — Rother

This guide covers built-in monitoring capabilities and how to verify the system is healthy.

---

## 1. Health Endpoint

**`GET /api/health`** — returns server status, uptime, and configuration presence.

```json
{
  "ok": true,
  "timestamp": "2026-07-26T18:00:00.000Z",
  "uptime": 3600,
  "environment": "production",
  "apiKeyConfigured": true,
  "pythonScraperAvailable": true,
  "configPresent": {
    "listings": true,
    "selectors": true
  },
  "dataDirectory": true,
  "version": "0.2.0"
}
```

### What to check

| Field | Healthy | Unhealthy |
|-------|---------|-----------|
| `ok` | `true` | `false` |
| `pythonScraperAvailable` | `true` | Scraper binary missing |
| `configPresent.listings` | `true` | No competitor config loaded |
| `configPresent.selectors` | `true` | No CSS selectors loaded |
| `dataDirectory` | `true` | Data directory inaccessible |

### External monitoring

You can curl the health endpoint from cron or an external uptime monitor:

```bash
curl -s http://localhost:3000/api/health | jq .
```

For production deployments with `API_KEY` set, GET requests **do not** require authentication.

---

## 2. Scrape Status

**`GET /api/scrape/status`** — returns the last scrape run and its result.

Check that scrapes are completing successfully by inspecting the `status` field:

- `"completed"` — last scrape finished normally
- `"running"` — a scrape is in progress (normal if trigger was just called)
- `"failed"` — last scrape errored; check `error` for details

---

## 3. Offline Detection (Client-Side)

The dashboard includes a built-in offline detector (`src/hooks/use-online-status.tsx`):

- When the browser goes offline, a persistent toast appears: *"You are offline"*
- When connectivity returns, a success toast appears: *"Back online"*
- TanStack Query caches are invalidated on reconnect, triggering automatic data refresh
- The `isOnline` state is available via `useOnlineStatus()` hook for custom UI

No additional configuration is required. Works automatically in any modern browser.

---

## 4. Authentication & Rate Limiting

The middleware (`src/middleware.ts`) enforces:

- **Rate limiting:** 20 requests per minute per IP per endpoint. Returns 429 when exceeded.
- **API key auth:** Required for POST/PATCH/PUT/DELETE requests when `API_KEY` is set.
- **Read access:** GET/HEAD requests are always allowed (no auth needed).

If the API key is not configured (development mode), all requests pass through freely.

---

## 5. Logging

The dashboard provides a **Logs** tab (`/api/logs`) that shows recent scrape-runner output. Logs are stored as JSON files in the data directory under `data/logs/`.

For production troubleshooting:

```bash
# Tail the most recent log
ls -t data/logs/*.json | head -1 | xargs cat

# Check Next.js server logs
journalctl -u rother --since "1 hour ago"
```

---

## 6. Common Health Checks

### 6.1 Is the server running?

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health
# Expected: 200
```

### 6.2 Is the scraper working?

Trigger a scrape and check status:

```bash
# Trigger (requires API_KEY in production)
curl -X POST http://localhost:3000/api/scrape/trigger \
  -H "Authorization: Bearer $API_KEY"

# Wait 30s, then check status
curl -s http://localhost:3000/api/scrape/status | jq .status
# Expected: "completed"
```

### 6.3 Are all API routes responding?

```bash
for route in health overview branches reviews logs alerts; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/api/$route")
  echo "$route: $status"
done
```

---

## 7. Alerting

The dashboard's **Alerts** tab shows configured alert rules. Currently, alerts are UI-only (displayed in the dashboard). For external alerting (email, Slack, etc.), integrate the health endpoint with an external monitoring service like UptimeRobot, Better Uptime, or a simple cron + webhook script.

---

## 8. Performance Considerations

- The health endpoint is lightweight (no DB queries, no file reads beyond `existsSync`)
- Scrape status reads a single JSON file
- Rate limiting is in-memory; resets on server restart
- For high-volume monitoring (>1 req/sec), add a CDN or reverse proxy caching layer
