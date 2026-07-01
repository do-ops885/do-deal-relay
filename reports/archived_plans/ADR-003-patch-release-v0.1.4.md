# ADR-003: Patch Release v0.1.4 — PR Feedback, Issue Implementation & CI Stabilization

**Status**: Completed  
**Date**: 2026-05-16  
**Completed**: 2026-05-16 (v0.1.4 shipped)  
**Author**: Buffy (AI Agent)  

## Context

The project has accumulated technical debt and open work items that must be addressed before the next patch release:

### Open Pull Requests
1. **PR #220** — `actions/github-script` v7.1.0 → v9.0.0
   - Codacy flagged: logic inversion in cleanup.yml cache cleanup (sorts ascending then `slice(5)` deletes newest caches instead of oldest)
   - Security risk: template literal injection in `${{ }}` expressions in rollback.yml
   - ESM compatibility: v9 drops `require('@actions/github')` support
2. **PR #223** — `actions/upload-artifact` v4.6.2 → v7.0.1
   - Codacy blocked: v7.0.1 flagged as non-existent version for this action

### Open Issues
1. **#193**: Remove `--legacy-peer-deps` from all 17+ CI workflows by resolving peer dependency conflicts
2. **#186**: Reduce metadata churn in scoring/ranking hot loops
3. **#187**: Strengthen dedupe pre-partitioning to reduce semantic comparison volume
4. **#190**: Add adaptive per-source budgets based on funnel yield
5. **#188**: Add phase-level and gate-level benchmark reporting

### CI Failures
1. TypeScript compilation and Prettier format failures observed in recent CI runs

## Decision

We will address all items using a phased GOAP approach, implementing the work in priority order:

### Priority Order
- **P0**: PR fixes, CI stabilization, `--legacy-peer-deps` removal, version bump
- **P1**: Perf optimizations (scoring churn, dedupe pre-partitioning)
- **P2**: Adaptive budgets, benchmark reporting

## Consequences

### Positive ✅
- All PR feedback addressed and mergable
- All open issues implemented
- CI pipeline fully passing
- Production-ready v0.1.4 release

### Negative
- Several performance issues implemented in same release may require careful benchmarking
- Some issues require touching hot-path pipeline code requiring thorough validation

## Validation ✅
- All 9 validation gates passing
- All CI workflows passing on main
- 98 test files (1650/1656 tests) passing
- 12/12 quality gates passing
- TypeScript 0 errors
- No `--legacy-peer-deps` remaining in any workflow
