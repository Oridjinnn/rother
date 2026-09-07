# Brand Consistency Report — Wave A

**Document:** `BRAND_CONSISTENCY_REPORT.md`  
**Milestone:** M15.1 — Product Identity Foundation  
**Date:** 2026-07-25  

---

> **Historical snapshot:** This report documents the **seed-demo era** branding (the bundled "Copenhagen Bali" demo). The current product is a generic, single-business tool; the seed demo is hidden from the UI once a user supplies their own business.

## Summary

| Metric | Before | After |
|:-------|:------:|:-----:|
| Distinct product names in use | 3 (`nextjs_tailwind_shadcn_ts`, `GBP Monitor`, `Rother`) | 1 (`Rother`) |
| Files with branding inconsistencies | 15 | 0 |
| P0 branding issues | 2 | 0 |
| P1 branding issues | 3 | 0 |
| Remaining issues (non-blocking) | — | 7 |

---

## Corrected Locations

| # | Location | Current (Before) | Corrected (After) | Type |
|:-:|----------|:----------------:|:-----------------:|:----:|
| 1 | `package.json` name | `"nextjs_tailwind_shadcn_ts"` | `"rother"` | Package metadata |
| 2 | `package-lock.json` name (×2) | `"nextjs_tailwind_shadcn_ts"` | `"rother"` | Lockfile metadata |
| 3 | `layout.tsx` metadata.title | `"GBP Monitor — Copenhagen Bali"` | `"Rother — Dashboard"` | Browser tab title |
| 4 | `layout.tsx` metadata.description | `"Zero-cost Google Business Profile competitor review monitor for Copenhagen Bali…"` | `"Competitor review monitoring dashboard. Track Google Business Profile reviews…"` | Meta description |
| 5 | `layout.tsx` metadata.keywords | `["GBP", "Copenhagen Bali", "coffee shop", "Bali", …]` | `["Rother", "review monitor", "competitor tracking", …]` | Meta keywords |
| 6 | `layout.tsx` metadata.authors | `"Copenhagen Bali — GBP Monitor"` | `"Rother"` | Author metadata |
| 7 | `layout.tsx` metadata.icons | `https://z-cdn.chatglm.cn/z-ai/static/logo.svg` (CDN, "Z" logo) | `/rother-icon.svg` (local "R" monogram) | Favicon |
| 8 | `layout.tsx` openGraph.title | `"GBP Monitor — Copenhagen Bali"` | `"Rother — Dashboard"` | Social share |
| 9 | `layout.tsx` openGraph.description | `"Zero-cost competitor review monitor for Copenhagen Bali's 6 branches."` | `"Competitor review monitoring dashboard. Track reviews across branches…"` | Social share |
| 10 | `app-mode.ts` dev subtitle | `"Copenhagen Bali · competitor review watch"` | `"Competitor review insights"` | Header subtitle |
| 11 | `branches-section.tsx` description | `"{N} Copenhagen Bali branches ·"` | `"{N} branches ·"` | UI text |
| 12 | `branch-comparison-section.tsx` description | `"Side-by-side comparison of all {N} Copenhagen Bali branches ·"` | `"Side-by-side comparison of all {N} branches ·"` | UI text |
| 13 | `overview-section.tsx` KPI hint | `"Copenhagen Bali locations"` | `"All locations"` | UI tooltip |
| 14 | `overview-section.tsx` chart description | `"grouped by Copenhagen Bali branch"` | `"grouped by branch"` | UI text |
| 15 | `export/branches/route.ts` filename | `gbp-branches-{date}.csv` | `rother-branches-{date}.csv` | Exported file |
| 16 | `export/competitors/route.ts` filename | `gbp-competitors-{date}.csv` | `rother-competitors-{date}.csv` | Exported file |
| 17 | `history/export/route.ts` filename (×2) | `gbp-history-{stamp}.json/csv` | `rother-history-{stamp}.json/csv` | Exported file |
| 18 | `reviews/export/route.ts` filename (×2) | `gbp-reviews-{stamp}.json/csv` | `rother-reviews-{stamp}.json/csv` | Exported file |
| 19 | `export-buttons.tsx` fallback filename | `gbp-reviews.{format}` | `rother-reviews.{format}` | Exported file |
| 20 | `run-history-timeline.tsx` fallback filename | `gbp-history.{format}` | `rother-history.{format}` | Exported file |
| 21 | `README.md` first-boot evidence | `<title>GBP Monitor - Copenhagen Bali</title>` | `<title>Rother — Dashboard</title>` | Documentation |
| 22 | `README.md` introduction | `"Rother — GBP Competitor Review Monitor"` + `"Copenhagen Bali"` | `"Rother — Competitor Review Monitor"` (generic) | Documentation |
| 23 | `public/rother-icon.svg` (new) | (did not exist) | `rother-icon.svg` — letter-mark "R" favicon | Brand asset |

---

## Locations Verified Clean (No Changes Needed)

| Location | Check | Result |
|----------|:-----:|:------:|
| Header app name | Uses `T.name` from app-mode → `"Rother"` / `"Rother (Dev)"` | ✅ Already correct |
| Header subtitle (client mode) | `"Competitor review insights"` | ✅ Already correct |
| Footer app name | Uses `T.name` → `"Rother"` / `"Rother (Dev)"` | ✅ Already correct |
| Footer tagline (client mode) | `"Automated review monitoring"` | ✅ Already correct |
| Footer tagline (dev mode) | `"Zero-cost · No AI/LLM"` | ✅ Intentional (dev mode) |
| Tab bar labels | Uses `T.runButton` → `"Update Now"` / `"Run Now"` | ✅ Already correct |
| Shortcuts dialog | All shortcuts reference app generically | ✅ Already correct |
| Export dialog | Uses generic labels, no brand names | ✅ Already correct |
| KPI labels | Generic metric labels | ✅ Already correct |
| Alerts tab | Generic alert labels | ✅ Already correct |
| Config tab | Generic section labels | ✅ Already correct |

