# ADR-005: Scheduled Performance Benchmarks

## Context
As the Deal Discovery System (do-deal-relay) matures, maintaining high throughput is critical for cost-efficiency and responsiveness. We need to detect performance regressions early in the development cycle. A benchmark script `scripts/benchmark_pipeline.ts` exists but is currently only run manually.

## Decision
We will implement a scheduled performance benchmark suite in GitHub Actions.

1. **Automation**: A new workflow `.github/workflows/benchmarks.yml` will run weekly (Sunday at 00:00 UTC).
2. **Regression Detection**: The benchmark script will be updated to support a throughput threshold. If the average throughput for the largest deal batch (1000 deals) falls below 5,000 deals/sec (~10% regression from the 5,600 baseline), the workflow will fail.
3. **Observability**: Benchmark reports will be saved as JSON artifacts and a Markdown summary will be added to the GitHub Action job summary.
4. **Baseline Documentation**: The baseline of 5,600-5,750 deals/sec (v0.1.4) will be documented in `docs/PERFORMANCE.md`.

## Consequences
- **Pros**: Automatic detection of performance regressions; historical performance data available via artifacts.
- **Cons**: Weekly CI usage (minimal for this simulation-based benchmark).
- **Risk**: Simulation-based benchmarks might not capture real-world I/O bottlenecks if the simulation factors are not updated as the worker evolves.

## Thresholds
- **Baseline**: 5,600 deals/sec
- **Warning Threshold**: 5,300 deals/sec
- **Failure Threshold**: 5,000 deals/sec
