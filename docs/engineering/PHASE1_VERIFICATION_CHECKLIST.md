# Phase 1 — Safety Gates Verification Checklist

Run this checklist after all Phase 1 changes have been deployed to a staging environment.

---

## Repository Hygiene

- [ ] `git status` shows no unexpected tracked files in `db/`, `data/`, `tool-results/`, `.zscripts/dev.pid`, `.env`
- [ ] `.gitignore` contains entries for `db/`, `data/`, `tool-results/`, `gbp-monitor/data/backups/`, `Rother - *`
- [ ] `gbp-monitor/.gitignore` contains entries for `data/run.log`, `data/backups/`

## Build and TypeScript

- [ ] `npm run build` completes successfully (exit code 0)
- [ ] `npm run test` passes all 44 tests
- [ ] `npx tsc --noEmit` returns zero errors
- [ ] Production output at `.next/standalone/` is generated

## Authentication

### With API_KEY set:

- [ ] `GET /api/overview` returns 200 (no auth required for GET)
- [ ] `POST /api/scrape/trigger` returns 401 when no `Authorization` header present
- [ ] `POST /api/scrape/trigger` returns 401 when wrong `Authorization` header value given
- [ ] `POST /api/scrape/trigger` returns 200 when correct `Authorization: Bearer <key>` header given
- [ ] `PATCH /api/config/listings` returns 401 when no auth header
- [ ] `PATCH /api/config/listings` returns 401 when wrong auth header
- [ ] `PATCH /api/config/listings` returns 200 when correct auth header

### Without API_KEY (unset):

- [ ] `POST /api/scrape/trigger` returns without 401 (dev mode)
- [ ] `PATCH /api/config/listings` returns without 401 (dev mode)

## Rate Limiting

- [ ] Sending 25+ POST requests to `/api/scrape/trigger` within 60 seconds returns 429 (rate limited)
- [ ] Waiting 60 seconds after rate limit clears the limiter
- [ ] GET requests are not rate-limited (or have different limit)

## Security Headers

- [ ] `curl -I http://localhost:3000/` includes `Content-Security-Policy` header
- [ ] Response includes `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- [ ] Response includes `X-Frame-Options: DENY`
- [ ] Response includes `X-Content-Type-Options: nosniff`
- [ ] Response includes `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] Response includes `Permissions-Policy` header

## Error Boundaries

- [ ] Navigate to `http://localhost:3000/` — page loads normally
- [ ] Force a render error (e.g., add `throw new Error("test")` in a component temporarily) — error page displays instead of white screen
- [ ] Click "Try again" button — page recovers
- [ ] Revert test error after verifying

## Process Timeout

- [ ] Start a scrape run
- [ ] Verify the Python process is spawned
- [ ] Wait for the timeout duration (default 10 min) — process is killed
- [ ] Status endpoint reports "failed" with timeout error message
- [ ] No orphaned Python processes remain after timeout

## Dashboard Deployment

- [ ] Dashboard starts with `pm2 start .next/standalone/server.js --name rother-dashboard`
- [ ] Dashboard is accessible at `http://localhost:3000/`
- [ ] `GET /api/overview` returns JSON data
- [ ] `GET /api/branches` returns JSON data
- [ ] Environment variables are loaded from `.env`
- [ ] `API_KEY` is read and enforced for mutating endpoints

## Startup/Shutdown

- [ ] `pm2 restart rother-dashboard` completes within 10 seconds
- [ ] After restart, API responses return within 2 seconds
- [ ] After shutdown, port 3000 is released
- [ ] On restart, data from previous runs (snapshots, deltas) is still accessible

## Documentation

- [ ] `docs/engineering/DEPLOYMENT_GUIDE.md` exists with Windows and Docker instructions
- [ ] `docs/engineering/DISASTER_RECOVERY.md` exists with procedures for all 7 scenarios
- [ ] `.env.example` exists with all documented environment variables
- [ ] `README.md` correctly references `API_KEY` and `SCRAPER_TIMEOUT_MS`

## Regression

- [ ] Dashboard renders all sections: Overview, Branches, Compare, Reviews, Alerts
- [ ] Charts render with data (no empty states unless expected)
- [ ] Scrape trigger works (non-blocking, returns runId)
- [ ] Status polling works during active scrape
- [ ] Progress bar displays in header during scrape
- [ ] Export functionality works (CSV, JSON)
- [ ] All 44 unit tests pass
