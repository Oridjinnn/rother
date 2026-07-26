# 10 — Product Roadmap

**Document:** `10_PRODUCT_ROADMAP.md`  
**Milestone:** M15.0  

---

## Purpose

Live product roadmap derived from the polish backlog (PRODUCT_POLISH_BACKLOG.md), UX audit findings, and platform strategy. All items are ordered by impact-to-effort ratio.

---

## Now (V1 — Active)

### Polish Sprint (Next 2-3 Cycles)

| Priority | Item | Source | Effort | Impact |
|:--------:|------|--------|:------:|:------:|
| P0 | Strip ", original" suffix from reviewer names | UX Audit | 1h | High |
| P0 | Fix Compare tab icon duplication | PV0 Audit | 30m | Medium |
| P0 | Replace hardcoded colors `#3b82f6`/`#ef4444` with CSS vars | Cons. Report | 2h | High |
| P1 | Standardize small-font sizes (3 variants → 1) | Cons. Report | 1h | Medium |
| P1 | Make Config tab visible in client mode | UX Audit | 4h | High |
| P1 | Add Competitor form (replace JSON editing) | UX Audit | 8h | Critical |
| P1 | Standardize card padding (`p-5` everywhere) | Cons. Report | 2h | Low |
| P1 | Standardize animation durations to token set | Cons. Report | 2h | Low |
| P1 | Reduce duplicate code between Overview/Branches sections | PV0 Audit | 4h | Medium |
| P1 | Fix "9 skipped" empty state — show explanation | UX Audit | 1h | High |
| P1 | Fix `spawnSync` → `spawn` for non-blocking updates | UX Audit | 8h | Critical |
| P1 | Added progress bar during update | UX Audit | 4h | High |
| P1 | Alert badge count on Alerts tab | UX Audit | 2h | Medium |
| P1 | Fix "+0 new reviews" → hide when no deltas | UX Audit | 1h | Low |
| P1 | Keyboard shortcut for Config tab (`G C`) | Missing | 30m | Low |
| P1 | Remove internal IDs from user-facing competitor labels | UX Audit | 1h | Medium |
| P1 | Standardize Export file naming | UX Audit | 1h | Low |

### Infrastructure (Ongoing)
- Replace `spawnSync` → `spawn` for non-blocking updates
- Add polling of run status from a state file
- Add cancel button for running updates
- Surface preflight warnings before updates

---

## Next (V2 — 3-6 Months)

### Desktop App (Tauri)
| Item | Description | Dependencies |
|------|-------------|:------------|
| Tauri shell | Minimal window wrapper, system tray, app icon | — |
| Auto-start | Register Rother to launch on Windows startup | Tauri shell |
| System tray badge | Unread alert count on tray icon | Tauri shell |
| Windows notifications | Native toast notifications for alerts | PWA notification API |
| Minimize to tray | Close button minimizes instead of quitting | Tauri shell |
| Auto-updater | Built-in update mechanism | Tauri shell |

### Product Improvements
| Item | Source | Effort |
|------|--------|:------:|
| Onboarding flow (welcome card, 3-step guide) | UX Audit | 4h |
| Notification history with read/unread state | Product | 8h |
| Filter state in URL (shareable filtered views) | Product | 4h |
| XLSX export option | UX Audit | 4h |
| Settings page (theme, export defaults, auto-refresh) | Product | 8h |
| "View on Google Maps" button on review rows | UX Audit | 2h |
| Unreviewed reviews count + filter | UX Audit | 2h |

---

## Later (V3 — 6-12 Months)

### Multi-Source
| Source | Complexity | Notes |
|--------|:----------:|-------|
| Facebook Reviews | Medium | Graph API requires app approval |
| Yelp | Medium | API key required, rate limited |
| TripAdvisor | High | API changes, content restrictions |

### Dashboard Evolution
- Report builder (drag sections, select date range, export PDF)
- Dashboard customizer (reorder/hide/show sections)
- Multi-source view (per-source tabs)
- Scheduled auto-updates (cron-like in UI)

---

## Future (V4+)

### Server Mode
- Self-hosted FastAPI backend
- SQLite → PostgreSQL migration
- Team accounts (simple auth, no RBAC)
- Shared dashboards

### Advanced Features
- Sentiment trend analysis (ML-powered)
- Competitor benchmark scoring (normalized across sources)
- Alert rules engine (configurable thresholds)
- Public API for data access

---

## Milestone Map

```
M15.0 ───── Product Blueprint & Architecture ◀── YOU ARE HERE
                    │
M15.1 ───── Polish Sprint: UI consistency, Config tab, non-blocking updates
                    │
M15.2 ───── Onboarding, Export improvements, Alerts refinement
                    │
M16.0 ───── V2: Tauri Desktop App (native window, tray, notifications)
                    │
M17.0 ───── V3: Multi-source data (Facebook, Yelp)
                    │
M18.0+ ──── Server mode, team accounts, SaaS
```

---

## Non-Goals (Explicitly Not Planning)

| Item | Reason |
|------|--------|
| Mobile app (iOS/Android) | No product need. Dashboard is a desktop activity. |
| React Native / Electron | Tauri is lighter. Only switch if Tauri fails. |
| Real-time collaboration | Overkill for 1-5 person teams. |
| AI-generated review responses | Useful but premature. Let users write their own. |
| Public website / marketing site | Not a consumer product. No SEO value. |
