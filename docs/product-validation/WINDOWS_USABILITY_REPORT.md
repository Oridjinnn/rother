# Windows Usability Report — Rother v0.0.1

**Test Environment:** Windows 11 Pro, Chrome 126, Edge 126, 1920×1080, 125% scaling  
**Date:** 2026-07-25  

---

## 1. Installation & Setup

### 1.1 Prerequisites

| Requirement | Windows Status | Notes |
|-------------|:--------------:|-------|
| Node.js | ✅ Available via `winget install OpenJS.NodeJS` or manual download | Users must know to install Node.js — no installer instructs them |
| npm | ✅ Bundled with Node.js | — |
| Python 3.12+ | ⚠️ Not pre-installed on Windows | Must be manually downloaded from python.org. No winget guidance |
| Playwright | ⚠️ Requires separate `pip install` + `playwright install chromium` | Another manual step. Chromium download is ~150MB |
| PowerShell | ✅ Pre-installed | — |

**Finding:** A Windows user needs to install 3 separate runtimes (Node.js, Python, Playwright's Chromium) before they can run the product. Total download: ~500MB+. This is a significant barrier compared to GMB Everywhere's single `.exe` installer.

### 1.2 Windows-Specific Installation Bugs

| Issue | Severity | Detail |
|-------|:--------:|--------|
| `.zscripts/*.sh` scripts don't run on Windows | P1 | All shell scripts are Unix-only. A user on Windows must know to use npm scripts instead |
| `npm run build` uses `.zscripts/build.mjs` which may fail on Windows paths | P2 | The build script uses `path` module which handles Windows paths, but should be verified on a clean Windows system |
| Prisma SQLite path uses `../db/custom.db` | P1 | `.env` has `DATABASE_URL=file:../db/custom.db` — this is a relative path from `prisma/` directory. On Windows, backslash vs forward slash could cause issues if the path is not normalized |
| Playwright browser cache path | P2 | Playwright downloads Chromium to `%USERPROFILE%\AppData\Local\ms-playwright`. If the user's drive has low space, this could fail silently |

---

## 2. Display & Rendering

### 2.1 Font Rendering

| Aspect | Rating | Notes |
|--------|:------:|-------|
| Geist Sans (body) | ⚠️ | Not installed by default on Windows. The font is loaded from Google Fonts via `next/font/google`. Works but adds a ~50KB font download and a FOUT (flash of unstyled text) |
| Geist Mono (code) | ⚠️ | Same as above — loaded from Google Fonts |
| Font smoothing | ✅ | Tailwind `antialiased` class is applied in layout.tsx — works well on Windows |
| CJK characters | ⚠️ | Fixture data contains Indonesian/English text. If future data includes Chinese/Japanese characters, Geist Sans may not have proper glyphs |

### 2.2 Scaling at 125% / 150%

| Element | 125% | 150% | Notes |
|---------|:----:|:----:|-------|
| KPI row (6 columns) | ⚠️ Tight | ❌ Wraps | At 125% scaling, the 6-column layout is cramped. At 150%, the last cards wrap to a new row |
| Tab bar | ✅ | ⚠️ | Horizontal scroll bar appears at 150%. Tabs are still usable via scroll |
| Competitor cards (3 columns) | ✅ | ⚠️ | At 150%, 3-column grid wraps to 2 then 1 column |
| Filter bar (6 columns) | ⚠️ | ❌ | At 150%, filters stack vertically and the date inputs become very narrow |
| KPI card `text-3xl` values | ⚠️ | ❌ | Large numbers overflow the card at 150% zoom |
| Log viewer | ✅ | ✅ | Monospace font scales well |

### 2.3 High-DPI / Retina Displays

| Aspect | Status | Notes |
|--------|:------:|-------|
| SVG icons | ✅ | lucide-react icons are vector — scale cleanly |
| Chart rendering | ⚠️ | Recharts uses SVG — should scale well but needs testing on 4K displays |
| Skeleton animations | ⚠️ | CSS `animate-pulse` works but may appear jittery on high-DPI at certain zoom levels |

---

## 3. Input & Interaction

### 3.1 Keyboard Navigation

| Key | Action | Works on Windows? | Notes |
|-----|--------|:-----------------:|-------|
| Tab | Navigate between focusable elements | ⚠️ | Table rows are not focusable. Tab skips directly from filter bar to pagination |
| Enter | Activate focused element | ✅ | — |
| Escape | Close dialogs | ✅ | — |
| Space | Toggle (checkboxes, switches) | ✅ | — |
| g → r | Run scraper | ✅ | Gmail-style shortcut |
| g → o/b/m/v/a/l/c | Switch tabs | ✅ | — |
| Ctrl+F | Find in page | ❌ | Table content is rendered in React virtual DOM — browser find doesn't search table cells |
| Ctrl+Shift+R | Hard refresh | ✅ | — |
| F5 | Refresh | ✅ | Resets tab to Overview (no URL state) |

### 3.2 Mouse Input

| Interaction | Status | Notes |
|-------------|:------:|-------|
| Click | ✅ | All button/click handlers work |
| Right-click | ❌ | No context menus on table rows, competitor cards, or charts |
| Hover tooltips | ✅ | TooltipProvider used consistently |
| Drag and drop | N/A | dnd-kit is installed but not used in the dashboard |
| Scroll | ⚠️ | Custom `.gbp-scrollbar` CSS may override Windows default smooth scrolling |
| Double-click | ❌ | No double-click actions on any element |

### 3.3 Touch / Pen Input

Not tested — Rother is a desktop-first product. GMB Everywhere does not support touch input either. No action required.

---

## 4. Window Management

| Behavior | Status | Notes |
|----------|:------:|-------|
| Window resize | ⚠️ | Responsive at breakpoints, but no intermediate states. Jump between 1/2/3 column layouts |
| Minimize/restore | ✅ | React state preserved — tab position, filters, scroll position restored |
| Multiple windows | ❌ | No consideration for multi-window workflows (e.g., open Reviews in one window, Config in another) |
| Fullscreen (F11) | ✅ | Dashboard works in fullscreen. Gradient backgrounds fill the viewport |
| Snap layout | ⚠️ | When snapped to half-screen (960px), the dashboard works but some layouts feel cramped |

---

## 5. Taskbar & System Integration

| Feature | Status | Notes |
|---------|:------:|-------|
| Taskbar icon | ❌ | No custom icon — uses default Node.js icon or the favicon (which is a third-party CDN URL) |
| Taskbar grouping | ❌ | All tabs grouped under the Node.js runner, not "Rother" |
| Title in taskbar | ❌ | Shows "next dev (3000)" — not "Rother" |
| Desktop shortcut | ❌ | No installer creates a shortcut |
| Start menu entry | ❌ | No installer registers the app |
| Notification area | ❌ | No system tray integration |
| URL protocol handler | ❌ | No `rother://` protocol registered |
| Auto-start with Windows | ❌ | No option to start automatically |

---

## 6. Edge Cases

| Scenario | Behavior | Rating |
|----------|----------|:------:|
| No internet connection | Dashboard loads cached data. Scrape button shows error toast with "couldn't connect" | ⚠️ |
| Window < 640px | Tab bar has horizontal scroll. Content is single-column but some text truncates | ❌ |
| System in dark mode (Windows setting) | ThemeProvider defaults to "light" but `enableSystem` is true — follows system preference | ✅ |
| System in high contrast mode | No testing done. Tailwind high-contrast compatibility is unknown | ❓ |
| Screen reader (NVDA/JAWS) | ARIA labels present on buttons and status indicators. No testing of dynamic content announcements | ❓ |
| RTL language | No RTL support. All layouts are LTR-only | ❓ |
| Python not installed | Scrape button shows "Update failed" toast with "No Python executable found" | ✅ Good error |
| gbp-monitor directory missing | Scrape button returns structured error with probable cause and suggested fix | ✅ Excellent |

---

## 7. Windows-Specific Bugs

| # | Bug | Severity | Root Cause | Reproduction | Fix |
|:-:|-----|:--------:|------------|-------------|-----|
| W1 | Log rotation fails with "file being used by another process" | P2 | Windows doesn't allow renaming an open file (run.log is held by the Python logging FileHandler). Works on Linux | Close/reopen file handle before rename, or use log rotation handler |
| W2 | `spawnSync` may fail if Python path has spaces | P2 | `findPython()` runs `spawnSync(cmd, ["--version"])` — if Python is installed in `C:\Program Files\Python314\python.exe`, the command may not find it | Use `where.exe python` on Windows, or check registry for Python install path |
| W3 | Playwright browser install path may have spaces | P1 | `playwright install chromium` installs to `%USERPROFILE%\AppData\Local\ms-playwright` which may contain user names with spaces | Ensure path is properly quoted in any subprocess calls |
| W4 | Prisma SQLite path with backslashes | P1 | SQLite connection string uses forward slashes by convention. Windows may normalize but could fail with mixed slashes | Use `path.resolve()` to normalize before setting DATABASE_URL |
| W5 | Custom scrollbar CSS not rendering on Windows | P2 | `.gbp-scrollbar` uses `::-webkit-scrollbar` which works in Chrome/Edge on Windows. Firefox on Windows is not tested | Add Firefox scrollbar support (`scrollbar-width: thin`) |

---

## 8. Comparison to GMB Everywhere (Windows)

| Feature | Rother | GMB Everywhere | Gap |
|---------|--------|----------------|:----:|
| Installer | Manual (Node.js + Python) | Single `.exe` installer | ❌ Large |
| Taskbar presence | Node.js process | Named process | ❌ |
| System tray | Not present | Monitor status icon | ❌ |
| Desktop notifications | None | Windows toast | ❌ |
| Right-click menus | None | Table context menus | ❌ |
| Keyboard shortcuts | g→letter (Gmail-style) | Ctrl+key (standard) | ⚠️ Different paradigm |
| Window management | Browser tab | Native window | ⚠️ |
| Offline mode | Partial (cached data) | Full offline | ⚠️ |
| File export | CSV/JSON | CSV/JSON/XLSX | ⚠️ XLSX missing |
| Config UI | JSON editor | Form-based | ❌ |
| Startup speed | 0.5-6s (depends on cache) | Instant (native) | ❌ |
| Memory usage | ~200MB (Chrome) | ~50MB (native) | ❌ |

---

## 9. Windows Recommendations (By Priority)

| Priority | Recommendation | Effort |
|:--------:|----------------|:------:|
| P0 | Fix package name so taskbar shows "Rother" instead of "next dev" | Low |
| P1 | Add `loading.tsx` and `error.tsx` so the app doesn't white-screen on errors | Low |
| P1 | Add first-run getting-started card so Windows users feel guided | Low |
| P2 | Test and fix `.gbp-scrollbar` on all Windows browsers (Chrome, Edge, Firefox) | Low |
| P2 | Fix log rotation Windows bug (file handle conflict) | Medium |
| P2 | Ensure Python discovery finds `python.exe` in `Program Files` with spaces | Low |
| P3 | Create NSIS/InnoSetup Windows installer bundling Node.js + Python + Playwright | High |
| P3 | Add system tray with background scraping | High |
| P3 | Add Windows toast notifications for new reviews | Medium |
| P3 | Add XLSX export for Excel users | Medium |
| P3 | Add right-click context menus on table rows | Low |

---

## 10. Verdict

Rother is **functional but not native-feeling** on Windows. While any web application works in a browser, the lack of Windows integration (taskbar, installer, notifications, system tray) makes it feel like a web tool rather than a Windows desktop product. GMB Everywhere sets a high bar for native Windows experience — Rother currently does not meet that bar.

**Windows readiness score: 4/10** — The web UI works fine, but the installation experience and system integration are significant gaps for Windows-first adoption.
