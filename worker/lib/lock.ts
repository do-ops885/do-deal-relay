import { CONFIG } from "../config";
import { PipelineError } from "../types";
import type { Env } from "../types";
import { toError } from "./sanitize-error";
import { logger } from "./global-logger";

// ============================================================================
// Distributed Lock — PipelineLock DO primary, D1 CAS fallback (ADR-022)
// ============================================================================
// The PipelineLock Durable Object is the PRIMARY path for all lock
// operations; its actor semantics give one global serialization point with
// SQLite atomic CAS. The D1 CAS below remains as an AUTOMATIC fallback when:
//   1. The PIPELINE_LOCK binding is absent from env, or
//   2. A PipelineLock RPC rejects (infrastructure error), or
//   3. An RPC exceeds PIPELINE_LOCK_RPC_TIMEOUT_MS.
// Contention is NOT a fallback trigger: a definitive DO answer (acquire →
// false / extend → false) is final — no D1 round-trip is attempted. Callers
// see identical return shapes and TTL semantics on both paths.
// ============================================================================

const LOCK_NAME = "pipeline:lock";

/** Singleton Durable Object name resolved via namespace.idFromName(). */
const PIPELINE_LOCK_DO_NAME = "pipeline";

/** Max wall-clock wait on any PipelineLock RPC before falling back to D1. */
const PIPELINE_LOCK_RPC_TIMEOUT_MS = 1000;

/** Default extension window in seconds (unchanged from prior behavior). */
const DEFAULT_LOCK_EXTENSION_SECONDS = 300;

/** Log component tag shared by both lock paths. */
const LOG_COMPONENT = "lock";

interface LockData {
  run_id: string;
  trace_id: string;
  acquired_at: string;
  expires_at: string;
}

/** Status payload returned by the PipelineLock getLockStatus() RPC. */
interface PipelineLockDoStatus {
  locked: boolean;
  run_id?: string;
  trace_id?: string;
  acquired_at?: number;
  expires_at?: number;
}

/**
 * Minimal RPC surface of the PipelineLock Durable Object consumed here.
 * Kept local so this module stays decoupled from the DO class type.
 */
interface PipelineLockStub {
  acquireLock(run_id: string, trace_id: string, ttl?: number): Promise<boolean>;
  extendLock(trace_id: string, additional_seconds: number): Promise<boolean>;
  releaseLock(trace_id: string): Promise<void>;
  getLockStatus(): Promise<PipelineLockDoStatus>;
}

// ============================================================================
// DO adapter helpers
// ============================================================================

/**
 * Resolve a PipelineLock stub from the binding, or undefined when the
 * binding is unavailable (deploy surfaces without the DO configured).
 */
function getPipelineLockStub(env: Env): PipelineLockStub | undefined {
  const namespace = env.PIPELINE_LOCK;
  if (!namespace) {
    return undefined;
  }
  const objectId = namespace.idFromName(PIPELINE_LOCK_DO_NAME);
  return namespace.get(objectId) as unknown as PipelineLockStub;
}

/**
 * Reject if the operation does not settle within PIPELINE_LOCK_RPC_TIMEOUT_MS,
 * converting slow DO calls into ordinary fallback triggers.
 */
function raceWithTimeout<T>(operation: Promise<T>): Promise<T> {
  let timerId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      reject(
        new Error(
          `PipelineLock RPC timed out after ${PIPELINE_LOCK_RPC_TIMEOUT_MS}ms`,
        ),
      );
    }, PIPELINE_LOCK_RPC_TIMEOUT_MS);
  });
  // Whichever side loses the race must not surface unhandled rejections.
  timeout.catch(() => undefined);
  operation.catch(() => undefined);
  return Promise.race([operation, timeout]).finally(() => {
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }
  });
}

function logFallback(stage: string, error: unknown): void {
  logger.warn("PipelineLock DO unavailable — falling back to D1 CAS", {
    component: LOG_COMPONENT,
    stage,
    error: error instanceof Error ? error.message : String(error),
  });
}

