# Product Polish Backlog — Rother v0.0.1

> Grouped by priority. Ordered by impact within each tier.
> Estimated effort: Low (<1 day) · Medium (1-3 days) · High (1 week)

---

## P0 — Critical Blockers (Before Client Testing)

These issues make the product confusing, unusable, or untrustworthy for a first-time customer. Must be resolved before any external testing.

| # | Issue | Area | Effort | Description |
|:-:|-------|:----:|:------:|-------------|
| P0.1 | **Brand identity — package name** | Branding | Low | `package.json` name is `"nextjs_tailwind_shadcn_ts"`. Rename to `"rother"`. Affects taskbar, process list, developer tools |
| P0.2 | **Brand identity — HTML title** | Branding | Low | `layout.tsx` metadata.title is `"GBP Monitor — Copenhagen Bali"`. Change to `"Rother"` |
| P0.3 | **No "Add Competitor" form** | Config UX | High | Only way to configure is raw JSON editing. Build a form UI with fields: branch name, competitor name, Google Maps URL, place_id. Must be accessible in client mode |
| P0.4 | **Config tab hidden in client mode** | IA | Medium | `showConfigTab: false` in client mode. End users cannot add/remove competitors. Need to either show Config tab with limited options or add "Add Competitor" inline in the Branches tab |
| P0.5 | **No server-side rendering** | Performance | High | Entire page is `"use client"`. No SSR, no loading.tsx, no error.tsx. Add Suspense boundaries, route-level loading/error states |
| P0.6 | **No code splitting across tabs** | Performance | Medium | All 7 tabs' components bundled upfront. Lazy-load tab content with `next/dynamic` |
| P0.7 | **No API caching** | Performance | Medium | All endpoints use `force-dynamic` + `Cache-Control: no-store`. Add SWR pattern, HTTP caching, or React Query |

---

## P1 — High-Impact Usability Improvements

These issues significantly degrade the user experience. Should be resolved before or during the first client feedback cycle.

| # | Issue | Area | Effort | Description |
|:-:|-------|:----:|:------:|-------------|
| P1.1 | **No scrape progress indicator** | Scrape UX | Low | Add per-competitor progress during scrape. WebSocket or polling for real-time status. Show "Processing 3/12 competitors…" instead of just a spinner |
| P1.2 | **"Update Now" label is misleading** | Scrape UX | Low | When the button triggers a Playwright browser launch (even in fixtures mode), the label should be accurate. Rename to "Scrape" or "Collect Data" (client mode: "Refresh Data") |
| P1.3 | **spawnSync blocks the server** | Scrape | Medium | Replace `spawnSync` with `spawn` and return immediately. Use a run ID for status polling. Set `maxDuration` in Vercel/server config |
| P1.4 | **Reviewer names have ", original" suffix** | Data | Low | Strip the suffix at the API layer (`server-data.ts` or route handler) rather than relying on client-side `cleanReviewerName()` |
| P1.5 | **Dismissed alerts not persisted** | Alerts UX | Low | Store dismissed alert IDs in `localStorage` so they survive page reloads |
| P1.6 | **No route-level loading/error boundaries** | Reliability | Low | Add `loading.tsx` and `error.tsx` files for the root route |
| P1.7 | **Heavy JS bundle (~900KB)** | Performance | High | Audit unused dependencies. Remove unused shadcn/ui components (48+ bundled, maybe 20 used). Consider lazy-loading recharts/framer-motion |
| P1.8 | **First-run experience: "+0 new reviews"** | Onboarding | Low | On first run (no delta files exist), show "Welcome! No new reviews yet — this is normal for a fresh setup" instead of "+0" |
| P1.9 | **First-run experience: "9 skipped" unexplained** | Onboarding | Low | Add inline explanation: "Skipped = no fixture file for this competitor. See Getting Started to learn how to add data." |
| P1.10 | **Config editor has no inline validation** | Config UX | Low | Highlight invalid JSON lines/fields in the textarea before submit. Show field-level error messages under the editor |
| P1.11 | **No first-run getting-started card** | Onboarding | Low | Add a prominent "Getting Started" banner on the Overview tab: "Welcome to Rother. Here are 3 things you can do now:" |
| P1.12 | **Preflight warnings not shown in UI** | Scrape UX | Low | The scraper emits preflight warnings (missing fixtures, Playwright not installed). Show these in the scrape result toast or as an inline banner |

---

## P2 — Visual Polish & Consistency

These are quality-of-life improvements. Make the product feel polished and professional.

