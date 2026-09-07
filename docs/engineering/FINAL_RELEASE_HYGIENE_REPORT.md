# Final Release Hygiene Report — v0.2.0

**Date:** 2026-07-29
**Scope:** Dead code, dependencies, documentation, build artifacts, release consistency

---

## 1. Dead Code Audit

### 1.1 Unused UI Components (shadcn/ui boilerplate)

These `src/components/ui/` files are never imported by any dashboard component, page, or layout:

| Component File | Exports | Lines |
|----------------|---------|-------|
| `sidebar.tsx` | 24 named exports (Sidebar, SidebarContent, etc.) | ~724 |
| `chart.tsx` | 7 named exports (ChartContainer, ChartTooltip, etc.) | ~400 |
| `calendar.tsx` | 2 named exports (Calendar, CalendarDayButton) | ~200 |
| `carousel.tsx` | 7 named exports (Carousel, CarouselContent, etc.) | ~200 |
| `menubar.tsx` | 16 named exports (Menubar, MenubarMenu, etc.) | ~200 |
| `navigation-menu.tsx` | 8 named exports | ~200 |
| `breadcrumb.tsx` | 7 named exports | ~100 |
| `context-menu.tsx` | 13 named exports | ~200 |
| `drawer.tsx` | 10 named exports (Drawer, DrawerPortal, etc.) | ~200 |
| `aspect-ratio.tsx` | 1 export (AspectRatio) | ~10 |
| `input-otp.tsx` | 4 named exports | ~100 |
| `resizable.tsx` | 3 named exports | ~100 |
| `slider.tsx` | 1 export (Slider) | ~100 |
| `toggle-group.tsx` | 2 named exports | ~100 |
| `toast.tsx` | ToastAction (toaster/sonner used instead) | ~200 |
| `toaster.tsx` | Toaster (sonner used instead) | ~100 |
| `command.tsx` | 4 named exports | ~150 |
| `collapsible.tsx` | 4 named exports | ~80 |
| `checkbox.tsx` | 1 export | ~60 |
| `form.tsx` | 5 named exports | ~150 |
| `hover-card.tsx` | 5 named exports | ~100 |
| `label.tsx` | 1 export | ~30 |
| `pagination.tsx` | 5 named exports | ~150 |
| `popover.tsx` | 5 named exports | ~100 |
| `progress.tsx` | 1 export | ~50 |
| `radio-group.tsx` | 2 named exports | ~100 |
| `scroll-area.tsx` | 2 named exports | ~60 |
| `switch.tsx` | 2 named exports | ~80 |
| `toggle.tsx` | 2 named exports | ~60 |
| `avatar.tsx` | 4 named exports | ~80 |

**Total dead UI code:** ~30 component files, ~4,000+ lines

**Used UI components (NOT dead):** `accordion`, `alert`, `badge`, `button`, `card`, `dialog`, `dropdown-menu`, `input`, `select`, `separator`, `sheet`, `skeleton`, `sonner`, `table`, `tabs`, `textarea`, `tooltip`

### 1.2 Unused Exports — Library Code

| File | Export | Line | Notes |
|------|--------|------|-------|
| `src/lib/app-mode.ts` | `appName` | 22 | Never imported — text is accessed via `getText()` |
| `src/lib/app-mode.ts` | `appVersion` | 27 | Never imported — text is accessed via `getText()` |
| `src/hooks/use-app-mode.ts` | `switchMode` | 45 | Never imported |
| `src/lib/gbp/format.ts` | `truncate` | 99 | Never imported |
| `src/lib/gbp/format.ts` | `averageRating` | 106 | Never imported |
| `src/lib/gbp/format.ts` | `formatRating` | 114 | Never imported |
| `src/lib/gbp/format.ts` | `ratingColor` | 120 | Never imported |
| `src/lib/gbp/sanitize.ts` | `safeError` | 20 | Never imported — superseded by `sanitizeError` |
| `src/lib/gbp/validate.ts` | `ValidationError` | 4 | Never imported (class exported, may be useful) |
| `src/components/dashboard/section-motion.tsx` | `SectionMotion` | 10 | Never imported |
| `src/components/dashboard/section-motion.tsx` | `KpiSkeleton` | 31 | Never imported |
| `src/hooks/use-toast.ts` | `reducer` | 78 | Internal — should not be exported |
| `src/hooks/use-toast.ts` | `toast` | 195 | Never imported — project uses `sonner` toast instead |

### 1.3 Unused Types/Interfaces

