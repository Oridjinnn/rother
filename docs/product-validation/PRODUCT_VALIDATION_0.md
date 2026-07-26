# Product Validation 0 — Rother

**Date:** 2026-07-25  
**Auditor:** PV0 agent (fresh-eyes first-time user)  
**Version:** 0.0.1  
**Target:** Windows desktop users, browser-based UI

> /PITFALLS /KILLCRITIC — No code modifications. Only observation.

---

## Scoring

| Dimension | Score (1–10) | Interpretation |
|-----------|:---:|---|
| **Installation** | 4 | Works but confusing brand identity, heavy deps, contradictory docs |
| **Workflow** | 3 | Core loop works but configuration requires JSON editing, client mode cripples essential features |
| **UI / UX** | 5 | Clean shadcn foundation but no server rendering, no streaming, no mobile, brand ambiguity |
| **Performance** | 4 | Large JS bundle, no code splitting, synchronous scraper, no caching |
| **Reliability** | 6 | API responses consistent, error handling present, but scrape trigger blocks server |
| **Confidence** | 3 | Not shippable to end users in current state — missing fundamental UX patterns |

**Overall Score: 4.2 / 10** — Foundation is solid (shadcn/ui, Next.js, structured data) but the product experience is incomplete for end users. This is a developer tool wearing a client mode costume.

---

## Phase 1 — Installation Validation

### Procedure
Followed `README.md` quickstart verbatim on Windows 11 with Node.js 22.11.0.

### Step-by-step findings

| Step | Result | Finding |
|------|--------|---------|
| `npm install` | ✅ | 669 packages in 447ms (cached) — heavy for a review monitor |
| `npx prisma db push` | ✅ | "Database already in sync" — but Prisma is documented as "scaffold only, not used by the dashboard" |
| `npm run dev` | ✅ | Ready in 553ms (warm) / ~6s (cold) |

### Issues

**C1. Package name describes tech stack, not the product.**  
`package.json` line 2: `"name": "nextjs_tailwind_shadcn_ts"` — this is a tech-stack description, not a product name. A user installing the product would see "nextjs_tailwind_shadcn_ts" in their taskbar/process list.

**C2. HTML title is "GBP Monitor — Copenhagen Bali", not "Rother".**  
`layout.tsx` line 19: `title: "GBP Monitor — Copenhagen Bali"`. This is a project name, not a product name. The app-mode system calls it "Rother" but the browser tab says something different. Brand identity is fractured three ways: "nextjs_tailwind_shadcn_ts" (package), "GBP Monitor — Copenhagen Bali" (title), "Rother" (UI text).

**H3. Prisma is required but documented as unused.**  
README says "Not used by the dashboard runtime — scaffold only" yet `npx prisma db push` is a required setup step. This contradiction confuses users. If Prisma isn't used, why is it a dependency? If it is required, why say it's not used?

**H4. 669 npm packages for a review monitor.**  
The dependency list includes 48+ shadcn/ui components (mostly unused), framer-motion, recharts, react-markdown, react-syntax-highlighter, dnd-kit, embla-carousel, vaul, cmdk, z-ai-web-dev-sdk, and more. A user might reasonably question why a review monitoring tool needs drag-and-drop, a carousel, a drawer component, and an AI dev SDK.

**M5. No one-click installer.**  
Windows users need to manually install Node.js, npm, Python, Playwright, and run three separate commands. No `.exe`, no `msi`, no `winget` package.

**M6. .env.example shows only DATABASE_URL.**  
The `.env` file has a single variable. Environment variables like `GBP_MONITOR_DATA_DIR`, `GBP_MONITOR_MIN_DISK_BYTES`, `GBP_MONITOR_LOG_LEVEL` are documented in the gbp-monitor subsystem but not in the main dashboard `.env.example`.

