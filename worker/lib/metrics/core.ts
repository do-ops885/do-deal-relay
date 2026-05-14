import type { PipelinePhase, PipelineMetrics, Env } from "../../pipeline/types"
import { fetchInBatches } from "../utils";

export function createMetrics(run_id: string): PipelineMetrics {
  return {
    run_id,
    start_time: Date.now(),
    phase_timings: {
      init: 0,
      discover: 0,
      normalize: 0,
      dedupe: 0,
      validate: 0,
      score: 0,
      stage: 0,
      publish: 0,
      verify: 0,
      finalize: 0,
    },
    phase_results: {
      init: "success",
      discover: "success",
      normalize: "success",
      dedupe: "success",
      validate: "success",
      score: "success",
      stage: "success",
      publish: "success",
      verify: "success",
      finalize: "success",
    },
    total_duration_ms: 0,
    deals_processed: {
      discovered: 0,
      passed_trust_filter: 0,
      normalized: 0,
      deduped: 0,
      validated: 0,
      scored: 0,
      published: 0,
    },
    validation_cache: {
      hit_total: 0,
      miss_total: 0,
      write_total: 0,
      d1_lookup_total: 0,
      dedup_hit_total: 0,
    },
    validation_gate_rejections: {},
    validation_gate_passes: {},
    errors: 0,
    retries: 0,
    success: false,
    final_phase: "init",
  };
}

export function recordPhaseTiming(
  metrics: PipelineMetrics,
  phase: PipelinePhase,
  duration: number,
  status: "success" | "failure" = "success",
): void {
  metrics.phase_timings[phase] = duration;
  metrics.phase_results[phase] = status;
}

export function recordDealCount(
  metrics: PipelineMetrics,
  phase:
    | "discovered"
    | "passed_trust_filter"
    | "normalized"
    | "deduped"
    | "validated"
    | "scored"
    | "published",
  count: number,
): void {
  metrics.deals_processed[phase] = count;
}

export function recordError(metrics: PipelineMetrics): void {
  metrics.errors++;
}
export function recordRetry(metrics: PipelineMetrics): void {
  metrics.retries++;
}

export function recordValidationGateRejection(
  metrics: PipelineMetrics,
  gate: string,
  count: number = 1,
): void {
  if (!metrics.validation_gate_rejections) {
    metrics.validation_gate_rejections = {};
  }
  metrics.validation_gate_rejections[gate] =
    (metrics.validation_gate_rejections[gate] || 0) + count;
}

export function recordValidationGatePass(
  metrics: PipelineMetrics,
  gate: string,
  count: number = 1,
): void {
  if (!metrics.validation_gate_passes) {
    metrics.validation_gate_passes = {};
  }
  metrics.validation_gate_passes[gate] =
    (metrics.validation_gate_passes[gate] || 0) + count;
}

export function recordValidationCacheMetric(
  metrics: PipelineMetrics,
  metric: keyof Required<PipelineMetrics>["validation_cache"],
  increment: number = 1,
): void {
  if (!metrics.validation_cache) {
    metrics.validation_cache = {
      hit_total: 0,
      miss_total: 0,
      write_total: 0,
      d1_lookup_total: 0,
      dedup_hit_total: 0,
    };
  }
  metrics.validation_cache[metric] += increment;
}

export function finalizeMetrics(
  metrics: PipelineMetrics,
  success: boolean,
  finalPhase: PipelinePhase,
): PipelineMetrics {
  metrics.end_time = Date.now();
  metrics.total_duration_ms = metrics.end_time - metrics.start_time;
  metrics.success = success;
  metrics.final_phase = finalPhase;
  return metrics;
}

export async function storeMetrics(
  env: Env,
  metrics: PipelineMetrics,
): Promise<void> {
  const key = `metrics:${metrics.run_id}`;
  await env.DEALS_LOG.put(key, JSON.stringify(metrics), {
    expirationTtl: 7 * 24 * 60 * 60,
  });

  // Persist cumulative gate rejections in KV
  if (metrics.validation_gate_rejections) {
    const cumulativeKey = "metrics:cumulative_gate_rejections";
    const existingRaw = await env.DEALS_LOG.get(cumulativeKey);
    const cumulative: Record<string, number> = existingRaw
      ? JSON.parse(existingRaw)
      : {};

    for (const [gate, count] of Object.entries(
      metrics.validation_gate_rejections,
    )) {
      cumulative[gate] = (cumulative[gate] || 0) + count;
    }

    await env.DEALS_LOG.put(cumulativeKey, JSON.stringify(cumulative), {
      // No TTL for cumulative stats, or a long one
      expirationTtl: 30 * 24 * 60 * 60,
    });
  }

  // Persist cumulative gate passes in KV
  if (metrics.validation_gate_passes) {
    const cumulativeKey = "metrics:cumulative_gate_passes";
    const existingRaw = await env.DEALS_LOG.get(cumulativeKey);
    const cumulative: Record<string, number> = existingRaw
      ? JSON.parse(existingRaw)
      : {};

    for (const [gate, count] of Object.entries(
      metrics.validation_gate_passes,
    )) {
      cumulative[gate] = (cumulative[gate] || 0) + count;
    }

    await env.DEALS_LOG.put(cumulativeKey, JSON.stringify(cumulative), {
      expirationTtl: 30 * 24 * 60 * 60,
    });
  }

  const indexKey = "metrics:index";
  const indexRaw = await env.DEALS_LOG.get(indexKey);
  const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
  index.unshift(metrics.run_id);
  if (index.length > 100) index.pop();
  await env.DEALS_LOG.put(indexKey, JSON.stringify(index), {
    expirationTtl: 7 * 24 * 60 * 60,
  });
}

export async function getMetrics(
  env: Env,
  run_id: string,
): Promise<PipelineMetrics | null> {
  const val = await env.DEALS_LOG.get(`metrics:${run_id}`);
  return val ? JSON.parse(val) : null;
}

export async function getRecentMetrics(
  env: Env,
  count: number = 10,
): Promise<PipelineMetrics[]> {
  const indexRaw = await env.DEALS_LOG.get("metrics:index");
  const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
  return fetchInBatches(index.slice(0, count), (id) => getMetrics(env, id));
}
