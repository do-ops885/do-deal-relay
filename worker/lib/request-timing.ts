// ============================================================================
// Request Timing Middleware — Response Duration Tracking
// ============================================================================
// Records per-route request durations to D1 for observability dashboards.
// Integrates with the centralized middleware pipeline (ADR-016).
// Adds X-Response-Time header to all responses.
//
// ADR-020 Phase 3 — Observability hardening
// ============================================================================

import type { Env } from "../types";
import { logger } from "./global-logger";

// ============================================================================
// Types
// ============================================================================

/** Timing record stored in D1 for analytics. */
interface RequestTiming {
  path: string;
  method: string;
  status_code: number;
  duration_ms: number;
  timestamp: string;
  environment: string;
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * Wrap a standard Response with an X-Response-Time header and record metrics.
 *
 * Usage in route handlers:
 *   const startTime = Date.now();
 *   // ... handler logic ...
 *   return withResponseTiming(response, request, env, startTime);
 */
export async function withResponseTiming(
  response: Response,
  request: Request,
  env: Env,
  startTime: number,
): Promise<Response> {
  const durationMs = Date.now() - startTime;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // Add timing header
  const headers = new Headers(response.headers);
  headers.set("X-Response-Time", `${durationMs}ms`);

  // Log slow requests (> 1s) at warn level
  if (durationMs > 1000) {
    logger.warn("Slow request", {
      component: "request-timing",
      path,
      method,
      duration_ms: durationMs,
      status: response.status,
    });
  }

  // Record to D1 asynchronously (fire-and-forget)
  recordTimingToD1(env, {
    path,
    method,
    status_code: response.status,
    duration_ms: durationMs,
    timestamp: new Date().toISOString(),
    environment: env.ENVIRONMENT || "unknown",
  }).catch(() => {
    // Silently drop recording errors — must not block the response
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// ============================================================================
// D1 Storage
// ============================================================================

/**
 * Persist a request timing record to D1 (best-effort, non-blocking).
 */
async function recordTimingToD1(
  env: Env,
  timing: RequestTiming,
): Promise<void> {
  try {
    await env.DEALS_DB.prepare(
      `INSERT INTO request_timings (path, method, status_code, duration_ms, timestamp, environment)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        timing.path,
        timing.method,
        timing.status_code,
        timing.duration_ms,
        timing.timestamp,
        timing.environment,
      )
      .run();
  } catch (err) {
    // Table may not exist yet — log once and suppress
    logger.debug("Failed to record request timing", {
      component: "request-timing",
      error: err instanceof Error ? err.message : String(err),
      path: timing.path,
    });
  }
}

// ============================================================================
// Route Metrics Summary
// ============================================================================

/**
 * Get timing summary for a specific route over the last N minutes.
 *
 * @returns Average/p50/p95/p99 duration in milliseconds.
 */
export async function getRouteTimingSummary(
  env: Env,
  path: string,
  minutes: number = 60,
): Promise<{
  path: string;
  count: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  errorRate: number;
} | null> {
  try {
    const cutoff = new Date(
      Date.now() - minutes * 60 * 1000,
    ).toISOString();

    const result = await env.DEALS_DB.prepare(
      `SELECT
         COUNT(*) as count,
         AVG(duration_ms) as avg_ms,
         SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as errors
       FROM request_timings
       WHERE path = ? AND timestamp > ?`,
    )
      .bind(path, cutoff)
      .first<{ count: number; avg_ms: number; errors: number }>();

    if (!result || result.count === 0) return null;

    // Get percentiles via separate query
    const p50Result = await env.DEALS_DB.prepare(
      `SELECT duration_ms FROM request_timings
       WHERE path = ? AND timestamp > ?
       ORDER BY duration_ms ASC
       LIMIT 1 OFFSET ?`,
    )
      .bind(path, cutoff, Math.floor(result.count * 0.5))
      .first<{ duration_ms: number }>();

    const p95Result = await env.DEALS_DB.prepare(
      `SELECT duration_ms FROM request_timings
       WHERE path = ? AND timestamp > ?
       ORDER BY duration_ms ASC
       LIMIT 1 OFFSET ?`,
    )
      .bind(path, cutoff, Math.floor(result.count * 0.95))
      .first<{ duration_ms: number }>();

    const p99Result = await env.DEALS_DB.prepare(
      `SELECT duration_ms FROM request_timings
       WHERE path = ? AND timestamp > ?
       ORDER BY duration_ms ASC
       LIMIT 1 OFFSET ?`,
    )
      .bind(path, cutoff, Math.floor(result.count * 0.99))
      .first<{ duration_ms: number }>();

    return {
      path,
      count: result.count,
      avgMs: Math.round(result.avg_ms * 100) / 100,
      p50Ms: p50Result?.duration_ms ?? 0,
      p95Ms: p95Result?.duration_ms ?? 0,
      p99Ms: p99Result?.duration_ms ?? 0,
      errorRate: result.count > 0 ? result.errors / result.count : 0,
    };
  } catch {
    return null;
  }
}
