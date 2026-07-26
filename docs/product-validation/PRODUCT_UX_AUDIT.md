# Product UX Audit — Rother v0.0.1

**Date:** 2026-07-25  
**Auditor:** First-time customer (Windows, Chrome)  
**Benchmark:** GMB Everywhere (Windows desktop product)  
**Mode:** Client mode (`/`), some Dev mode (`/?mode=dev`) checks  

---

## 1. Branding Consistency

| Issue | Severity | Detail |
|-------|:--------:|--------|
| Package name `"nextjs_tailwind_shadcn_ts"` | P0 | Shows in taskbar, process list, and developer tools |
| HTML `<title>` says "Rother" | P0 | Browser tab never shows "Rother" |
| Header says "Rother" but subtitle says "Competitor review insights" | P1 | End user should see the product as self-standing |
| App-mode system creates two brands: "Rother" vs "Rother (Dev)" | P2 | End users see only "Rother", but the Dev suffix leaks into screenshots |
| Favicon is a generic SVG from a CDN | P1 | No custom favicon — uses third-party URL that could break |
| OG metadata references "Rother" | P2 | Social share previews use old name |
| VSCode/explorer shows "nextjs_tailwind_shadcn_ts" folder | P1 | The root folder name is "Rother - 0.0.1" but the package is not renamed |

### Root cause
The product was originally built for a specific client and later rebranded to "Rother" (a product name). The rebranding was done in the UI layer (`app-mode.ts`) but not in the project metadata, package configuration, or build output.

### Recommended solutions
- Rename `package.json` → `"name": "rother"`
- Update `layout.tsx` metadata → `title: "Rother"`
- Replace CDN favicon with a custom Rother icon
- Remove Copenhagen Bali references from product-level strings (keep in default config data)

---

## 2. Navigation Clarity

### Tab system
| Aspect | Rating | Notes |
|--------|:------:|-------|
| Tab labels | 8/10 | Clear, concise, with icons |
| Tab order | 7/10 | Overview → Branches → Compare → Reviews → Alerts → Logs → Config |
| Tab discoverability | 5/10 | 7 tabs shown in dev mode, 5 in client. No visual indicator of hidden tabs |
| Active tab indicator | 7/10 | shadcn/tabs underline + color |
| Tab persistence | 3/10 | Navigating away and back resets to Overview tab |
| Keyboard navigation | 6/10 | `g` + letter shortcuts work but undiscoverable |

| Issue | Severity | Detail |
|-------|:--------:|--------|
| No URL-based tab state | P1 | `tab` state is in React, not the URL. Cannot link to the Reviews tab |
| Logs tab shows internal file path to `data/run.log` | P1 | Client mode hides the tab entirely, but if visible in dev mode, users see filesystem paths |
| No breadcrumb | P2 | Single-level navigation is fine for now, but multi-level drill-downs (competitor detail) have no back-navigation affordance |

---

## 3. Information Architecture

### What's where

| Feature | Location | Discoverability |
|---------|----------|:---------------:|
| KPI overview | Overview tab | ✅ Prominent |
| Branch drill-down | Branches tab | ✅ Accordion |
| Side-by-side comparison | Compare tab | ✅ But "Historical" sub-tab hidden |
| Review search | Reviews tab | ✅ Full filter bar |
| Alerts | Alerts tab | ✅ |
| Config editing | Config tab (dev only) | ❌ Hidden in client mode |
| Log viewer | Logs tab (dev only) | ❌ Hidden in client mode |
| Export | Header icon + Reviews tab dropdown | ⚠️ Two entry points for the same thing |
| Keyboard shortcuts | Hidden behind `?` key | ❌ Undiscoverable |

| Issue | Severity | Detail |
|-------|:--------:|--------|
| Two export entry points have different scope | P2 | Header export dialog covers all data types. Reviews tab export covers only reviews. The distinction is unclear |
| No "getting started" panel | P1 | First-time users see charts before any onboarding |
| Config tab should be accessible in client mode | P0 | Without it, users cannot add competitors |

---

## 4. Dashboard Hierarchy

| Issue | Severity | Detail |
|-------|:--------:|--------|
| Overview tab has 20+ distinct sections | P2 | Information density is overwhelming. Charts for rating distribution, sentiment, word cloud, recency heatmap, language distribution, correlation matrix — most shown even with minimal data |
| KPI row is good | ✅ | 5 KPIs (Branches, Competitors, Reviews, New, Last Updated) + 1 dev-only (Selector Verification) |
| Health panel is good | ✅ | Stacked bar + stats footer are clear |
| Section ordering | P2 | Word cloud appears before competitor leaderboard. Heatmap appears before growth rate. The visual hierarchy doesn't follow user priority |
| Empty states take up full chart space | P2 | When 10/12 competitors have no data, each empty state card is a full chart-sized box |