| File | Export | Line |
|------|--------|------|
| `src/lib/gbp/types.ts` | `ReviewsQuery` | 144 |
| `src/lib/gbp/types.ts` | `ScrapeTriggerResponse` | 171 |
| `src/lib/gbp/types.ts` | `ConfigUpdateRequest` | 272 |
| `src/lib/gbp/types.ts` | `ReviewLengthBucket` | 224 |
| `src/lib/gbp/types.ts` | `SelectorsMeta` | 60 |
| `src/lib/gbp/types.ts` | `HistoryRunBreakdownItem` | 187 |
| `src/lib/gbp/types.ts` | `CompetitorConfig` | 41 |
| `src/lib/gbp/types.ts` | `ReviewsOverTimePoint` | 210 |
| `src/lib/gbp/server-data.ts` | `SnapshotEntry` | 136 |
| `src/lib/gbp/server-data.ts` | `DeltaFileEntry` | 238 |
| `src/lib/gbp/scrape-runner.ts` | `RunStatus` | 48 |

### 1.4 Unused Constants

| File | Export | Line |
|------|--------|------|
| `src/lib/gbp/paths.ts` | `GBP_CONFIG_DIR` | 22 |
| `src/lib/gbp/paths.ts` | `GBP_RAW_HTML_DIR` | 26 |
| `src/lib/db.ts` | `db` | 7 (Prisma client) |

### 1.5 Duplicate Functions

| Function | Location 1 | Location 2 | Difference |
|----------|-----------|-----------|------------|
| `cleanReviewerName` | `src/lib/gbp/format.ts:13` (exported) | `src/lib/gbp/server-data.ts:29` (private) | format version returns `"Anonymous"`, server-data returns `null` |

### 1.6 TODO/FIXME Comments

**None found.** The codebase is clean of work-in-progress markers.

---

## 2. Dependency Audit

### 2.1 Unused npm Packages (Confirmed — 0 imports from any source file)

These packages are listed in `package.json` but never imported in any `.ts` or `.tsx` file:

| Package | Type | Notes |
|---------|------|-------|
| `@dnd-kit/core` | dependency | Drag-and-drop — not used |
| `@dnd-kit/sortable` | dependency | Sortable drag-and-drop — not used |
| `@dnd-kit/utilities` | dependency | DnD utilities — not used |
| `@hookform/resolvers` | dependency | Form validation resolvers — not used (form.tsx is dead) |
| `@mdxeditor/editor` | dependency | MDX editor — not used |
| `@reactuses/core` | dependency | React hooks library — not used |
| `cmdk` | dependency | Command menu — only used by dead `command.tsx` |
| `date-fns` | dependency | Date utilities — only used by dead `calendar.tsx` |
| `embla-carousel-react` | dependency | Carousel — only used by dead `carousel.tsx` |
| `input-otp` | dependency | OTP input — only used by dead `input-otp.tsx` |
| `next-auth` | dependency | Authentication — not used |
| `next-intl` | dependency | Internationalization — not used |
| `react-day-picker` | dependency | Date picker — only used by dead `calendar.tsx` |
| `react-hook-form` | dependency | Forms — only used by dead `form.tsx` |
| `react-markdown` | dependency | Markdown rendering — not used |
| `react-resizable-panels` | dependency | Resizable panels — only used by dead `resizable.tsx` |
| `react-syntax-highlighter` | dependency | Code highlighting — not used |
| `uuid` | dependency | UUID generation — not used (uses `randomUUID` from `node:crypto` instead) |
| `vaul` | dependency | Drawer — only used by dead `drawer.tsx` |
| `z-ai-web-dev-sdk` | dependency | AI SDK — not used |
| `zod` | dependency | Schema validation — not used |
| `zustand` | dependency | State management — not used |
| `bun-types` | devDependency | Bun type definitions — project uses npm, not Bun |

**Estimated size savings:** ~20-30 MB from `node_modules` if removed.

### 2.2 Packages Intentionally Retained (Runtime/Peer Dependencies)

| Package | Reason |
|---------|--------|
| `sharp` | Next.js image optimization — runtime peer dependency |
| `prisma` | Used via CLI (`npm run db:push`, etc.) |
| `@prisma/client` | Imported by `src/lib/db.ts` |
| `@tanstack/react-query` | Used by query-provider |
| `@tanstack/react-table` | Used by table components |
| `class-variance-authority` | Used by active UI components (button, badge, etc.) |
| `tailwindcss-animate` | Used in tailwind config for animations |
| `tw-animate-css` | Used in tailwind config for animations |

### 2.3 Python Dependencies

All 3 packages in `gbp-monitor/requirements.txt` are confirmed used:
- `playwright` — imported via harness modules
- `parsel` — `from parsel import Selector`
- `requests` — `import requests`

### 2.4 Dual Lockfiles

`bun.lock` and `package-lock.json` both exist and are both committed. This creates a dependency drift risk if a teammate or CI installs with the wrong package manager.

---

## 3. Documentation Audit

