# PEV Spec — Flag Governance + Gap-Analysis Hardening Batch

## Task

**Title**: Implement GAP-ANALYSIS-2026-10-04 findings (NI-1, NI-2, IMP-4, IMP-5, IMP-6)
**Author**: cline
**Date**: 2026-10-05
**Priority**: high

## Goal

Make the feature-flag system honest (every declared flag enforced, manageable,
fail-closed where declared off) and close the remaining code-actionable
improvement items from the 2026-10-04 gap analysis.

## Approach

Enforce flags at their route/AI call sites behind a lazy-initializing gate
helper, add an admin flag-management API, wire `ai_extractor_scraper`
fail-closed, split the three over-limit files along existing seams using the
repo's barrel pattern, and add a golden-case eval harness.

## Non-Goals

- Not touching prod D1 migrations, queues, or seeding (owner ops)
- Not implementing OTEL SDK or build-once promote (ADR-registered, owner/CI scope)
- Not building the Web UI dashboard epic (separate-project decision)
- Not rewriting the alerts matcher for Vectorize (free-tier constraint per ADR-031)

## Steps

| Step | Description | Files Touched | Risk |
|------|-------------|---------------|------|
| 1 | NI-2: `extractWithAI` fail-closed on `ai_extractor_scraper` | compliance-log.ts, tests | low |
| 2 | NI-1: lazy flag init, corrected defaults, gate helper, route gates (bulk, email, analytics, webhooks, NLQ AI), admin flag API | feature-flags.ts, ops-routes.ts, legacy-routes.ts, hybrid/index.ts, routes/admin/flags.ts, tests | medium |
| 3 | IMP-6: split auth.ts (565), rate-limit.ts (517), url-validator.ts (500) under 500 via barrels | routes/auth/*, lib/rate-limit*, lib/validation/url-* | medium |
| 4 | IMP-4: FTS5-parity token semantics (prefix tokens) in alerts matcher | alerts/matcher.ts, tests | low |
| 5 | IMP-5: golden-case eval harness (matcher, NLQ intent, hybrid fusion) | tests/evals/*, package.json | low |
| 6 | GOAP v0.19.34 + INDEX + ADR-032 | plans/* | low |

## Acceptance Criteria

- [ ] `isFeatureEnabled` readers exist for all 9 DEFAULT_FLAGS
- [ ] Disabled flag returns 503 `FEATURE_DISABLED` on gated routes
- [ ] `extractWithAI` returns [] when `ai_extractor_scraper` disabled (default)
- [ ] Admin can list/flip flags via `GET/PUT /api/admin/flags` (admin role)
- [ ] auth.ts, rate-limit.ts, url-validator.ts all < 500 lines; zero importer changes
- [ ] Eval harness runs via `npm run test:evals` with precision thresholds
- [ ] All existing tests pass; new unit tests for every gate
- [ ] tsc, prettier, markdownlint, quality gate clean

## Open Questions

None — flag semantics decided in ADR-032 (fail-closed for `ai_extractor_scraper`;
defaults corrected to match live behavior for bulk/email; 503 over 404 for
debuggability on documented endpoints).

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Flag init adds KV reads per gated request | low | init is one `__ff_initialized__` get once seeded |
| AI extraction turns off by default (NI-2 behavior change) | medium | intended compliance fix; admin can enable; ADR-documented |
| File splits break imports | medium | barrel re-exports keep every importer unchanged; full test suite |
| Route gates break e2e | medium | flags default enabled for bulk/email/analytics/webhook/nlq; e2e green |

## Dependencies

- GAP-ANALYSIS-2026-10-04 (findings), ADR-025 (logging), ADR-031 (alerts as-built)

## Out of Scope for This Spec

- N-3 logging importer migration (110 files; separate wave per ADR-025)
- F-4 DO cutover (ADR-017 phase 2)
- Owner ops: prod D1 v13/v14, `wrangler queues create`, prod seeding, credentials