---

## Remaining Issues (Not Addressed in Wave A)

| # | Location | Issue | Severity | Rationale for Deferral |
|:-:|----------|:-----:|:--------:|------------------------|
| R1 | `src/components/dashboard/header.tsx` | Logo uses `Coffee` icon (Copenhagen Bali heritage) | P2 | Changing the icon is a UI redesign. Product vision specifies "Abstract R monogram" for V2. |
| R2 | `src/components/dashboard/footer.tsx` | Same `Coffee` icon in footer branding | P2 | Same as R1. Icon change deferred to V2 (Tauri) or a dedicated icon sprint. |
| R3 | `src/app/globals.css` | CSS classes use `gbp-` prefix (`gbp-card-hover`, `gbp-scrollbar`, `gbp-scrollbar-lg`) | P3 | Renaming CSS classes requires edits across 30+ components and the globals.css definition. This is a code refactor, not a user-visible brand change. Deferred to Wave C or later. |
| R4 | `src/lib/gbp/` directory | Directory named `gbp/` (internal module path) | P3 | Renaming would require updating all imports across 15+ files. Internal code structure, not user-facing. |
| R5 | `public/logo.svg` | Old "Z" logo SVG file (unused — layout references CDN URL) | P3 | Orphan file. Not referenced by any code. Clean up in a future maintenance pass. |
| R6 | No PWA manifest file | Missing `manifest.json` or `manifest.webmanifest` | P2 | The product vision specifies PWA manifest fields. Creating a manifest is a new feature (V2 scope). Current PWA works from browser defaults. |
| R7 | No `loading.tsx` / `error.tsx` | No route-level loading or error boundary | P2 | This is a UX reliability concern (listed in polish backlog as P1.6), not a branding issue. Will be addressed in a future wave. |

---

## Files Changed (15 files + 1 new)

| File | Type | Change |
|------|:----:|--------|
| `package.json` | Edit | name: `nextjs_tailwind_shadcn_ts` → `rother` |
| `package-lock.json` | Edit | name: `nextjs_tailwind_shadcn_ts` → `rother` (×2) |
| `src/app/layout.tsx` | Edit | Full metadata rewrite (title, description, keywords, authors, icons, OG) |
| `src/lib/app-mode.ts` | Edit | Dev subtitle: `Copenhagen Bali · competitor review watch` → `Competitor review insights` |
| `src/components/dashboard/branches-section.tsx` | Edit | Text: `{N} Copenhagen Bali branches` → `{N} branches` |
| `src/components/dashboard/branch-comparison-section.tsx` | Edit | Text: removed `Copenhagen Bali` from description |
| `src/components/dashboard/overview-section.tsx` | Edit | Hint + description: replaced `Copenhagen Bali` references |
| `src/app/api/export/branches/route.ts` | Edit | Filename prefix: `gbp-` → `rother-` |
| `src/app/api/export/competitors/route.ts` | Edit | Filename prefix: `gbp-` → `rother-` |
| `src/app/api/history/export/route.ts` | Edit | Filename prefix: `gbp-` → `rother-` (×2) |
| `src/app/api/reviews/export/route.ts` | Edit | Filename prefix: `gbp-` → `rother-` (×2) |
| `src/components/dashboard/export-buttons.tsx` | Edit | Fallback filename: `gbp-reviews.` → `rother-reviews.` |
| `src/components/dashboard/run-history-timeline.tsx` | Edit | Fallback filename: `gbp-history.` → `rother-history.` |
| `README.md` | Edit | Title + boot evidence updated |
| `public/rother-icon.svg` | **New** | Letter-mark "R" favicon |

---

## Regression Risk Assessment

| Risk | Impact | Mitigation |
|------|:------:|------------|
| Export filename change breaks user workflows if users parse filenames | Medium | Filenames are cosmetic — no code depends on parsing them. Users downloading exports benefit from consistent naming. |
| Metadata change breaks SEO/social previews | Low | Previous metadata was incorrect (wrong product name). New metadata is correct. |
| Package name change affects npm/publish | Low | Package is private (`"private": true`). No npm publish workflow depends on the name. |
| Favicon change breaks cached icon | Low | Old icon was a third-party CDN URL that could break independently. New icon is local and versioned with the app. |

---

## Verification

- [x] All 15 edited files confirmed changed
- [x] No remaining `"GBP Monitor"` in src/ user-facing strings
- [x] No remaining `"Copenhagen Bali"` in src/ user-facing strings (regex data-processing patterns excluded)
- [x] Package name changed in both `package.json` and `package-lock.json`
- [x] Custom favicon created at `public/rother-icon.svg`
- [x] Export filenames use `rother-` prefix consistently
- [x] README references updated

---

## Next Steps for Wave B

1. **Logo icon redesign** — Replace `Coffee` icon in header and footer with "R" monogram per product vision
2. **PWA manifest** — Create `manifest.json` with product name, icons, theme color, display mode
3. **CSS class rename** — `gbp-` → `rother-` in globals.css and all component references (Wave C)
