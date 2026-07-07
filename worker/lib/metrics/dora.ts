import type { PipelineMetrics, Env } from "../../types";
import { logger } from "../global-logger";
import { fetchInBatches } from "../utils";

const DORA_CACHE_KEY = "dora:summary";
const DORA_CACHE_TTL = 60 * 60;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DORAMetricSummary {
  deployment_frequency: {
    runs_per_day: number;
    successful_runs_per_day: number;
    total_runs_in_period: number;
    period_days: number;
  };
  lead_time: {
    avg_duration_ms: number;
    p50_duration_ms: number;
    p95_duration_ms: number;
    p99_duration_ms: number;
    sample_size: number;
  };
  change_failure_rate: {
    failure_rate: number;
    total_runs: number;
    failed_runs: number;
  };
  mean_time_to_recovery: {
    avg_recovery_ms: number;
    recovery_samples: number;
  };
  computed_at: string;
  period_days: number;
}

export interface DailyBreakdown {
  date: string;
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  avg_duration_ms: number;
}

export interface DORAMetricsResult {
  summary: DORAMetricSummary;
  daily_breakdown: DailyBreakdown[];
}

async function loadAllMetrics(
  env: Env,
  runIds: string[],
): Promise<PipelineMetrics[]> {
  const results = await fetchInBatches(
    runIds,
    (id) => getMetricsById(env, id),
    25,
  );
  return results.filter((m): m is PipelineMetrics => m !== null);
}

async function getMetricsById(
  env: Env,
  runId: string,
): Promise<PipelineMetrics | null> {
  const raw = await env.DEALS_LOG.get(`metrics:${runId}`);
  return raw ? (JSON.parse(raw) as PipelineMetrics) : null;
}

function filterByDays(
  metrics: PipelineMetrics[],
  days: number,
): PipelineMetrics[] {
  const cutoff = Date.now() - days * DAY_MS;
  return metrics.filter((m) => m.start_time >= cutoff);
}

function computeDeploymentFrequency(
  metrics: PipelineMetrics[],
  days: number,
): DORAMetricSummary["deployment_frequency"] {
  const totalRuns = metrics.length;
  const successfulRuns = metrics.filter((m) => m.success).length;
  return {
    runs_per_day: days > 0 ? Math.round((totalRuns / days) * 100) / 100 : 0,
    successful_runs_per_day:
      days > 0 ? Math.round((successfulRuns / days) * 100) / 100 : 0,
    total_runs_in_period: totalRuns,
    period_days: days,
  };
}

function computeLeadTime(
  metrics: PipelineMetrics[],
): DORAMetricSummary["lead_time"] {
  const durations = metrics
    .map((m) => m.total_duration_ms)
    .filter((d) => d > 0)
    .sort((a, b) => a - b);

  if (durations.length === 0) {
    return {
      avg_duration_ms: 0,
      p50_duration_ms: 0,
      p95_duration_ms: 0,
      p99_duration_ms: 0,
      sample_size: 0,
    };
  }

  const sum = durations.reduce((a, b) => a + b, 0);
  const quantile = (q: number) =>
    durations[Math.max(0, Math.ceil(durations.length * q) - 1)] ?? 0;

  return {
    avg_duration_ms: Math.round(sum / durations.length),
    p50_duration_ms: quantile(0.5),
    p95_duration_ms: quantile(0.95),
    p99_duration_ms: quantile(0.99),
    sample_size: durations.length,
  };
}

function computeChangeFailureRate(
  metrics: PipelineMetrics[],
): DORAMetricSummary["change_failure_rate"] {
  const totalRuns = metrics.length;
  const failedRuns = metrics.filter((m) => !m.success).length;
  return {
    failure_rate:
      totalRuns > 0 ? Math.round((failedRuns / totalRuns) * 10000) / 10000 : 0,
    total_runs: totalRuns,
    failed_runs: failedRuns,
  };
}