**M7. Scraper setup is a separate concern but mixed into same README.**  
The README has an entire "Scraper (gbp-monitor/)" section referencing `pip install` and `playwright install chromium`. A dashboard-only user doesn't need this, but there's no clear separation.

**L8. No startup script for Windows.**  
The `.zscripts/` directory has shell scripts (Unix-only). Windows users must know the npm scripts by heart.

---

## Phase 2 — Daily Workflow Audit

### Workflow 1: Add a competitor

| Step | UX | Finding |
|------|----|---------|
| Find "Add" button | ❌ | No "Add Competitor" button exists |
| Navigate to Config | ❌ | Config tab is hidden in client mode (`showConfigTab: false`) |
| Discover dev mode | ❌ | Must know to append `?mode=dev` to the URL — undocumented in UI |
| Edit JSON | ❌ | Must edit JSON directly — no form, no dropdowns, no place_id picker |
| Save | ⚠️ | PATCH endpoint validates, but user must know JSON schema |

**C3. Impossible to add a competitor in client mode.**  
Client mode (`/` without `?mode=dev`) hides the Config tab entirely. An end user has no way to:
- Add a new competitor
- Remove a competitor
- Change a Google Maps URL
- See which place_ids are configured

**C4. Only way to configure is raw JSON editing.**  
The Config tab shows a raw JSON textarea. No form fields, no dropdown for branches, no place_id validation. If a user types invalid JSON, the error message is a generic "Invalid JSON" toast with no pointer to the exact line or field.

### Workflow 2: Run a scrape

| Step | UX | Finding |
|------|----|---------|
| Click "Update Now" | ✅ | Button is prominent in header |
| See progress | ⚠️ | Spinner on button only — no progress bar, no "3/12 competitors done" |
| Wait for completion | ⚠️ | No ETA, no status messages during run |
| See results | ⚠️ | Toast shows "+X new reviews" but can be "+0" when no deltas |
| Verify data refreshed | ⚠️ | Auto-refresh only on Overview tab (30s interval, opt-in) |

**H5. No scrape progress indicator.**  
During a scrape, the only feedback is a spinning icon on the "Update Now" button and a toast saying "Spawning python3...". A real-time log panel or per-competitor progress would help.

**H6. "Update Now" label is misleading.**  
Client mode calls it "Update Now" which implies a lightweight API refresh. What actually happens: `spawnSync('python3', ['-m', 'orchestration.run_all', '--fixtures'])` — a synchronous subprocess that launches Playwright and Chromium. The mental model mismatch is significant.

**H7. "+0 new reviews" is confusing.**  
When fixtures don't produce new deltas (expected — fixtures are static HTML), the toast says "+0 new reviews". A user may think "nothing happened" or "it's broken".

### Workflow 3: Review scraped data

| Step | UX | Finding |
|------|----|---------|
| See KPIs | ✅ | KPI cards show branches, competitors, reviews |
| See charts | ⚠️ | Charts load but with 83% empty data (10/12 competitors have 0 reviews) |
| Browse reviews | ✅ | Paginated table with filters |
| View competitor detail | ✅ | Sheet slide-in with reviews list |
| Compare branches | ✅ | Compare tab shows side-by-side |

**H8. 10 of 12 competitors show "No snapshot yet".**  
Only 2 out of 12 competitors have fixture data. The other 10 show empty states throughout the dashboard. This makes the product look broken or incomplete on first launch, even though it's just a fixture limitation.

### Workflow 4: Export data

| Step | UX | Finding |
|------|----|---------|
| Click export button | ✅ | Download icon in header |
| Select format | ✅ | CSV/JSON options in dialog |
| Export | ✅ | Works for reviews, competitors, branches, history |

**L9. Export dialog always shows full options.**  
Even when 0 reviews exist, the export dialog shows all export types. Empty CSV files may confuse users.

### Workflow 5: Review alerts

