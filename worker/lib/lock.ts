import { CONFIG } from "../config";
import { PipelineError, ErrorClass } from "../types";
import type { Env } from "../types";

// ============================================================================
// Distributed Lock Implementation
// ============================================================================

const LOCK_KEY = "pipeline:lock";

interface LockData {
  run_id: string;
  trace_id: string;
  acquired_at: string;
  expires_at: string;
}

/**
 * Acquire distributed lock for pipeline execution
 * Uses KV with TTL for automatic expiration
 */
export async function acquireLock(
  env: Env,
  run_id: string,
  trace_id: string,
): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CONFIG.LOCK_TTL_SECONDS * 1000);

  const lockData: LockData = {
    run_id,
    trace_id,
    acquired_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  };

  try {
    // Check existing lock
    const existing = await env.DEALS_LOCK.get<LockData>(LOCK_KEY, "json");

    if (existing) {
      const expiresAtExisting = new Date(existing.expires_at);
      const now = new Date();

      // Lock is still valid
      if (expiresAtExisting > now) {
        throw new PipelineError(
          "ConcurrencyError",
          `Lock held by run ${existing.run_id} until ${existing.expires_at}`,
          "init",
          false,
        );
      }

      // Lock expired, we can take over (log warning)
      console.warn(
        `Lock expired for run ${existing.run_id}, taking over with ${run_id}`,
      );
    }

    // Acquire new lock
    await env.DEALS_LOCK.put(LOCK_KEY, JSON.stringify(lockData), {
      expirationTtl: CONFIG.LOCK_TTL_SECONDS,
    });

    // Verify lock was acquired
    const verify = await env.DEALS_LOCK.get<LockData>(LOCK_KEY, "json");
    if (!verify || verify.trace_id !== trace_id) {
      throw new PipelineError(
        "ConcurrencyError",
        "Failed to verify lock acquisition",
        "init",
        false,
      );
    }

    return true;
  } catch (error) {
    if (error instanceof PipelineError) {
      throw error;
    }
    throw new PipelineError(
      "ConcurrencyError",
      `Lock acquisition failed: ${(error as Error).message}`,
      "init",
      true,
    );
  }
}

/**
 * Release distributed lock
 */
export async function releaseLock(env: Env, trace_id: string): Promise<void> {
  try {
    const existing = await env.DEALS_LOCK.get<LockData>(LOCK_KEY, "json");

    if (!existing) {
      console.warn("No active lock found during release");
      return;
    }

    // Verify we're releasing our own lock
    if (existing.trace_id !== trace_id) {
      console.warn(
        `Lock owned by ${existing.trace_id}, cannot release with ${trace_id}`,
      );
      return;
    }

    await env.DEALS_LOCK.delete(LOCK_KEY);
  } catch (error) {
    console.error("Failed to release lock:", error);
    // Don't throw - lock will expire naturally
  }
}

/**
 * Extend lock TTL during long operations
 */
export async function extendLock(
  env: Env,
  trace_id: string,
  additionalSeconds: number = 300,
): Promise<void> {
  try {
    const existing = await env.DEALS_LOCK.get<LockData>(LOCK_KEY, "json");

    if (!existing || existing.trace_id !== trace_id) {
      throw new PipelineError(
        "ConcurrencyError",
        "Cannot extend lock - not owned by current trace",
        "init",
        false,
      );
    }

    const now = new Date();
    const newExpiresAt = new Date(now.getTime() + additionalSeconds * 1000);

    const lockData: LockData = {
      ...existing,
      expires_at: newExpiresAt.toISOString(),
    };

    await env.DEALS_LOCK.put(LOCK_KEY, JSON.stringify(lockData), {
      expirationTtl: additionalSeconds,
    });
  } catch (error) {
    if (error instanceof PipelineError) {
      throw error;
    }
    throw new PipelineError(
      "ConcurrencyError",
      `Lock extension failed: ${(error as Error).message}`,
      "init",
      true,
    );
  }
}

/**
 * Get current lock status
 */
export async function getLockStatus(env: Env): Promise<{
  locked: boolean;
  run_id?: string;
  trace_id?: string;
  expires_at?: string;
}> {
  try {
    const existing = await env.DEALS_LOCK.get<LockData>(LOCK_KEY, "json");

    if (!existing) {
      return { locked: false };
    }

    const expiresAt = new Date(existing.expires_at);
    const now = new Date();

    if (expiresAt <= now) {
      return { locked: false };
    }

    return {
      locked: true,
      run_id: existing.run_id,
      trace_id: existing.trace_id,
      expires_at: existing.expires_at,
    };
  } catch {
    return { locked: false };
  }
}
