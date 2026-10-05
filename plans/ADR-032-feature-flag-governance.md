# ADR-032: Feature Flag Governance — Enforcement, Defaults, and Management API

**Status**: Accepted
**Date**: 2026-10-05
**Deciders**: cline (audit + implementation)
**Context**: GAP-ANALYSIS-2026-10-04 findings NI-1 and NI-2

## Context

`worker/lib/feature-flags.ts` declares nine `DEFAULT_FLAGS`, but before this
change only four flags had any reader (`real_research_fetching`,
`workflow_shadow_discovery`, `workflow_pipeline_cutover` — all read in exactly
three files). Five flags were dead config. Additionally:

- `initializeDefaultFlags()` was never called, so no flag exists in KV unless
  written by hand; every read fell through to `false`.
- No management surface existed (no admin route, no CLI), so a fail-closed
  gate would have been unrecoverable without a deploy.
- `bulk_import_export` and `email_processing` declared `enabled: false` while
  `/api/bulk/*` and `/api/email/*` have been live, documented, and e2e-tested
  for months.
- `ai_extractor_scraper` declared `enabled: false, rolloutPercentage: 0` with
  a "gradual rollout" description, yet `extractWithAI` ran unconditionally
  whenever the Workers AI binding was present — an unbudgeted LLM cost and an
  EU AI Act Article 12 surface with no working off switch.

## Decision

1. **Enforce every declared flag at its consumer.** Route flags gate at the
   router (`/api/bulk/*`, `/api/email/*`, `/api/analytics*` +
   `/api/dashboard/*`, `/webhooks/*`); `nlq_ai_enhancement` gates the
   `HybridClassifier` AI path (rule-based fallback); `ai_extractor_scraper`
   gates `extractWithAI` (skip, fail-closed).
2. **Lazy initialization.** The gate helper runs `initializeDefaultFlags(env)`
   before reading; seeding is idempotent and costs one KV get per check once
   seeded.
3. **Correct the two false defaults to match reality.**
   `bulk_import_export` and `email_processing` become `enabled: true` — the
   endpoints have been live by design; the flag rows were aspirational, not
   descriptive. Kill switches now actually work.
4. **`ai_extractor_scraper` stays `enabled: false`.** AI extraction is OFF by
   default after this ships — a deliberate behavior change that fixes the
   cost/compliance gap. Operators enable it via the admin API (gradual
   rollout per the flag's original description).
5. **Admin management API.** `GET /api/admin/flags` and
   `PUT /api/admin/flags/:name` (admin role, audit-logged) give operators the
   control the flag dashboard always implied.
6. **503 `FEATURE_DISABLED` over 404.** These endpoints are publicly
   documented; an explicit status with a machine-readable code is more
   debuggable than hiding existence, and consistent with the existing
   `REMOTE_BINDING_REQUIRED` 503 pattern.

## Consequences

- Every gated request costs up to two KV reads (init probe + flag read).
- Deploying this change disables research-agent AI extraction until an admin
  enables `ai_extractor_scraper` — noted in the release notes.
- New flags added to `DEFAULT_FLAGS` must name their enforcement point in the
  flag description; unenforced flags are treated as audit findings.

## Alternatives Considered

- **Delete the five unread flags** — simpler, but removes the kill-switch
  capability the system clearly intended and operators expect.
- **Fail-closed enforcement without an admin API** — would permanently disable
  bulk/email with no recovery path short of a deploy; rejected.
- **404 when disabled** — rejected: less debuggable, no precedent in-repo.

## References

- GAP-ANALYSIS-2026-10-04 (NI-1, NI-2)
- ADR-031 (deal alerts as-built), ADR-025 (logging consolidation)
- `worker/lib/feature-flags.ts`, `worker/router/ops-routes.ts`,
  `worker/router/legacy-routes.ts`, `worker/lib/nlq/hybrid/index.ts`,
  `worker/lib/research-agent/compliance-log.ts`
