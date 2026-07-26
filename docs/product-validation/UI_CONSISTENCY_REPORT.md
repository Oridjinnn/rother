# UI Consistency Report — Rother v0.0.1

---

## 1. Color System

| Role | CSS Variable | Used For | Consistency |
|------|-------------|----------|:-----------:|
| Primary | `--primary` | Accent color, buttons, active states | ✅ Consistent |
| Background | `--background` | Page background | ✅ |
| Card | `--card` | Card backgrounds | ✅ |
| Muted | `--muted` | Subtle backgrounds, secondary text | ✅ |
| Border | `--border` | Card borders, separators | ✅ |
| Destructive | `--destructive` | Error states, delete actions | ✅ |

### Inconsistencies

| Issue | Location | Detail |
|-------|----------|--------|
| Hardcoded gradient `from-primary to-emerald-700` | Header button, header logo | Uses `emerald-700` which is not a CSS variable — breaks with custom themes |
| Hardcoded `bg-zinc-950` | Config JSON viewer, Log viewer | Terminal-style backgrounds use `zinc-950` directly. If theme switches to light mode, this remains dark |
| Hardcoded `text-amber-500/40` border | Verification badges | Uses hardcoded amber/border colors instead of semantic CSS variables |
| Multiple blues in info badges | Alerts tab `info` severity | `border-blue-500/30 bg-blue-500/10 text-blue-700` — hardcoded |
| Rating stars use `fill-amber-400 text-amber-500` | StarRating component | Direct color values, not theme-aware |
| `text-emerald-600 dark:text-emerald-400` | Export buttons, success states | Dark mode handled manually via `dark:` modifiers, not through CSS variables |

---

## 2. Typography

| Token | Value | Usage |
|-------|-------|-------|
| Font family | Geist Sans (body), Geist Mono (code) | ✅ Consistent across all components |
| Font sizes | `text-[9px]` through `text-3xl` | ⚠️ Some ad-hoc sizes |
| Font weight | `font-medium`, `font-semibold`, `font-bold` | ✅ Consistent |
| Line height | `leading-tight`, `leading-relaxed` | ✅ |

### Inconsistencies

| Issue | Location | Detail |
|-------|----------|--------|
| `text-[9px]` used for stat pills | branch-comparison-section.tsx:405 | Should use `text-[10px]` for consistency with other labels |
| `text-[10px]` vs `text-[11px]` vs `text-xs` | Multiple components | Three different "small" sizes used across components: badges use `text-[10px]`, descriptions use `text-[11px]` or `text-xs` (12px). No single `text-micro` token |
| `font-mono text-[10px]` for competitor IDs | Branch comparison cards, competitor rows | Inconsistent with `font-mono text-[11px]` used elsewhere for IDs |
| KPI value `text-3xl` | KpiCard | Very large in a 6-card row. On small screens, values overflow |

---

## 3. Icon Usage

| Icon Set | Source | Consistency |
|----------|--------|:-----------:|
| All icons | lucide-react | ✅ Single source |
| Icon sizes | `size-3` to `size-5` | ⚠️ Minor variation |
| Icon colors | Inherit or `text-primary` | ⚠️ Some hardcoded |

### Inconsistencies

| Issue | Location | Detail |
|-------|----------|--------|
| `Building2` icon used for both "Branch Comparison" and "Historical" sub-tabs | branch-comparison-section.tsx:109-114 | Two tabs in the same group with the same icon |
| `Sparkles` used for "new reviews" badges everywhere | Throughout | sparkles icon appears on search results — a search result is not "new" |
| `Activity` vs `Bell` in health panel | overview-section.tsx:144, 169 | `Activity` icon in health card title, but the health status badge uses `CheckCircle2` / `AlertTriangle` |
| `Download` icon in export dialog | export-dashboard-dialog.tsx:198 | Download button inside a section — the plus button in the header also triggers export. Two icons for the same action |

---

## 4. Card Patterns

| Pattern | Used In | Consistency |
|---------|---------|:-----------:|
| `gbp-card-hover` CSS class | All interactive cards | ✅ Consistent |
| Gradient header backgrounds | KPI cards, section title cards | ⚠️ Some use `from-primary/5 to-transparent`, some don't |
| Card header with icon + title + description | All cards | ✅ Very consistent |
| Skeleton matching card shape | All loading states | ✅ |

### Inconsistencies

| Issue | Location | Detail |
|-------|----------|--------|
| Some cards use `CardHeader` + `CardContent`, some wrap everything in `CardContent p-5` | KpiCard vs StatPill | KpiCard skips CardHeader entirely |
| Gradient backgrounds inconsistent | Section headers use `from-primary/5`, competitor cards use `from-primary/15 to-primary/5` | Two different gradient intensities for the same pattern |
| `rounded-lg` vs `rounded-xl` | Cards at different levels | Cards are `rounded-xl`, inner elements are `rounded-lg`. Border-radius inconsistency at nested levels |

