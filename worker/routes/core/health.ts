/**
 * Core API Routes - Health Endpoints
 *
 * Handles /health, /health/ready, /health/live, /metrics
 */

import { getProductionSnapshot } from "../../lib/storage";
import { getPipelineStatus } from "../../state-machine";
import { getRecentLogs } from "../../lib/logger";
import { CONFIG } from "../../config";
import type { Env, HealthStatus } from "../../types";
import { jsonResponse } from "../utils";

export async function handleHealth(env: Env): Promise<Response> {
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
  return jsonResponse(health, statusCode);
}

export async function handleReady(env: Env): Promise<Response> {
  const health = await handleHealth(env);
  const body = (await health.json()) as HealthStatus;
  const isReady = body.status === "healthy";
  return jsonResponse({ ready: isReady, ...body }, isReady ? 200 : 503);
}

export async function handleLive(env: Env): Promise<Response> {
  return jsonResponse({ alive: true, timestamp: new Date().toISOString() });
}

export async function handleMetrics(
  env: Env,
  format: string = "prometheus",
): Promise<Response> {
  // Optimization: Parallelize snapshot and log retrieval to reduce total latency
  const [snapshot, logs] = await Promise.all([
    getProductionSnapshot(env),
    getRecentLogs(env, 1000),
  ]);

  const runs = logs.filter((l) => l.phase === "finalize").length;
  const successes = logs.filter(
    (l) => l.phase === "publish" && l.status === "complete",
  ).length;
  const candidates = logs.reduce((sum, l) => sum + (l.candidate_count || 0), 0);
  const valid = logs.reduce((sum, l) => sum + (l.valid_count || 0), 0);
  const duplicates = logs.reduce((sum, l) => sum + (l.duplicate_count || 0), 0);

  if (format === "json") {
    return jsonResponse({
      summary: {
        total_runs: runs,
        successful_runs: successes,
      },
      deals: {
        active: snapshot?.stats?.active || 0,
        discovered_total: candidates,
        validated_total: valid,
        duplicate_total: duplicates,
      },
    });
  }

  const metrics = `
# HELP deals_runs_total Total discovery runs
# TYPE deals_runs_total counter
deals_runs_total ${runs}

# HELP deals_publish_success_total Successful publishes
deals_publish_success_total ${successes}

# HELP deals_candidate_deals_total Candidate deals discovered
deals_candidate_deals_total ${candidates}

# HELP deals_valid_deals_total Valid deals after validation
deals_valid_deals_total ${valid}

# HELP deals_duplicate_deals_total Duplicate deals filtered
deals_duplicate_deals_total ${duplicates}

# HELP deals_active_deals Current active deals in production
deals_active_deals ${snapshot?.stats?.active || 0}
`.trim();

  return new Response(metrics, {
    headers: { "Content-Type": "text/plain" },
  });
}
