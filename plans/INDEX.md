# Plans Index

This index tracks all implementation plans, roadmaps, and design documents in the `plans/` directory.

## Status Definitions

- `active`: Currently being implemented.
- `planned`: Approved for future implementation.
- `completed`: Implementation finished (move to `reports/` for archiving).
- `archived`: Stale or deprecated plans (move to `reports/`).

## Active Plans

- [GitHub Automation](github-automation-plan.md) — Auto-merge workflow for Dependabot PRs created (`.github/workflows/auto-merge.yml`). CI fixes (TruffleHog pin, codecov v4, npm install) already applied in prior PRs.

## Completed Plans (Recent)

- [ADR-013: Missing Implementations Remediation](ADR-013-missing-implementations-remediation.md) — All 15 M items addressed. M-1 through M-4, M-7, M-9, M-13 verified already implemented. M-5, M-8, M-11 implemented in this session. M-14 (auth routes) wired. PRs #485, #487.
- [GOAP: Missing Implementations & CI Failures (2026-06-11)](GOAP-missing-implementation-2026-06-11.md) — 4-phase remediation complete. Embedding cron (M-5), Discord types (M-8), cache prefix (M-11), auth routes (M-14). CI-2 audit level updated.
- [Sprint v0.1.6](sprint-v0.1.6.md) — All items completed, released.
- [Sprint v0.1.5](sprint-v0.1.5.md) — CI/CD stability fixes completed, released.
- [ADR-005: Scheduled Benchmarks](ADR-005-scheduled-benchmarks.md) — benchmarks.yml workflow exists, passing.

## Completed Plans (Recent)

- [Fix CI LOC Violations (2026-06-09)](GOAP-fix-ci-loc-violations-2026-06-09.md) — PR [#445](https://github.com/do-ops885/do-deal-relay/pull/445). Quality gate LOC enforcement fixed; 9 source files split under 600 lines; exclusion patterns corrected. Core CI passes (Quality Gate, Tests, Build, Type Check). Codacy/CodeQL failures pre-existing.
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

- [FOLLOWUP: Vectorize Binding Config](FOLLOWUP-vectorize-binding-config.md) — Add `vectorize` binding to `wrangler.jsonc` for semantic search runtime. **RESOLVED** in this PR.
- [FOLLOWUP: E2E Local Env Setup](FOLLOWUP-e2e-local-env-setup.md) — **PARTIALLY RESOLVED** in PR #488: .dev.vars docs added to CONTRIBUTING.md/QUICKSTART.md, pre-flight env check in playwright.config.ts. Remaining: auth token setup in E2E tests.
- [FOLLOWUP: Pre-Existing Issues Scan](FOLLOWUP-pre-existing-issues-scan.md) — **RESOLVED**. Dead modules already deleted, jsonResponse callers already using 4-arg signature.
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
- [ADR-004: Observability Enablement](ADR-004-observability-enablement.md) — Traces enabled, WAF/edge security documented in DEPLOYMENT.md §12.
- [GOAP Improvements (2026-05-11)](GOAP_IMPROVEMENTS_2026-05-11.md) — Gate count verified correct (9 validation gates), plans index maintained.
- [Manual Entry UX Enhancements (ADR-002)](manual-entry-ux-implementation.md) — Real-time input cleaning implemented (uppercase, strip non-alphanumeric, 20-char limit).
  - [ADR-002: Manual Entry UX Enhancements](ADR-002-manual-entry-ux-enhancements.md) — Decision record.

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
