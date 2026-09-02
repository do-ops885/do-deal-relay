/**
 * D1 Route Helpers — Shared Boilerplate
 *
 * Extracts duplicated `getD1Logger` and `DEALS_DB` guard that was
 * copy-pasted across 4 files (F-12: ~250 lines). Single source of truth
 * for D1 route logging and DB availability checks.
 */

import type { Env } from "../../types";
import { jsonResponse } from "../utils";
import { createStructuredLogger } from "../../lib/logger";

/**
 * Create a scoped logger for D1 route handlers.
 * Uses a stable trace id per request (timestamp-based, no collision risk
 * within single isolate; uniqueness not required for logging).
 */
export function getD1Logger(env: Env) {
  return createStructuredLogger(env, "d1-routes", `d1-${Date.now()}`);
}

/**
 * Guard that D1 is configured. Returns a 503 Response when missing,
 * otherwise null (caller continues).
 */
export function requireD1Db(env: Env): Response | null {
  if (!env.DEALS_DB) {
    return jsonResponse(
      { error: "D1 database not configured" },
      503,
      undefined,
      env,
    );
  }
  return null;
}