---

## 5. Motion & Animation

| Pattern | Implementation | Consistency |
|---------|---------------|:-----------:|
| Section entrance | Framer Motion `initial={{opacity:0, y:8}} animate={...}` | ✅ Very consistent (shared via SectionMotion) |
| Card hover | `gbp-card-hover` CSS transition | ✅ |
| Button loading | Spinning `Loader2` icon | ✅ |
| Staggered card entrance | `transition.delay = index * 0.05` | ⚠️ Inconsistent delay values |

### Inconsistencies

| Issue | Location | Detail |
|-------|----------|--------|
| Section delay timing | `duration: 0.3` vs `duration: 0.25` vs `duration: 0.35` | Three different durations |
| Stagger delays | `idx * 0.03` (alerts) vs `rank * 0.05` (branch comparison) | Different stagger multipliers for similar patterns |
| Motion not disabled for reduced motion | Global | No `prefers-reduced-motion` check |
| Header entrance animation | `duration: 0.35, ease: "easeOut"` globally | Animates every page load, even on navigation |

---

## 6. Button Patterns

| Button Style | Usage | Consistency |
|-------------|-------|:-----------:|
| `variant="default"` | Primary actions (Run Now, Save) | ✅ |
| `variant="outline"` | Secondary actions (Edit, Copy, Cancel) | ✅ |
| `variant="ghost"` | Tertiary actions (Refresh, Dismiss) | ✅ |
| `variant="destructive"` | Dangerous actions | ⚠️ Not used yet |
| `size="sm"` | Most internal buttons | ✅ |
| `size="icon"` | Icon-only buttons | ✅ |

### Inconsistencies

| Issue | Location | Detail |
|-------|----------|--------|
| "Update Now" uses `from-primary to-emerald-700` gradient | Header button | No other button uses a gradient. Style inconsistency |
| `rounded-md` vs `rounded-lg` vs `rounded-xl` | Buttons, cards, inner containers | Three border-radius values in the same visual context |
| Button spacing inside cards | Some cards use `gap-1.5`, others `gap-2` | Minor 1px inconsistency |

---

## 7. Badge Patterns

| Badge Style | Usage | Consistency |
|-------------|-------|:-----------:|
| `variant="outline"` | Most badges | ✅ |
| `variant="secondary"` | Active filter badges | ✅ |
| `variant="destructive"` | Alert badge | ✅ |
| Custom badges (colored dots) | Freshness, status | ⚠️ Ad-hoc |

### Inconsistencies

| Issue | Location | Detail |
|-------|----------|--------|
| Badge height varies | Some badges are `h-4`, some `h-5`, some have no fixed height | `FreshnessBadge` uses `h-4`, other badges use `px-1.5 py-0.5` |
| Badge font size varies | `text-[10px]`, `text-[11px]`, `text-xs` | Three different sizes for the same pattern |
| Dot animation on badges | Some use `animate-ping`, some don't | Fresh badges ping, severity badges don't |

---

## 8. Spacing Audit

| Token | Pixels | Usage | Consistent? |
|-------|--------|-------|:-----------:|
| `gap-4` | 16px | Grid gaps between cards | ✅ |
| `gap-3` | 12px | Filter bar items, card internal groups | ✅ |
| `gap-2` | 8px | Button groups, compact items | ✅ |
| `gap-1.5` | 6px | Tagged items (badge + icon) | ⚠️ Inconsistent with `gap-1` |
| `p-5` | 20px | Card padding | ✅ |
| `p-4` | 16px | Inner card padding (logs) | ⚠️ |
| `px-4` / `py-6` | 16px / 24px | Main content area | ✅ |
| `space-y-6` | 24px | Section vertical spacing | ✅ |
| `space-y-4` | 16px | Content vertical spacing | ✅ |
| `space-y-3` | 12px | Compact content | ✅ |

### Violations
- Logs section summary strip uses `p-4` for cards where every other card uses `p-5`
- Export dialog uses `px-5 py-4` header padding — different from `p-5` in KpiCard
- Competitor detail sheet uses `p-5` header but `p-4` content area

---

## 9. Summary

| Category | Score | Key Issues |
|----------|:-----:|------------|
| Color System | 6/10 | Hardcoded colors that break with theme switching |
| Typography | 7/10 | Inconsistent small sizes (`9px` vs `10px` vs `11px`) |
| Icon Usage | 8/10 | Minor duplicate icons in Compare tab |
| Card Patterns | 8/10 | Very consistent, minor gradient inconsistency |
| Motion | 7/10 | Three different durations, no reduced-motion support |
| Buttons | 8/10 | Gradient on header button is unique |
| Badges | 6/10 | Inconsistent heights and font sizes |
| Spacing | 7/10 | 80% consistent, 20% ad-hoc values |
| **Overall** | **7.1/10** | **Solid foundation, ~20 minor inconsistencies** |
