# Plans Index

**Last Updated**: 2026-10-02. Active set is intentionally small; completed
work lives in `reports/archived_plans/`. See [README](README.md) for rules.

## Status Definitions

- `active`: Currently being implemented.
- `planned`: Approved for future implementation.
- `completed`: Shipped; spec kept only while linked as GOAP evidence.
- `archived`: Moved to `reports/archived_plans/`.

## Active Plans

- [GOAP State](GOAP_STATE.md) — **v0.19.31, single source of truth**.
  Full inventory (P0–P3, deferred, blocked). #764 deal alerts shipped
  (#824/#853) plus alerts e2e; register reconciled 2026-10-02. Queue
  EMPTY: RL-1 (v0.19.12), F-8/F-10 (v0.19.5), T-2/T-3/T-4, REDDIT-5
  all verified closed. Remaining: prod D1 v13/v14 ops apply (owner) +
  small deferred menu (N-3, test as-any, F-4 DO cutover, gated items).
- [Gap Analysis 2026-08-15](GAP-ANALYSIS-2026-08-15.md) — Static audit of
  missing implementations and test-coverage gaps behind the 2026-08
  swarm runs.
- [Reddit Post Lifecycle Spec](SPEC-reddit-post-lifecycle.md) — **Active**.
  Opt-in, fail-closed Reddit publication and moderation client.
  REDDIT-1–5 complete, REDDIT-6 blocked on
  credentials. Decision: [ADR-020](ADR-020-reddit-post-lifecycle.md).

## Architecture Decision Records (kept in place)

- [ADR-015](ADR-015-harness-cloudflare-2026-best-practices.md) — Harness
  and Cloudflare 2026 patterns roadmap.
- [ADR-016](ADR-016-centralized-middleware-architecture.md) — Centralized
  middleware pipeline (shipped; pattern now standard).
- [ADR-017](ADR-017-durable-objects-migration.md) — Durable Objects
  migration; Phase 2 (`extends DurableObject` cutover) still open, gates
  RL-1.
- [ADR-018](ADR-018-cloudflare-workers-builds-failure.md) /
  [ADR-018](ADR-018-durable-execution-migration.md) — Workers Builds
  outage record; durable execution research.
- [ADR-019](ADR-019-deploy-timeout-too-low.md) — Deploy timeout, needs
  workflow-scope token (owner action).
- [ADR-021](ADR-021-ci-workflow-validator-over-strict.md) — Local
  validator gate premise mismatch (known limitation).
- [ADR-022](ADR-022-do-disposition-pipelinelock-first.md) — PipelineLock
  DO as primary lock path (shipped).
- [ADR-023](ADR-023-ci-external-credentials-and-research-flake.md) —
  CI-1 blocked on owner secret.
- [ADR-024](ADR-024-skill-version-independence.md) — Skill version
  independence (shipped).
- [ADR-025](ADR-025-logging-consolidation.md) — Logging consolidation
  N-3 (Accepted; lib/logger shipped, importer migration deferred).
- [ADR-026](ADR-026-ci-npm-registry-degradation.md) — Resolved 2026-09-05.
- [ADR-027](ADR-027-ruleset-required-check-mismatch.md) — Resolved
  2026-09-05.
- [ADR-028](ADR-028-rate-limit-binding-over-do.md) — Rate-limit binding
  over DO (RL-1 candidate; gates on ADR-017 phase 2).
- [ADR-029](ADR-029-dependabot-major-pin-policy.md) — Dependabot
  major-pin policy.
- [ADR-030](ADR-030-zod-v4-migration.md) — Zod v4 migration (shipped;
  zod ^4.6.5).
- [ADR-031](ADR-031-deal-alerts.md) — Personalized deal alerts
  (Implemented 2026-10-02 with as-built note; #824/#853).

## Completed Specs (kept as GOAP evidence)

- [SPEC-missing-impl-sweep](SPEC-missing-impl-sweep.md) — Shipped #750.
- [SPEC-f11-strict-ts-flags](SPEC-f11-strict-ts-flags.md) — Shipped #745.
- [SPEC-deal-alerts-764](SPEC-deal-alerts-764.md) — Shipped #824/#853.
- [SPEC-exactOptionalPropertyTypes-768](SPEC-exactOptionalPropertyTypes-768.md)
  — Shipped; #768 closed 2026-09-13.
- [SPEC-zod-v4-migration](SPEC-zod-v4-migration.md) — Shipped; zod ^4.6.5.
- [SPEC-n3-logging-consolidation](SPEC-n3-logging-consolidation.md) —
  Shipped #745.
- [SPEC-self-learning-feedback-full](SPEC-self-learning-feedback-full.md)
  — Shipped v0.19.1.
- [SPEC-improvement-swarm-2026-08-25](SPEC-improvement-swarm-2026-08-25.md)
  — Shipped v0.19.2.
- [SPEC-pr-triage-and-p1-swarm](SPEC-pr-triage-and-p1-swarm.md),
  [SPEC-pr-triage-and-improvements-2026-08-29](SPEC-pr-triage-and-improvements-2026-08-29.md)
  — Shipped v0.19.0.
- [PEV-d1-boilerplate-dry](PEV-d1-boilerplate-dry.md),
  [PEV-discovery-circuit-breaker](PEV-discovery-circuit-breaker.md),
  [PEV-snapshot-optimize](PEV-snapshot-optimize.md) — Shipped v0.19.5.
- [PROGRESS-2026-08-25](PROGRESS-2026-08-25.md),
  [PROGRESS-2026-08-31](PROGRESS-2026-08-31.md) — Swarm outcome records.

## Process Docs (kept in place)

- [SPEC_TEMPLATE](SPEC_TEMPLATE.md) — Required template for Full Mode.
- [PEV_LOOP](PEV_LOOP.md) — Plan-Execute-Verify spec, referenced by
  `scripts/pev-gates.sh` and the `pev-loop`, `goap-agent`,
  `validation-gates`, and `multi-agent-orchestration` skills.

## Historical Reference (kept in place, not active)

- [GitHub Automation](github-automation-plan.md) — Mostly complete since
  2026-06-30; auto-merge live.
- [FOLLOWUP: Deployment Fix](FOLLOWUP-deployment-fix.md) — Resolved;
  staging health-check root cause and options.
- [FOLLOWUP: E2E Local Env Setup](FOLLOWUP-e2e-local-env-setup.md) —
  Closed; auth setup infrastructure shipped.
- [FOLLOWUP: P3 Features](FOLLOWUP-p3-features.md) — Semantic search
  complete; dashboard deferred to separate project.
- [FOLLOWUP: Issues Not Addressed](FOLLOWUP-issues-not-addressed.md) —
  Rollback-issue wave root-caused 2026-07-17; zero open issues.
- `jules-audit/` — Dated Jules audit snapshots.

## Archived 2026-09-05

Moved to `reports/archived_plans/` (superseded July swarm snapshots,
stale merge plans, completed specs):

- `GOAP-SWARM-2026-07-06.md`, `GOAP-SWARM-V3/V4/V5/V6/V7-2026-07-0*.md`
- `GOAP-FIX-FORMAT-2026-07-06.md`, `GOAP-FIX-PR528.md`
- `FINAL_SUMMARY.md` (PR #539–#550 era), `MERGE_PLAN.md` (same era)
- `SPEC-ai-gateway-integration.md` (MI-3 shipped 2026-08-31)
- `SPEC-codacy-fixes-and-goap-state-update.md` (SC2034 shipped)
- `SPEC-legacy-routes-codacy-fix.md` (route split shipped)
- `PROGRESS-2026-07-02.md` (superseded by August progress records)

Older archives (ADRs, GOAP runs, sprints, Jules audits) are already in
`reports/archived_plans/` — see that directory for history.
