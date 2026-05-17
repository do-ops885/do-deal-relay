# Sprint Plan: v0.1.6 — Performance & CI Enhancements

**Date**: 2026-05-17
**Status**: Planned
**Strategy**: GOAP with parallel swarm coordination

## Current State (v0.1.5 Release)

- **Version**: 0.1.5 deployed to production
- **All E2E passing**: 26/26 Playwright tests ✅
- **Auth KV fix**: `--remote` flag identified as required for production KV seeding
- **CI KV seeding**: Added step to deploy-production.yml for E2E test API keys
- **Benchmark**: 5,618 deals/sec at 1,000 deals (threshold: 5,000 ✅)
- **TypeScript**: 0 errors
- **Quality gate**: All 13 gates passing

## Benchmark Results — v0.1.5

**Run ID**: `bench-1779022664979`
**Throughput**: 5,618 deals/sec at 1,000 deals (above 5,000 threshold)

### Scale Analysis

| Deals | Duration | Deals/sec |
|-------|----------|-----------|
| 10    | 13ms     | 769       |
| 50    | 12ms     | 4,167     |
| 100   | 21ms     | 4,762     |
| 500   | 89ms     | 5,618     |
| 1000  | 178ms    | 5,618     |

### Phase Timing Breakdown (1,000 deals)

| Phase      | Duration | % of Total |
|------------|----------|-----------|
| discover   | 50ms     | 28.1%     |
| dedupe     | 30ms     | 16.9%     |
| validate   | 25ms     | 14.0%     |
| normalize  | 11ms     | 6.2%      |
| publish    | 11ms     | 6.2%      |
| init       | 10ms     | 5.6%      |
| score      | 10ms     | 5.6%      |
| stage      | 10ms     | 5.6%      |
| verify     | 10ms     | 5.6%      |
| finalize   | 11ms     | 6.2%      |

### Bottlenecks Identified

1. **discover** (28.1%) — Phase with highest latency
2. **dedupe** (16.9%) — Second highest
3. **validate** (14.0%) — Third highest

## Sprint Goals

### P0: Performance Optimization (Benchmark-driven)

1. **Optimize discover phase** (28.1% of total time)
   - Profile discovery source requests — identify slow sources
   - Implement parallel source fetching where safe
   - Add timeout limits per source to prevent stragglers
   - Gate: discover phase ≤ 20ms (60% reduction target)

2. **Optimize dedupe phase** (16.9% of total time)
   - Review dedupe algorithm complexity
   - Consider pre-computed hash indexes for faster matching
   - Gate: dedupe phase ≤ 15ms (50% reduction target)

3. **Optimize validate phase** (14.0% of total time)
   - Audit validation gate performance (9 gates)
   - Identify slowest validation gates
   - Gate: validate phase ≤ 12ms (50% reduction target)

### P1: CI/CD Reliability

4. **CI KV seeding** ✅ (implemented in v0.1.5 deploy-production.yml)
   - E2E test API keys auto-seeded on every production deploy
   - Prevents auth test failures on fresh deployments

5. **Benchmark CI integration**
   - Add benchmark step to release workflow
   - Auto-fail if throughput drops below 5,000 deals/sec
   - Compare against previous run via artifact

### P2: Developer Experience

6. **Local dev KV seeding script**
   - Create `scripts/seed-local-kv.sh` that runs all KV seeding at once
   - Include E2E test keys, initial data, and configuration
   - Document in QUICKSTART.md

7. **Update setup-auth.sh** for remote seeding
   - Add `--remote` flag variant alongside `--local` for production seeding

### P3: Monitoring & Observability

8. **Benchmark trend tracking**
   - Store benchmark reports in `reports/` with version naming
   - Track deals/sec trend across versions
   - Add performance regression alerting

## Execution Strategy

### Phase 1: Performance Analysis (Parallel)
```
Agent 1: Profile discover phase — instrument source fetch timings
Agent 2: Review dedupe algorithm — complexity analysis
Agent 3: Audit validation gates — per-gate timing instrumentation
```

### Phase 2: Optimization (Sequential)
```
Agent 1 → 2 → 3: Apply optimizations in priority order
Gate: Benchmark shows ≥20% improvement on bottlenecks
```

### Phase 3: CI & DX (Parallel)
```
Agent A: Create seed-local-kv.sh + update setup-auth.sh
Agent B: Add benchmark to release workflow
Agent C: Set up trend tracking in reports/
```

## Quality Gates

- [ ] Benchmark throughput ≥ 5,000 deals/sec (currently 5,618)
- [ ] Discover phase ≤ 20ms (currently 50ms)
- [ ] Dedupe phase ≤ 15ms (currently 30ms)
- [ ] Validate phase ≤ 12ms (currently 25ms)
- [ ] No test regressions
- [ ] TypeScript compiles clean (0 errors)
- [ ] All 13 quality gates passing
- [ ] E2E tests 26/26 passing

## Risks

| Risk | Mitigation |
|------|------------|
| Discover optimization may change behavior | Parallel fetching with configurable concurrency limit |
| Dedupe hash indexes increase memory | Use TTL-based cache, not persistent storage |
| Validation gate changes could break pipelines | Add per-gate timing metrics before optimizing |
| CI benchmark step adds deploy time | Run as separate workflow, not blocking deploy |
