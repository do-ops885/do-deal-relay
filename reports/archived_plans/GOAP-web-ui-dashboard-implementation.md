# GOAP Plan: Web UI Dashboard (Issues #298-#302)

**Date**: 2026-06-03
**Strategy**: Parallel Swarm → Sequential Integration
**Agents**: 3 code-crafter agents

## Context

Issues #298-#302 request a Web UI Dashboard for the do-deal-relay service. This is a P3 feature that provides a browser-based interface for managing deals, viewing analytics, and tracking referrals. The dashboard will be served as static files from the Worker's `public/` directory.

## Architecture Decision: Lightweight SPA with Vanilla JS

### ADR: Static SPA Served from Worker

**Decision**: Build a lightweight single-page application using vanilla HTML/CSS/JS, served from `public/` directory via Cloudflare Worker static asset serving.

**Rationale**:
- No build step required (keeps deployment simple)
- Minimal bundle size (<100KB total)
- Works without JavaScript for basic content
- Leverages existing Worker static file serving

**Tech Stack**:
- HTML5 with semantic elements
- CSS3 with CSS Grid/Flexbox (responsive)
- Vanilla JavaScript (ES modules)
- Chart.js for analytics (CDN-loaded, optional)
- No framework dependency

### ADR: API-First Dashboard

**Decision**: Dashboard communicates with existing REST API endpoints.

**Rationale**: All data operations already have API endpoints. Dashboard is a thin client.

**API Endpoints Used**:
- `GET /api/deals` - List deals
- `GET /api/deals/:id` - Deal detail
- `GET /api/analytics` - Analytics data
- `GET /api/referrals` - List referrals
- `GET /health` - System health
- `GET /metrics` - Prometheus metrics

---

## Task Decomposition

### Sub-Goals

1. **Dashboard Layout & Architecture** (#298) - Priority: P3, Deps: none
2. **Deal Management Views** (#299) - Priority: P3, Deps: 1
3. **Analytics & Referral Views** (#300, #301) - Priority: P3, Deps: 1

### Dependency Graph
```
T4.1 (Layout) ──┬──→ T4.2 (Deal Views)
                 └──→ T4.3 (Analytics + Referrals)
```

---

## Execution Plan

### Phase 4A: Parallel Implementation

**Agent 1 → T4.1: Dashboard Layout & Architecture (#298)**

Files to create:
- `public/index.html` - Main dashboard shell
- `public/css/dashboard.css` - Responsive styles
- `public/js/app.js` - Main application controller
- `public/js/router.js` - Client-side routing
- `public/js/api.js` - API client wrapper

Tasks:
1. Create responsive layout with sidebar navigation
2. Implement dark/light theme toggle
3. Create component shell (header, sidebar, content area)
4. Implement client-side hash-based routing
5. Create API client with error handling
6. Add loading states and error boundaries
7. Ensure mobile responsiveness (375px breakpoint)

Success Criteria:
- [ ] Dashboard loads at root URL
- [ ] Navigation works between sections
- [ ] Responsive on mobile (375px) and desktop (1440px)
- [ ] Dark/light theme toggle works
- [ ] API client handles errors gracefully

---

**Agent 2 → T4.2: Deal Management Views (#299)**

Dependencies: T4.1 must complete first (needs layout shell)

Files to create:
- `public/js/deals.js` - Deal list/detail views
- `public/js/components/deal-card.js` - Deal card component
- `public/js/components/deal-detail.js` - Deal detail modal

Tasks:
1. Create deal list view with search/filter
2. Create deal card component (title, price, source, status)
3. Create deal detail view (full info, referrals, history)
4. Add pagination for deal list
5. Add category filtering
6. Add status filtering (active/expired/all)
7. Add sort by date/confidence/trust

Success Criteria:
- [ ] Deal list displays with pagination
- [ ] Deal cards show key information
- [ ] Deal detail shows full information
- [ ] Search and filter work
- [ ] Responsive layout maintained

---

**Agent 3 → T4.3: Analytics & Referral Views (#300, #301)**

Dependencies: T4.1 must complete first (needs layout shell)

Files to create:
- `public/js/analytics.js` - Analytics dashboard views
- `public/js/referrals.js` - Referral tracking interface

Tasks:
1. Create analytics summary cards (total deals, active, expired)
2. Create deals-over-time chart (using Chart.js from CDN)
3. Create category distribution chart
4. Create referral list view
5. Create referral detail view
6. Add referral status tracking (active/pending/expired)
7. Create system health status card

Success Criteria:
- [ ] Analytics summary cards display correctly
- [ ] Charts render with real data
- [ ] Referral list shows all referrals
- [ ] System health card shows service status
- [ ] Responsive layout maintained

---

## Quality Gate: Phase 4 Complete

- [ ] Dashboard loads and navigates correctly
- [ ] All views render with real API data
- [ ] Responsive on mobile and desktop
- [ ] Bundle size <100KB total
- [ ] No TypeScript/JavaScript errors
- [ ] Accessible (ARIA labels, keyboard navigation)
- [ ] Performance: First contentful paint <1s

## File Structure

```
public/
├── index.html              # Dashboard shell
├── css/
│   └── dashboard.css       # All styles
├── js/
│   ├── app.js              # Main controller
│   ├── router.js           # Client-side routing
│   ├── api.js              # API client
│   ├── deals.js            # Deal views
│   ├── analytics.js        # Analytics views
│   ├── referrals.js        # Referral views
│   └── components/
│       ├── deal-card.js    # Deal card component
│       ├── deal-detail.js  # Deal detail component
│       └── charts.js       # Chart components
└── assets/
    └── favicon.ico         # Favicon
```

## Contingency

- If Chart.js CDN unavailable: Use simple CSS-based bar charts
- If bundle too large: Lazy-load chart library, split JS into chunks
- If API endpoints return too much data: Add client-side pagination
