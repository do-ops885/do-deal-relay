import { CONFIG } from "../config";
import { PipelineError } from "../types";
import type { Env } from "../types";
import { toError } from "./sanitize-error";
import { logger } from "./global-logger";

// ============================================================================
// Distributed Lock — D1 CAS fallback path (ADR-022)
// ============================================================================
// These are the AUTOMATIC fallback implementations used by worker/lib/lock.ts
// when the PipelineLock Durable Object is unavailable (binding absent, RPC
// rejection, or RPC timeout). Semantics are unchanged from the original
// single-file implementation; callers see identical return shapes and TTL
// behavior on both paths. See lock.ts for the DO-primary orchestration.
// ============================================================================

/** Lock row name shared with the DO-primary path. */
export const LOCK_NAME = "pipeline:lock";

/** Log component tag shared by both lock paths. */
export const LOG_COMPONENT = "lock";

interface LockData {
  run_id: string;
  trace_id: string;
  acquired_at: string;
  expires_at: string;
}

/** Acquire via D1 compare-and-swap (atomic INSERT OR REPLACE + expiry check). */
export async function acquireLockViaD1(
  env: Env,
  run_id: string,
  trace_id: string,
): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CONFIG.LOCK_TTL_SECONDS * 1000);
  const nowIso = now.toISOString();
  const expiresIso = expiresAt.toISOString();

  try {
    // Atomic CAS: try to acquire lock in a single D1 batch.
    // Step 1: INSERT OR IGNORE — if lock doesn't exist, create it.
    // Step 2: UPDATE with expiry check — if lock exists but expired, take over.
    // Step 3: SELECT — verify acquisition.
    const batchResults = await env.DEALS_DB.batch([
      env.DEALS_DB.prepare(
        `INSERT OR IGNORE INTO pipeline_locks (lock_name, run_id, trace_id, acquired_at, expires_at)
         VALUES (?1, ?2, ?3, ?4, ?5)`,
      ).bind(LOCK_NAME, run_id, trace_id, nowIso, expiresIso),
      env.DEALS_DB.prepare(
        `UPDATE pipeline_locks
         SET run_id = ?2, trace_id = ?3, acquired_at = ?4, expires_at = ?5
         WHERE lock_name = ?1 AND expires_at <= ?6`,
      ).bind(LOCK_NAME, run_id, trace_id, nowIso, expiresIso, nowIso),
      env.DEALS_DB.prepare(
        `SELECT run_id, trace_id, acquired_at, expires_at
         FROM pipeline_locks WHERE lock_name = ?1`,
      ).bind(LOCK_NAME),
    ]);

    // Check if INSERT was applied (new lock created) or UPDATE was applied (expired lock taken over)
    const insertMeta = batchResults[0]?.meta;
    const updateMeta = batchResults[1]?.meta;
    const selectResult = batchResults[2]?.results?.[0] as LockData | undefined;

    const insertedNew = (insertMeta?.changes ?? 0) > 0;
    const tookOverExpired = (updateMeta?.changes ?? 0) > 0;

    if (insertedNew || tookOverExpired) {
      // Lock was acquired — verify we own it
      if (selectResult && selectResult.trace_id === trace_id) {
        logger.info(`Lock acquired for run ${run_id}`, {
          component: LOG_COMPONENT,
          run_id,
          trace_id,
          method: insertedNew ? "insert" : "takeover",
        });
        return true;
      }
    }

    // Lock is held by another run and not expired
    if (selectResult && selectResult.trace_id !== trace_id) {
      const expiresAtExisting = new Date(selectResult.expires_at);
      if (expiresAtExisting > now) {
        throw new PipelineError(
          "ConcurrencyError",
          `Lock held by run ${selectResult.run_id} until ${selectResult.expires_at}`,
          "init",
          false,
        );
      }
    }

    // Should not reach here, but handle gracefully
    throw new PipelineError(
      "ConcurrencyError",
      "Lock acquisition failed — unexpected state",
      "init",
      false,
    );
  } catch (error) {
    if (error instanceof PipelineError) {
      throw error;
    }
    throw new PipelineError(
      "ConcurrencyError",
      `Lock acquisition failed: ${toError(error).message}`,
      "init",
      true,
    );
  }
}

