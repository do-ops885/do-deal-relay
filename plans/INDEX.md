# Plans Index

This index tracks all implementation plans, roadmaps, and design documents in the `plans/` directory.

## Status Definitions

- `active`: Currently being implemented.
- `planned`: Approved for future implementation.
- `completed`: Implementation finished (move to `reports/` for archiving).
- `archived`: Stale or deprecated plans (move to `reports/`).

## Active Plans

- [Sprint v0.1.5](sprint-v0.1.5.md) — CI/CD stability fixes (quality gate, TruffleHog, CodeQL).

## Planned Plans

- [GOAP Improvements (2026-05-11)](GOAP_IMPROVEMENTS_2026-05-11.md) — CI/CD hardening, governance alignment, explainability API.
- [GitHub Automation](github-automation-plan.md) — Enhancing PR and issue automation.
- [Manual Entry UX Enhancements (ADR-002)](manual-entry-ux-implementation.md) — Browser extension UX improvements.
  - [ADR-002: Manual Entry UX Enhancements](ADR-002-manual-entry-ux-enhancements.md) — Decision record.

## Completed Plans

- [Comparison Caching](comparison-caching.md) — ADR accepted and implemented (PR #224).
- [Dependabot npm Integration](dependabot-npm-integration.md) — npm ecosystem configured in dependabot.yml.
- [ADR-003: Patch Release v0.1.4](ADR-003-patch-release-v0.1.4.md) — All PR feedback addressed, v0.1.4 shipped.
- [Patch Release v0.1.4 Execution](patch-release-v0.1.4-execution.md) — 8 phases completed, tag v0.1.4 pushed.
- [Swarm PR Register](swarm-pr-register.md) — All 8 PRs stabilized and merged.
- [Swarm Execution Plan](swarm-execution-plan.md) — PR stabilization swarm completed.
- [Swarm Status Report](swarm-status-report.md) — Full PR stabilization status report with compatibility matrix.
- [PR #225 Stabilization](pr-225-stabilization.md) — Dependabot validation PR stabilized and merged.

## Archived Plans

- [Multi-Agent Workflow](multi-agent-workflow.md) — Historical execution report (2026-04): codebase audit, git workflow, pre-existing CI issues.

## Archived Directories

- `jules-audit/` — Jules audit snapshots (pre-check, quality, deps, docs, tests).

## Completed & Archived (Moved to `reports/`)

- `EXECUTION_PLAN.md` → `reports/EXECUTION_PLAN_2026.md`
- `PROGRESS.md` → `reports/PROGRESS_ARCHIVE_2026-05.md`
- `production-readiness.md` → `reports/production-readiness.md`
- `2026-ci-cd-config-plan.md` → `reports/2026-ci-cd-config-plan.md`
- `PRE_EXISTING_CI_ISSUES.md` → `reports/PRE_EXISTING_CI_ISSUES.md`
