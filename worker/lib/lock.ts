import { CONFIG } from "../config";
import { PipelineError } from "../types";
import type { Env } from "../types";
import { logger } from "./global-logger";
import {
  LOG_COMPONENT,
  acquireLockViaD1,
  extendLockViaD1,
  getLockStatusViaD1,
  releaseLockViaD1,
} from "./lock-d1";

// ============================================================================
// Distributed Lock — PipelineLock DO primary, D1 CAS fallback (ADR-022)
// ============================================================================
// The PipelineLock Durable Object is the PRIMARY path for all lock
// operations; its actor semantics give one global serialization point with
// SQLite atomic CAS. The D1 CAS (see lock-d1.ts) remains as an AUTOMATIC
// fallback when:
//   1. The PIPELINE_LOCK binding is absent from env, or
//   2. A PipelineLock RPC rejects (infrastructure error), or
//   3. An RPC exceeds PIPELINE_LOCK_RPC_TIMEOUT_MS.
// Contention is NOT a fallback trigger: a definitive DO answer (acquire →
// false / extend → false) is final — no D1 round-trip is attempted. Callers
// see identical return shapes and TTL semantics on both paths.
// ============================================================================

/** Singleton Durable Object name resolved via namespace.idFromName(). */
const PIPELINE_LOCK_DO_NAME = "pipeline";

/** Max wall-clock wait on any PipelineLock RPC before falling back to D1. */
const PIPELINE_LOCK_RPC_TIMEOUT_MS = 1000;

/** Default extension window in seconds (unchanged from prior behavior). */
const DEFAULT_LOCK_EXTENSION_SECONDS = 300;

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