### 3.1 Stale API Route Count ("15" → should be "21")

| Document | Line(s) | Severity |
|----------|---------|----------|
| `docs/01-audit/AUDIT-01-Architecture.md` | 161, 259, 386, 697 | Critical |
| `docs/01-audit/AUDIT-03-Parser.md` | 526 | Critical |
| `docs/01-audit/AUDIT-04-Storage.md` | 618 | Critical |
| `docs/01-audit/AUDIT-05-Dashboard-Data-Layer.md` | 235, 251 | Critical |
| `docs/01-audit/AUDIT-06-API-Routes.md` | 4, 220 | Critical |
| `docs/management/EXECUTIVE_SUMMARY.md` | 16 | Critical |
| `docs/management/MASTER_RISK_REGISTER.md` | 78 | Critical |
| `docs/management/TECHNICAL_DEBT_REGISTER.md` | 89-90 | Critical |
| `docs/management/IMPLEMENTATION_BACKLOG.md` | 75 | Stale |

### 3.2 Hardcoded `/home/z/...` Paths

| Document | Line(s) | Severity |
|----------|---------|----------|
| `docs/engineering/LOCAL_DEVELOPMENT.md` | 70, 132-133 | Critical |
| `docs/01-audit/AUDIT-01-Architecture.md` | 343, 603, 655 | Critical |
| `docs/01-audit/AUDIT-04-Storage.md` | 29, 109-110, 481, 513, 588 | Critical |
| `docs/01-audit/AUDIT-05-Dashboard-Data-Layer.md` | 108, 121, 123, 393 | Critical |
| `docs/01-audit/AUDIT-07-Dashboard-Components.md` | 446, 481 | Critical |
| `docs/engineering/ENGINEERING_BASELINE.md` | 58 | Critical |
| `docs/management/EXECUTIVE_SUMMARY.md` | 42 | Critical |
| `docs/management/MASTER_RISK_REGISTER.md` | 65, 69, 299 | Critical |
| `docs/management/TECHNICAL_DEBT_REGISTER.md` | 25 | Critical |
| `docs/management/IMPLEMENTATION_BACKLOG.md` | 39, 351 | Cosmetic |

### 3.3 `bun` References (project uses npm)

| Document | Severity |
|----------|----------|
| `docs/engineering/LOCAL_DEVELOPMENT.md` | Critical |
| `docs/engineering/VERIFICATION_CHECKLIST.md` | Stale |
| `docs/01-audit/AUDIT-01-Architecture.md` | Stale |
| `docs/engineering/ENGINEERING_BASELINE.md` | Stale |
| `docs/engineering/DEPLOYMENT_GUIDE.md` | Cosmetic |
| `docs/management/IMPLEMENTATION_BACKLOG.md` | Stale |
| `docs/management/MILESTONE_PLAN.md` | Stale |

### 3.4 Other Stale Documentation

| Document | Issue |
|----------|-------|
| `docs/engineering/VERIFICATION_CHECKLIST.md` | Uses `branch_count` instead of `totalBranches` (lines 217, 227) |
| `docs/01-audit/AUDIT-06-API-Routes.md` | Documents old `Run summary:` regex (line 159) |
| `docs/engineering/VERIFICATION_CHECKLIST.md` | References ESLint disabled (line 382) — fixed |
| `docs/engineering/RELEASE_CANDIDATE_REPORT.md` | Self-identifies LOCAL_DEVELOPMENT.md and VERIFICATION_CHECKLIST.md as stale (lines 131-132) |

---

## 4. Build Artifact Audit

### 4.1 `.gitignore` Issues

| Issue | Detail |
|-------|--------|
| `dist/` not in `.gitignore` | Vitest excludes `**/dist/**` but gitignore has no entry |
| `Thumbs.db` not in `.gitignore` | Windows thumbnail cache — not committed yet, but should be ignored |
| `bun.lock` not in `.gitignore` | Dual lockfile — both committed; standardize on one |
| `prisma/migrations/` ignored | Intentional — deployed not tracked |

### 4.2 Build Outputs

No build artifacts (.next/, coverage/, node_modules/) are committed. Gitignore coverage is adequate for current build output.

### 4.3 Test Discovery

Vitest config (`vitest.config.mjs`) correctly excludes `.next/`, `coverage/`, `dist/`, `node_modules/`. Verified: `npm test` now reports 2 files / 34 tests (correct, no duplication).

---

## 5. Release Hygiene

### 5.1 Version Consistency

| Location | Version | Status |
|----------|---------|--------|
| `package.json` | 0.2.0 | Reference |
| `src/app/api/health/route.ts` | 0.2.0 | ✓ Matches |
| `src/lib/app-mode.ts` | **0.0.1** | **✗ Does not match** — display version in footer is stale |

