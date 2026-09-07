# 01 — Product Vision

**Document:** `01_PRODUCT_VISION.md`  
**Milestone:** M15.0 — Product Blueprint & Architecture  
**Date:** 2026-07-25  

---

## Purpose

Define the long-term identity, target audience, and value proposition of the Rother product. This document is the north star for all future UI, platform, and feature decisions.

---

## Product Identity

### Name
**Rother** — A standalone brand, not an acronym. Short, memorable, easy to type. No existing trademark conflicts in the review-monitoring space.

### Tagline (Current)
*"Competitor review insights"* — Client mode, header subtitle.

### Tagline (Proposed)
*"Your competitors' reviews, automatically tracked."*

Rationale: Focuses on the value (tracking competitors automatically) rather than the mechanism (GBP, scraping, monitoring). Accessible to non-technical decision-makers.

### Logo
- Current: Abstract brand mark (stylized "R" with a radar/dashboard motif), rendered in the app top bar.
- Rationale: Rother is a standalone, generic product. It is **not** tied to any single client or demo business (the legacy "Copenhagen Bali" coffee-shop demo is seed data only and is hidden from the UI once a user supplies their own business).

### Brand Colors
- Primary: Deep indigo (`#4F46E5`) — trustworthy, analytical
- Accent: Teal (`#0D9488`) — growth, freshness
- Warning: Amber (`#D97706`) — attention
- Error: Red (`#DC2626`) — alert
- Current shadcn/ui CSS variables map 1:1 to these

---

## Target Users

### Primary Persona — The Operations Manager
**Name:** Sarah  
**Role:** Operations Manager at a 10-50 location retail/hospitality chain  
**Technical skill:** Low (can use Excel, browser, email)  
**Goal:** Know immediately when a competitor gets a new review, especially negative ones  
**Pain points:**
- Manually checking competitors' Google Maps pages daily
- Spreadsheets with stale data
- Missed negative reviews

### Secondary Persona — The Marketing Manager
**Name:** David  
**Role:** Marketing lead for a multi-brand group  
**Technical skill:** Medium (can use CRMs, dashboards, Google Analytics)  
**Goal:** Track competitor review sentiment trends, benchmark performance  
**Pain points:**
- No automated competitive intelligence
- Manual data aggregation for reports

### Tertiary Persona — The Agency Owner
**Name:** Priya  
**Role:** Runs a digital agency managing 20+ client locations  
**Technical skill:** High (comfortable with APIs, understands web technologies)  
**Goal:** White-label competitor monitoring for client reporting  
**Pain points:**
- Agency tools are expensive ($200+/month)
- Needs multi-tenant data isolation

### Non-Target Users (V1)
- Enterprise procurement departments (needs SSO, RBAC, compliance)
- Individual store owners (1-2 locations — too small for competitive monitoring ROI)

---

## Value Proposition

### Core Value
**Know what your competitors' customers are saying — without checking their Google Maps pages every day.**

### Key Differentiators vs GMB Everywhere
| Dimension | Rother | GMB Everywhere |
|-----------|--------|----------------|
| Price | Free (self-hosted) | $47/month+ |
| Data ownership | You own your data | Cloud-only |
| Customization | Full (open source) | Limited |
| Setup effort | Moderate (self-hosted) | Instant (SaaS) |
| Competitor scope | Unlimited competitors | Per-plan limits |
| Platform | Windows-first, web UI | Web-only |

### Positioning
Rother is the **affordable, self-hosted alternative** to GMB Everywhere for organizations that:
- Have technical capability to self-host (or a IT-savvy team member)
- Want full data ownership
- Need to monitor more competitors than SaaS plans allow
- Prefer a desktop-class experience on Windows

---

## Product Principles

1. **Offline-first** — The scraper runs on your schedule. The dashboard displays the last-known state. No always-on cloud dependency.
2. **Transparent** — Every data point is inspectable as raw JSON. No black-box AI. No opaque scoring.
3. **Fast by default** — Skeletons on load, instant tab switches, no spinners for navigation.
4. **Progressive complexity** — Simple for Sarah, powerful for Priya. Advanced features are hidden until needed.
5. **Windows-first** — Browser-based UI that feels native. Taskbar, notifications, system tray in V2.

---

## Scope Boundaries

### In Scope (V1)
- Competitor review monitoring for Google Business Profiles
- Dashboard with KPIs, charts, review browsing
- CSV/JSON export
- Desktop browser experience (Chrome, Edge)
- Self-hosted deployment (Docker, Node.js)

### In Scope (V2)
- Windows installer (One-click setup)
- Desktop notifications
- System tray background scraper
- XLSX export
- macOS support

### Out of Scope (V1-V3)
- Direct review posting/reply
- Review generation or AI-written responses
- Social media monitoring (Facebook, Yelp, TripAdvisor)
- Multi-user access / RBAC
- White-label / multi-tenant
- Mobile app

---

## Risks

| Risk | Mitigation |
|------|------------|
| Google Maps DOM changes break selectors | Selector health system with browser_agent verification. Alerts when selectors degrade |
| Users can't self-host | Provide Docker image with one-command deploy. Windows installer in V2 |
| Competition from GMB Everywhere | Compete on price (free) and data ownership. Target different segment |
| Small market (GBP review monitoring) | Expand to other review platforms in future phases |
| Python/Playwright dependency complexity | Bundle with Docker. Windows installer in V2 abstracts this |

---

## Future Evolution

### V1 — Web Dashboard (Current)
Browser-based dashboard for Windows users. Manual setup.

### V2 — Desktop Application
Electron or Tauri wrapper. One-click installer. System tray. Notifications. Background scraping.

### V3 — Cross-Platform
macOS and Linux desktop support. Progressive web app for mobile companion.

### V4 — Multi-Platform Review Sources
Facebook, Yelp, TripAdvisor, Trustpilot, Booking.com. Same dashboard, more data sources.

### V5 — Agency Platform
Multi-tenant, white-label, client reporting, API access.

---

## Success Metrics

| Metric | Target (V1) | Target (V2) |
|--------|:-----------:|:-----------:|
| Time to first value | <5 minutes | <2 minutes |
| Tasks completed successfully | >80% | >95% |
| User errors per session | <3 | <1 |
| Support requests per user | — | <1/month |
| NPS (user satisfaction) | — | >40 |
