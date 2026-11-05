import { VERSION } from "../../version";
import type { Env, HealthStatus, PipelineMetrics } from "../../types";
import { getAllowedOrigin, jsonResponse } from "../utils";
import {
  formatPrometheusMetrics,
  isPrometheusFormat,
  logPrometheusExport,
  prometheusResponse,
} from "../../lib/metrics/prometheus";
import { logger } from "../../lib/global-logger";

/**
 * Health probes are polled frequently, so they must never scan the whole
 * DEALS_LOG namespace. The health path reads a single bounded index entry
 * plus at most HEALTH_MAX_RUNS metrics records (point reads).
 */
export const HEALTH_MAX_RUNS = 24;
export const HEALTH_WINDOW_MS = 24 * 60 * 60 * 1000;

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
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const probe = env.DEALS_DB.prepare("SELECT 1").first();
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("D1 probe timeout")), 2000);
    });
    await Promise.race([probe, timeout]);
    return jsonResponse({ ready: true }, 200, request, env);
  } catch {
    return jsonResponse(
      { ready: false, reason: "D1 unavailable" },
      503,
      request,
      env,
    );
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function handleLive(
  env: Env,
  request: Request,
): Promise<Response> {
  try {
    const ns = env.DEALS_PROD as unknown;
    const bound = !!(
      ns &&
      typeof ns === "object" &&
      "get" in (ns as Record<string, unknown>)
    );
    if (!bound) {
      return jsonResponse(
        { alive: false, reason: "Primary KV binding missing" },
        503,
        request,
        env,
      );
    }

    // Perform an actual KV read to verify runtime connectivity
    await (env.DEALS_PROD as KVNamespace).get("__health_probe__");

    return jsonResponse({ alive: true }, 200, request, env);
  } catch {
    return jsonResponse(
      { alive: false, reason: "Primary KV unreachable" },
      503,
      request,
      env,
    );
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

/**
 * Health status contract:
 * - `unhealthy`: a hard dependency (D1 or any KV binding) is unavailable.
 * - `degraded`: dependencies are reachable, but the service cannot serve its
 *   primary purpose yet — no valid snapshot, no successful/fresh pipeline run,
 *   or the most recent run failed. A missing snapshot is treated as a startup
 *   condition, not as healthy.
 * - `healthy`: dependencies reachable, snapshot valid, and the latest run
 *   completed successfully within the 24h freshness window.
 *
 * Only measured values are reported: the old hard-coded averages, the
 * unconditional `github_api` flag, and the request-duration `uptime_seconds`
 * were removed because they did not describe real operational state.
 */
export async function getHealthStatus(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const [snapshotValid, d1Check, kvChecks, runs] = await Promise.all([
      getLatestSnapshot(env),
      checkD1Connection(env),
      checkKVConnections(env),
      getBoundedRunMetrics(env),
    ]);

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
    const dependenciesConnected = allKvConnected && d1Check.connected;

    const now = Date.now();
    const windowStart = now - HEALTH_WINDOW_MS;
    const runs24h = runs.filter((run) => {
      const ts = runTimestamp(run);
      return ts !== null && ts >= windowStart;
    });
    const successfulRuns24h = runs24h.filter((run) => run.success === true);
    const latestRun = runs[0] ?? null;
    const latestRunTimestamp = latestRun ? runTimestamp(latestRun) : null;
    const lastRunFresh =
      latestRunTimestamp !== null && latestRunTimestamp >= windowStart;
    const lastRunSuccess = latestRun?.success === true && lastRunFresh;

    let overallStatus: "healthy" | "degraded" | "unhealthy";
    if (!dependenciesConnected) {
      overallStatus = "unhealthy";
    } else if (!snapshotValid || !lastRunSuccess) {
      overallStatus = "degraded";
    } else {
      overallStatus = "healthy";
    }

    const averageDurationMs =
      runs24h.length > 0
        ? Math.round(
            runs24h.reduce(
              (sum, run) =>
                sum +
                (Number.isFinite(run.total_duration_ms)
                  ? run.total_duration_ms
                  : 0),
              0,
            ) / runs24h.length,
          )
        : 0;
    const averageDealsPerRun =
      runs24h.length > 0
        ? runs24h.reduce(
            (sum, run) => sum + (run.deals_processed?.published ?? 0),
            0,
          ) / runs24h.length
        : 0;

    const response: HealthStatus = {
      status: overallStatus,
      version: VERSION,
      timestamp: new Date(now).toISOString(),
      checks: {
        kv_connection: allKvConnected,
        last_run_success: lastRunSuccess,
        snapshot_valid: snapshotValid,
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
          ...(d1Check.error !== undefined ? { error: d1Check.error } : {}),
        },
        pipeline: {
          last_run:
            latestRunTimestamp !== null
              ? new Date(latestRunTimestamp).toISOString()
              : "",
          last_success: lastRunSuccess,
          average_duration_ms: averageDurationMs,
        },
      },
      metrics: {
        total_runs_24h: runs24h.length,
        success_rate_24h:
          runs24h.length > 0
            ? (successfulRuns24h.length / runs24h.length) * 100
            : 0,
        avg_deals_per_run: averageDealsPerRun,
      },
      ...(latestRun !== null
        ? {
            last_run: {
              run_id: latestRun.run_id,
              timestamp:
                latestRunTimestamp !== null
                  ? new Date(latestRunTimestamp).toISOString()
                  : "",
              duration_ms: Number.isFinite(latestRun.total_duration_ms)
                ? latestRun.total_duration_ms
                : 0,
              deals_count: latestRun.deals_processed?.published ?? 0,
            },
          }
        : {}),
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

function runTimestamp(run: PipelineMetrics): number | null {
  if (typeof run.end_time === "number" && run.end_time > 0) {
    return run.end_time;
  }
  if (typeof run.start_time === "number" && run.start_time > 0) {
    return run.start_time;
  }
  return null;
}

/**
 * Bounded health metrics read: one index point read plus at most
 * HEALTH_MAX_RUNS point reads. Never lists the DEALS_LOG namespace, so
 * probe cost is independent of total log history.
 */
async function getBoundedRunMetrics(env: Env): Promise<PipelineMetrics[]> {
  try {
    const indexRaw = await env.DEALS_LOG.get("metrics:index");
    if (!indexRaw) return [];

    let parsedIndex: unknown;
    try {
      parsedIndex = JSON.parse(indexRaw);
    } catch {
      return [];
    }
    if (!Array.isArray(parsedIndex)) return [];

    const ids = parsedIndex
      .filter((value): value is string => typeof value === "string")
      .slice(0, HEALTH_MAX_RUNS);

    const records = await Promise.all(
      ids.map(async (id) => {
        try {
          const raw = await env.DEALS_LOG.get(`metrics:${id}`);
          if (!raw) return null;
          const parsed = JSON.parse(raw) as Partial<PipelineMetrics>;
          if (
            !parsed ||
            typeof parsed !== "object" ||
            typeof parsed.run_id !== "string"
          ) {
            return null;
          }
          return parsed as PipelineMetrics;
        } catch {
          return null;
        }
      }),
    );

    return records.filter((run): run is PipelineMetrics => run !== null);
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
