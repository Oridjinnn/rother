# 05 — Component System

**Document:** `05_COMPONENT_SYSTEM.md`  
**Milestone:** M15.0  

---

## Purpose

Define the component hierarchy, naming conventions, and design patterns for the Rother UI. This document ensures consistency as the component library grows from 38 to potentially 100+ components.

---

## Current State

**Source:** shadcn/ui (48 base components) + Rother custom components (38 in `components/dashboard/`)

**Current issues identified in UI_CONSISTENCY_REPORT.md:**
- Three different small-font sizes (`9px`, `10px`, `11px`)
- Hardcoded colors that break theme switching
- Inconsistent card padding (`p-5` vs `p-4`)
- Three different animation durations for the same pattern
- Duplicate icons (Compare sub-tabs)

---

## Component Hierarchy

```
<Page>                              — src/app/page.tsx (client entry)
  ├── <Header>                      — App header (sticky)
  │   ├── Logo + Title
  │   ├── LiveClock
  │   ├── ExportButton
  │   ├── ThemeToggle
  │   ├── ShortcutsButton
  │   └── RunButton
  ├── <Tabs>                        — Tab navigation
  │   ├── <TabBar>                  — Tab triggers with icons
  │   ├── <OverviewTab>
  │   │   ├── <GettingStartedCard>  — First visit only
  │   │   ├── <KpiRow>
  │   │   │   └── <KpiCard> × 5-6
  │   │   ├── <HealthPanel>
  │   │   ├── <ChartsGrid>
  │   │   │   ├── <RatingDistributionChart>
  │   │   │   ├── <ReviewsPerCompetitorChart>
  │   │   │   ├── <SentimentDistributionChart>
  │   │   │   └── <ReviewsOverTimeCard>
  │   │   ├── <CompetitorLeaderboard>
  │   │   ├── <RecentReviewsPreview>
  │   │   └── <RunHistoryTimeline>
  │   ├── <BranchesTab>
  │   │   ├── <BranchAccordion>
  │   │   │   ├── <BranchHeader>
   │   │   │   └── <CompetitorCard> × N per branch (data-driven; "2" was the demo seed count, not a limit)
  │   │   └── <CompetitorDetailSheet>
  │   ├── <CompareTab>
  │   │   ├── <SubTabBar>
  │   │   ├── <BranchComparisonGrid>
  │   │   │   └── <BranchComparisonCard> × 6
  │   │   └── <HistoricalComparison>
  │   ├── <ReviewsTab>
  │   │   ├── <FilterBar>
  │   │   ├── <ActiveFilters>
  │   │   ├── <ReviewTable>
  │   │   └── <PaginationFooter>
  │   ├── <AlertsTab>
  │   │   ├── <AlertFilter>
  │   │   └── <AlertCard> × N
  │   └── <ConfigTab>
  │       ├── <CompetitorManager>
  │       ├── <AddCompetitorDialog>
  │       ├── <LogViewer>
  │       └── <JsonEditor> (dev mode)
  ├── <ExportDialog>
  ├── <ShortcutsHelpDialog>
  └── <Footer>
      ├── <HealthSparkline>
      ├── <HealthIndicator>
      └── <ModeSwitcher>
```

---

## Naming Conventions

| Pattern | Example | Rule |
|---------|---------|------|
| **Components** | `OverviewSection`, `BranchComparisonCard` | PascalCase, functional, describe purpose |
| **Files** | `overview-section.tsx`, `branch-comparison-card.tsx` | kebab-case, match component name |
| **Props** | `data`, `loading`, `error`, `onAction` | camelCase, descriptive |
| **Handlers** | `handleRunNow`, `handleExport` | `handle` + verb |
| **Types** | `OverviewResponse`, `Alert` | PascalCase, match API shape |
| **CSS classes** | `gbp-card-hover`, `gbp-scrollbar` | `gbp-` prefix for custom utilities |
| **State vars** | `isLoading`, `hasError`, `selectedId` | `is`/`has`/`selected` prefix |

---

## Component Types

### Layout Components
- **Page** — top-level component, manages state, fetches data
- **Section** — wrapper for a logical screen area (e.g., `OverviewSection`)
- **Card** — shadcn/ui `Card` with consistent header/content/skeleton pattern