---

## 5. Visual Alignment

| Component | Alignment Issue | Severity |
|-----------|----------------|:--------:|
| KPI cards | Consistent 24px gap, uniform height | ✅ |
| Chart cards | Consistent header/content padding | ✅ |
| Filter bar labels | Uppercase tracking, 11px — consistent | ✅ |
| Tab bar icons | All 16x16, consistent with labels | ✅ |
| Footer badges | Selector verification badge misaligns with health dot on narrow screens | P2 |
| Competitor cards in Branches tab | Uneven heights when some have reviews and others don't | P2 |
| Empty state icon | Centered but 48px circle is large for the space it occupies | P3 |

---

## 6. Spacing Consistency

| Pattern | Spacing | Found In |
|---------|---------|----------|
| Section vertical gap | `space-y-6` (24px) | Overview tab |
| Card grid gap | `gap-4` (16px) | All grids |
| Card padding | `p-5` (20px) header, `p-5` content | KpiCard |
| Card header padding | `pb-3` (12px) | BranchComparisonCard |
| Tab list padding | `p-1` (4px) | Tab bar |
| Filter bar spacing | `gap-3` (12px) | Reviews filter |

Mostly consistent. Minor deviation: `KpiCard` uses `p-5` everywhere while `BranchComparisonCard` header uses `pb-3` — causes vertical rhythm inconsistency when cards are stacked.

---

## 7. Responsive Layouts

| Breakpoint | Grid Columns | Issues |
|:----------:|:------------:|--------|
| Default | 1 | ✅ All content stacks |
| `sm` (640px) | 2 | KPI row wraps to 2 columns. Text truncation in header |
| `lg` (1024px) | 3-6 | KPI row at 6 columns may be too wide for some labels |
| Custom scrollbar | ⚠️ | `.gbp-scrollbar` and `.gbp-scrollbar-lg` custom classes may not render on all Windows browsers |

| Issue | Severity | Detail |
|-------|:--------:|--------|
| No testing below 640px | P2 | Mobile phone sizes untested. Tab bar may overflow |
| Tab bar horizontal scroll | P2 | `overflow-x-auto` on tab bar is a fallback, not a designed experience |
| Competitor card grid at 3 columns | P2 | On 1024px screens, 3-column grid makes competitor cards narrow, truncating names |
| Filter bar at md breakpoint | P2 | 6 filter controls stack at `md:grid-cols-2` but some (rating, search) need more width |

---

## 8. Empty States

| Location | Empty State | Quality |
|----------|-------------|:-------:|
| Overview (no data) | Full-page skeleton | ✅ Good |
| Overview (no reviews) | EmptyState per chart | ✅ Good but repetitive |
| Branches (no data) | Skeleton + "No branches configured" | ✅ |
| Compare (no data) | Skeleton | ✅ |
| Reviews (no data) | "No reviews yet" with CTA | ✅ |
| Reviews (no match) | "No reviews match these filters" | ✅ |
| Alerts (none) | "All clear" | ✅ |
| Logs (empty) | "Log file is empty" | ✅ |
| Config (error) | "Couldn't load config" | ✅ |

| Issue | Severity | Detail |
|-------|:--------:|--------|
| Too many empty states on first load | P2 | A first-time user sees 6+ empty states simultaneously, making the product look broken |
| Empty state CTAs vary | P2 | Some say "Click Run Now", some say "Click Update Now", some reference dev-mode concepts |
| No guided "first step" | P1 | No 'Getting Started' card pointing the user to their first action |

---

## 9. Loading States

| Location | Loading Treatment | Quality |
|----------|-------------------|:-------:|
| Overview (full page) | Skeletons for all cards | ✅ Good |
| Overview (refresh) | No skeletons — inline spinner on refresh button | ⚠️ Brief flash |
| Branches | Skeletons matching card layout | ✅ |
| Reviews | Skeleton rows matching table layout | ✅ |
| Alerts | Skeleton cards | ✅ |
| Logs | Skeleton lines in dark terminal | ✅ |
| Config | Skeleton | ✅ |
| Scrape trigger | Button spinner only | ❌ No progress during 0.6s+ run |

| Issue | Severity | Detail |
|-------|:--------:|--------|
| No loading.tsx at route level | P1 | If any section fails, the error propagates to the whole page |
| Scrape has no progress indicator | P1 | Button spinner is the only feedback — no "3/12 competitors done" |
| Auto-refresh on Overview polls every 30s with no loading indicator | P2 | Data refreshes silently. User sees stale data until re-render |

---

## 10. Error Handling

