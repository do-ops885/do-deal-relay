# ADR: Performance Optimization Implementation

**Date**: 2026-06-02
**Status**: Draft

## Context

The repository has 9 performance optimization issues filed. This document outlines the implementation plan using GOAP methodology.

## Implementation Strategy

### Dependency Graph

```
Issue 9 (benchmark obs) ──→ all other issues (needed for measurement)
       │
       ├── Issue 1 (candidate budgets) ─ simple config
       ├── Issue 8 (trust threshold) ─ simple config  
       ├── Issue 3 (gate reordering) ─ moderate
       ├── Issue 6 (KV batching) ─ moderate
       ├── Issue 4 (dedupe partitioning) ─ moderate+
       ├── Issue 5 (normalized cache) ─ moderate+
       ├── Issue 2 (adaptive budgets) ─ complex
       └── Issue 7 (scoring churn) ─ moderate
```

### Execution Phases

#### Phase 1: Foundation (Issues 9, 1, 8)
- **9**: Add phase-level and gate-level benchmark reporting
- **1**: Reduce default candidate budgets (config change)
- **8**: Raise trust threshold experiment (config change)

#### Phase 2: Validation Fast Paths (Issues 3, 6)
- **3**: Reorder validation gates (cheap first)
- **6**: Serial KV → batched reads/writes

#### Phase 3: Dedupe & Scoring (Issues 4, 5, 7)
- **4**: Strengthen pre-partitioning in dedupe
- **5**: Shared normalized deal representation
- **7**: Reduce scoring metadata churn

#### Phase 4: Adaptive (Issue 2)
- **2**: Adaptive per-source budgets

## Quality Gates

1. TypeScript compilation (npm run typecheck)
2. Unit tests (npm test)
3. `scripts/quality_gate.sh`
4. Benchmark pipeline runs without errors