/** Raise the same ConcurrencyError shape the D1 CAS path produces. */
async function throwDoContention(stub: PipelineLockStub): Promise<never> {
  try {
    const status = await raceWithTimeout(stub.getLockStatus());
    const holder = status.run_id ?? "unknown";
    const until =
      status.expires_at !== undefined
        ? new Date(status.expires_at).toISOString()
        : "unknown";
    throw new PipelineError(
      "ConcurrencyError",
      `Lock held by run ${holder} until ${until}`,
      "init",
      false,
    );
  } catch (error) {
    if (error instanceof PipelineError) {
      throw error;
    }
    throw new PipelineError(
      "ConcurrencyError",
      "Lock held by another pipeline run",
      "init",
      false,
    );
  }
}

// ============================================================================
// Public API — DO primary with automatic D1 fallback
// ============================================================================

/** Acquire the pipeline lock: DO atomic CAS first, D1 CAS on fallback. */
export async function acquireLock(
  env: Env,
  run_id: string,
  trace_id: string,
): Promise<boolean> {
  const stub = getPipelineLockStub(env);
  if (stub) {
    try {
      const acquired = await raceWithTimeout(
        stub.acquireLock(run_id, trace_id, CONFIG.LOCK_TTL_SECONDS),
      );
      if (acquired) {
        logger.info(`Lock acquired for run ${run_id}`, {
          component: LOG_COMPONENT,
          run_id,
          trace_id,
          method: "durable-object",
        });
        return true;
      }
      await throwDoContention(stub);
    } catch (error) {
      if (error instanceof PipelineError) {
        throw error;
      }
      logFallback("acquire", error);
    }
  }
  return acquireLockViaD1(env, run_id, trace_id);
}

/** Release the lock if owned by trace_id; safe to repeat; falls back to D1. */
export async function releaseLock(env: Env, trace_id: string): Promise<void> {
  const stub = getPipelineLockStub(env);
  if (stub) {
    try {
      await raceWithTimeout(stub.releaseLock(trace_id));
      logger.info(`Lock released for trace ${trace_id}`, {
        component: LOG_COMPONENT,
        trace_id,
        method: "durable-object",
      });
      return;
    } catch (error) {
      logFallback("release", error);
    }
  }
  return releaseLockViaD1(env, trace_id);
}

/**
 * Extend lock TTL during long operations. Only the owner can extend.
 * A definitive DO ownership rejection (false) throws the same
 * non-retryable ConcurrencyError as the D1 path without falling back.
 */
export async function extendLock(
  env: Env,
  trace_id: string,
  additionalSeconds: number = DEFAULT_LOCK_EXTENSION_SECONDS,
): Promise<void> {
  const stub = getPipelineLockStub(env);
  if (stub) {
    try {
      const extended = await raceWithTimeout(
        stub.extendLock(trace_id, additionalSeconds),
      );
      if (!extended) {
        throw new PipelineError(
          "ConcurrencyError",
          "Cannot extend lock - not owned by current trace",
          "init",
          false,
        );
      }
      return;
    } catch (error) {
      if (error instanceof PipelineError) {
        throw error;
      }
      logFallback("extend", error);
    }
  }
  return extendLockViaD1(env, trace_id, additionalSeconds);
}

/**
 * Get current lock status. The DO returns epoch milliseconds; they are
 * mapped to ISO strings so callers see one shape on both paths.
 */
export async function getLockStatus(env: Env): Promise<{
  locked: boolean;
  run_id?: string;
  trace_id?: string;
  expires_at?: string;
}> {
  const stub = getPipelineLockStub(env);
  if (stub) {
    try {
      const status = await raceWithTimeout(stub.getLockStatus());
      if (!status.locked || status.expires_at === undefined) {
        return { locked: false };
      }
      return {
        locked: true,
        run_id: status.run_id,
        trace_id: status.trace_id,
        expires_at: new Date(status.expires_at).toISOString(),
      };
    } catch (error) {
      logFallback("status", error);
    }
  }
  return getLockStatusViaD1(env);
}

// ============================================================================
// D1 CAS fallback implementations (semantics unchanged)
// ============================================================================

/** Acquire via D1 compare-and-swap (atomic INSERT OR REPLACE + expiry check). */
async function acquireLockViaD1(
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
async function releaseLockViaD1(env: Env, trace_id: string): Promise<void> {
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
async function extendLockViaD1(
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
async function getLockStatusViaD1(env: Env): Promise<{
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