| Location | Error Treatment | Quality |
|----------|-----------------|:-------:|
| API routes | Return `{ error, detail }` JSON + HTTP status | ✅ |
| Overview section | EmptyState showing error message | ✅ |
| Branches section | EmptyState + error message | ✅ |
| Reviews section | EmptyState in table body, error message | ✅ |
| Alerts section | EmptyState | ✅ |
| Logs section | Inline error in terminal | ✅ |
| Config section | EmptyState | ✅ |
| Scrape trigger | Structured error response with stages, probable cause, suggested fix | ✅ Excellent |
| Network failure | Toast "Couldn't load overview" | ✅ |
| Invalid JSON in config | Toast "Invalid JSON" with parse error | ✅ |

| Issue | Severity | Detail |
|-------|:--------:|--------|
| No error.tsx at route level | P1 | Any unhandled React error crashes the entire page with a white screen |
| Error messages reference developer concepts | P1 | Dev mode errors mention `config/selectors.json`, Python tracebacks are in stderr |
| Toast errors auto-dismiss | P2 | Error toasts disappear after a few seconds. User may miss critical errors |
| No offline/network status indicator | P2 | If the scraper fails, the UI looks the same as before — no banner indicating stale data |

---

## 11. Form Usability

| Form | Usability | Issues |
|------|:---------:|--------|
| Config editor (JSON) | ❌ | Raw JSON textarea. No form fields. No validation before submit. No undo |
| Reviews filter (branch) | ✅ | Select dropdown, clear labels |
| Reviews filter (competitor) | ✅ | Select, cascades from branch selection |
| Reviews filter (rating) | ✅ | Star button toggle |
| Reviews filter (date) | ✅ | Native date inputs |
| Reviews filter (search) | ✅ | With debounce, clear button |
| Export dialog | ✅ | Clear sections, count badges, download buttons |
| Keyboard shortcuts | ⚠️ | Help dialog but no way to customize |

| Issue | Severity | Detail |
|-------|:--------:|--------|
| Config editor has no schema-aware editing | P0 | Adding a competitor requires knowing the JSON schema: `branch_id`, `branch_name`, `competitors[].competitor_id`, `competitors[].name`, `competitors[].gmaps_url`, `competitors[].place_id`. One typo breaks the entire config |
| No validation summary before save | P1 | The API validates and returns field-level errors, but the textarea shows no inline highlighting |
| No undo for config changes | P2 | Once saved, changes are written to disk immediately |
| No confirmation dialog for config changes | P2 | No "Are you sure?" — one accidental keyboard shortcut could overwrite config |

---

## 12. Configuration Workflow

| Issue | Severity | Detail |
|-------|:--------:|--------|
| No "Add Competitor" wizard | P0 | Must edit raw JSON. GMB Everywhere has a form with fields: Place ID, Name, Branch, URL |
| Client mode hides config entirely | P0 | An end user cannot add or remove competitors |
| place_id field is nullable but required for live mode | P2 | No validation hint showing which competitors are live-ready vs fixture-only |
| Branch IDs are internal identifiers exposed in UI | P2 | `cph-seminyak`, `comp-canggu-01` shown in multiple places |

---

## 13. Export Workflow

| Issue | Severity | Detail |
|-------|:--------:|--------|
| Two export entry points with different scope | P2 | Header dialog (all data) vs Reviews tab dropdown (reviews only). Unclear which to use |
| Export disabled when count is 0 | P2 | Shows "Download" button disabled with no explanation |
| File naming follows server convention | P2 | Filenames come from Content-Disposition header. No user control over export name |
| No export progress for large datasets | P2 | Single spinner, no progress |

---

## 14. Scrape Workflow

| Issue | Severity | Detail |
|-------|:--------:|--------|
| No progress feedback during scrape | P1 | Only a spinning button. No "Processing competitor 3/12" |
| "Update Now" label misrepresents what happens | P1 | User thinks "API refresh" but it launches Playwright + Chromium |
| spawnSync blocks the server | P1 | Server unresponsive during the run |
| No cancel button during scrape | P2 | Once started, the scrape cannot be cancelled from the UI |
| No last-run duration shown in the trigger UI | P2 | Toast shows results but not how long it took |

---

## 15. Alerts UX

| Issue | Severity | Detail |
|-------|:--------:|--------|
| Dismissed alerts reappear on refresh | P1 | React state only, not persisted |
| No action links on alerts | P2 | "Selector degraded" alert could link to the Config tab. "New reviews" could link to the Reviews tab with filters |
| No alert count badge on tab | P2 | The Alerts tab shows no badge indicating how many unread alerts exist |
| No alert acknowledgment | P2 | Dismiss is the only interaction. No "acknowledge and keep" |
| Selector degradation alert persists after fix | P2 | No mechanism to recheck and auto-clear |

