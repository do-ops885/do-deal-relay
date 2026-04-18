import { createMetrics, finalizeMetrics, recordPhaseTiming, storeMetrics } from "../worker/lib/metrics/index";
import { PipelineMetrics, Env } from "../worker/types";

async function benchmark() {
  console.log("Starting Pipeline Benchmark...");
  const run_id = `bench-${Date.now()}`;
  const metrics = createMetrics(run_id);

  const phases = ["init", "discover", "normalize", "dedupe", "validate", "score", "stage", "publish", "verify", "finalize"] as const;

  const start = Date.now();
  for (const phase of phases) {
    const phaseStart = Date.now();
    // Simulate work
    await new Promise(r => setTimeout(r, Math.random() * 50));
    recordPhaseTiming(metrics, phase, Date.now() - phaseStart);
  }

  finalizeMetrics(metrics, true, "finalize");
  const duration = Date.now() - start;

  console.log(`Benchmark Complete: ${run_id}`);
  console.log(`Total Duration: ${duration}ms`);
  console.log("Phase Timings:", JSON.stringify(metrics.phase_timings, null, 2));
}

benchmark().catch(console.error);
