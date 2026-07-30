# Plans Index

This index tracks active implementation plans in `plans/`. Completed and archived plans have been moved to `reports/archived_plans/`.

## Status Definitions

- `active`: Currently being implemented.
- `planned`: Approved for future implementation.
- `completed`: Moved to `reports/archived_plans/`.
- `archived`: Moved to `reports/archived_plans/`.

## Active Plans

- [GOAP State](GOAP_STATE.md) — **Comprehensive inventory of ALL missing tasks, implementations, features, and gaps** (65+ items across P0–P3 + deferred ADR-015 proposals). Single source of truth for all planned work. **Refreshed 2026-07-29 (v0.12.0)** — All P0-P3 items resolved or documented. PR #640 merged, PR #639 closed.
- [Progress 2026-07-02](PROGRESS-2026-07-02.md) — Re-verification of the 5 P0 critical bugs from the April audit against current code: all confirmed closed. New focus shifts to P1/P2 items.
- [ADR-015: Harness & Cloudflare 2026 Best Practices](ADR-015-harness-cloudflare-2026-best-practices.md) — Architecture Decision Record mapping 2026 Harness CI/CD and Cloudflare Agentic Cloud patterns to our codebase. Includes migration roadmap for Durable Objects, Durable Execution, Agent Memory, and AI Gateway. **Proposed** as of 2026-07-02.
- [ADR-016: Centralized Security & Routing Middleware Architecture](ADR-016-centralized-middleware-architecture.md) — **New** (2026-07-06). Proposes a unified middleware pipeline (auth tiers, rate limiting, validation, logging) to address the recurring pattern of ad-hoc security in route handlers. Directly unblocks P1 items: D1 auth, API rate limiting, submit auth, and webhook route registration. **Proposed** — implementation depends on this ADR being accepted.
- [GitHub Automation](github-automation-plan.md) — Auto-merge workflow for Dependabot PRs and CI automation. **Verified and mostly complete** as of 2026-06-30; auto-merge workflow is live, remaining polish tracked in follow-up plans below.

## Closed PRs (merged)

- ⬜ ~~GOAP Missing Tasks Swarm v2~~ — Swarm 1 (JWT/cheerio/budget tests) closed via **PR #524**; Swarm 2 (70 new tests for `worker/lib/metrics/stats.ts` + `worker/lib/d1/client.ts`) shipped in **PR #527**. Plan archived as `reports/archived_plans/GOAP-missing-tasks-swarm-2026-07-01.md`. Branch `feat/goap-missing-tasks-swarm-v2` is no longer active.
- ✅ **PR #571** — test: split oversized test files under 500 lines — MERGED `c239211`
- ✅ **PR #570** — perf(pipeline): optimize snapshot staging and hash generation — MERGED `5fb1381`
- ✅ **PR #569** — feat(ux): add copy-to-clipboard functionality — MERGED `779122c`
- ✅ **PR #567** — docs(agent): sync agent contracts — MERGED `096343a`
- ✅ **PR #566** — docs(plans): GOAP_STATE v0.7.0 — MERGED `f884970`
- ✅ **`2f290ca`** — fix(tests): resolve 36 test failures (D1 mock + SSRF) — MERGED to main
- ✅ **PR #640** — perf(pipeline): batch D1 writes, fast pre-filter, and validation gate reorder — MERGED `83bd67e`
- ✅ **PR #638** — ci(fix): pin checkout action to full sha — MERGED
- ✅ **PR #637** — chore: bump postcss from 8.5.16 to 8.5.24 — MERGED
- ✅ **PR #636** — ci(fix): add checkout step to auto-merge workflow — MERGED
- ✅ **PR #635** — chore: bump dependencies to safe patch versions — MERGED
- ✅ **PR #631** — chore: bump typescript from 6.0.3 to 7.0.2 — MERGED

## Follow-Up Plans (Tracked)

- [FOLLOWUP: Deployment Fix](FOLLOWUP-deployment-fix.md) — Deployment pipeline hardening.
- [FOLLOWUP: E2E Local Env Setup](FOLLOWUP-e2e-local-env-setup.md) — E2E test local environment setup.
- [FOLLOWUP: P3 Features](FOLLOWUP-p3-features.md) — P3 feature follow-up.
- [FOLLOWUP: Issues Not Addressed](FOLLOWUP-issues-not-addressed.md) — Historical tracking of issues outside this resolution.

> **GOAP execution completed on 2026-06-30.** All planned phases (Analyze, Decompose, Execute, Synthesize) finished. The GitHub Automation plan reached verified status. See individual plan files for details.
>
> **Swarm v2 closed on 2026-07-01:** Original 3 swarm tasks re-verified as already complete via PR #524. Swarm 2 (test coverage) shipped in PR #527 (CI: 22+/23 PASS including Unit Tests, Build, E2E, Codacy, Security, Quality Gate). Plan archived to `reports/archived_plans/`.
>
> **Swarm V3 closed on 2026-07-06:** All 8 deferred items from GOAP_STATE.md resolved. P3-12/P3-13 closed as NO-FIX. P3-17 OTEL config implemented. ⬜-5 Continuous Verification gate (10th gate) implemented. ⬜-6 DORA metrics endpoint implemented. ⬜-1/⬜-2 DO/DE research complete with migration plans. Commits: `feat(dora)` + `docs(observability)` pushed to `develop`.

## Completed Specs

- [Codacy Fix + GOAP State Update](SPEC-codacy-fixes-and-goap-state-update.md) — PEV spec for applying SC2034 fixes and updating plans to current state. **Completed** — SC2034 fixes applied, GOAP_STATE updated to v0.12.0.

## Archived

All completed/archived plans (ADRs, GOAP plans, sprints, swarms, Jules audits) have been moved to `reports/archived_plans/`. See that directory for historical records.

- `jules-audit/` — Jules audit snapshots (pre-check, quality, deps, docs, tests).
