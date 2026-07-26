# 06 — Design Language

**Document:** `06_DESIGN_LANGUAGE.md`  
**Milestone:** M15.0  

---

## Purpose

Define the visual design principles, typography, color system, spacing, motion, and iconography that give Rother a coherent identity across platforms. This is a design system spec, not implementation instructions.

---

## Design Principles

| Principle | Explanation |
|-----------|-------------|
| **Calm data density** | Show as much data as needed, but no more. Use progressive disclosure (expand/collapse, hover details). |
| **One click to insight** | Every KPI should be self-explanatory within 3 seconds. Avoid charts that need interpretation. |
| **Windows-native feel** | Respect Windows 11 conventions: Mica-like backgrounds, rounded corners, consistent hit targets. |
| **Brand-neutral palette** | Rother belongs to the user, not to any client. Colors must never imply brand affiliation. |

---

## Color System

### Current State
- Tailwind CSS shadcn/ui theme with CSS variables
- Light and dark mode both functional
- `--primary` / `--primary-foreground` for interactive elements
- Issues: hardcoded colors in 5+ components, `#3b82f6`/`#ef4444`/`#22c55e` in inline styles

### Palette

#### Neutral Scale (Base UI)
| Token | Light | Dark | Usage |
|-------|:-----:|:----:|-------|
| `--background` | `#ffffff` | `#09090b` | Page background |
| `--foreground` | `#09090b` | `#fafafa` | Body text |
| `--card` | `#ffffff` | `#18181b` | Card/panel background |
| `--card-foreground` | `#09090b` | `#fafafa` | Card heading text |
| `--muted` | `#f4f4f5` | `#27272a` | Muted background |
| `--muted-foreground` | `#71717a` | `#a1a1aa` | Secondary/subtle text |
| `--border` | `#e4e4e7` | `#27272a` | Borders, dividers |

#### Brand (Primary)
| Token | Light | Dark | Usage |
|-------|:-----:|:----:|-------|
| `--primary` | `#18181b` | `#fafafa` | Buttons, active tabs, links |
| `--primary-foreground` | `#fafafa` | `#18181b` | Text on primary |
| `--accent` | `#f4f4f5` | `#27272a` | Hover states, subtle selection |
| `--accent-foreground` | `#18181b` | `#fafafa` | Text on accent |

#### Semantic Colors
| Token | Light | Dark | Usage |
|-------|:-----:|:----:|-------|
| `--destructive` | `#ef4444` | `#ef4444` | Errors, destructive actions |
| `--warning` | `#f59e0b` | `#fbbf24` | Warnings, medium severity |
| `--success` | `#22c55e` | `#22c55e` | Success, healthy state |

#### Chart Colors
```css
/* Use CSS variables for chart fills so themes work seamlessly */
--chart-1: oklch(0.5 0.15 250);  /* brand blue-ish */
--chart-2: oklch(0.6 0.2 150);   /* green */
--chart-3: oklch(0.6 0.2 80);    /* yellow */
--chart-4: oklch(0.5 0.2 20);    /* orange */
--chart-5: oklch(0.5 0.2 330);   /* purple */
```

### Rules
- **No hardcoded hex values** in component files. All colors via CSS variables.
- Severity coding: red left border for alerts `destructive`, green left border for success.
- Chart fills must change with theme (light → dark).
- Brand identity colors (`--primary`) should be neutral (black/white) to avoid brand association.

---

## Typography

### Font Stack
```css
--font-family: 'Inter', system-ui, -apple-system, sans-serif;
```

Inter is already used in the project (package.json: `"inter": "next/font/google"`).

### Scale
| Token | Size | Weight | Line Ht | Usage |
|-------|:----:|:------:|:-------:|-------|
| `text-xs` | `0.75rem` (12px) | 400 | 1 | Chart labels, secondary stats |
| `text-sm` | `0.875rem` (14px) | 400 | 1.25 | Body, descriptions |
| `text-base` | `1rem` (16px) | 500 | 1.5 | Card titles, headings |
| `text-lg` | `1.125rem` (18px) | 600 | 1.75 | Section headings |
| `text-xl` | `1.25rem` (20px) | 600 | 1.75 | Tab labels |
| `text-2xl` | `1.5rem` (24px) | 700 | 2 | Page title |

### Rules
- ONLY use Tailwind text scale (`xs`, `sm`, `base`, `lg`, `xl`, `2xl`, `3xl`).
- Never use `9px`, `10px`, `11px` custom sizes (3 instances found).
- All numbers: tabular-nums for alignment.

---

## Spacing & Layout

