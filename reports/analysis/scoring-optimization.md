# Performance Analysis: Scoring Pipeline Optimization

## Findings

### 1. Unused KV Fetch and Data Construction
- **Bottleneck**: The `score` function redundantly fetches the production snapshot and constructs an `allDeals` array.
- **Code**:
  ```typescript
  const prodSnapshot = await getProductionSnapshot(env);
  const allDeals = [...(prodSnapshot?.deals || []), ...deals];
  ```
- **Analysis**: These variables are never referenced after initialization.
- **Impact**:
  - **Network**: One unnecessary KV READ subrequest per execution.
  - **Latency**: Estimated 10-50ms overhead depending on KV region and snapshot size.
  - **Memory**: Redundant allocation of an array containing all production deals.

### 2. O(N²) Duplicate Penalty Calculation
- **Bottleneck**: `calculateDuplicatePenalty` uses `Array.prototype.filter` on `ctx.deduped` for every deal being scored.
- **Code**:
  ```typescript
  const similarInBatch = ctx.deduped.filter(
    (d) =>
      d.id !== deal.id &&
      d.source.domain === deal.source.domain &&
      d.code === deal.code,
  );
  ```
- **Analysis**: If `N` deals are scored and `M` deals are in `ctx.deduped`, the complexity is O(N * M). Given `N \approx M`, this is effectively O(N²).
- **Impact**: For a batch of 1,000 deals, this performs up to 1,000,000 object comparisons.

### 3. Loop Hoisting Opportunities
- **Bottleneck**: `CONFIG.SCORING_WEIGHTS` is accessed inside the main scoring loop.
- **Impact**: Minimal, but redundant property lookups in a hot loop.

## Proposed Optimization

1. **Remove unused KV fetch**: Eliminate `getProductionSnapshot` call.
2. **Frequency Map**: Pre-calculate a frequency map of `domain:code` from `ctx.deduped`.
   - New Complexity: O(M) to build map + O(N) to look up = O(N + M).
3. **Hoisting**: Move configuration access outside the loop.

## Expected Metric Improvement
- **Subrequests**: -1 KV READ per run.
- **Time Complexity**: Improved from O(N²) to O(N).
- **Execution Time**: For 1,000 deals, expected reduction in loop processing time from ~50ms to <1ms.