/**
 * Release via D1 batch for atomic read-then-delete.
 * Errors are logged and swallowed — lock will be treated as expired.
 */
export async function releaseLockViaD1(
  env: Env,
  trace_id: string,
): Promise<void> {
  try {
    const batchResults = await env.DEALS_DB.batch([
      env.DEALS_DB.prepare(
        `SELECT trace_id FROM pipeline_locks WHERE lock_name = ?1`,
      ).bind(LOCK_NAME),
      env.DEALS_DB.prepare(
        `DELETE FROM pipeline_locks WHERE lock_name = ?1 AND trace_id = ?2`,
      ).bind(LOCK_NAME, trace_id),
    ]);

    const selectResult = batchResults[0]?.results?.[0] as
      { trace_id: string } | undefined;

    if (!selectResult) {
      logger.warn("No active lock found during release", {
        component: LOG_COMPONENT,
      });
      return;
    }

    if (selectResult.trace_id !== trace_id) {
      logger.warn(
        `Lock owned by ${selectResult.trace_id}, cannot release with ${trace_id}`,
        {
          component: LOG_COMPONENT,
          owned_by: selectResult.trace_id,
          requested_by: trace_id,
        },
      );
      return;
    }

    logger.info(`Lock released for trace ${trace_id}`, {
      component: LOG_COMPONENT,
      trace_id,
    });
  } catch (error) {
    logger.error("Failed to release lock", {
      component: LOG_COMPONENT,
      error: error instanceof Error ? error.message : String(error),
    });
    // Don't throw — lock will be treated as expired
  }
}

/**
 * Extend via D1 atomic check-and-update. Throws non-retryable
 * ConcurrencyError when the lock is missing or owned by another trace.
 */
export async function extendLockViaD1(
  env: Env,
  trace_id: string,
  additionalSeconds: number,
): Promise<void> {
  try {
    const now = new Date();
    const newExpiresAt = new Date(now.getTime() + additionalSeconds * 1000);

    const batchResults = await env.DEALS_DB.batch([
      env.DEALS_DB.prepare(
        `SELECT trace_id, expires_at FROM pipeline_locks WHERE lock_name = ?1`,
      ).bind(LOCK_NAME),
      env.DEALS_DB.prepare(
        `UPDATE pipeline_locks
         SET expires_at = ?2
         WHERE lock_name = ?1 AND trace_id = ?3`,
      ).bind(LOCK_NAME, newExpiresAt.toISOString(), trace_id),
    ]);

    const selectResult = batchResults[0]?.results?.[0] as
      { trace_id: string; expires_at: string } | undefined;

    if (!selectResult || selectResult.trace_id !== trace_id) {
      throw new PipelineError(
        "ConcurrencyError",
        "Cannot extend lock - not owned by current trace",
        "init",
        false,
      );
    }

    const updateMeta = batchResults[1]?.meta;
    if ((updateMeta?.changes ?? 0) === 0) {
      throw new PipelineError(
        "ConcurrencyError",
        "Cannot extend lock - update failed",
        "init",
        false,
      );
    }
  } catch (error) {
    if (error instanceof PipelineError) {
      throw error;
    }
    throw new PipelineError(
      "ConcurrencyError",
      `Lock extension failed: ${toError(error).message}`,
      "init",
      true,
    );
  }
}

/**
 * Get current lock status via D1. Returns unlocked on any read failure.
 */
export async function getLockStatusViaD1(env: Env): Promise<{
  locked: boolean;
  run_id?: string;
  trace_id?: string;
  expires_at?: string;
}> {
  try {
    const result = await env.DEALS_DB.prepare(
      `SELECT run_id, trace_id, expires_at FROM pipeline_locks WHERE lock_name = ?1`,
    )
      .bind(LOCK_NAME)
      .first<{
        run_id: string;
        trace_id: string;
        expires_at: string;
      }>();

    if (!result) {
      return { locked: false };
    }

    const expiresAt = new Date(result.expires_at);
    const now = new Date();

    if (expiresAt <= now) {
      return { locked: false };
    }

    return {
      locked: true,
      run_id: result.run_id,
      trace_id: result.trace_id,
      expires_at: result.expires_at,
    };
  } catch {
    return { locked: false };
  }
}
