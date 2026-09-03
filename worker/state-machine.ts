import {
  PipelinePhase,
  PipelineContext,
  FailurePath,
  PipelineError,
} from "./types";
import { CONFIG } from "./config";
import { generateRunId, generateUUID } from "./lib/crypto";
import { acquireLock, releaseLock, extendLock } from "./lib/lock";
import { createLogBuilder, appendLog } from "./lib/logger";
import { toError } from "./lib/sanitize-error";
import { executePhase, handleFailure } from "./pipeline-executor";
import type { Env } from "./types";

// ============================================================================
// State Machine Implementation
// ============================================================================

const PHASES: PipelinePhase[] = [
  "init",
  "discover",
  "normalize",
  "dedupe",
  "validate",
  "score",
  "stage",
  "publish",
  "verify",
  "finalize",
];

import {
  createMetrics,
  recordPhaseTiming,
  recordError,
  recordRetry,
  finalizeMetrics,
  storeMetrics,
} from "./lib/metrics/index";

/**
 * Execute full pipeline
 */
export async function executePipeline(env: Env): Promise<{
  success: boolean;
  phase: string;
  error?: string;
}> {
  const startTime = Date.now();
  const run_id = generateRunId();
  const trace_id = generateUUID();

  const ctx: PipelineContext = {
    run_id,
    trace_id,
    start_time: startTime,
    candidates: [],
    normalized: [],
    deduped: [],
    validated: [],
    scored: [],
    metrics: createMetrics(run_id),
    errors: [],
    retry_count: 0,
  };

  let currentPhase: PipelinePhase = "init";
  let phaseIndex = 0;

  try {
    // Acquire lock
    await acquireLock(env, run_id, trace_id);

    // Execute phases
    while (phaseIndex < PHASES.length) {
      const p = PHASES[phaseIndex];
      if (!p) break;
      currentPhase = p;

      // Log phase start
      const logBuilder = createLogBuilder(run_id, trace_id)
        .phase(currentPhase)
        .status("complete");

      try {
        // Extend lock for long operations
        if (["discover", "validate", "publish"].includes(currentPhase)) {
          await extendLock(env, trace_id, 300);
        }

        // Execute phase and instrument duration (discovery, validation, publish etc)
        const phaseStartTime = Date.now();
        let result: PipelinePhase | FailurePath;
        try {
          result = await executePhase(currentPhase, ctx, env);
          const phaseDuration = Date.now() - phaseStartTime;

          // Record metrics for per-stage latency tracking
          if (ctx.metrics) {
            recordPhaseTiming(
              ctx.metrics,
              currentPhase,
              phaseDuration,
              "success",
            );
          }
        } catch (error) {
          const phaseDuration = Date.now() - phaseStartTime;
          if (ctx.metrics) {
            recordPhaseTiming(
              ctx.metrics,
              currentPhase,
              phaseDuration,
              "failure",
            );
          }
          throw error;
        }

        if (result === "finalize") {
          // Success path
          await appendLog(
            env,
            logBuilder
              .duration(Date.now() - startTime)
              .versions(CONFIG.VERSION, CONFIG.SCHEMA_VERSION)
              .notify(false)
              .build(),
          );
          break;
        } else if (
          result === "revert" ||
          result === "quarantine" ||
          result === "concurrency_abort"
        ) {
          // Failure path
          await handleFailure(result, ctx, env);
          return { success: false, phase: currentPhase, error: result };
        }

        // Continue to next phase
        phaseIndex++;
      } catch (error) {
        if (ctx.metrics) recordError(ctx.metrics);
        const err = toError(error);
        ctx.errors.push({ phase: currentPhase, error: err });

        // Log error
        await appendLog(
          env,
          logBuilder
            .status("error")
            .error(
              (error as PipelineError).errorClass || "UnknownError",
              err.message,
            )
            .duration(Date.now() - startTime)
            .build(),
        );

        // Check if retryable
        if (
          error instanceof PipelineError &&
          error.retryable &&
          ctx.retry_count < CONFIG.MAX_RETRIES
        ) {
          ctx.retry_count++;
          if (ctx.metrics) recordRetry(ctx.metrics);
          // Retry same phase with backoff
          await new Promise((r) => setTimeout(r, 1000 * ctx.retry_count));
          continue;
        }

        // Non-retryable or max retries reached
        if (ctx.metrics) {
          finalizeMetrics(ctx.metrics, false, currentPhase);
          await storeMetrics(env, ctx.metrics);
        }
        await handleFailure("revert", ctx, env);
        return { success: false, phase: currentPhase, error: err.message };
      }
    }

    // Finalize metrics
    if (ctx.metrics) {
      finalizeMetrics(ctx.metrics, true, "finalize");
      await storeMetrics(env, ctx.metrics);
    }

    // Success
    return { success: true, phase: "finalize" };
  } catch (error) {
    const err = toError(error);
    return { success: false, phase: currentPhase, error: err.message };
  } finally {
    // Always release lock
    await releaseLock(env, trace_id);
  }
}

/**
 * Get current pipeline status
 */
export async function getPipelineStatus(env: Env): Promise<{
  locked: boolean;
  current_run?: string;
  last_run?: {
    run_id: string;
    timestamp: string;
    success: boolean;
  };
}> {
  const { getLockStatus } = await import("./lib/lock");
  const { getLastRunMetadata } = await import("./lib/storage");

  // Optimization: Parallelize lock status and metadata retrieval
  const [lockStatus, lastRun] = await Promise.all([
    getLockStatus(env),
    getLastRunMetadata(env),
  ]);

  return {
    locked: lockStatus.locked,
    current_run: lockStatus.locked ? lockStatus.run_id : undefined,
    last_run: lastRun
      ? {
          run_id: lastRun.run_id,
          timestamp: lastRun.timestamp,
          success: true, // Assume success if recorded
        }
      : undefined,
  };
}
