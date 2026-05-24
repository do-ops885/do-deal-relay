import type { Env, HealthStatus, LogEntry } from "../types";
import { handleError } from "../lib/error-handler";
import { logger } from "../lib/global-logger";
import { jsonResponse } from "./utils";

export async function getHealthStatus(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const startTime = Date.now();

    const snapshot = await getLatestSnapshot(env);
    const logs = await getRecentLogs(env);
    const d1Check = await checkD1Connection(env);

    const kvChecks = await checkKVConnections(env);

    const kvProd = kvChecks.DEALS_PROD;
    const kvStaging = kvChecks.DEALS_STAGING;
    const kvLog = kvChecks.DEALS_LOG;
    const kvLock = kvChecks.DEALS_LOCK;
    const kvSources = kvChecks.DEALS_SOURCES;

    const allKvConnected =
      kvProd.connected &&
      kvStaging.connected &&
      kvLog.connected &&
      kvLock.connected &&
      kvSources.connected;
    const allDepsHealthy =
      snapshot || !allKvConnected ? false : d1Check.connected;

    const recentRuns = logs.filter((l) => l.phase === "finalize").length;
    const successfulRuns = logs.filter(
      (l) => l.phase === "finalize" && l.status === "complete",
    ).length;

    let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";

    if (!allDepsHealthy || !allKvConnected) {
      overallStatus = "degraded";
    }

    if (!d1Check.connected || !allKvConnected) {
      overallStatus = "unhealthy";
    }

    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

    const response: HealthStatus = {
      status: overallStatus,
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      uptime_seconds: uptimeSeconds,
      checks: {
        kv_connection: allKvConnected,
        last_run_success: recentRuns > 0 ? successfulRuns === recentRuns : false,
        snapshot_valid: snapshot !== null,
        d1_connected: d1Check.connected,
      },
      components: {
        kv_stores: {
          deals_prod: kvProd.connected,
          deals_staging: kvStaging.connected,
          deals_log: kvLog.connected,
          deals_lock: kvLock.connected,
          deals_sources: kvSources.connected,
        },
        d1_database: {
          connected: d1Check.connected,
          latency_ms: d1Check.latencyMs,
          error: d1Check.error,
        },
        pipeline: {
          last_run: logs.length > 0 ? logs[0].ts : "",
          last_success: logs.length > 0 ? logs[0].status === "complete" : false,
          average_duration_ms: 0,
        },
        external_services: {
          github_api: true,
        },
      },
      metrics: {
        total_runs_24h: recentRuns,
        success_rate_24h: recentRuns > 0 ? (successfulRuns / recentRuns) * 100 : 0,
        avg_deals_per_run: 0,
      },
      last_run:
        logs.length > 0
          ? {
              run_id: logs[0].run_id,
              timestamp: logs[0].ts,
              duration_ms: logs[0].duration_ms || 0,
              deals_count: 0,
            }
          : undefined,
    };

    return jsonResponse(response, 200, request, env);
  } catch (error) {
    return handleError(error, request, env, "Failed to get health status");
  }
}

async function getLatestSnapshot(env: Env): Promise<boolean> {
  try {
    const result = await env.DEALS_DB.prepare(
      "SELECT snapshot_hash FROM snapshots ORDER BY generated_at DESC LIMIT 1",
    )
      .first();
    return result !== null;
  } catch {
    return false;
  }
}

async function getRecentLogs(env: Env): Promise<LogEntry[]> {
  try {
    const result = await env.DEALS_LOG.list();
    return result.keys.map((k) => JSON.parse(k.metadata as string) as LogEntry);
  } catch {
    return [];
  }
}

async function checkD1Connection(env: Env): Promise<{
  connected: boolean;
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    await env.DEALS_DB.prepare("SELECT 1").first();
    return {
      connected: true,
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      connected: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function checkKVConnections(env: Env): Promise<{
  [key: string]: { connected: boolean };
}> {
  const kvKeys = [
    "DEALS_PROD",
    "DEALS_STAGING",
    "DEALS_LOG",
    "DEALS_LOCK",
    "DEALS_SOURCES",
  ];
  const kvChecks: Record<string, { connected: boolean }> = {};

  for (let i = 0; i < kvKeys.length; i++) {
    const kvKey = kvKeys[i];
    try {
      const ns = env[kvKey as keyof Env] as unknown;
      kvChecks[kvKey] = !!(
        ns &&
        typeof ns === "object" &&
        "get" in (ns as Record<string, unknown>)
      );
    } catch {
      kvChecks[kvKey] = { connected: false };
    }
  }

  return kvChecks;
}