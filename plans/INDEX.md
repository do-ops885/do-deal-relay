# Plans Index

This index tracks all implementation plans, roadmaps, and design documents in the `plans/` directory.

## Status Definitions

- `active`: Currently being implemented.
- `planned`: Approved for future implementation.
- `completed`: Implementation finished (move to `reports/` for archiving).
- `archived`: Stale or deprecated plans (move to `reports/`).

## Active Plans

- [Sprint v0.1.5](sprint-v0.1.5.md) — CI/CD stability fixes (quality gate, TruffleHog, CodeQL).
- [ADR-004: Observability Enablement](ADR-004-observability-enablement.md) — Enable traces, document WAF/edge security.
- [ADR-005: Scheduled Performance Benchmarks](ADR-005-scheduled-benchmarks.md) — Performance regression detection in CI.

## Planned Plans

- [GOAP Improvements (2026-05-11)](GOAP_IMPROVEMENTS_2026-05-11.md) — CI/CD hardening, governance alignment, explainability API.
- [GitHub Automation](github-automation-plan.md) — Enhancing PR and issue automation.
- [Manual Entry UX Enhancements (ADR-002)](manual-entry-ux-implementation.md) — Browser extension UX improvements.
  - [ADR-002: Manual Entry UX Enhancements](ADR-002-manual-entry-ux-enhancements.md) — Decision record.

## Completed Plans (Recent)

- [GOAP Master Resolution (2026-06-04)](GOAP-master-resolution-2026-06-04.md) — **All non-blocked open issues resolved** via 3-agent swarm (10 issues: 8 closed, 1 duplicate, 1 blocked-keep-open).
- [ADR-012: Master Implementation Strategy](ADR-012-master-implementation-strategy.md) — Strategy for the 47-issue backlog (PR #411).
- [GOAP Web UI Dashboard Implementation](GOAP-web-ui-dashboard-implementation.md) — Dashboard epic (#298-#302) closed.
- [GOAP Deployment Readiness Master](GOAP-deployment-readiness-master.md) — Deployment epic (#279) closed.
- [GOAP Monitoring & Observability](GOAP-monitoring-observability-implementation.md) — Monitoring (#277) closed.
- [GOAP Real Web Research](GOAP-real-web-research-implementation.md) — Research enhancements (#285-#288) closed.
- [GOAP MCP Pagination](GOAP-mcp-pagination-implementation.md) — MCP epic (#293) closed.
- [GOAP Semantic Search](GOAP-semantic-search-implementation.md) — Search epic (#297) closed; follow-up tracked separately.
- [GOAP User Management](GOAP-user-management-implementation.md) — Auth (#280-#284) closed.
- [GOAP Implementation (2026-06-03)](GOAP-implementation-2026-06-03.md) — Pre-PR-411 execution plan.
- [GOAP Execution Master (2026-06-03)](GOAP-execution-master-2026-06-03.md) — 47-issue execution plan.

## Follow-Up Plans (Tracked)

- [FOLLOWUP: Vectorize Binding Config](FOLLOWUP-vectorize-binding-config.md) — Add `vectorize` binding to `wrangler.jsonc` for semantic search runtime.
- [FOLLOWUP: E2E Local Env Setup](FOLLOWUP-e2e-local-env-setup.md) — E2E test local environment setup.
- [FOLLOWUP: Pre-Existing Issues Scan](FOLLOWUP-pre-existing-issues-scan.md) — Pre-existing warnings/issues in repository.
- [FOLLOWUP: Deployment Fix](FOLLOWUP-deployment-fix.md) — Deployment pipeline hardening.
- [FOLLOWUP: P3 Features](FOLLOWUP-p3-features.md) — P3 feature follow-up.
- [FOLLOWUP: Issues Not Addressed](FOLLOWUP-issues-not-addressed.md) — Historical tracking of issues outside this resolution.

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

## Issue Status Summary (2026-06-04)

| Status | Count | Notes |
|--------|-------|-------|
| Closed by GOAP master resolution | 8 | #279, #293, #297, #298, #299, #300, #301, #302, #410, #413, #414 (rollback) |
| Blocked (manual setup) | 1 | #242 — Cloudflare API secrets (ops task) |
| Total resolved this run | 11 | |
