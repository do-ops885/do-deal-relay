# Sprint Plan: v0.1.5

**Date**: 2026-05-16
**Status**: Planning
**Strategy**: GOAP with parallel swarm coordination

## Analysis

### Current State
- v0.1.4 released successfully with all open PRs merged and all open issues closed
- CI workflows passing on main
- Release workflow failed initially due to package.json version mismatch (fixed)
- 1 failed workflow needs investigation (Release on v0.1.4 tag, now fixed)

### Historical Blockers (from previous sprints)
1. **Quality gate fails in CI but works locally** — `quality_gate.sh` passes locally but errors in CI environment
2. **TruffleHog BASE/HEAD same-commit error** — workflow fails when comparing same commit
3. **CodeQL not enabled** — requires enabling in GitHub repo settings

## Sprint Goals

### P0: CI/CD Stability
1. **Fix CI quality gate** — Debug why `quality_gate.sh` fails in CI vs local
2. **Fix TruffleHog workflow** — Add conditional logic to skip when BASE==HEAD
3. **Enable CodeQL** — Enable in GitHub repo settings, verify scanning runs

### P1: Developer Experience
4. **Run and validate benchmark script** — Execute `scripts/benchmark_pipeline.ts` to confirm perf improvements from v0.1.4
5. **Add CHANGELOG.md** — Auto-generated from conventional commits
6. **Review and update AGENTS.md** — Clean up stale references

### P2: Feature Work
7. **Browser tests** — Complete pending browser-agent work from coordination state
8. **Evaluate next enhancement priorities** — Based on production data

## Execution Strategy

### Phase 1: CI Fixes (P0, Parallel Swarm)
- Agent 1: Debug and fix quality gate CI behavior
- Agent 2: Fix TruffleHog workflow conditional
- Agent 3: Enable CodeQL (requires user action for repo settings)
- **Gate**: All CI workflows pass on PR branch

### Phase 2: Validation (P1, Sequential)
- Agent 1: Run benchmark script, record results
- Agent 2: Generate CHANGELOG.md from git log
- Agent 3: Review AGENTS.md for stale references
- **Gate**: No regressions in test suite

### Phase 3: Feature Planning (P2, Research)
- Review production metrics
- Identify next high-impact improvements
- **Gate**: Stakeholder approval on priorities

## Quality Gates

- [ ] All CI workflows pass
- [ ] No test regressions
- [ ] TypeScript compiles clean
- [ ] Quality gate passes locally and in CI
- [ ] Benchmark results recorded

## Risks

| Risk | Mitigation |
|------|------------|
| CI quality gate has environment-specific behavior | Reproduce CI environment locally with Docker/act |
| TruffleHog requires repo admin for config | Document required changes, escalate if needed |
| CodeQL requires GitHub settings change | Provide clear step-by-step instructions |
