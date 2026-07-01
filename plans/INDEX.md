# Plans Index

This index tracks active implementation plans in `plans/`. Completed and archived plans have been moved to `reports/archived_plans/`.

## Status Definitions

- `active`: Currently being implemented.
- `planned`: Approved for future implementation.
- `completed`: Moved to `reports/archived_plans/`.
- `archived`: Moved to `reports/archived_plans/`.

## Active Plans

- [GitHub Automation](github-automation-plan.md) — Auto-merge workflow for Dependabot PRs and CI automation. **Verified and mostly complete** as of 2026-06-30; auto-merge workflow is live, remaining polish tracked in follow-up plans below.

## In-Progress PRs (working branch → upstreams when green)

- [GOAP Missing Tasks Swarm v2](GOAP-missing-tasks-swarm.md) — Swarm 1 (JWT/cheerio/budget tests) closed via PR #524; Swarm 2 (test coverage for `worker/lib/metrics/stats.ts` and `worker/lib/d1/client.ts`) in review on branch `feat/goap-missing-tasks-swarm-v2`.

## Follow-Up Plans (Tracked)

- [FOLLOWUP: Deployment Fix](FOLLOWUP-deployment-fix.md) — Deployment pipeline hardening.
- [FOLLOWUP: E2E Local Env Setup](FOLLOWUP-e2e-local-env-setup.md) — E2E test local environment setup.
- [FOLLOWUP: P3 Features](FOLLOWUP-p3-features.md) — P3 feature follow-up.
- [FOLLOWUP: Issues Not Addressed](FOLLOWUP-issues-not-addressed.md) — Historical tracking of issues outside this resolution.

> **GOAP execution completed on 2026-06-30.** All planned phases (Analyze, Decompose, Execute, Synthesize) finished. The GitHub Automation plan reached verified status. See individual plan files for details.
>
> **Swarm 2 update (2026-07-01):** Original 3 swarm tasks re-verified as already complete via PR #524. New test-coverage swarm opened on `feat/goap-missing-tasks-swarm-v2` — see `GOAP-missing-tasks-swarm.md` for the plan and commit list.

## Archived

All completed/archived plans (ADRs, GOAP plans, sprints, swarms, Jules audits) have been moved to `reports/archived_plans/`. See that directory for historical records.

- `jules-audit/` — Jules audit snapshots (pre-check, quality, deps, docs, tests).