---

## 16. Review Browsing UX

| Issue | Severity | Detail |
|-------|:--------:|--------|
| Reviewer names show ", original" suffix | P1 | Visible in API response, strips only in display layer |
| "show less" should be "collapse" | P2 | Inconsistent terminology |
| No bulk select / batch actions | P2 | Cannot select multiple reviews for batch export |
| Review text cell shows "expand" even when text is short | P2 | `MAX = 120` includes trailing spaces, so some ≤120 char texts still show "…" |
| No keyboard navigation in table rows | P2 | Table rows are not focusable. `Tab` skips the table entirely |

---

## 17. Competitor Workflow

| Issue | Severity | Detail |
|-------|:--------:|--------|
| No inline "Add Competitor" button | P0 | Must use JSON editor |
| Competitor detail sheet shows `competitor_id` | P2 | Internal ID shown to end user |
| Google Maps link opens in same tab | P2 | `target="_blank"` is present but no `rel="noopener noreferrer"` for security (actually present — good) |
| No competitor search | P3 | With 12 competitors, fine. With 100+, search would be needed |

---

## 18. Branch Workflow

| Issue | Severity | Detail |
|-------|:--------:|--------|
| Branch accordion auto-opens first branch | ✅ | Good default |
| Branch badge shows "Scraped X relative time" | P2 | "Scraped 3 hours ago" in client mode — should be "Updated 3 hours ago" |
| Branch IDs shown in UI | P2 | Internal IDs exposed |
| No branch-level sort | P3 | Current sort is by default config order, not by activity |

---

## 19. Accessibility

| Issue | Severity | Detail |
|-------|:--------:|--------|
| No focus indicators on tab content | P2 | `focus-visible:outline-none` removes default browser outline without custom replacement in some areas |
| Color coding without text labels | P2 | "Healthy" status uses green dot + green text, but the stacked bar relies entirely on color |
| Chart aria labels | P2 | Recharts uses SVG — no comprehensive accessible descriptions |
| Keyboard shortcuts undiscoverable | P2 | `?` key opens help, but no auto-trigger on first visit |
| Skip-to-content link | P3 | No skip navigation link for keyboard users |
| Reduced motion not respected | P3 | Framer Motion animations don't check `prefers-reduced-motion` |

---

## 20. Performance Perception

| Issue | Severity | Detail |
|-------|:--------:|--------|
| No server-side rendering | P1 | Full page is `"use client"`. User sees blank white screen until JS loads |
| Large JS bundle (~900KB) | P1 | 48+ shadcn UI components + 38 dashboard components + recharts + framer-motion |
| No lazy loading for tabs | P1 | All tab content loaded upfront |
| API calls on every navigation | P2 | No cache strategy — every tab switch fetches fresh data |
| Auto-refresh polls silently | P2 | 30s interval with no visual indicator of background activity |
| No transition between tab switches | P2 | Tab content switches instantly with no animation or loading state |

---

## Summary

| Area | Score | P0 | P1 | P2 | P3 |
|------|:----:|:--:|:--:|:--:|:--:|
| Branding | 3/10 | 2 | 2 | 2 | 0 |
| Navigation | 6/10 | 0 | 2 | 2 | 0 |
| Info Architecture | 5/10 | 1 | 1 | 1 | 0 |
| Dashboard Hierarchy | 6/10 | 0 | 0 | 3 | 0 |
| Visual Alignment | 7/10 | 0 | 0 | 2 | 1 |
| Spacing | 8/10 | 0 | 0 | 1 | 0 |
| Responsive | 5/10 | 0 | 0 | 4 | 0 |
| Empty States | 6/10 | 0 | 1 | 2 | 0 |
| Loading States | 5/10 | 0 | 2 | 1 | 0 |
| Error Handling | 7/10 | 0 | 2 | 2 | 0 |
| Form Usability | 5/10 | 1 | 1 | 2 | 0 |
| Config Workflow | 2/10 | 2 | 0 | 1 | 0 |
| Export Workflow | 7/10 | 0 | 0 | 3 | 0 |
| Scrape Workflow | 4/10 | 0 | 2 | 1 | 0 |
| Alerts UX | 6/10 | 0 | 1 | 3 | 0 |
| Review Browsing | 7/10 | 0 | 1 | 3 | 0 |
| Competitor Workflow | 5/10 | 1 | 0 | 2 | 1 |
| Branch Workflow | 7/10 | 0 | 0 | 2 | 1 |
| Accessibility | 4/10 | 0 | 0 | 4 | 2 |
| Performance Perception | 3/10 | 0 | 3 | 2 | 0 |
| **Total** | **5.1/10** | **7** | **18** | **43** | **5** |
