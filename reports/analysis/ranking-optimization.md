# Performance Analysis: Deal Ranking Optimization

## Findings

### 1. Redundant Component Calculations in `rankDeals`
- **Bottleneck**: The `rankDeals` function calculates the total score and then immediately re-calculates all individual components for the breakdown object.
- **Code**:
  ```typescript
  const scores = sorted.map((deal) => ({
    dealId: deal.id,
    score: calculateDealScore(deal),
    breakdown: {
      confidence: deal.metadata.confidence_score * 100,
      trust: deal.source.trust_score * 100,
      recency: calculateRecencyScore(deal.source.discovered_at),
      value: calculateValueScore(deal.reward),
      expiry: calculateExpiryScore(deal.expiry.date),
    },
  }));
  ```
- **Analysis**: Each component (recency, value, expiry) is computed twice per deal: once inside `calculateDealScore` and once for the breakdown.
- **Impact**: O(N) redundant calculations. For 100 deals, this is 300 extra function calls (many involving Date parsing and string manipulation).

### 2. Inefficient Weighted Sum Pattern
- **Bottleneck**: `calculateDealScore` uses `Object.entries().reduce()` to sum weighted scores.
- **Code**:
  ```typescript
  return Object.entries(scores).reduce(
    (sum, [key, value]) => sum + value * weights[key as keyof typeof weights],
    0,
  );
  ```
- **Analysis**: This pattern creates intermediate arrays (`Object.entries`) and objects for every call.
- **Impact**: Increased garbage collection pressure and CPU overhead in a hot path.

## Proposed Optimization

1. **Unified Scoring**: Introduce `calculateDetailedScore` to return both total and breakdown in one pass.
2. **Direct Summation**: Use direct property addition in scoring functions to eliminate array/object allocation.
3. **Data Re-use**: Update `rankDeals` to use the pre-calculated results from `calculateDetailedScore`.

## Expected Metric Improvement
- **Redundancy**: 50% reduction in scoring-related computations in `rankDeals`.
- **Allocations**: Near-zero intermediate allocations in the scoring hot path.
- **Latency**: Estimated 10-20% reduction in processing time for large deal batches.
