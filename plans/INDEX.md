# Plans Index

**Last Updated**: 2026-10-18. Active set is intentionally small; completed
work lives in `reports/archived_plans/`. See [README](README.md) for rules.

## Status Definitions

- `active`: Currently being implemented.
- `planned`: Approved for future implementation.
- `completed`: Shipped; spec kept only while linked as GOAP evidence.
- `archived`: Moved to `reports/archived_plans/`.

## Active Plans

- [GOAP State](GOAP_STATE.md) — **v0.19.43, single source of truth**.
  2026-10-18 plans-gap sweep: IMP-1 incremental SPA views wired
  (deals/referrals/analytics + deal-detail dialog), ADR-021 validator
  resolved via config-parity manifest (15/15), ADR-019 deploy timeouts
  resolved; owner-blocked items opened as tracked issues on top of
  v0.19.42 deferred-menu sweep
  on top of
  2026-10-15 deferred N-3 closed as misconceived (importers use the
  canonical factory; ADR-025 stands) on top of
  2026-10-15 PEV hygiene (reverify marker fixed, dev-only audit risk
  accepted, validator limitation re-confirmed) on top of
  2026-10-15 queue close-out (#968 verified closed, #973 deps merged,
  #975 autonomous-merge policy, ci-status refreshed) on top of
  2026-10-15 plans compaction (Full compact archived, [PROGRESS](PROGRESS-2026-10-15.md)) + F-12 re-close on top of
  2026-10-13 missing-wiring sweep: `GET /api/admin/ci-status`,
  `GET /api/log?trace_id=` + `structured-jsonl`,
  `GET /api/nlq/saved/:id`, `POST /api/admin/referrals/reconcile`,
  NLQ `secondary_intents`, stage consistency guard, alias/error-helper
  adoption (245 files / 3168 tests green). Codecov OIDC policy:
  [ADR-033](ADR-033-codecov-oidc-upload-credentials.md).
  Full inventory (P0–P3, deferred, blocked). F-12 test `as any`
  residue CLOSED 2026-10-06
  ([SPEC](../reports/archived_plans/SPEC-f12-asany-residue.md);
  0 in tests/, 0 in worker/; 229 files / 3065 tests green).
  2026-10-04 gap-audit findings implemented 2026-10-05 (NI-1/NI-2/IMP-4/IMP-5/IMP-6,
  [ADR-032](ADR-032-feature-flag-governance.md)). Remaining: prod D1
  v13/v14 apply + `wrangler queues create` (owner ops), deferred menu
  (N-3, F-4 DO cutover), IMP-1/IMP-3 decisions, IMP-2 external OTEL export.
- [Gap Analysis 2026-10-04](GAP-ANALYSIS-2026-10-04.md) — Fresh static
  audit. All 17 items from the 2026-08-15 audit re-verified closed; two
  new findings (route-level flag enforcement, dead `ai_extractor_scraper`
  flag) plus six improvement candidates. **NI-1/NI-2/IMP-4/IMP-5/IMP-6
  implemented 2026-10-05**
  ([SPEC](../reports/archived_plans/SPEC-flag-governance-and-hardening-2026-10-05.md),
  [ADR-032](ADR-032-feature-flag-governance.md)).
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
- [ADR-032](ADR-032-feature-flag-governance.md) — Feature flag governance:
  enforcement, corrected defaults, admin management API, fail-closed
  `ai_extractor_scraper` (Implemented 2026-10-05).
- [ADR-033](ADR-033-codecov-oidc-upload-credentials.md) — Codecov upload
  credentials: OIDC when no token, advisory upload; owner applies the
  workflow patch (agent credential lacks `workflows` permission).

## Completed Specs (archived 2026-10-15 — pointers to `reports/archived_plans/`)

- [SPEC-missing-impl-sweep](../reports/archived_plans/SPEC-missing-impl-sweep.md) —
  Shipped #750.
- [SPEC-f11-strict-ts-flags](../reports/archived_plans/SPEC-f11-strict-ts-flags.md) —
  Shipped #745.
- [SPEC-deal-alerts-764](../reports/archived_plans/SPEC-deal-alerts-764.md) —
  Shipped #824/#853.
- [SPEC-exactOptionalPropertyTypes-768](../reports/archived_plans/SPEC-exactOptionalPropertyTypes-768.md) —
  Shipped; #768 closed 2026-09-13.
- [SPEC-zod-v4-migration](../reports/archived_plans/SPEC-zod-v4-migration.md) —
  Shipped; zod ^4.6.5.
- [SPEC-n3-logging-consolidation](../reports/archived_plans/SPEC-n3-logging-consolidation.md) —
  Shipped #745.
- [SPEC-self-learning-feedback-full](../reports/archived_plans/SPEC-self-learning-feedback-full.md) —
  Shipped v0.19.1.
- [SPEC-improvement-swarm-2026-08-25](../reports/archived_plans/SPEC-improvement-swarm-2026-08-25.md) —
  Shipped v0.19.2.
- [SPEC-pr-triage-and-p1-swarm](../reports/archived_plans/SPEC-pr-triage-and-p1-swarm.md),
  [SPEC-pr-triage-and-improvements-2026-08-29](../reports/archived_plans/SPEC-pr-triage-and-improvements-2026-08-29.md) —
  Shipped v0.19.0.
- [SPEC-f12-asany-residue](../reports/archived_plans/SPEC-f12-asany-residue.md) —
  Shipped; F-12 residue CLOSED 2026-10-06.
- [SPEC-flag-governance-and-hardening-2026-10-05](../reports/archived_plans/SPEC-flag-governance-and-hardening-2026-10-05.md) —
  Shipped 2026-10-05 (NI-1/NI-2/IMP-4/IMP-5/IMP-6).
- [SPEC-rl1-rate-limit-binding](../reports/archived_plans/SPEC-rl1-rate-limit-binding.md) —
  Archived 2026-10-15; gates on ADR-017 phase 2.
- [SPEC-workflow-shadow-763](../reports/archived_plans/SPEC-workflow-shadow-763.md),
  [SPEC-workflow-shadow-wave2-763](../reports/archived_plans/SPEC-workflow-shadow-wave2-763.md),
  [SPEC-workflow-shadow-wave3-763](../reports/archived_plans/SPEC-workflow-shadow-wave3-763.md),
  [SPEC-workflow-cutover-wave4-763](../reports/archived_plans/SPEC-workflow-cutover-wave4-763.md) —
  Archived 2026-10-15.
- [SPEC-test-gaps-t2-t3-t4](../reports/archived_plans/SPEC-test-gaps-t2-t3-t4.md) —
  Archived 2026-10-15.
- [SPEC-ci-unblock-full-hygiene](../reports/archived_plans/SPEC-ci-unblock-full-hygiene.md) —
  Archived 2026-10-15.
- [PEV-d1-boilerplate-dry](../reports/archived_plans/PEV-d1-boilerplate-dry.md),
  [PEV-discovery-circuit-breaker](../reports/archived_plans/PEV-discovery-circuit-breaker.md),
  [PEV-snapshot-optimize](../reports/archived_plans/PEV-snapshot-optimize.md) —
  Shipped v0.19.5.
- [PROGRESS-2026-08-25](../reports/archived_plans/PROGRESS-2026-08-25.md),
  [PROGRESS-2026-08-31](../reports/archived_plans/PROGRESS-2026-08-31.md) —
  Swarm outcome records.

## Process Docs (kept in place)

- [SPEC_TEMPLATE](SPEC_TEMPLATE.md) — Required template for Full Mode.
- [PEV_LOOP](PEV_LOOP.md) — Plan-Execute-Verify spec, referenced by
  `scripts/pev-gates.sh` and the `pev-loop`, `goap-agent`,
  `validation-gates`, and `multi-agent-orchestration` skills.

## Historical Reference (archived 2026-10-15 — pointers, all resolved)

- [GitHub Automation](../reports/archived_plans/github-automation-plan.md) —
  Mostly complete since 2026-06-30; auto-merge live. Archived 2026-10-15.
- [FOLLOWUP: Deployment Fix](../reports/archived_plans/FOLLOWUP-deployment-fix.md) —
  Resolved; staging health-check root cause and options. Archived
  2026-10-15 as resolved.
- [FOLLOWUP: E2E Local Env Setup](../reports/archived_plans/FOLLOWUP-e2e-local-env-setup.md) —
  Closed; auth setup infrastructure shipped. Archived 2026-10-15 as
  resolved.
- [FOLLOWUP: P3 Features](../reports/archived_plans/FOLLOWUP-p3-features.md) —
  Semantic search complete; dashboard deferred to separate project.
  Archived 2026-10-15 as resolved.
- [FOLLOWUP: Issues Not Addressed](../reports/archived_plans/FOLLOWUP-issues-not-addressed.md) —
  Rollback-issue wave root-caused 2026-07-17; zero open issues. Archived
  2026-10-15 as resolved.
- `jules-audit/` (archived 2026-10-15 to
  `reports/archived_plans/jules-audit/`) — Dated Jules audit snapshots.

## Archived 2026-10-15 (Wave 1A)

Moved from `plans/` to `reports/archived_plans/` (filenames identical;
`jules-audit/` moved as a directory):

- `GAP-ANALYSIS-2026-08-15.md` (was Active; all items verified closed
  2026-10-04, see [Gap Analysis 2026-10-04](GAP-ANALYSIS-2026-10-04.md)
  section 1) — now
  [archived](../reports/archived_plans/GAP-ANALYSIS-2026-08-15.md).
- 19 SPECs, 3 PEVs, 2 PROGRESS records, 4 FOLLOWUPs, 1 automation plan,
  and `jules-audit/` — see Completed Specs and Historical Reference
  pointers above.

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