### Spacing Scale
Use Tailwind's default scale: `0.5` (2px), `1` (4px), `1.5` (6px), `2` (8px), `3` (12px), `4` (16px), `5` (20px), `6` (24px), `8` (32px).

### Card Padding
| Element | Padding | Current | Target |
|---------|:-------:|:-------:|:------:|
| Card default | `p-5` | mixed | `p-5` |
| Card content | `pt-0` | yes | yes |
| Card tight | `p-4` | yes | only for nested cards |
| Section pad | `gap-4` | yes | yes |

### Grid
- Responsive grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
- KPI row: `flex gap-4 flex-wrap`
- Dashboard sections: `flex flex-col gap-4`

---

## Motion & Animation

### Current State
- Framer Motion `AnimatePresence` for tab transitions (200ms)
- Chart animations (300ms)
- Three different durations found for same pattern

### Motion Tokens
| Token | Duration | Easing | Usage |
|-------|:--------:|:------:|-------|
| `fast` | 150ms | ease-out | Hover, press, micro-interactions |
| `normal` | 200ms | ease-out | Tab transitions, dialog open |
| `slow` | 300ms | ease-out | Chart enter animations |
| `page` | 300ms | ease-in-out | Page-level transitions |

### Rules
- Entrances: fade + slide up (`y: 20 → 0`)
- Exits: fade + scale out
- Layout animations: `layout` prop with `normal` duration
- No animations on reduced-motion preference
- Only 3 durations: 150ms, 200ms, 300ms

---

## Shadows & Elevation

| Elevation | Light | Dark | Usage |
|:---------:|:-----:|:----:|-------|
| 0 | none | none | Default cards |
| 1 | `shadow-sm` | `shadow-sm` | Cards on hover |
| 2 | `shadow-md` | `shadow-md` | Dialogs |
| 3 | `shadow-lg` | `shadow-lg` | Sheets, modals |

All via Tailwind `shadow-*` utilities. No custom box-shadow values.

---

## Iconography

- **Library:** lucide-react (already installed, used in 18+ components)
- **Style:** Regular weight (not filled), 16px size in UI, 20px in header
- **Semantic icons:**
  - Overview: `LayoutDashboard`
  - Branches: `GitBranch`
  - Compare: `BarChart3` (comparison), `History` (historical)
  - Reviews: `MessageSquare`
  - Alerts: `Bell`
  - Config: `Settings`

---

## Accessibility

### Contrast
- All text/background combos must pass WCAG AA (ratio ≥ 4.5:1 for normal text, ≥ 3:1 for large text)
- Chart colors must maintain contrast against both light and dark backgrounds

### Focus
- Focus ring: `ring-2 ring-primary ring-offset-2` on all interactive elements
- Visible focus state on tab navigation

### Reduced Motion
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Screen Readers
- Charts: `aria-label` summarizing the data
- Icons: `aria-hidden="true"` with labels in parent
- Live regions for alert notifications

---

## Dark Mode

Already implemented. Rules:
- All components test in both modes before merging
- Chart fills use CSS variables that change per theme
- Color stops for gradient charts must invert in dark mode
- Shadows are slightly more prominent in dark mode

---

## Brand Elements

- **Logo:** Typographic lockup "Rother" in Inter SemiBold
- **Favicon:** Letter-mark "R" in the primary color
- **Tab title:** "Rother — Dashboard"
- **No client branding anywhere.** Rother is a standalone product.

---

## Component-Specific Rules

### Buttons
- Primary button: `bg-primary text-primary-foreground hover:bg-primary/90`
- Outline button: `border border-input bg-background hover:bg-accent`
- Ghost button: `hover:bg-accent hover:text-accent-foreground`
- Loading state: spinner icon (lucide `Loader2`) replacing button icon

### Badges
- Default: `bg-primary/10 text-primary`
- Success: `bg-success/10 text-success`
- Destructive: `bg-destructive/10 text-destructive`
- Warning: `bg-warning/10 text-warning`

### Tables
- Header: sticky, `bg-muted/50 text-muted-foreground text-xs uppercase`
- Rows: hover highlight `hover:bg-muted/50`
- Empty: centered EmptyState component

### Links
- `text-primary underline-offset-4 hover:underline`
- Always `target="_blank" rel="noopener noreferrer"` for external (Google Maps)

---

## Rule Enforcement

| Rule | Detection | Fix |
|------|-----------|-----|
| No hardcoded hex colors | ESLint custom rule | Replace with CSS variable |
| Only Tailwind text scale | ESLint custom rule | Map to closest Tailwind token |
| Only 3 animation durations | Git hook | Standardize to token values |
| Card padding consistent | Code review | Enforce `p-5` rule |
