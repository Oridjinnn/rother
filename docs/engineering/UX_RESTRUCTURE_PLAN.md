# UX Restructure Plan — One Feature = One Screen

## Problem
The 4-hub shell exposed only 1–2 features per hub, and each feature rendered a
dashboard *section* that stacked 10–20 panels on one long scrollable page
(`overview-section.tsx` alone renders KPIs, run health, rating distribution,
sentiment, new-reviews-per-branch, reviews-over-time, review lengths, word
cloud, leaderboard, radar, run comparison, run history, heatmap, growth rate,
top reviewers, language, correlation, rating-dist comparison — all in one
scroll). That is not simple.

## Principle (client / UX lead decision)
- Every hub shows many features.
- Every feature = exactly **one page, one purpose**.
- The page itself must **not scroll**; only an inner region scrolls when a list
  is genuinely longer than one viewport (reviews, logs, leaderboard, branches).

## Approach
Every dashboard panel is already a standalone, exported component and most are
self-fetching. We:
1. Expanded the `FEATURES` registry from 8 → 28 entries (one per panel).
2. Added a `FeaturePage` shell that locks to one viewport with an internal scroll
   region, so the document body never scrolls.
3. Added two tiny data hooks (`useOverview`, `useBranches`) for the few panels that
   currently receive `data` props from a parent section.
4. Each `src/features/<id>.tsx` adapter renders exactly one panel.

## Feature inventory

