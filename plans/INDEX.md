# Plans Index

This index tracks active implementation plans in `plans/`. Completed and archived plans have been moved to `reports/archived_plans/`.

## Status Definitions

- `active`: Currently being implemented.
- `planned`: Approved for future implementation.
- `completed`: Moved to `reports/archived_plans/`.
- `archived`: Moved to `reports/archived_plans/`.

## Active Plans

- [GOAP State](GOAP_STATE.md) — **Comprehensive inventory of ALL missing tasks, implementations, features, and gaps** (61 items across P0-P3). Single source of truth for all planned work. Generated 2026-07-02 from codebase audit, swarm analysis, and 2026 web research.
- [Progress 2026-07-02](PROGRESS-2026-07-02.md) — Re-verification of the 5 P0 critical bugs from the April audit against current code: all confirmed closed. New focus shifts to P1/P2 items.
- [ADR-015: Harness & Cloudflare 2026 Best Practices](ADR-015-harness-cloudflare-2026-best-practices.md) — Architecture Decision Record mapping 2026 Harness CI/CD and Cloudflare Agentic Cloud patterns to our codebase. Includes migration roadmap for Durable Objects, Durable Execution, Agent Memory, and AI Gateway. **Proposed** as of 2026-07-02.
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
