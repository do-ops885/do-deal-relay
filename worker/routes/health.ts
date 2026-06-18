import { handleError } from "../lib/error-handler";
import { jsonResponse } from "./utils";
import { logger } from "../lib/global-logger";
import { CONFIG } from "../config";
import type { Env } from "../types";
import { getProductionSnapshot } from "../lib/storage";
import { getPipelineStatus } from "../state-machine";

const START_TIME = Date.now();

export interface HealthDependency {
  status: "healthy" | "degraded" | "unhealthy";
  name: string;
  latency_ms?: number;
  error?: string;
}

export interface SystemHealth {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  timestamp: string;
  uptime_seconds: number;
  environment: string;
  checks: {
    kv_connection: boolean;
    last_run_success: boolean;
    snapshot_valid: boolean;
  };
  dependencies: Record<string, HealthDependency>;
  pipeline?: {
    locked: boolean;
    last_run: string | null;
    last_success: boolean;
  };
}

async function checkD1(env: Env): Promise<HealthDependency> {
  const startTime = Date.now();
  try {
    if (!env.DEALS_DB) {
      return {
        status: "unhealthy",
        name: "D1 Database",
        error: "Not configured",
      };
    }
    const result = await env.DEALS_DB.prepare("SELECT 1 as test").first<{
      test: number;
    }>();
    const latency_ms = Date.now() - startTime;
    if (result?.test === 1) {
      return { status: "healthy", name: "D1 Database", latency_ms };
    }
    return {
      status: "degraded",
      name: "D1 Database",
      latency_ms,
      error: "Unexpected response",
    };
  } catch (error) {
    const latency_ms = Date.now() - startTime;
    return {
      status: "unhealthy",
      name: "D1 Database",
      latency_ms,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkKVNamespace(
  env: Env,
  nsKey: keyof Env,
  label: string,
): Promise<HealthDependency> {
  const startTime = Date.now();
  try {
    const ns = env[nsKey] as unknown;
    if (
      !ns ||
      typeof ns !== "object" ||
      !("get" in (ns as Record<string, unknown>))
    ) {
      return {
        status: "unhealthy",
        name: label,
        error: "Namespace not available",
      };
    }
    const latency_ms = Date.now() - startTime;
    return { status: "healthy", name: label, latency_ms };
  } catch (error) {
    const latency_ms = Date.now() - startTime;
    return {
      status: "unhealthy",
      name: label,
      latency_ms,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Handle system health check requests.
 *
 * Performs a comprehensive check of all system dependencies, including
 * D1 database connectivity, all KV namespaces, and the production snapshot.
 * Returns a 200 OK if all critical dependencies are healthy, or 503 Service
 * Unavailable if any are unhealthy or degraded.
 *
 * @param env - Worker environment containing database and KV bindings
 * @param request - Optional HTTP request object
 * @returns JSON response with overall status and detailed dependency health
 */
export async function handleSystemHealth(
  env: Env,
  request?: Request,
): Promise<Response> {
  try {
    const [
      d1Result,
      kvProdResult,
      kvStagingResult,
      kvLogResult,
      kvLockResult,
      kvSourcesResult,
      snapshot,
      pipelineStatus,
    ] = await Promise.allSettled([
      checkD1(env),
      checkKVNamespace(env, "DEALS_PROD" as keyof Env, "KV Deals Prod"),
      checkKVNamespace(env, "DEALS_STAGING" as keyof Env, "KV Deals Staging"),
      checkKVNamespace(env, "DEALS_LOG" as keyof Env, "KV Deals Log"),
      checkKVNamespace(env, "DEALS_LOCK" as keyof Env, "KV Deals Lock"),
      checkKVNamespace(env, "DEALS_SOURCES" as keyof Env, "KV Deals Sources"),
      getProductionSnapshot(env),
      getPipelineStatus(env),
    ]);

    const dependencies: Record<string, HealthDependency> = {
      d1_database: extractResult(d1Result, {
        status: "unhealthy",
        name: "D1 Database",
        error: "Check failed",
      }),
      kv_deals_prod: extractResult(kvProdResult, {
        status: "unhealthy",
        name: "KV Deals Prod",
        error: "Check failed",
      }),
      kv_deals_staging: extractResult(kvStagingResult, {
        status: "unhealthy",
        name: "KV Deals Staging",
        error: "Check failed",
      }),
      kv_deals_log: extractResult(kvLogResult, {
        status: "unhealthy",
        name: "KV Deals Log",
        error: "Check failed",
      }),
      kv_deals_lock: extractResult(kvLockResult, {
        status: "unhealthy",
        name: "KV Deals Lock",
        error: "Check failed",
      }),
      kv_deals_sources: extractResult(kvSourcesResult, {
        status: "unhealthy",
        name: "KV Deals Sources",
        error: "Check failed",
      }),
    };

    const snapValue = snapshot.status === "fulfilled" ? snapshot.value : null;
    const pipeValue =
      pipelineStatus.status === "fulfilled" ? pipelineStatus.value : null;

    const unhealthyDeps = Object.values(dependencies).filter(
      (d) => d.status === "unhealthy",
    );
    const degradedDeps = Object.values(dependencies).filter(
      (d) => d.status === "degraded",
    );

    let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";
    if (unhealthyDeps.length > 0) overallStatus = "unhealthy";
    else if (degradedDeps.length > 0) overallStatus = "degraded";

    const result: SystemHealth = {
      status: overallStatus,
      version: CONFIG.VERSION,
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor((Date.now() - START_TIME) / 1000),
      environment: env.ENVIRONMENT || "unknown",
      checks: {
        kv_connection: dependencies.kv_deals_prod?.status === "healthy",
        last_run_success: !!pipeValue?.last_run,
        snapshot_valid: !!snapValue,
      },
      dependencies,
      pipeline: pipeValue
        ? {
            locked: pipeValue.locked,
            last_run: pipeValue.last_run?.timestamp || null,
            last_success: !!pipeValue.last_run,
          }
        : undefined,
    };

    const statusCode = overallStatus === "healthy" ? 200 : 503;
    return jsonResponse(result, statusCode, request, env);
  } catch (error) {
    const err = handleError(error, {
      component: "health",
      handler: "handleSystemHealth",
    });
    return jsonResponse({ error: "Health check failed" }, 500, request, env);
  }
}

function extractResult<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback;
}