### 5.2 CHANGELOG

| File | Status |
|------|--------|
| Root `CHANGELOG.md` | **Does not exist** |
| `upload/CHANGELOG.md` | **Empty template** — placeholder only |
| `gbp-monitor/CHANGELOG.md` | **Populated** — Python scraper changelog only |

No unified changelog tracks dashboard-side changes across the full release cycle.

### 5.3 API Version Reporting

The health endpoint at `/api/health` returns `version: "0.2.0"` which matches `package.json`. Consistent.

---

## 6. Items Removed

No code was removed during this audit. This is a discovery-only pass.

---

## 7. Items Intentionally Retained

| Item | Rationale |
|------|-----------|
| Dead UI components (~30 files) | shadcn/ui boilerplate — removing would delete code that may be used in future sprints. Risk: low |
| Unused exports (appName, appVersion, etc.) | API of library modules — removing may break external consumers. Low risk but requires deliberate cleanup |
| Unused types (ReviewsQuery, etc.) | Part of public type surface — removing may surprise API consumers |
| Unused constants (GBP_CONFIG_DIR, GBP_RAW_HTML_DIR) | Path constants — zero cost to retain, may be useful |
| `sharp` | Next.js runtime peer dependency for image optimization |
| `prisma` / `@prisma/client` | Used via CLI and db.ts |
| `class-variance-authority` | Used by active UI components |
| `tailwindcss-animate` | Used in tailwind config |
| `bun.lock` | Do not delete without team consensus on single package manager |

---

## 8. Suspicious Code Requiring Manual Review

| Location | Issue |
|----------|-------|
| `src/lib/gbp/format.ts:13` vs `src/lib/gbp/server-data.ts:29` | Two `cleanReviewerName` implementations — should be consolidated |
| `src/hooks/use-toast.ts` (entire file) | Custom toast implementation — appears completely superseded by `sonner` toast. The exported `toast()` and `useToast()` are never used by any component. *However*, the `toaster.tsx` was previously flagged as not imported, so the old toast system may be entirely dead. Verify before deleting. |
| `src/lib/gbp/paths.ts` | `GBP_RAW_HTML_DIR` defined but never used — raw HTML storage may be an incomplete feature |
| `src/lib/gbp/validate.ts:4` | `ValidationError` class exported but never imported — consumers use the function directly |

---

## 9. Proposed Cleanup NOT Automatically Performed

| Cleanup | Reason Deferred |
|---------|----------------|
| Remove 30 dead UI component files | Requires removing their npm dependencies too — coordinated dependency cleanup needed |
| Remove 23 unused npm packages | Must be done together with dead UI component removal to avoid breaking tree-shaking |
| Update `app-mode.ts` version from 0.0.1 to 0.2.0 | Display-only change — verify `getText().version` is actually rendered before changing |
| Delete `bun.lock` or add to `.gitignore` | Requires team decision on single package manager |
| Consolidate `cleanReviewerName` duplicates | Refactoring — no functional impact |
| Add `dist/` and `Thumbs.db` to `.gitignore` | Trivial fix — included in recommendations |
| Update stale API route counts in docs | 7 documents with "15" — documentation-only change |
| Create root `CHANGELOG.md` | New file — not a fix |

---

## 10. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Dead UI components confuse developers | High | Low | shadcn/ui convention — familiar pattern |
| Dual lockfiles cause dependency drift | Medium | Medium | CI must use `npm ci` consistently |
| Stale version (0.0.1) shown in footer | Medium | Low | Cosmetic — users see wrong version |
| Stale docs mislead new team members | High | Medium | Team should know to check `API_REFERENCE.md` as source of truth |
| Unused npm packages bloat install size | Low | Low | Tree-shaking eliminates dead code at bundle time |

---

## 11. Final Recommendation

# READY FOR v0.2.0 RELEASE

**No release blockers found.** The dead code is extensive (~4,000 lines, ~30 UI components, ~23 npm packages) but all of it is unused boilerplate — it has no runtime impact due to tree-shaking. The dual lockfile (`bun.lock` + `package-lock.json`) is the highest-risk item and should be resolved post-release.

### Recommended Follow-up (not release-blocking)

| Priority | Action |
|----------|--------|
| High | Standardize on one package manager; remove or ignore the other lockfile |
| Medium | Update `app-mode.ts` version from `0.0.1` → `0.2.0` |
| Medium | Remove 23 confirmed-unused npm packages and their dead UI component consumers |
| Low | Add `dist/` and `Thumbs.db` to `.gitignore` |
| Low | Consolidate `cleanReviewerName` into single implementation |
| Low | Update stale API route counts in archived audit docs (`docs/01-audit/`) |
| Low | Verify `use-toast.ts` is entirely dead and can be removed |
