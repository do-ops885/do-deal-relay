# Performance Optimization Playbook

This document provides a guide for contributors looking to optimize the Deal Discovery System. It covers where to find bottlenecks, how to measure performance, and how to verify improvements.

## 🚀 Known Hot Paths

The following areas are the most computationally or I/O intensive parts of the pipeline:

### 1. Discovery Budgeting & Fetching
- **File**: `worker/pipeline/discover.ts`
- **Description**: Managing multi-source discovery within budget constraints.
- **Bottleneck**: Network I/O when fetching from dozens of sources and payload size validation.

### 2. Semantic Deduplication
- **File**: `worker/pipeline/dedupe.ts`
- **Description**: Comparing new deals against existing production deals using string similarity.
- **Bottleneck**: O(N*M) comparisons, where N is new deals and M is existing deals. Optimized via domain-partitioning.

### 3. Validation Gates
- **File**: `worker/pipeline/validate.ts`
- **Description**: Running 9 mandatory validation gates (schema, trust, reward plausibility, etc.).
- **Bottleneck**: Sequential execution of gates for each deal.

### 4. Ranking & Scoring
- **File**: `worker/pipeline/score.ts`
- **Description**: Calculating weighted confidence scores based on 7+ metrics.
- **Bottleneck**: Frequent metadata updates and floating-point math in hot loops.

---

## 📊 How to Read `/metrics`

The `/metrics` endpoint (accessible via `GET /metrics?format=json` or `GET /metrics` for Prometheus format) is your primary tool for performance analysis.

| Metric | Meaning | Healthy Value |
|--------|---------|---------------|
| `stage_latency_ms` | Time spent in discovery, validation, or publish phases. | Discovery < 10s, Validation < 5s |
| `validation_gate_rejection_ratio` | Percentage of deals failing a specific gate. | High rejections in `source_trust` are normal; high rejections in `schema_validation` suggest parser bugs. |
| `deals_pipeline_success_rate` | Percentage of cron runs that complete without errors. | > 95% |
| `deals_active_deals` | Total deals currently in production snapshot. | 100 - 1000 |

### Bad Value Signals
- **p99 Latency > 30s**: Risk of Worker timeout.
- **High `idempotency_check` rejections**: Possible duplicate discovery logic bugs.
- **Success Rate < 80%**: Systemic instability in external dependencies (KV, GitHub, AI Gateway).

---

## 🧪 Funnel Health Check

The discovery funnel tracks how many candidates survive each stage:
`Discovered` ➔ `Normalized` ➔ `Deduped` ➔ `Validated` ➔ `Published`

**Key Conversions:**
- **Discovery Yield**: `Normalized / Discovered`. Low yield means parsers are failing to extract data.
- **Uniqueness Ratio**: `Deduped / Normalized`. Low ratio means we are finding the same deals repeatedly.
- **Quality Yield**: `Validated / Deduped`. Low yield means discovered deals are failing quality gates.

---

## ⏱️ Running Benchmarks

### Local Benchmarks
Before submitting a performance-related PR, run the pipeline benchmark:

```bash
# Run the local pipeline simulator
npm run benchmark
```

Compare the `Phase Timings` output before and after your changes. Look for significant reductions in the specific phase you targeted without regressions in others.

### CI Benchmarks
Performance benchmarks are run automatically every Sunday at 00:00 UTC via GitHub Actions (`.github/workflows/benchmarks.yml`).

- **Baseline (v0.1.4)**: 5,600-5,750 deals/sec
- **Regression Threshold**: 5,000 deals/sec (Failure triggered if throughput falls below this)

---

## 🛠️ Optimization Workflow

1. **Measure Baseline**: Run `scripts/benchmark_pipeline.ts` or check production `/metrics`.
2. **Isolate**: Use `console.time()` or a profiler to find the exact function causing the delay.
3. **Change**: Implement your optimization (e.g., better caching, O(N) instead of O(N^2)).
4. **Benchmark**: Run the local benchmark again to confirm the speedup.
5. **Verify**: Ensure all tests pass (`npm test`) and that quality metrics (like discovery yield) haven't degraded.

---

## ⚠️ Common Pitfalls

- **AI Gate Costs**: AI-based validation gates are 10.1.4x slower than rule-based gates. Use rule-based gates first as "fast paths."
- **KV Read Patterns**: Avoid reading KV keys one-by-one in a loop. Use `Promise.all` or batching logic.
- **6h Cron Overlap**: If a run takes > 5 minutes, it may overlap with locking logic. Keep the end-to-end duration as low as possible.
- **Memory Limits**: Cloudflare Workers have a 128MB limit. Avoid loading thousands of deals into memory at once.

---

## ⚙️ Config Tuning Guide

Adjust these in `wrangler.jsonc` or via environment variables to tune the balance between performance and quality:

| Key | Impact | Trade-off |
|-----|--------|-----------|
| `TRUST_THRESHOLD` | Minimum trust score to process a source. | Higher = Faster, but fewer deals found. |
| `CANDIDATE_BUDGET_GLOBAL` | Max deals to discover per run. | Lower = Faster, reduces KV write costs. |
| `CANDIDATE_BUDGET_PER_SOURCE` | Max deals per individual source. | Prevents a single noisy source from drowning out others. |
| `SIMILARITY_THRESHOLD` | Threshold for deduplication (0.0 to 1.0). | Higher = More strict, but may miss subtle duplicates. |
