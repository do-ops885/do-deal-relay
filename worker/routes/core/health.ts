/**
 * Core API Routes - Health Endpoints
 *
 * Handles /health, /health/ready, /health/live, /metrics
 */

import { getProductionSnapshot } from "../../lib/storage";
import { getPipelineStatus } from "../../state-machine";
import { getRecentLogs } from "../../lib/logger";
import { getRecentMetrics } from "../../lib/metrics/index";
import {
  calculateAggregateStats,
  formatMetricsForPrometheus,
} from "../../lib/metrics/stats";
import { CONFIG } from "../../config";
import type { Env, HealthStatus } from "../../types";
import { jsonResponse, SECURITY_HEADERS } from "../utils";
import { getRecentMetrics } from "../../lib/metrics/core";
import {
  calculateAggregateStats,
  formatMetricsForPrometheus,
} from "../../lib/metrics/stats";

export async function handleHealth(
  env: Env,
  request?: Request,
): Promise<Response> {
  // Optimization: Parallelize snapshot, status and log retrieval
  // This reduces latency by performing independent I/O operations concurrently
  const [snapshot, status, logs] = await Promise.all([
    getProductionSnapshot(env),
    getPipelineStatus(env),
    getRecentLogs(env, 100),
  ]);
  const recentRuns = logs.filter((l) => l.phase === "finalize").length;
  const successfulRuns = logs.filter(
    (l) => l.phase === "finalize" && l.status === "complete",
  ).length;

  const health: HealthStatus = {
    status: snapshot ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    version: CONFIG.VERSION,
    checks: {
      kv_connection: !!snapshot,
      last_run_success: !!status.last_run,
      snapshot_valid: !!snapshot,
    },
    components: {
      kv_stores: {
        deals_prod: !!snapshot,
        deals_staging: true,
        deals_log: true,
        deals_lock: !status.locked,
        deals_sources: true,
      },
      pipeline: {
        last_run: status.last_run?.timestamp || new Date().toISOString(),
        last_success: !!status.last_run,
        average_duration_ms: 0,
      },
      external_services: {
        github_api: true,
      },
    },
    metrics: {
      total_runs_24h: recentRuns,
      success_rate_24h: recentRuns > 0 ? successfulRuns / recentRuns : 0,
      avg_deals_per_run: snapshot?.stats?.active || 0,
    },
  };

  const statusCode = health.status === "healthy" ? 200 : 503;
  return jsonResponse(health, statusCode, request);
}

export async function handleReady(
  env: Env,
  request?: Request,
): Promise<Response> {
  const health = await handleHealth(env, request);
  const body = (await health.json()) as HealthStatus;
  const isReady = body.status === "healthy";
  return jsonResponse(
    { ready: isReady, ...body },
    isReady ? 200 : 503,
    request,
  );
}

export async function handleLive(
  env: Env,
  request?: Request,
): Promise<Response> {
  return jsonResponse(
    { alive: true, timestamp: new Date().toISOString() },
    200,
    request,
  );
}

export async function handleMetrics(
  env: Env,
  format: string = "prometheus",
  request?: Request,
): Promise<Response> {
  // Optimization: Parallelize snapshot and metrics retrieval to reduce total latency
  const [snapshot, metricsList] = await Promise.all([
    getProductionSnapshot(env),
    getRecentMetrics(env, 100),
  ]);

  const stats = calculateAggregateStats(metricsList);

  if (format === "json") {
    return jsonResponse(
      {
        summary: {
          total_runs: stats.total_runs,
          successful_runs: stats.successful_runs,
          failed_runs: stats.failed_runs,
          success_rate: stats.success_rate,
        },
        deals: {
          active: snapshot?.stats?.active || 0,
          avg_per_run: stats.avg_deals_per_run,
        },
        phases: stats.avg_phase_timings,
        validation_cache: stats.avg_validation_cache,
        validation_gates: stats.avg_validation_gates,
      },
      200,
      request,
    );
  }

  let prometheusMetrics = formatMetricsForPrometheus(stats);

  // Add active deals metric which is only in snapshot
  prometheusMetrics += `\n# HELP deals_active_deals Current active deals in production
# TYPE deals_active_deals gauge
deals_active_deals ${snapshot?.stats.active || 0}`;

  return new Response(prometheusMetrics, {
    headers: {
      "Content-Type": "text/plain",
      ...SECURITY_HEADERS,
    },
  });
}
