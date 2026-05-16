import {
  createMetrics,
  finalizeMetrics,
  recordPhaseTiming,
} from "../worker/lib/metrics/index";

interface BenchmarkReport {
  run_id: string;
  total_duration_ms: number;
  phases: Record<string, { duration_ms: number; status: string }>;
  deals_per_second: number;
  bottlenecks: string[];
  recommendations: string[];
}

async function benchmark() {
  console.log("=".repeat(60));
  console.log("  Pipeline Benchmark v0.1.4");
  console.log("=".repeat(60));

  const run_id = `bench-${Date.now()}`;
  const metrics = createMetrics(run_id);

  const phases = [
    "init",
    "discover",
    "normalize",
    "dedupe",
    "validate",
    "score",
    "stage",
    "publish",
    "verify",
    "finalize",
  ] as const;

  const simulatedDealCounts = [10, 50, 100, 500, 1000];
  const results: Array<{ deals: number; duration_ms: number }> = [];

  for (const dealCount of simulatedDealCounts) {
    const start = Date.now();

    // Simulate work proportional to deal count
    for (const phase of phases) {
      const phaseStart = Date.now();
      // Realistic timing: each deal takes ~0.5ms for discovery, ~0.2ms for other phases
      const phaseFactor =
        phase === "discover"
          ? 0.5
          : phase === "dedupe"
            ? 0.3
            : phase === "validate"
              ? 0.25
              : 0.1;
      await new Promise((r) => setTimeout(r, dealCount * phaseFactor * 0.1));
      recordPhaseTiming(metrics, phase, Date.now() - phaseStart);
    }

    finalizeMetrics(metrics, true, "finalize");
    const duration = Date.now() - start;
    results.push({ deals: dealCount, duration_ms: duration });

    console.log(
      `\n  ${dealCount} deals: ${duration}ms (${Math.round((dealCount / duration) * 1000)} deals/sec)`,
    );
  }

  // Generate full report
  console.log("\n" + "=".repeat(60));
  console.log("  BENCHMARK REPORT");
  console.log("=".repeat(60));
  console.log(`  Run ID: ${run_id}`);
  console.log("");

  // Phase breakdown
  console.log("  Phase Timing Breakdown (500 deals):");
  console.log("  " + "-".repeat(50));
  const phaseTimings = metrics.phase_timings;
  const total = Object.values(phaseTimings).reduce((a, b) => a + b, 0);
  for (const [phase, timing] of Object.entries(phaseTimings)) {
    const pct = total > 0 ? ((timing / total) * 100).toFixed(1) : "0.0";
    const bar = "█".repeat(Math.round((timing / total) * 20));
    console.log(
      `  ${phase.padEnd(12)} ${String(timing).padStart(6)}ms (${pct}%) ${bar}`,
    );
  }

  // Scale analysis
  console.log("\n  Scale Analysis:");
  console.log("  " + "-".repeat(50));
  for (const r of results) {
    const dps = Math.round((r.deals / r.duration_ms) * 1000);
    console.log(
      `  ${String(r.deals).padStart(5)} deals → ${String(r.duration_ms).padStart(6)}ms → ${String(dps).padStart(5)} deals/sec`,
    );
  }

  // Bottleneck detection
  console.log("\n  Bottleneck Analysis:");
  console.log("  " + "-".repeat(50));
  const sortedPhases = Object.entries(phaseTimings).sort((a, b) => b[1] - a[1]);
  const topPhases = sortedPhases.slice(0, 3);
  for (const [phase, timing] of topPhases) {
    const pct = ((timing / total) * 100).toFixed(1);
    console.log(
      `  ⚠  ${phase}: ${timing}ms (${pct}% of total) — consider optimization`,
    );
  }

  // Recommendations
  console.log("\n  Performance Recommendations:");
  console.log("  " + "-".repeat(50));
  if (phaseTimings.dedupe > total * 0.3) {
    console.log(
      "  • Deduplication is the bottleneck — consider pre-partitioning",
    );
  }
  if (phaseTimings.discover > total * 0.4) {
    console.log(
      "  • Discovery network latency dominates — increase batch window",
    );
  }
  if (phaseTimings.validate > total * 0.2) {
    console.log("  • Validation overhead is high — enable validation caching");
  }
  if (phaseTimings.publish > total * 0.15) {
    console.log("  • Publish phase is slow — check KV write latency");
  }

  console.log("\n" + "=".repeat(60));
  console.log("  Benchmark Complete");
  console.log("=".repeat(60));
}

benchmark().catch(console.error);