| Step | UX | Finding |
|------|----|---------|
| Navigate to Alerts tab | ✅ | Visible in all modes |
| See alerts | ✅ | Already shows "CSS selectors degraded" |
| Filter by type | ✅ | Dropdown filter |
| Dismiss | ✅ | Per-alert dismiss + "Dismiss all" button |
| Follow up | ❌ | No action links, no "go to run log" for scrape failures |

**M10. Alerts are client-side dismissed only.**  
Dismissed alerts reappear on page refresh because dismissal is stored in React state, not persisted. A user who dismisses 20 alerts and refreshes will see all 20 again.

---

## Phase 3 — UI / UX Audit

### Screen-by-screen evaluation

#### Overview Tab

| Aspect | Rating | Notes |
|--------|:------:|-------|
| Layout | 7/10 | Clean card grid, responsive breakpoints |
| KPI cards | 8/10 | Clear labels, good use of icons and accents |
| Health panel | 8/10 | Stacked proportion bar is informative |
| Charts | 6/10 | "Unproven" banner visible in dev mode, but many charts show empty states |
| Chart content | 4/10 | 83% of space is empty states because 10/12 competitors have no data |
| Scrollable | 7/10 | Long page — 20+ distinct sections |

**C5. Entire page is a single client component.**  
`page.tsx` uses `"use client"` at the top. This means:
- No server-side rendering for the dashboard
- The entire JS bundle must download, parse, and execute before any content is visible
- No streaming, no Suspense boundaries, no progressive enhancement
- SEO is non-existent (irrelevant for an internal tool, but impacts perceived performance)

**C6. All 16+ chart components imported upfront.**  
The overview-section.tsx imports CompetitorRadarChart, NewReviewsPerBranchChart, RatingDistributionChart, ReviewsPerCompetitorChart, SentimentDistributionChart, ReviewsOverTimeCard, ReviewLengthsCard, CompetitorLeaderboard, ReviewRecencyHeatmap, ReviewWordCloud, CompetitorGrowthRate, RunComparisonCard, TopReviewers, ReviewLanguageDistribution, CompetitorCorrelation, CompetitorRatingDistComparison — all loaded even if the user immediately switches to the Branches tab.

**H11. Reviewer names contain ", original" suffix.**  
API response shows `"reviewer_name": "Tom Baker, original"`. The TypeScript types document this: "May contain the suffix `, original` from the Google Maps aria-label — strip it client-side before display." But the API returns the raw value, and the reviews-section.tsx applies `cleanReviewerName()` only in the display layer. This means:
- Raw data contains developer-facing artifacts
- Any consumer of the API must know to strip the suffix
- The suffix is visible in the branches-section.tsx competitor sheet (the cell uses `cleanReviewerName` but some display paths may not)

#### Branches Tab

| Aspect | Rating | Notes |
|--------|:------:|-------|
| Accordion pattern | 8/10 | Intuitive, first branch auto-opened |
| Competitor cards | 7/10 | Clean, clear info hierarchy |
| Competitor sheet | 7/10 | Slide-in works well, shows stats header |
| Empty competitors | 4/10 | 10/12 show "No snapshot yet" — dominates the view |

**M12. Branch accordion shows `branch_id` in UI.**  
`branches-section.tsx` line 427: `{branch.branch_id}` displayed alongside `branch_name`. End users don't need to see internal IDs.

#### Compare Tab

| Aspect | Rating | Notes |
|--------|:------:|-------|
| Side-by-side | 7/10 | Clean card comparison |
| Empty data | 3/10 | Both sides show "No snapshot yet" for most competitors |

**L10. Empty comparison is confusing.**  
Two empty cards side-by-side with no guidance on what to do next.

#### Reviews Tab

| Aspect | Rating | Notes |
|--------|:------:|-------|
| Filter bar | 8/10 | Branch, competitor, rating, date range, search |
| Table | 8/10 | Sortable, paginated, expandable text |
| Export | 7/10 | Disabled when no data (good), CSV/JSON options |
| Star rating filter | 7/10 | Button-style rating picker is clean |