### Data Components
- **Chart** — Wraps Recharts with consistent loading/empty state (e.g., `RatingDistributionChart`)
- **Table** — Wraps TanStack Table with sort/pagination/filter
- **List** — Scrollable list with loading/empty/error states
- **Stat** — KPI-like display (e.g., `StatPill`)

### Interactive Components
- **Dialog** — Modal overlay (shadcn/ui `Dialog`)
- **Sheet** — Slide-in panel (shadcn/ui `Sheet`)
- **Form** — Input controls (shadcn/ui `Form` + `Input`)
- **Button** — shadcn/ui `Button` with consistent loading pattern

### Feedback Components
- **Toast** — sonner toast for transient messages
- **EmptyState** — Standardized empty state icon + message + CTA
- **Skeleton** — Loading placeholder (shadcn/ui `Skeleton`)
- **Badge** — Status indicator (shadcn/ui `Badge`)
- **Alert** — Persistent banner (shadcn/ui `Alert`)

---

## Standard Props Interface

Every data-display component should accept these props:

```typescript
interface DataComponentProps<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Called when user retries after an error */
  onRetry?: () => void;
  /** Bump to force refetch internal data */
  refreshKey?: number;
  className?: string;
}
```

This pattern is already used by `OverviewSection`, `BranchesSection`, `BranchComparisonSection`, etc. (PV0 audit confirmed consistency). The `empty-state` and `skeleton` class should be formalized.

---

## Component Patterns

### Card Pattern (Standard)
```tsx
<Card className="gbp-card-hover">
  <CardHeader>
    <CardTitle className="flex items-center gap-2 text-base">
      <Icon className="size-4 text-primary" />
      Title
    </CardTitle>
    <CardDescription>Description text</CardDescription>
  </CardHeader>
  <CardContent>
    {loading ? <Skeleton className="h-64 w-full rounded-md" /> : content}
  </CardContent>
</Card>
```

### Loading Pattern
- Full-page loading: Full-screen skeleton grid (already implemented)
- Section loading: Section-level skeleton matching card shape
- Inline loading: Skeleton rows matching table/list shape
- Action loading: Spinner on button (already implemented)

### Empty State Pattern
```tsx
<EmptyState
  icon={Search}
  title="No results"
  description="Try adjusting your filters."
  action={<Button onClick={clearFilters}>Clear Filters</Button>}
/>
```

### Error State Pattern
```tsx
if (error && !data) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title="Couldn't load data"
      description={error}
      action={onRetry ? <Button onClick={onRetry}>Retry</Button> : undefined}
    />
  );
}
```

---

## State Machine Per Component

Every data component follows this state machine:

```
       ┌─────────────┐
       │  Loading    │ ← Initial state on mount
       └──────┬──────┘
              │ data loaded
              ▼
       ┌─────────────┐
       │  Has Data   │ ← data !== null, data.length > 0
       └──────┬──────┘
              │ no data
              ▼
       ┌─────────────┐
       │   Empty     │ ← data is null/empty array
       └─────────────┘

Errors can transition from any state to Error state.
Retry transitions Error → Loading.
```

---

## Future Component Evolution

### V2
- **NotificationCenter** — Bell icon with unread count + dropdown panel
- **SettingsForm** — User preferences form
- **ReportBuilder** — Drag-and-drop report generator
- **ScheduleCalendar** — Visual schedule display

### V3
- **DashboardCustomizer** — Drag-reorder sections (uses dnd-kit, already installed)
- **MultiSourceFilter** — Combined filter across data sources
- **ExportProgress** — Progress bar for large exports

---

## Risks

| Risk | Mitigation |
|------|------------|
| Component count grows too large (50+) | Enforce strict code-splitting via `next/dynamic` for all tab content |
| Inconsistent prop interfaces | Enforce `DataComponentProps` convention in code review |
| Theme-breaking hardcoded colors | Add ESLint rule banning hardcoded Tailwind colors outside of theme config |
| shadcn/ui updates break custom overrides | Keep shadcn/ui components unmodified. Extend via composition, not modification |