| # | Issue | Area | Effort | Description |
|:-:|-------|:----:|:------:|-------------|
| P2.1 | **Favicon is a generic CDN SVG** | Branding | Medium | Replace with custom Rother favicon (coffee bean, R logo, or similar). Must work on Windows taskbar |
| P2.2 | **OG metadata references old name** | Branding | Low | Update Open Graph metadata to use "Rother" |
| P2.3 | **"show less" should be "collapse"** | Reviews UX | Low | Change `reviews-section.tsx` line 776: `"show less"` → `"collapse"` |
| P2.4 | **Branch IDs visible in UI** | Polish | Low | Remove `branch_id` and `competitor_id` from user-facing labels. Show only human-readable names |
| P2.5 | **Duplicate icon in Compare tab** | Polish | Low | "Historical" sub-tab uses `Building2` — same as "Branch Comparison". Change to `History` or `Clock` |
| P2.6 | **No URL-based tab state** | Navigation | Medium | Store active tab in URL search params so users can link to specific tabs and back/forward works |
| P2.7 | **No transition between tab switches** | Animation | Low | Add subtle loading animation when switching tabs (reuse existing motion patterns) |
| P2.8 | **Hardcoded colors that break theme** | Theming | Medium | Replace hardcoded `emerald-700`, `zinc-950`, `amber-500` with CSS variables for theme compatibility |
| P2.9 | **Export filename is generic** | Export | Low | Let the user specify a filename prefix, or use branch/competitor name in the filename |
| P2.10 | **Two export entry points unclear** | Export | Low | Unify the header export dialog and reviews tab export dropdown into one pattern. Or add clearer labels distinguishing their scope |
| P2.11 | **Empty states too many on first load** | Onboarding | Low | Consolidate empty charts into a single "Data Summary" card that explains what data is expected |
| P2.12 | **No alert count badge on tab** | Alerts UX | Low | Add a badge count on the Alerts tab showing unread (non-dismissed) alerts |
| P2.13 | **Tab bar overflows on small screens** | Responsive | Low | Horizontal scroll is acceptable but should auto-scroll to active tab on mobile |
| P2.14 | **Filter bar stacks poorly on md breakpoint** | Responsive | Low | Reorder filters by priority: Branch → Competitor → Search → Rating → Dates. Group date filters together |
| P2.15 | **Stat pills use `text-[9px]`** | Typography | Low | Change `text-[9px]` to `text-[10px]` for consistency with other labels |
| P2.16 | **Alert actions don't link anywhere** | Alerts UX | Low | "Selector degraded" alert → link to Config tab. "New reviews" → link to filtered Reviews tab |
| P2.17 | **No keyboard shortcut discoverability** | Accessibility | Low | Show a brief tooltip on first visit: "Press ? for keyboard shortcuts" |
| P2.18 | **Tab content resets on navigation** | Navigation | Low | Preserve tab state across page navigations using URL search params |
| P2.19 | **Scrollbar custom CSS may not work** | Windows | Medium | Test `.gbp-scrollbar` custom CSS on Edge/Chrome on Windows. Ensure scrollbar styling doesn't break on Windows 11 |
| P2.20 | **"Scraped X ago" in client mode** | Wording | Low | Client mode should show "Updated X ago" not "Scraped X ago". Already partially implemented via `collectedPast` text map |

---

## P3 — Future Enhancements

Nice-to-have features. Not required for client testing but valuable for product maturity.

| # | Issue | Area | Effort | Description |
|:-:|-------|:----:|:------:|-------------|
| P3.1 | **Windows installer (NSIS/InnoSetup)** | Installation | High | Bundled `.exe` installer with Node.js + Python + Playwright. One-click install for non-technical users |
| P3.2 | **Auto-update mechanism** | Installation | High | Check for new versions and offer one-click update |
| P3.3 | **System tray / background service** | Windows | High | Run scraper on schedule without keeping browser tab open |
| P3.4 | **Desktop notifications** | Windows | Medium | Windows toast notifications when new reviews are found |
| P3.5 | **Reduce 669 npm dependencies** | Maintenance | High | Audit and remove unused packages. Target: <200 core dependencies |
| P3.6 | **Prisma removal** | Maintenance | Medium | If Prisma is not used by the dashboard, remove it. Either use it properly or eliminate it |
| P3.7 | **Competitor search** | Reviews UX | Low | Add search-by-name for competitors when the list grows beyond 20+ |
| P3.8 | **Batch export with selected filters** | Export | Low | Allow selecting specific reviews in the table and exporting only those |
| P3.9 | **Reduced motion support** | Accessibility | Low | Add `prefers-reduced-motion` media query check to Framer Motion components |
| P3.10 | **Skip-to-content link** | Accessibility | Low | Add keyboard-accessible skip navigation link at top of page |
| P3.11 | **Dark mode image/icon compatibility** | Theming | Low | Ensure icons and any future images work in both light and dark modes |
| P3.12 | **Run comparison — visual diff** | Compare UX | Medium | Show visual diff between two runs: added/removed/changed reviews |
| P3.13 | **Competitor place_id validation** | Config UX | Low | Validate place_id format before saving. Provide Google Maps link preview |
| P3.14 | **Export in XLSX format** | Export | Medium | Add `.xlsx` export option for corporate users |
| P3.15 | **Multi-language support** | i18n | High | Add i18n framework for future language packs |
| P3.16 | **Keyboard shortcut customization** | Accessibility | Low | Allow users to customize the g→letter mappings |
| P3.17 | **Alerts acknowledgment system** | Alerts UX | Low | "Acknowledge" button that keeps the alert visible but marks it as read (persisted) |
| P3.18 | **Auto-clear resolved alerts** | Alerts UX | Low | Recheck selector health state and auto-clear "selector degraded" alerts when resolved |
| P3.19 | **Dashboard snapshot comparison** | Compare UX | Low | Side-by-side diff of two snapshots within the same competitor |
| P3.20 | **Competitor trend graphs** | Analytics | High | Line charts showing review count and rating trends over time |

---

## Effort Summary

| Tier | Count | Low | Medium | High |
|:----:|:-----:|:---:|:------:|:----:|
| P0 | 7 | 2 | 3 | 2 |
| P1 | 12 | 9 | 2 | 1 |
| P2 | 20 | 16 | 3 | 1 |
| P3 | 20 | 11 | 4 | 5 |
| **Total** | **59** | **38** | **12** | **9** |

## Implementation Recommendation

### Sprint 1 (P0 — Critical)
Focus on the 7 P0 items. Target: 1-2 weeks.

### Sprint 2-3 (P1 — High Impact)
Focus on the 12 P1 items. Target: 2-3 weeks.

### Sprint 4-5 (P2 — Polish)
Focus on the 20 P2 items. Target: 2-3 weeks.

### Ongoing (P3 — Future)
Pick up P3 items as time permits. Target: 1 per sprint as capacity allows.
