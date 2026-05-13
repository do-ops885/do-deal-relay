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

export async function handleHealth(
  env: Env,
  request?: Request,
): Promise<Response> {
  // Optimization: Parallelize snapshot, status and log retrieval
  // This reduces latency by performing independent I/O operations concurrently
  const results = await Promise.allSettled([
    getProductionSnapshot(env),
    getPipelineStatus(env),
    getRecentLogs(env, 100),
  ]);

  const snapshot = results[0].status === "fulfilled" ? results[0].value : null;
  const status =
    results[1].status === "fulfilled"
      ? results[1].value
      : { locked: false, last_run: null };
  const logs =
    results[2].status === "fulfilled" ? (results[2].value as any[]) : [];
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
  // Optimization: Parallelize snapshot, log and metrics retrieval to reduce total latency
  const [
    snapshot,
    logs,
    pipelineMetrics,
    cumulativeRejections,
    cumulativePasses,
  ] = await Promise.all([
    getProductionSnapshot(env),
    getRecentLogs(env, 1000),
    getRecentMetrics(env, 100),
    import("../../lib/metrics/stats").then((m) =>
      m.getCumulativeGateRejections(env),
    ),
    import("../../lib/metrics/stats").then((m) =>
      m.getCumulativeGatePasses(env),
    ),
  ]);

  const stats = calculateAggregateStats(pipelineMetrics);

  const runs = logs.filter((l) => l.phase === "finalize").length;
  const successes = logs.filter(
    (l) => l.phase === "publish" && l.status === "complete",
  ).length;
  const candidates = logs.reduce((sum, l) => sum + (l.candidate_count || 0), 0);
  const valid = logs.reduce((sum, l) => sum + (l.valid_count || 0), 0);
  const duplicates = logs.reduce((sum, l) => sum + (l.duplicate_count || 0), 0);

  if (format === "json") {
    // Use latest run for more accurate funnel if available, fallback to consistent averages
    const hasMetrics = pipelineMetrics && pipelineMetrics.length > 0;
    const latestRun = hasMetrics ? pipelineMetrics[0] : null;

    const funnel = {
      discovered: latestRun
        ? latestRun.deals_processed.discovered
        : stats.avg_deals_per_run.discovered,
      passed_trust_filter: latestRun
        ? latestRun.deals_processed.passed_trust_filter
        : stats.avg_deals_per_run.passed_trust_filter,
      passed_all_validation: latestRun
        ? latestRun.deals_processed.validated
        : stats.avg_deals_per_run.validated,
      published: latestRun
        ? latestRun.deals_processed.published
        : stats.avg_deals_per_run.published,
      conversion_rate: "0%",
    };

    if (funnel.discovered > 0) {
      funnel.conversion_rate = `${((funnel.published / funnel.discovered) * 100).toFixed(1)}%`;
    }

    return jsonResponse(
      {
        summary: {
          total_runs: runs,
          successful_runs: successes,
          avg_duration_ms: stats.avg_duration_ms,
          success_rate: stats.success_rate,
        },
        deals: {
          active: snapshot?.stats?.active || 0,
          discovered_total: candidates,
          validated_total: valid,
          duplicate_total: duplicates,
        },
        funnel,
        phases: stats.avg_phase_timings,
      },
      200,
      request,
    );
  }

  let metrics = formatMetricsForPrometheus(
    stats,
    pipelineMetrics,
    cumulativeRejections,
    cumulativePasses,
  );

  // Add legacy metrics for backward compatibility
  metrics += `
# HELP deals_runs_total Total discovery runs (legacy)
deals_runs_total ${runs}
# HELP deals_publish_success_total Successful publishes (legacy)
deals_publish_success_total ${successes}
# HELP deals_candidate_deals_total Candidate deals discovered (legacy)
deals_candidate_deals_total ${candidates}
# HELP deals_valid_deals_total Valid deals after validation (legacy)
deals_valid_deals_total ${valid}
# HELP deals_duplicate_deals_total Duplicate deals filtered (legacy)
deals_duplicate_deals_total ${duplicates}
# HELP deals_active_deals Current active deals in production (legacy)
deals_active_deals ${snapshot?.stats?.active || 0}
`.trim();

  return new Response(metrics, {
    headers: {
      "Content-Type": "text/plain",
      ...SECURITY_HEADERS,
    },
  });
}
