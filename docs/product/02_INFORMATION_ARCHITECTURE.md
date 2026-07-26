# 02 — Information Architecture

**Document:** `02_INFORMATION_ARCHITECTURE.md`  
**Milestone:** M15.0  

---

## Purpose

Define the complete information hierarchy of the Rother dashboard. Every piece of data has a single canonical location. Every screen has a clear purpose. Every navigation path is intentional.

---

## Scope

- All screens, panels, dialogs, and data displays in the browser UI
- Navigation hierarchy (tabs → sections → cards → items)
- Data relationships and cross-references
- Search and discovery paths
- Export and data egress

---

## Current State Analysis

From the PV0 and UX audits, the current architecture has several problems:

1. **Config tab hidden in client mode** — users cannot configure without `?mode=dev`
2. **Two export entry points** — header dialog (all data) vs reviews dropdown (reviews only)
3. **20+ sections on Overview tab** — information density without hierarchy
4. **Compare tab has two sub-tabs** — "Branch Comparison" and "Historical" with identical icons
5. **Sections with zero data still occupy full space** — empty states are full-sized cards
6. **No URL-based tab state** — cannot link to specific tabs

---

## Navigation Hierarchy

### Level 1 — Tab Bar (Primary Navigation)

```
[Overview] [Branches] [Compare] [Reviews] [Alerts] [Config]
    1           2           3          4        5        6
```

**Rationale:** Tab-based navigation is proven in the current app. Users understand it. Gmail-style shortcuts work with it. The order follows user priority: see the big picture first, then drill into details.

**Change from current:** Config tab moved from dev-only to always-visible (but simplified for client mode). Logs tab merged into Config as a sub-section (it was dev-only and confusing for end users).

### Level 2 — Section Cards (Within Tabs)

Each tab contains:
- **Header card:** Title, description, summary stats, key actions
- **Content cards:** Data displays, charts, tables
- **Empty states:** When no data exists, show a single consolidated "Getting Started" card instead of multiple empty charts

### Level 3 — Detail Panels

- **Competitor detail:** Sheet slide-in (right side)
- **Export dialog:** Modal dialog
- **Shortcuts help:** Modal dialog
- **Historical comparison:** Sheet or inline section

---

## Screen Map

```
/
├── Overview (default tab)
│   ├── Getting Started card (first visit only)
│   ├── KPI row (Branches, Competitors, Reviews, New, Last Updated)
│   ├── Update Health panel
│   ├── Rating Distribution chart
│   ├── Reviews per Competitor chart
│   ├── Sentiment Distribution chart
│   ├── Reviews Over Time chart
│   ├── Competitor Leaderboard
│   ├── Recent Reviews preview
│   └── Update History timeline
│
├── Branches
│   ├── Summary header (X branches, Y competitors, Z reviews)
│   ├── Branch accordion
│   │   ├── Branch header (name, IDs removed, review count badge)
│   │   └── Competitor cards (2 per branch)
│   │       └── → Competitor detail sheet
│   └── → Competitor Detail Sheet
│       ├── Competitor name, branch, Google Maps link
│       ├── Stats (Total, Avg Rating, New)
│       └── Review list (scrollable)
│
├── Compare
│   ├── Branch Comparison (default sub-tab)
│   │   ├── Summary header
│   │   └── Grid of branch cards (6 branches, 3 columns)
│   │       ├── Aggregate stats (Reviews, Avg, New)
│   │       └── Competitor list within each branch
│   │           └── → Competitor Detail Sheet
│   └── Historical (sub-tab)
│       ├── Run selector (two runs to compare)
│       └── Diff view (added/removed/changed reviews)
│
├── Reviews
│   ├── Filter bar (Branch, Competitor, Rating, Date range, Search)
│   ├── Active filters display
│   ├── Export dropdown (CSV / JSON)
│   ├── Review table (sortable, paginated)
│   └── Pagination footer
│
├── Alerts (5th position)
│   ├── Filter (by type)
│   ├── Alert cards (severity-coded, dismissable)
│   └── "All clear" empty state
│
└── Config (6th position)
    ├── Listings editor (form-based in client mode, JSON in dev mode)
    ├── Selectors viewer (dev mode only)
    └── Run Logs viewer (inline, collapsible)
```

---

## Data Relationships

```
Branch (1) ──has many──> Competitors (2)
                             │
                             ├── Snapshots (1 per run, versioned)
                             │       └── Reviews (N per snapshot)
                             │
                             ├── Deltas (new reviews per run)
                             │       └── Review IDs
                             │
                             └── Selector health (per run)
```

### Key Rules
- **A branch** has exactly 2 competitors (by design — Copenhagen Bali model)
- **A competitor** has 1 latest snapshot, N historical snapshots
- **A review** belongs to exactly 1 competitor
- **A run** produces 1 snapshot per competitor + 1 summary + N delta files
- **Selectors** are shared across all competitors, verified by browser_agent or manual_human

---

## Search & Discovery

### Current
- Reviews tab has full-text search with debounce
- Branch/competitor filters cascade
- No cross-tab search

### Proposed
- Global search in header (search across competitor names, review text)
- URL search params persist state (linkable tabs)
- Keyboard shortcut `Ctrl+F` works in table (ensure DOM rendering doesn't break browser find)

---

## Information Density Rules

| Screen | Max Sections | Max Items Per Section | Pagination |
|--------|:-----------:|:---------------------:|:----------:|
| Overview | 8 (excluding KPI row) | 5 KPIs | None |
| Branches | 1 accordion | 12 competitors | None |
| Compare | 6 branch cards | 2 competitors per card | None |
| Reviews | 1 table | 25/50/100 rows | Server-side (50 default) |
| Alerts | Scrollable list | Unlimited | Client-side "Dismiss" |
| Config | 3 collapsible sections | N/A | None |

---

## Export Architecture

### Single Export Entry Point
**Decision:** Merge the two current export points (header dialog + reviews dropdown) into a single **Export** action in the header with a unified dropdown.

```mermaid
Export dropdown (header)
├── Reviews (CSV / JSON) — respects current filters
├── Competitors (CSV / JSON) — all competitors
├── Branches (CSV / JSON) — branch-level aggregates
└── History (CSV / JSON) — run history timeline
```

**Rationale:** One place for all exports. Reviews tab export was confusing because it exported filtered reviews but looked like a general export button. Unifying reduces cognitive load.

### Alternatives Considered
- **Keep two entry points** — Rejected. Users in PV0 audit reported confusion about which export to use.
- **Eliminate header export** — Rejected. Users expect export to be accessible from any tab.
- **Single "Export All" button** — Rejected. Most users only need reviews export. Full export is for backups.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Tab bar has 6 items — may feel crowded | Current app has 7 tabs in dev mode. 6 is acceptable. Use icons + short labels |
| Config tab in client mode may confuse non-technical users | Show simplified config (add/remove competitors only). JSON editor requires dev mode |
| Information overload on Overview | Collapse low-priority charts behind "Show more" toggle. Show top 4 charts by default |
| Historical comparison is hard to find as sub-tab | Add an inline link from the Run History timeline on Overview tab |

---

## Future Evolution

### V2 Changes
- Add search bar to header (global search)
- Add notification center (bell icon with unread count)
- Config tab becomes "Settings" with sub-tabs: Competitors, System, Logs

### V3 Changes
- Add dashboard customization (user can reorder/hide sections)
- Add saved filter presets for Reviews tab
- Add report builder (select sections, generate PDF)
