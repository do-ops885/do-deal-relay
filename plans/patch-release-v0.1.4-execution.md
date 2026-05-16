# Execution Plan: Patch Release v0.1.4

**Date**: 2026-05-16  
**Strategy**: Hybrid (Parallel + Sequential phases with quality gates)

## Phase 1: Fix Open PRs (P0)
- **1a**: Fix PR #220 — cleanup.yml cache logic inversion + rollback.yml security
- **1b**: Fix PR #223 — verify v7.0.1 exists, fix workflow, push to PR branch
- **Gate**: Both PRs mergeable, CI passes on PR branches

## Phase 2: Remove `--legacy-peer-deps` (Issue #193, P0)
- **2a**: Identify peer dep conflicts via `npm install` (w/o flag)
- **2b**: Resolve via overrides in package.json
- **2c**: Remove `--legacy-peer-deps` from all 17+ workflow files + quality_gate.sh
- **Gate**: `npm ci` works without flag

## Phase 3: perf(dedupe) strengthen pre-partitioning (Issue #187, P1) ✅
- **3a**: Added `buildPartitionKey()` combining domain + reward type + value tier
- **3b**: Added `precomputeUrlKey()` to cache URL parsing and avoid repeated `new URL()` calls
- **3c**: Partitioned semantic dedup into smaller buckets before O(n²) comparisons
- **3d**: Applied same partitioning to existing-production pass for consistency
- **3e**: Removed unused imports

## Phase 4: perf(scoring) reduce metadata churn (Issue #186, P1) ✅
- **4a**: Switched from index-based loops to faster for-of iteration
- **4b**: Changed from dynamic array push to pre-allocated array with `new Array(n)`
- **4c**: Mutates metadata in-place instead of spreading entire object per deal
- **Gate**: TypeScript compiles clean, all 11 dedupe/score/budget tests pass

## Phase 5: Adaptive per-source budgets (Issue #190, P2) ✅
- **5a**: Implemented `calculateAdaptiveBudget()` with validation success rate bonus
- **5b**: Trust score bonus (≤70% = base, >70% = base + highTrustBonus)
- **5c**: Validation success rate: ≥80% → +50%, ≥50% → +25%, <50% → −25%
- **5d**: Discovery maturity: 10+ runs → +20%, 5+ runs → +10%
- **5e**: Updated discover() to log adaptive budget details per source

## Phase 6: Benchmark reporting (Issue #188, P2) ✅
- **6a**: Multi-deal-count simulation (10/50/100/500/1000 deals)
- **6b**: Phase timing breakdown with ASCII bar charts (% of total)
- **6c**: Scale analysis with deals/sec per data size
- **6d**: Bottleneck detection (top 3 slowest phases)
- **6e**: Performance recommendations based on timing thresholds
- **6f**: Cleaned up unused imports

## Phase 7: Version bump & final validation (P0) ✅
- **7a**: Bumped version to 0.1.4 in VERSION and worker/version.ts
- **7b**: Removed `--legacy-peer-deps` from all 11 workflow files and 2 doc files
- **7c**: TypeScript compiles clean ✅ (0 errors)
- **7d**: All unit tests pass ✅ (11/11 dedupe+score+budget)
- **7e**: Code review completed ✅ (minor concerns noted)
