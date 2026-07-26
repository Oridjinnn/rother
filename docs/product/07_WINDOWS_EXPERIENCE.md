# 07 — Windows Experience

**Document:** `07_WINDOWS_EXPERIENCE.md`  
**Milestone:** M15.0  

---

## Purpose

Define how Rother feels and behaves on Windows 11, its primary platform. This document addresses the "Windows-first" product strategy and formalizes recommendations from the Windows Usability Audit.

---

## Current State

- Rother runs as a Chrome/Edge PWA (or pinned tab)
- No native Windows features are used
- `gbp-monitor.py` backend runs as a Python process
- User launches Rother by opening a browser and navigating to `localhost:3000`
- Windows Usability Audit found 15 issues

---

## UX Principles for Windows

| Principle | Rationale |
|-----------|-----------|
| **Feels native** | Even as a web app, Rother should follow Windows 11 conventions (title bar, taskbar, notifications). |
| **Survives sleep/restart** | A daily-check-in tool must be resilient to laptop lid close, sleep, and reboot. |
| **Zero-config launch** | Opening Rother should be as easy as opening Spotify or Slack. |
| **System-aware** | Respect Windows theme, accent color, and notification settings. |

---

## Launch Flow (Target)

### Current Flow
```
Open browser → Type localhost:3000 → Click bookmark (if saved)
```

### Target Flow
```
Click Rother shortcut (desktop/taskbar) → Opens automatically
Start menu → Search "Rother" → Opens automatically
Windows startup → Rother launches minimized to tray
```

---

## PWA Improvements (V1)

### Manifest Updates
Current manifest is barebones. Target:

```json
{
  "name": "Rother",
  "short_name": "Rother",
  "description": "Competitor review monitoring dashboard",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#18181b",
  "categories": ["business", "productivity"],
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### Service Worker
- Register a minimal service worker for offline-capable boot screen
- Cache the app shell (icons, CSS, JS bundles)
- Show cached shell if server is unreachable (common after sleep)

### Taskbar Integration
- `display: standalone` with `theme_color` matching --primary
- Edge/Chrome PWA install prompt (no protocol handler needed)
- Right-click jump list: "Update Data", "Open Reviews", "Export"

---

## Notifications (V2)

### Windows Notification Target
```typescript
// When new alerts arrive and Rother is minimized/backgrounded
if (Notification.permission === 'granted') {
  new Notification('Rother', {
    body: '2 new 1★ reviews detected',
    icon: '/icon-192.png',
    tag: 'rother-alert',
    requireInteraction: true,
  });
}
```

### Rules
- Only notify for severity ≥ warning (new 1-2★ reviews, run failures)
- Suppress duplicates within 5-minute window
- Respect Windows Focus Assist (Do Not Disturb) — `navigator.permissions.query({ name: 'notifications' })`

---

## System Tray Integration (V2+)

### Electron/Native Shell
If PWA limitations become blocking, wrap in a minimal Electron shell that provides:
- System tray icon with unread alert badge
- Right-click menu: "Open", "Update Data", "Quit"
- Auto-start on login (Windows registry)
- Minimize-to-tray instead of closing

This is **V2 or later**. For V1, the PWA should be sufficient.

---

## Theme Sync (V1)

### Auto Theme Detection
```typescript
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
// On first load and on change, sync with system
prefersDark.addEventListener('change', (e) => {
  document.documentElement.classList.toggle('dark', e.matches);
});
```

Already partially implemented (PV0 audit confirms theme toggle works). Enhancement: sync with system as the default, with manual override persisted.

---

## Window Behavior

| Behavior | Current | Target |
|----------|:-------:|:------:|
| Tab title | "Rother" | "Rother (2)" when unread alerts |
| App icon | Generic Next.js | Branded "R" favicon |
| Window sizing | Default browser | Full height, 1440px min width |
| Multiple windows | Possible (confusing) | Prevent duplicates via service worker |
| Sleep recovery | Broken (hangs) | Reconnect button if fetch fails after sleep |

### Sleep Recovery
Common issue: laptop opens lid, user switches to Rother tab, it hangs on "Loading..." because the backend hasn't started in time.

**Target flow:**
```
1. User opens laptop → Switches to Rother tab
2. Rother tries to fetch /api/overview → fetch timeout (10s)
3. Shows "Backend starting up… Please wait" overlay with retry
4. Backend starts → Auto-retry succeeds → Dismiss overlay
```

---

## Keyboard Navigation

### Global Shortcuts (Already Partially Implemented)
| Shortcut | Action | Status |
|----------|--------|:------:|
| `G` `O` | Switch to Overview | Implemented |
| `G` `B` | Switch to Branches | Implemented |
| `G` `M` | Switch to Compare | Implemented |
| `G` `V` | Switch to Reviews | Implemented |
| `G` `A` | Switch to Alerts | Implemented |
| `G` `C` | Switch to Config | Missing |
| `G` `R` | Run update | Implemented |
| `?` | Show shortcuts | Implemented |
| `Esc` | Close dialog | Implemented |

### Windows-Specific
- `Alt+Tab` to switch windows: works (browser tab)
- `Win+1..9` to launch: works (Edge/Chrome pinned taskbar)
- `Ctrl+W` to close: works (closes tab)
- `Ctrl+Shift+T` to reopen: works

---

## Accessibility on Windows

- **Narrator compatibility**: All interactive elements must be focusable and have labels
- **High Contrast mode**: Test with Windows High Contrast themes
- **Font scaling**: Respect Windows display scaling (100%, 125%, 150%)
- **Focus indicators**: Visible ring on keyboard navigation (Tab, Shift+Tab)

---

## What NOT to Do (Anti-Patterns)

| Anti-Pattern | Reason |
|:-------------|:-------|
| Custom title bar | Unnecessary for PWA; adds complexity for no user value |
| Native installer (.msi/.exe) | Overhead for a dashboard. PWA install is sufficient for V1 |
| Electron before PWA is proven | PWA covers 90% of use cases. Electron only if PWA hits limits |
| Registry/config files | Everything should work from a single browser session |
| Auto-start without consent | Ask once on first install |