interface FailureEvent {
  failure_time: number;
  next_success_time: number | null;
}

function computeMTTR(
  metrics: PipelineMetrics[],
): DORAMetricSummary["mean_time_to_recovery"] {
  const sorted = [...metrics].sort((a, b) => a.start_time - b.start_time);
  const failures: FailureEvent[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    if (!current || current.success) continue;

    const failureTime = current.end_time ?? current.start_time;
    let nextSuccessTime: number | null = null;

    for (let j = i + 1; j < sorted.length; j++) {
      const candidate = sorted[j];
      if (candidate && candidate.success) {
        nextSuccessTime = candidate.start_time;
        break;
      }
    }

    failures.push({
      failure_time: failureTime,
      next_success_time: nextSuccessTime,
    });
  }

  const recoveries = failures.filter(
    (f): f is FailureEvent & { next_success_time: number } =>
      f.next_success_time !== null,
  );

  if (recoveries.length === 0) {
    return { avg_recovery_ms: 0, recovery_samples: 0 };
  }

  const totalRecoveryTime = recoveries.reduce(
    (sum, f) => sum + (f.next_success_time - f.failure_time),
    0,
  );

  return {
    avg_recovery_ms: Math.round(totalRecoveryTime / recoveries.length),
    recovery_samples: recoveries.length,
  };
}

function computeDailyBreakdown(metrics: PipelineMetrics[]): DailyBreakdown[] {
  const byDay = new Map<string, PipelineMetrics[]>();

  for (const m of metrics) {
    const date = new Date(m.start_time).toISOString().slice(0, 10);
    const existing = byDay.get(date);
    if (existing) {
      existing.push(m);
    } else {
      byDay.set(date, [m]);
    }
  }

  const breakdown: DailyBreakdown[] = [];

  for (const [date, dayMetrics] of byDay) {
    const successful = dayMetrics.filter((m) => m.success).length;
    const totalDuration = dayMetrics.reduce(
      (sum, m) => sum + m.total_duration_ms,
      0,
    );
    breakdown.push({
      date,
      total_runs: dayMetrics.length,
      successful_runs: successful,
      failed_runs: dayMetrics.length - successful,
      avg_duration_ms:
        dayMetrics.length > 0
          ? Math.round(totalDuration / dayMetrics.length)
          : 0,
    });
  }

  breakdown.sort((a, b) => a.date.localeCompare(b.date));
  return breakdown;
}

export async function getMetricsIndex(env: Env): Promise<string[]> {
  const raw = await env.DEALS_LOG.get("metrics:index");
  return raw ? JSON.parse(raw) : [];
}

export async function computeDORAMetrics(
  env: Env,
  days: number = 30,
): Promise<DORAMetricsResult> {
  const index = await getMetricsIndex(env);
  const allMetrics = await loadAllMetrics(env, index);
  const metrics = filterByDays(allMetrics, days);

  const summary: DORAMetricSummary = {
    deployment_frequency: computeDeploymentFrequency(metrics, days),
    lead_time: computeLeadTime(metrics),
    change_failure_rate: computeChangeFailureRate(metrics),
    mean_time_to_recovery: computeMTTR(metrics),
    computed_at: new Date().toISOString(),
    period_days: days,
  };

  const daily_breakdown = computeDailyBreakdown(metrics);

  return { summary, daily_breakdown };
}

export async function getDORASummary(env: Env): Promise<DORAMetricsResult> {
  const cached = await env.DEALS_LOG.get(DORA_CACHE_KEY);
  if (cached) {
    return JSON.parse(cached) as DORAMetricsResult;
  }

  const result = await computeDORAMetrics(env);

  try {
    await env.DEALS_LOG.put(DORA_CACHE_KEY, JSON.stringify(result), {
      expirationTtl: DORA_CACHE_TTL,
    });
  } catch {
    logger.warn("Failed to cache DORA summary", {
      component: "dora-metrics",
    });
  }

  return result;
}
