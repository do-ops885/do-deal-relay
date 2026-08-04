# PEV Spec — Dashboard Renderer Wiring

## Task

**Title**: Wire existing dashboard renderers into the public shell
**Author**: Buffy
**Date**: 2026-08-04
**Priority**: high

## Goal

Replace the user-facing Deals, Referrals, and Analytics placeholder routes with their existing API-backed renderer modules.

## Approach

Import the existing renderer modules in `public/js/app.js`, register them in the router view map, preserve placeholders only for routes without completed renderers, and add static wiring coverage.

## Non-Goals

- Not implementing the Research or System Health views.
- Not redesigning the existing Deals, Referrals, or Analytics modules.
- Not enabling AI Gateway, Durable Execution, OTLP export, or A2A task delegation.
- Not changing backend API contracts or authentication.

## Steps

| Step | Description | Files Touched | Risk |
|------|-------------|---------------|------|
| 1 | Import and register existing renderers; retain explicit placeholders for unfinished routes | `public/js/app.js` | medium |
| 2 | Align static/A2A version labels with the repository version | `public/index.html`, `worker/routes/a2a.ts` | low |
| 3 | Add source-level wiring assertions | `tests/unit/dashboard-wiring.test.ts` | low |
| 4 | Update roadmap status to distinguish partial dashboard work from remaining gaps | `plans/GOAP_STATE.md`, `plans/FOLLOWUP-p3-features.md` | low |

## Acceptance Criteria

- [ ] `#/deals` uses `renderDealsView`.
- [ ] `#/referrals` uses `renderReferralsView`.
- [ ] `#/analytics` uses `renderAnalyticsView`.
- [ ] Research, Health, and Deal Details remain visibly identified as incomplete rather than falsely advertised as implemented.
- [ ] A2A reports the repository version instead of a hardcoded divergent version.
- [ ] Typecheck and formatting pass.
- [ ] Focused wiring tests pass.

## Open Questions

- Research and System Health need separate renderer designs or an explicit scope decision.
- A2A task delegation requires a protocol/API design before implementation.

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Renderer mount contracts differ | medium | Preserve the router's existing Node/object return handling and run focused tests |
| Dashboard API calls fail in an unconfigured environment | medium | Existing renderers already expose loading/error states; no API contract changes |
| Version generation overwrites a manual Worker edit | low | Import the existing generated `VERSION` constant |

## Dependencies

- Existing dashboard renderer modules and API client.
- Existing `VERSION` generation workflow.

## Out of Scope for This Spec

- Production AI Gateway migration.
- Durable Execution runtime migration.
- OTLP vendor configuration.
- A2A task lifecycle endpoints.