**M13. "Show less" should be "Collapse".**  
`reviews-section.tsx` line 776: `expanded ? "show less" : "expand"`. Should be `expanded ? "collapse" : "expand"` for consistency with common UI patterns.

**L11. "999+" hardcoded max for badge.**  
`page.tsx` line 409: `badgeCount > 999 ? "999+" : badgeCount`. Fine for pilot but worth noting.

#### Alerts Tab

| Aspect | Rating | Notes |
|--------|:------:|-------|
| Alert cards | 8/10 | Clear severity colors, type labels, timestamps |
| Dismiss | 6/10 | Client-side only, not persisted |
| Filter | 7/10 | By type, useful |

**M10 (repeated). Dismissal is not persisted.**  
Already documented above.

### Global UX

| Aspect | Rating | Notes |
|--------|:------:|-------|
| Navigation | 8/10 | Tab-based, clear labels, icons |
| Keyboard | 6/10 | Gmail-style shortcuts (g → letter) but undocumented in UI |
| Theme toggle | 8/10 | Light/dark with system detection |
| Responsive | 5/10 | Breakpoints exist but no mobile verification |
| Loading states | 6/10 | Skeletons for initial load, no progress for actions |
| Error states | 7/10 | EmptyState component used consistently |
| Accessibility | 4/10 | aria-labels present on many elements, but no keyboard testing done |

**C7. No loading.tsx or error.tsx boundaries.**  
Next.js App Router supports route-level `loading.tsx` and `error.tsx` files. Neither exists. A crash in any section propagates to the entire page.

**C8. No keyboard navigation testing.**  
The keyboard shortcuts system (g → letter) is clever but:
- Not discoverable — no hint on initial load
- The "?" shortcut help doesn't auto-trigger on first visit
- Shortcuts don't work when an input is focused (correct behavior) but no visual indicator shows this

**M14. Theme flickers on load.**  
The `ThemeProvider` uses `disableTransitionOnChange` but no SSR-safe theme detection. Users may see a flash of light theme before dark mode applies.

---

## Phase 4 — Performance Audit

### Measured Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| Server cold start | ~6s | First `npm run dev` |
| Server warm start | 553ms | Turbopack cache hit |
| Page HTML size | 42 KB | Initial HTML |
| JS bundle (estimated) | ~900 KB+ | 48+ UI components + 38 dashboard + recharts + framer-motion |
| Overview API | 1.6 KB | 6 concurrent reads (run summary, selectors, listings, snapshots x delta) |
| Branches API | 3.2 KB | Per-competitor stats |
| Reviews API (page 1) | 2.4 KB | 25 reviews + metadata |
| Config API | 1.3 KB | listings.json |
| Alerts API | 0.6 KB | 2 alerts |
| Scrape trigger (fixtures) | 0.6s | spawnSync Python |
| Total page resources | ~2.5 MB | Estimated from Next.js chunk patterns |

### Issues

**C9. No code splitting across tabs.**  
All 7 tabs' components are bundled into the initial JavaScript payload. Switching tabs does not lazy-load — all code is already in memory. A user who only wants the Overview tab pays the full cost of the Reviews table, the Config editor, the Logs viewer, etc.

**C10. No API response caching.**  
Every API route uses `force-dynamic` and `Cache-Control: no-store`. This means:
- Every navigation or tab switch re-fetches all data
- The auto-refresh on Overview tab (30s) hits the API even if nothing changed
- No stale-while-revalidate pattern

**H12. Scrape trigger blocks the server.**  
`spawnSync` is synchronous — it blocks the Node.js event loop for the duration of the Python subprocess (0.6s for fixtures, potentially 60s for live). During this time, the server cannot respond to other requests.

**H13. Heavy dependency graph.**  
Framer Motion (animation) + Recharts (charting) + 48 shadcn/ui components + react-markdown + react-syntax-highlighter + dnd-kit + embla-carousel — all imported eagerly. The `page.tsx` imports these transitively through the dashboard components. Estimated initial JS: 900 KB+.

