# 08 — Web Experience

**Document:** `08_WEB_EXPERIENCE.md`  
**Milestone:** M15.0  

---

## Purpose

Define Rother's behavior as a web application — how it works in browser tabs, on different screen sizes, and across network conditions. While Windows/PWA is the primary mode, Rother must work well in any modern browser.

---

## Platform Priorities

```
Windows (Chrome/Edge PWA)    ████████████████  Primary
Mac (Chrome/Safari)          ████████████      Tier 1
Linux (Chrome)               ████████          Tier 2
Tablet (landscape)           ██████            Tier 3
Mobile                       ████              Future
```

---

## Browser Support

| Feature | Target |
|---------|--------|
| Browser | Chrome 115+, Edge 115+, Firefox 115+, Safari 17+ |
| JS | ES2022 (modules, optional chaining, nullish coalescing) |
| CSS | Container queries, `:has()`, `color-scheme`, `oklch()` |
| PWA | Service Worker, manifest, notifications |
| Font | Inter (next/font/google) — self-hosted subset |

---

## Responsive Behavior

### Breakpoints
| Breakpoint | Width | Layout |
|:----------:|:-----:|--------|
| `sm` | ≥640px | Narrow dashboard (single-column) |
| `md` | ≥768px | Two-column chart grid |
| `lg` | ≥1024px | Full dashboard (3-col grid) |
| `xl` | ≥1280px | Max content width |

### Screen-Specific Layout

#### Desktop (≥1024px) — Primary Mode
```
┌──────────────────────────────────────────────┐
│ Header with all controls                      │
├───────────────┬──────────────────────────────┤
│ Tab Navigation │                              │
│ (6 tabs)       │  Content Area                │
│                │  - 3-column chart grid        │
│                │  - KPI row (6 columns)        │
│                │  - Full filter bar            │
└────────────────┴──────────────────────────────┘
```

#### Tablet (768–1023px)
```
┌──────────────────────────────┐
│ Header (condensed)            │
├──────────┬───────────────────┤
│ Tab Nav  │                   │
│ (scroll) │  Content Area     │
│          │  - 2-col grid     │
│          │  - KPI row wraps  │
└──────────┴───────────────────┘
```

#### Narrow (Mobile/Resize <768px)
```
┌─────────────────────┐
│ Header (minimal)     │
├─────────────────────┤
│ Tab Bar (scrollable) │
├─────────────────────┤
│ Content Area         │
│ - Single column      │
│ - KPI row stacks     │
│ - Filter bar is collapsible │
│ - Tables horizontal scroll  │
└─────────────────────┘
```

---

## Network Resilience

### Offline/Slow Network Strategy
Rother is data-dense and network-dependent. Strategy:

| Condition | Behavior |
|-----------|----------|
| **No connection** | Show cached app shell (PWA) with "Waiting for connection" state |
| **Slow API** | Show skeleton loaders, never block the whole page for one section |
| **Partial failure** | Card-level error state with `onRetry`. Other sections unaffected. |
| **Backend offline** | HTTP proxy returns 503 → show "Backend unavailable" overlay with retry button |

### Fetch Strategy
- Use `swr` (already installed) with `dedupingInterval: 5000` for stale-while-revalidate
- Background refetch on `refreshKey` change
- Manual refresh via "Update Now" triggers full SWR cache invalidation
- No auto-polling in V1 (user-initiated only)

### CORS & Security
- Backend at `localhost:3001` (or deployed URL)
- Next.js API routes proxy to backend (`/api/` → `/api/`)
- CSRF: SameSite cookie or token-based auth (future)
- No sensitive data in localStorage

---

## URL & State Management

### Tab Routing
```
/                          → Overview (default)
/?tab=branches             → Branches
/?tab=compare              → Compare (default sub-tab)
/?tab=compare&sub=history  → Compare (historical sub-tab)
/?tab=reviews              → Reviews
/?tab=alerts               → Alerts
/?tab=config               → Config
```

### State Persistence
| State | Where | Why |
|-------|:-----:|:----|
| Active tab | URL query | Shareable, back-button-safe |
| Active sub-tab | URL query | Shareable |
| Theme preference | localStorage | Persist across sessions |
| Filter state | URL query (future) | Shareable filtered views |
| First-visit flag | localStorage | Hide welcome card after dismiss |
| Dismissed alerts | localStorage | Suppress dismissed alerts |
| Sidebar/collapse state | localStorage | Remember layout preference |

### Page Title
- Default: `Rother — Dashboard`
- With unread alerts: `Rother (2) — Dashboard`
- Tab changes: `Rother — Reviews` etc.

---

## Performance Budgets

| Metric | Target |
|--------|:------:|
| First Contentful Paint | <1.5s |
| Largest Contentful Paint | <2.5s |
| Time to Interactive | <3.5s |
| First Input Delay | <50ms |
| Bundle size (initial) | <120KB gzipped |
| Total JS (all tabs) | <250KB gzipped |

### Current Status
- Next.js App Router with `next/dynamic` for tab content (confirmed in PV0)
- Charts loaded on-demand per tab
- `clsx`, `tailwind-merge`, `lucide-react`, `recharts`, `@tanstack/react-table` in bundle

### Optimization Opportunities
- Lazy-load Charts section (only when tab is visible)
- `next/dynamic` with `loading` skeleton for each tab
- Static assets (fonts) via `next/font` (already configured)
- Image optimization for icons (use SVG, not PNG)

---

## Caching Strategy

### Browser Caching
| Resource | Cache | Policy |
|----------|:-----:|--------|
| App shell (HTML, CSS, JS) | Service Worker | Cache-first, update on navigation |
| API responses | SWR in-memory | Stale-while-revalidate, 5s dedup |
| Font files | HTTP Cache | 1 year (`Cache-Control: public, max-age=31536000, immutable`) |
| Icons/SVGs | HTTP Cache | 1 year |

### SWR Config
```typescript
const { data, error, isLoading } = useSWR('/api/overview', fetcher, {
  dedupingInterval: 5000,
  errorRetryCount: 3,
  errorRetryInterval: 5000,
  revalidateOnFocus: false, // don't refetch on tab focus (wasteful for daily use)
});
```

---

## Error Handling

### HTTP Error Codes
| Code | Description | UX |
|:----:|-------------|-----|
| 200 | OK | Normal render |
| 400 | Bad request | Show validation error |
| 401 | Unauthorized | Show login screen (future) |
| 404 | Not found | Show EmptyState |
| 429 | Rate limit | Show "Too many requests, slow down" |
| 500 | Server error | Show error toast with retry |
| 503 | Backend offline | Show overlay with retry |

### Fetch Errors
```typescript
if (error && !data) {
  return (
    <EmptyState
      icon={WifiOff}
      title="Couldn't reach the server"
      description="Make sure Rother is running. If the issue persists, try a refresh."
      action={<Button onClick={() => window.location.reload()}>Refresh</Button>}
    />
  );
}
```

---

## Non-Goals for V1 (Web)

| Feature | Reason |
|---------|--------|
| Mobile responsive | Not a primary platform. Minimum viable: doesn't break on mobile. |
| Service Worker push | Requires HTTPS and backend push infrastructure. V2. |
| Shareable filter URLs | Useful but adds complexity. V2. |
| WebSocket live updates | Overkill for a daily-check-in tool. Polling on action is fine. |
| SEO | Dashboard is authenticated, no public pages. Not needed. |