> Baseline below is **28**. The shipped `FEATURES` registry grew to **30** with
> the limitation work (`c-discover` — category discovery, partial P1; `c-geo-grid`
> — static Leaflet map, partial P4). After consolidation (#11) **3 entries are
> merged → canonical count is now 27**.

### Insights (business health) — 9
| id | label | component | data |
|----|-------|-----------|------|
| i-kpis | KPIs | `KpiRow` (new) | /api/overview |
| i-run-health | Run Health | `RunHealthCard` (new) | /api/overview |
| i-rating-distribution | Rating Distribution | `RatingDistributionChart` | /api/overview |
| i-reviews-per-competitor | Reviews / Competitor | `ReviewsPerCompetitorChart` | /api/overview |
| i-sentiment | Sentiment | `SentimentDistributionChart` | /api/overview |
| i-new-reviews-branch | New Reviews / Branch | `NewReviewsPerBranchChart` | /api/overview |
| i-snapshot-glance | Snapshot at a Glance | `SnapshotGlance` (new) | /api/overview |
| i-run-comparison | Run Comparison | `RunComparisonCard` | self (/api/history) |
| i-run-history | Run History | `RunHistoryTimeline` | self (/api/history) |

### Reputation (reviews) — 8
| id | label | component | data |
|----|-------|-----------|------|
| r-reviews | All Reviews | `ReviewsSection` | self (/api/reviews) |
| r-reviews-over-time | Reviews over Time | `ReviewsOverTimeCard` | self |
| r-review-lengths | Review Lengths | `ReviewLengthsCard` | self |
| r-word-cloud | Review Word Cloud | `ReviewWordCloud` | self |
| r-language | Review Language | `ReviewLanguageDistribution` | self |
| r-recency-heatmap | Review Recency | `ReviewRecencyHeatmap` | self (/api/history) |
| r-top-reviewers | Top Reviewers | `TopReviewers` | self |
| r-alerts | Alerts | `AlertsSection` | self (/api/alerts) |

### Competitors — 9
| id | label | component | data |
|----|-------|-----------|------|
| c-branches | Branches & Competitors | `BranchesSection` | /api/branches |
| c-compare | Branch Comparison | `BranchComparisonSection` | /api/branches |
| c-leaderboard | Leaderboard | `CompetitorLeaderboard` | /api/overview |
| c-comparison | Competitor Comparison | `CompetitorRadarChart` | /api/overview |
| c-growth-rate | Growth Rate | `CompetitorGrowthRate` | /api/overview |
| c-correlation | Competitor Correlation | `CompetitorCorrelation` | self (/api/competitor-correlation) |
| c-rating-dist-comparison | Rating Distribution Compare | `CompetitorRatingDistComparison` | self |
| c-discover | Category Discovery | (partial — P1) | self (/api/discover) |
| c-geo-grid | Geo Grid Map | `LeafletMap` (static — partial P4) | self (/api/geo-grid) |

### Tools — 4
| id | label | component | data |
|----|-------|-----------|------|
| t-config | Configuration | `ConfigSection` | self (/api/config) |
| t-logs | Run Logs | `LogsSection` | self (/api/logs) |
| t-export | Export Data | `ExportDashboardDialog` | n/a |
| t-scrape-schedule | Scrape Schedule | `ScrapeSchedule` | dev only |

## Tasks

### A. Shared infrastructure
- [x] `src/lib/gbp/use-overview.ts` — `useOverview()` hook (fetch /api/overview)
- [x] `src/lib/gbp/use-branches.ts` — `useBranches()` hook (fetch /api/branches)
- [x] `src/components/shell/feature-page.tsx` — one-viewport page wrapper (header + internal scroll)
- [x] `src/components/dashboard/kpi-row.tsx` — `KpiRow` (extract KPI grid from overview-section)
- [x] `src/components/dashboard/run-health.tsx` — `RunHealthCard` (extract RunHealthPanel + VerificationBadge)
- [x] `src/components/dashboard/snapshot-glance.tsx` — `SnapshotGlance` (extract competitor grid)

### B. Insights features (9)
- [x] `src/features/i-kpis.tsx`
- [x] `src/features/i-run-health.tsx`
- [x] `src/features/i-rating-distribution.tsx`
- [x] `src/features/i-reviews-per-competitor.tsx`
- [x] `src/features/i-sentiment.tsx`
- [x] `src/features/i-new-reviews-branch.tsx`
- [x] `src/features/i-snapshot-glance.tsx`
- [x] `src/features/i-run-comparison.tsx`
- [x] `src/features/i-run-history.tsx`

### C. Reputation features (8)
- [x] `src/features/r-reviews.tsx`
- [x] `src/features/r-reviews-over-time.tsx`
- [x] `src/features/r-review-lengths.tsx`
- [x] `src/features/r-word-cloud.tsx`
- [x] `src/features/r-language.tsx`
- [x] `src/features/r-recency-heatmap.tsx`
- [x] `src/features/r-top-reviewers.tsx`
- [x] `src/features/r-alerts.tsx`

### D. Competitors features (7)
- [x] `src/features/c-branches.tsx`
- [x] `src/features/c-compare.tsx`
- [x] `src/features/c-leaderboard.tsx`
- [x] `src/features/c-comparison.tsx`
- [x] `src/features/c-growth-rate.tsx`
- [x] `src/features/c-correlation.tsx`
- [x] `src/features/c-rating-dist-comparison.tsx`

### E. Tools features (4)
- [x] `src/features/t-config.tsx`
- [x] `src/features/t-logs.tsx`
- [x] `src/features/t-export.tsx`
- [x] `src/features/t-scrape-schedule.tsx`

### F. Registry + shell wiring
- [x] Rewrite `src/lib/features.tsx` `FEATURES` (28 entries, correct hub/icon/label/description/keywords/load)
- [x] Update `src/components/shell/section-view.tsx` LAZY map (28) + wrap active feature in `FeaturePage`
- [x] Delete superseded old adapters (`insights, reviews, alerts, branches, compare, config, logs, export`)
- [x] Verify `command-palette.tsx` reads `FEATURES` (auto-includes new features)

### G. Verification
- [x] `npx tsc --noEmit` passes (exit 0)
- [x] `npm run lint` passes (exit 0)
- [x] `next build` passes (standalone output ready)
- [x] Dev server renders HTTP 200, no runtime errors

---

## Execution Prompt B — User Business + Category + Run Gate

Adds the single-business onboarding model on top of the 4-hub shell: the user
logs in, names **their own** business (name + location + **category**), runs a
live scrape, and only then sees the hubs. The seeded Copenhagen Bali demo stays
hidden from the UI.

### H. App state + flow gate
- [x] `src/lib/app-state.tsx` — `AppProvider` with `user`, `business`, `runStarted`, `hub`; `login`/`setBusiness`/`setActiveBusiness`/`startRun`/`openHub`; selecting a business resets `runStarted`
- [x] `setBusiness` / `setActiveBusiness` persist the business and clear the Run gate
- [x] `src/lib/app-state.tsx` — `BusinessProfile` carries `category` / `categoryId`
- [x] `src/components/shell/app-shell.tsx` — gate order: `LoginScreen` → `Onboarding` → `RunScreen` → Hubs (hubs hidden until `runStarted`)

### I. Category dimension
- [x] `src/lib/categories.ts` — `BUSINESS_CATEGORIES` (curated list), `searchCategories()`, `getCategory()`
- [x] `src/components/shell/onboarding.tsx` — adds the **category** step (searchable picker) alongside name + location

### J. Run screen (Run gate)
- [x] `src/components/shell/run-screen.tsx` — centered, single-viewport screen; "Run" → `POST /api/scrape/trigger` with `{ name, location, category, categoryId }`; reveals hubs whether the scrape succeeds or fails
- [x] `src/components/shell/login-screen.tsx` — mock "Sign in with Gmail" (no real auth yet)

### K. Backend wiring for the user's business
- [x] `src/lib/gbp/types.ts` — `ActiveBusiness` (id, name, location, category, categoryId, scrapedAt)
- [x] `src/lib/gbp/paths.ts` — `GBP_USER_BUSINESS_PATH` (config/user-business.json)
- [x] `src/lib/gbp/server-data.ts` — `readActiveBusiness()`; `readListings()` returns `[]` once a user business is active (seed demo hidden)
- [x] `src/app/api/scrape/trigger/route.ts` — persists `{ name, location, category, categoryId }` to `user-business.json` BEFORE the run; targets the user's business, not the seed demo

### L. Documentation (this pass)
- [x] `docs/product/03_USER_FLOWS.md` — Flow 8 (Login → Onboarding → Run → Hubs)
- [x] `docs/product/04_SCREEN_MAP.md` — S00 (Login / Onboarding / Run), hubs hidden until Run
- [x] `docs/product/02_INFORMATION_ARCHITECTURE.md` — single-business scoping principle + category dimension
- [x] `docs/engineering/ENGINEERING_BASELINE.md` — stable scope + "user only sees own business" invariant
- [x] `docs/management/MASTER_RISK_REGISTER.md` / `TECHNICAL_DEBT_REGISTER.md` — close single-business assumption; new deferred live-scrape item
- [x] `docs/engineering/API_REFERENCE.md` — `POST /api/scrape/trigger` request body + user-business targeting
- [x] `CHANGELOG.md` / `KNOWN_LIMITATIONS.md` — increment entry + limitations

> **Deferred (not part of this increment, tracked as RISK-028):** the live
> scrape of an arbitrary user business by category + location is not yet
> supported backend-side. The Run gate therefore often lands the user on empty
> states; this is expected and does not block navigation.