**M15. Multiple API calls on page load.**  
The main page makes 6+ API calls in parallel (overview, branches, selectors, reviews count, etc.). On a slow network, this creates a "staggered loading" visual effect.

**L12. No compression verification.**  
Next.js with Turbopack should enable gzip/brotli, but not verified in this audit.

---

## Top 20 Improvements Ranked by Impact

| Rank | ID | Finding | Severity | Impact | Effort |
|:----:|:--:|---------|:--------:|:------:|:------:|
| 1 | C5 | Full page is client-rendered — no SSR, no streaming | Critical | Performance | High |
| 2 | C3 | Client mode hides Config tab — cannot add competitors | Critical | Workflow | Medium |
| 3 | C1 | Package name is "nextjs_tailwind_shadcn_ts" not "rother" | Critical | Brand | Low |
| 4 | C2 | HTML title is "GBP Monitor — Copenhagen Bali" not "Rother" | Critical | Brand | Low |
| 5 | C6 | 16+ chart components all loaded upfront, no tab-level code splitting | Critical | Performance | Medium |
| 6 | C4 | Only raw JSON editing for configuration — no form UI | Critical | Workflow | High |
| 7 | C7 | No loading.tsx or error.tsx boundaries | Critical | Reliability | Low |
| 8 | C9 | No code splitting across tabs | Critical | Performance | Medium |
| 9 | C10 | No API response caching — all endpoints force-dynamic | Critical | Performance | Medium |
| 10 | H5 | No scrape progress indicator | High | UX | Low |
| 11 | H6 | "Update Now" label misleading — implies API call, launches Playwright | High | UX | Low |
| 12 | H8 | 10/12 competitors empty — first-run experience looks broken | High | Onboarding | Medium |
| 13 | H11 | Reviewer names contain ", original" suffix | High | Polish | Low |
| 14 | H12 | Scrape trigger blocks server (spawnSync) | High | Reliability | Medium |
| 15 | H13 | Heavy dependency graph (900 KB+ JS) | High | Performance | High |
| 16 | H3 | Prisma required but documented as unused | High | Documentation | Low |
| 17 | H4 | 669 npm packages — excessive for a review monitor | High | Maintainability | High |
| 18 | M12 | Branch IDs visible in UI (internal implementation detail) | Medium | Polish | Low |
| 19 | M13 | "show less" should be "collapse" | Medium | Polish | Low |
| 20 | M10 | Alert dismissals not persisted (client-side only) | Medium | UX | Low |

---

## Defect Classification Summary

| Severity | Count | IDs |
|----------|:-----:|-----|
| **Critical** | 9 | C1, C2, C3, C4, C5, C6, C7, C9, C10 |
| **High** | 8 | H3, H4, H5, H6, H8, H11, H12, H13 |
| **Medium** | 3 | M10, M12, M13 |
| **Low** | 5 | L8, L9, L10, L11, L12 |
| **Enhancement** | — | — |

---

## Verdict

Rother has a solid technical foundation: Next.js 16, Turbopack, shadcn/ui, structured data from the Python scraper, and a clean component architecture. The app-mode system (client vs dev) shows thoughtful consideration of the end-user experience.

However, the product is **not ready for end users** in its current state. The critical issues are:

1. **Brand is fractured three ways** — the package, the HTML title, and the UI all call it different things
2. **Client mode is too restrictive** — hiding the Config tab makes the product unusable for its primary purpose (configuring competitors)
3. **Performance is not optimized for production** — no code splitting, no SSR, no caching, synchronous scrape
4. **The first-run experience is poor** — 83% empty data, no onboarding flow, no clear "what to do next"

The product scores **4.2/10** overall. It needs significant UX work before it can be presented as a polished Windows desktop product comparable to GMB Everywhere.
