import { VERSION } from "../../version";
import type { Env, HealthStatus, LogEntry, PipelineMetrics } from "../../types";
import { getAllowedOrigin, jsonResponse } from "../utils";
import {
  formatPrometheusMetrics,
  isPrometheusFormat,
  logPrometheusExport,
  prometheusResponse,
} from "../../lib/metrics/prometheus";
import { logger } from "../../lib/global-logger";

export async function handleHealth(
  env: Env,
  request: Request,
): Promise<Response> {
  return getHealthStatus(request, env);
}

export async function handleReady(
  env: Env,
  request: Request,
): Promise<Response> {
  try {
    void env.DEALS_DB.prepare("SELECT 1").first();
    return jsonResponse({ ready: true }, 200, request, env);
  } catch {
    return jsonResponse(
      { ready: false, reason: "D1 unavailable" },
      503,
      request,
      env,
    );
  }
}

export async function handleLive(
  env: Env,
  request: Request,
): Promise<Response> {
  try {
    const ns = env.DEALS_PROD as unknown;
    const connected = !!(
      ns &&
      typeof ns === "object" &&
      "get" in (ns as Record<string, unknown>)
    );
    if (!connected) {
      return jsonResponse(
        { alive: false, reason: "Primary KV unreachable" },
        503,
        request,
        env,
      );
    }
    return jsonResponse({ alive: true }, 200, request, env);
  } catch {
    return jsonResponse({ alive: false }, 503, request, env);
  }
}

export async function handleMetrics(
  env: Env,
  format: string,
  request: Request,
): Promise<Response> {
  try {
    const indexRaw = await env.DEALS_LOG.get("metrics:index");
    const runIds: string[] = indexRaw ? JSON.parse(indexRaw) : [];

    let discovered = 0;
    let passed_trust_filter = 0;
    let validated = 0;
    let published = 0;
    let latestMetrics: PipelineMetrics | null = null;

    if (runIds.length > 0) {
      const latestRaw = await env.DEALS_LOG.get(`metrics:${runIds[0]}`);
      if (latestRaw) {
        latestMetrics = JSON.parse(latestRaw) as PipelineMetrics;
        discovered = latestMetrics.deals_processed.discovered;
        passed_trust_filter = latestMetrics.deals_processed.passed_trust_filter;
        validated = latestMetrics.deals_processed.validated;
        published = latestMetrics.deals_processed.published;
      }
    }

    const conversion_rate =
      discovered > 0 ? `${((published / discovered) * 100).toFixed(1)}%` : "0%";

    const funnel = {
      discovered,
      passed_trust_filter,
      passed_all_validation: validated,
      published,
      conversion_rate,
    };

    if (isPrometheusFormat(format)) {
      const metricsForExport: PipelineMetrics =
        latestMetrics ??
        ({
          run_id: runIds[0] ?? "empty",
          start_time: 0,
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
            discovered,
            passed_trust_filter,
            normalized: 0,
            deduped: 0,
            validated,
            scored: 0,
            published,
          },
          errors: 0,
          retries: 0,
          success: false,
          final_phase: "init",
        } satisfies PipelineMetrics);

      const body = formatPrometheusMetrics(metricsForExport);
      logPrometheusExport(metricsForExport);
      return withCors(prometheusResponse(body), request, env);
    }

    return jsonResponse({ funnel }, 200, request, env);
  } catch (error) {
    logger.error("handleMetrics failed", {
      component: "metrics",
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse({ error: "Failed to get metrics" }, 500, request, env);
  }
}

function withCors(response: Response, request: Request, env: Env): Response {
  const origin = request.headers.get("Origin");
  const allowedOrigin = getAllowedOrigin(origin, env);
  if (allowedOrigin) {
    response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
    response.headers.set("Vary", "Origin");
  }
  return response;
}

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

    const kvProd = kvChecks.DEALS_PROD ?? { connected: false };
    const kvStaging = kvChecks.DEALS_STAGING ?? { connected: false };
    const kvLog = kvChecks.DEALS_LOG ?? { connected: false };
    const kvLock = kvChecks.DEALS_LOCK ?? { connected: false };
    const kvSources = kvChecks.DEALS_SOURCES ?? { connected: false };

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
      version: VERSION,
      timestamp: new Date().toISOString(),
      uptime_seconds: uptimeSeconds,
      checks: {
        kv_connection: allKvConnected,
        last_run_success:
          recentRuns > 0 ? successfulRuns === recentRuns : false,
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
          last_run: logs.length > 0 ? (logs[0]?.ts ?? "") : "",
          last_success:
            logs.length > 0 ? logs[0]?.status === "complete" : false,
          average_duration_ms: 0,
        },
        external_services: {
          github_api: true,
        },
      },
      metrics: {
        total_runs_24h: recentRuns,
        success_rate_24h:
          recentRuns > 0 ? (successfulRuns / recentRuns) * 100 : 0,
        avg_deals_per_run: 0,
      },
      last_run:
        logs.length > 0
          ? {
              run_id: logs[0]?.run_id ?? "",
              timestamp: logs[0]?.ts ?? "",
              duration_ms: logs[0]?.duration_ms || 0,
              deals_count: 0,
            }
          : undefined,
    };

    return jsonResponse(response, 200, request, env);
  } catch {
    return jsonResponse(
      { error: "Failed to get health status" },
      500,
      request,
      env,
    );
  }
}

async function getLatestSnapshot(env: Env): Promise<boolean> {
  try {
    // biome-ignore lint/nursery/noPlaywrightUselessAwait: necessary await for DB result
    const result = await env.DEALS_DB.prepare(
      "SELECT snapshot_hash FROM snapshots ORDER BY generated_at DESC LIMIT 1",
    ).first();
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
    // biome-ignore lint/nursery/noPlaywrightUselessAwait: necessary await for DB connectivity check
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
    if (kvKey === undefined) continue;
    try {
      const ns = env[kvKey as keyof Env] as unknown;
      kvChecks[kvKey] = {
        connected: !!(
          ns &&
          typeof ns === "object" &&
          "get" in (ns as Record<string, unknown>)
        ),
      };
    } catch {
      kvChecks[kvKey] = { connected: false };
    }
  }

  return kvChecks;
}
