# Plans Index

This index tracks active implementation plans in `plans/`. Completed and archived plans have been moved to `reports/archived_plans/`.

## Status Definitions

- `active`: Currently being implemented.
- `planned`: Approved for future implementation.
- `completed`: Moved to `reports/archived_plans/`.
- `archived`: Moved to `reports/archived_plans/`.

## Active Plans

- [GOAP State](GOAP_STATE.md) — **Comprehensive inventory of ALL missing tasks, implementations, features, and gaps** (65+ items across P0–P3 + deferred ADR-015 proposals). Single source of truth for all planned work. **Refreshed 2026-07-06** — cross-referenced from codebase audit (50 items), swarm analysis (31 items), feature gap analysis, PROGRESS report, and all follow-up plans. Replaces the previous PR-management-only content with a full prioritized inventory.
- [Progress 2026-07-02](PROGRESS-2026-07-02.md) — Re-verification of the 5 P0 critical bugs from the April audit against current code: all confirmed closed. New focus shifts to P1/P2 items.
- [ADR-015: Harness & Cloudflare 2026 Best Practices](ADR-015-harness-cloudflare-2026-best-practices.md) — Architecture Decision Record mapping 2026 Harness CI/CD and Cloudflare Agentic Cloud patterns to our codebase. Includes migration roadmap for Durable Objects, Durable Execution, Agent Memory, and AI Gateway. **Proposed** as of 2026-07-02.
- [ADR-016: Centralized Security & Routing Middleware Architecture](ADR-016-centralized-middleware-architecture.md) — **New** (2026-07-06). Proposes a unified middleware pipeline (auth tiers, rate limiting, validation, logging) to address the recurring pattern of ad-hoc security in route handlers. Directly unblocks P1 items: D1 auth, API rate limiting, submit auth, and webhook route registration. **Proposed** — implementation depends on this ADR being accepted.
- [GitHub Automation](github-automation-plan.md) — Auto-merge workflow for Dependabot PRs and CI automation. **Verified and mostly complete** as of 2026-06-30; auto-merge workflow is live, remaining polish tracked in follow-up plans below.

## Closed PRs (merged)

- ~~GOAP Missing Tasks Swarm v2~~ — Swarm 1 (JWT/cheerio/budget tests) closed via **PR #524**; Swarm 2 (70 new tests for `worker/lib/metrics/stats.ts` + `worker/lib/d1/client.ts`) shipped in **PR #527**. Plan archived as `reports/archived_plans/GOAP-missing-tasks-swarm-2026-07-01.md`. Branch `feat/goap-missing-tasks-swarm-v2` is no longer active.

## Follow-Up Plans (Tracked)

- [FOLLOWUP: Deployment Fix](FOLLOWUP-deployment-fix.md) — Deployment pipeline hardening.
- [FOLLOWUP: E2E Local Env Setup](FOLLOWUP-e2e-local-env-setup.md) — E2E test local environment setup.
- [FOLLOWUP: P3 Features](FOLLOWUP-p3-features.md) — P3 feature follow-up.
- [FOLLOWUP: Issues Not Addressed](FOLLOWUP-issues-not-addressed.md) — Historical tracking of issues outside this resolution.

> **GOAP execution completed on 2026-06-30.** All planned phases (Analyze, Decompose, Execute, Synthesize) finished. The GitHub Automation plan reached verified status. See individual plan files for details.
>
> **Swarm v2 closed on 2026-07-01:** Original 3 swarm tasks re-verified as already complete via PR #524. Swarm 2 (test coverage) shipped in PR #527 (CI: 22+/23 PASS including Unit Tests, Build, E2E, Codacy, Security, Quality Gate). Plan archived to `reports/archived_plans/`.

## Archived

All completed/archived plans (ADRs, GOAP plans, sprints, swarms, Jules audits) have been moved to `reports/archived_plans/`. See that directory for historical records.

- `jules-audit/` — Jules audit snapshots (pre-check, quality, deps, docs, tests).
