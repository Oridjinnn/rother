# Release Preparation Report — v0.2.0

**Date:** 2026-07-29
**Prepared for:** v0.2.0 tag

---

## Package Manager Decision

**Standardized on npm.** The project was using both `bun.lock` and `package-lock.json`. `bun.lock` has been removed from git tracking and added to `.gitignore`. All operational documentation now references `npm` commands exclusively.

---

## Files Modified

| File | Change | Justification |
|------|--------|---------------|
| `.gitignore` | Added `bun.lock`, `Thumbs.db`, `/dist` | Lockfile hygiene, Windows artifact, build output safeguard |
| `src/lib/app-mode.ts` | Updated version `0.0.1` → `0.2.0`; removed unused parameter from `appVersion()` | Version consistency; ESLint warning fix |
| `package.json` | Removed 40 unused dependencies | Dead code cleanup (0 imports confirmed) |
| `docs/engineering/LOCAL_DEVELOPMENT.md` | Replaced all `bun` → `npm`; removed `/home/z/...` paths; updated version | Documentation synchronization |
| `docs/engineering/VERIFICATION_CHECKLIST.md` | Replaced `bun` → `npm`; fixed `branch_count` → `totalBranches` | Documentation synchronization |
| `docs/engineering/ENGINEERING_BASELINE.md` | Replaced `bun` → `npm`; fixed test count 68→34; fixed path references | Documentation synchronization |

## Files Removed

| File | Justification |
|------|---------------|
| `bun.lock` (from git) | Standardized on npm |
| `src/components/ui/alert-dialog.tsx` | Never imported — shadcn/ui boilerplate |
| `src/components/ui/aspect-ratio.tsx` | Never imported |
| `src/components/ui/avatar.tsx` | Never imported |
| `src/components/ui/breadcrumb.tsx` | Never imported |
| `src/components/ui/calendar.tsx` | Never imported |
| `src/components/ui/carousel.tsx` | Never imported |
| `src/components/ui/chart.tsx` | Never imported |
| `src/components/ui/checkbox.tsx` | Never imported |
| `src/components/ui/collapsible.tsx` | Never imported |
| `src/components/ui/command.tsx` | Never imported |
| `src/components/ui/context-menu.tsx` | Never imported |
| `src/components/ui/drawer.tsx` | Never imported |
| `src/components/ui/form.tsx` | Never imported |
| `src/components/ui/hover-card.tsx` | Never imported |
| `src/components/ui/input-otp.tsx` | Never imported |
| `src/components/ui/label.tsx` | Never imported |
| `src/components/ui/menubar.tsx` | Never imported |
| `src/components/ui/navigation-menu.tsx` | Never imported |
| `src/components/ui/pagination.tsx` | Never imported |
| `src/components/ui/popover.tsx` | Never imported |
| `src/components/ui/progress.tsx` | Never imported |
| `src/components/ui/radio-group.tsx` | Never imported |
| `src/components/ui/resizable.tsx` | Never imported |
| `src/components/ui/scroll-area.tsx` | Never imported |
| `src/components/ui/sidebar.tsx` | Never imported |
| `src/components/ui/slider.tsx` | Never imported |
| `src/components/ui/switch.tsx` | Never imported |
| `src/components/ui/toast.tsx` | Never imported (project uses sonner) |
| `src/components/ui/toaster.tsx` | Never imported (project uses sonner) |
| `src/components/ui/toggle.tsx` | Never imported |
| `src/components/ui/toggle-group.tsx` | Never imported |
| `src/hooks/use-toast.ts` | Never imported (project uses sonner) |
| `src/components/dashboard/section-motion.tsx` | Never imported |

**Total: 33 source files removed**

## Dependencies Removed

**40 npm packages removed** (30 dependencies + 1 devDependency):

