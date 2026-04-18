import type { Env, PipelineMetrics } from "../../types";
import { getMetricsSnapshot, saveMetricsSnapshot } from "./core";

/**
 * Update pipeline metrics after a run
 */
export async function updatePipelineMetrics(
  env: Env,
  stats: {
    run_id: string;
    duration_ms: number;
    deals_count: number;
    success: boolean;
    error?: string;
  },
  pipelineMetrics: PipelineMetrics,
): Promise<void> {
  const existing = await getMetricsSnapshot(env);

  const newData = {
    pipeline: pipelineMetrics,
    lastRun: {
      run_id: stats.run_id,
      timestamp: new Date().toISOString(),
      duration_ms: stats.duration_ms,
      deals_count: stats.deals_count,
      status: (stats.success ? "success" : "failure") as "success" | "failure",
      error: stats.error,
    },
    system: {
      memory_usage: (process as any).memoryUsage?.().heapUsed || 0,
      uptime: (process as any).uptime?.() || 0,
      worker_version: "0.1.3", // Should come from package.json or env
    },
  };

  await saveMetricsSnapshot(env, newData);
}

/**
 * Initialize default metrics if none exist
 */
export async function initMetrics(env: Env): Promise<void> {
  const existing = await getMetricsSnapshot(env);
  if (existing) return;

  const initialMetrics = {
    pipeline: {
      discovery: { total: 0, successful: 0, failed: 0, duration_avg: 0 },
      validation: { total: 0, successful: 0, failed: 0, duration_avg: 0 },
      storage: { total: 0, successful: 0, failed: 0, duration_avg: 0 },
      cache_hits: 0,
      cache_misses: 0,
    },
    lastRun: {
      run_id: "initial",
      timestamp: new Date().toISOString(),
      duration_ms: 0,
      deals_count: 0,
      status: "success" as const,
    },
    system: {
      memory_usage: 0,
      uptime: 0,
      worker_version: "0.1.3",
    },
  };

  await saveMetricsSnapshot(env, initialMetrics);
}

export interface LocalMetrics {
  run_id: string;
  start_time: number;
  phases: Record<string, { duration: number; status: string }>;
  deals: Record<string, number>;
  errors: number;
  retries: number;
}

export function createMetrics(run_id: string): LocalMetrics {
  return {
    run_id,
    start_time: Date.now(),
    phases: {},
    deals: {},
    errors: 0,
    retries: 0,
  };
}

export function recordPhaseTiming(metrics: LocalMetrics, phase: string, duration: number): void {
  metrics.phases[phase] = { duration, status: "success" };
}

export function recordError(metrics: LocalMetrics): void {
  metrics.errors++;
}

export function recordRetry(metrics: LocalMetrics): void {
  metrics.retries++;
}

export function recordDealCount(metrics: LocalMetrics, stage: string, count: number): void {
  metrics.deals[stage] = count;
}

export function finalizeMetrics(metrics: LocalMetrics, success: boolean, lastPhase: string): void {
  if (metrics.phases[lastPhase]) {
    metrics.phases[lastPhase].status = success ? "success" : "failure";
  }
}

export async function storeMetrics(env: Env, metrics: LocalMetrics): Promise<void> {
  const pipelineMetrics: PipelineMetrics = {
    discovery: {
      total: metrics.deals.discovered || 0,
      successful: metrics.deals.normalized || 0,
      failed: (metrics.deals.discovered || 0) - (metrics.deals.normalized || 0),
      duration_avg: metrics.phases.discover?.duration || 0,
    },
    validation: {
      total: metrics.deals.deduped || 0,
      successful: metrics.deals.validated || 0,
      failed: (metrics.deals.deduped || 0) - (metrics.deals.validated || 0),
      duration_avg: metrics.phases.validate?.duration || 0,
    },
    storage: {
      total: metrics.deals.published || 0,
      successful: metrics.deals.published || 0,
      failed: 0,
      duration_avg: metrics.phases.publish?.duration || 0,
    },
    cache_hits: 0,
    cache_misses: 0,
  };

  await updatePipelineMetrics(
    env,
    {
      run_id: metrics.run_id,
      duration_ms: Date.now() - metrics.start_time,
      deals_count: metrics.deals.published || 0,
      success: true, // simplified
    },
    pipelineMetrics
  );
}