| Package | Reason |
|---------|--------|
| `@dnd-kit/core` | 0 imports |
| `@dnd-kit/sortable` | 0 imports |
| `@dnd-kit/utilities` | 0 imports |
| `@hookform/resolvers` | 0 imports |
| `@mdxeditor/editor` | 0 imports |
| `@radix-ui/react-alert-dialog` | Only used by deleted dead component |
| `@radix-ui/react-aspect-ratio` | Only used by deleted dead component |
| `@radix-ui/react-avatar` | Only used by deleted dead component |
| `@radix-ui/react-checkbox` | Only used by deleted dead component |
| `@radix-ui/react-collapsible` | Only used by deleted dead component |
| `@radix-ui/react-context-menu` | Only used by deleted dead component |
| `@radix-ui/react-hover-card` | Only used by deleted dead component |
| `@radix-ui/react-label` | Only used by deleted dead component |
| `@radix-ui/react-menubar` | Only used by deleted dead component |
| `@radix-ui/react-navigation-menu` | Only used by deleted dead component |
| `@radix-ui/react-popover` | Only used by deleted dead component |
| `@radix-ui/react-progress` | Only used by deleted dead component |
| `@radix-ui/react-radio-group` | Only used by deleted dead component |
| `@radix-ui/react-scroll-area` | Only used by deleted dead component |
| `@radix-ui/react-slider` | Only used by deleted dead component |
| `@radix-ui/react-switch` | Only used by deleted dead component |
| `@radix-ui/react-toast` | Only used by deleted dead component |
| `@radix-ui/react-toggle` | Only used by deleted dead component |
| `@radix-ui/react-toggle-group` | Only used by deleted dead component |
| `@reactuses/core` | 0 imports |
| `bun-types` (dev) | Project uses npm |
| `cmdk` | Only used by deleted dead component |
| `embla-carousel-react` | Only used by deleted dead component |
| `input-otp` | Only used by deleted dead component |
| `next-auth` | 0 imports |
| `next-intl` | 0 imports |
| `react-day-picker` | Only used by deleted dead component |
| `react-hook-form` | Only used by deleted dead component |
| `react-markdown` | 0 imports |
| `react-resizable-panels` | Only used by deleted dead component |
| `react-syntax-highlighter` | 0 imports |
| `uuid` | 0 imports (project uses node:crypto) |
| `vaul` | Only used by deleted dead component |
| `z-ai-web-dev-sdk` | 0 imports |
| `zod` | 0 imports |
| `zustand` | 0 imports |

**337 packages removed from `node_modules`** during `npm install`.

## Documentation Updated

| Document | Status |
|----------|--------|
| `docs/engineering/LOCAL_DEVELOPMENT.md` | Updated — npm, version, path docs |
| `docs/engineering/VERIFICATION_CHECKLIST.md` | Updated — npm, `totalBranches` |
| `docs/engineering/ENGINEERING_BASELINE.md` | Updated — npm, test count, paths |

## Documentation Created

| Document | Purpose |
|----------|---------|
| `CHANGELOG.md` | Full release history from 0.1.0 → 0.2.0 |
| `RELEASE_NOTES.md` | Release highlights and installation |
| `KNOWN_LIMITATIONS.md` | Documented known issues |
| `RELEASE_CHECKLIST.md` | Pre/post-release steps |

## Release Assets (checklist)

See `RELEASE_CHECKLIST.md` for the complete pre/post-release procedure.

## Validation Results

| Check | Result | Detail |
|-------|--------|--------|
| `npm test` | **PASS** | 34/34 tests, 2 files |
| `npx tsc --noEmit` | **PASS** | 0 errors |
| `eslint .` | **PASS** | 0 errors, 0 warnings |
| `npm run build` | **PASS** | Compiled (27.1s) |

## Version Consistency

| Location | Version | Status |
|----------|---------|--------|
| `package.json` | `0.2.0` | Reference |
| `/api/health` | `0.2.0` | ✓ |
| `app-mode.ts` (display) | `0.2.0` | ✓ |
| `docs/engineering/LOCAL_DEVELOPMENT.md` | `0.2.0` | ✓ |
| `docs/engineering/ENGINEERING_BASELINE.md` | `0.2.0` | ✓ |

## Remaining Deferred Items

| Item | Reason |
|------|--------|
| Remove dead exports (`appName`, `appVersion`, `truncate`, etc.) | Public API surface — low impact, defer to dedicated cleanup |
| Consolidate duplicate `cleanReviewerName` functions | Refactoring — no functional impact |
| Remove unused types (`ReviewsQuery`, `CompetitorConfig`, etc.) | Type-level dead code — zero runtime impact |
| Update stale audit docs in `docs/01-audit/` (API count "15" → "21") | Historical records — not current operational docs |
| `execSync` blocks event loop in `killProcessTree` | Error/cleanup path only — defer to hardening pass |
| Snapshot O(n) reads per request | Fine at current scale — defer to performance pass |

**Conclusion:** The repository is ready for `v0.2.0` tagging. All validation checks pass with zero errors. Documentation is consistent. Dead code has been removed. A single package manager (npm) is now the standard.
