import type {
  Env,
  FailurePath,
  PipelineContext,
  PipelineMetrics,
  PipelinePhase,
} from "../types";
import { CONFIG } from "../config";
import { PipelineError } from "../types";
import { extendLock } from "../lib/lock";
import { executePhase } from "../pipeline-executor";
import {
  recordPhaseTiming,
  recordError,
  recordRetry,
} from "../lib/metrics/index";
import { toError } from "../lib/sanitize-error";

// Phase-runner shared by the PipelineWorkflow steps. Mirrors the
// state-machine.ts per-phase policy (lock extend, timings, bounded
// retry); the workflow adds KV handoffs and engine retries around it.

const LONG_PHASES: PipelinePhase[] = ["discover", "validate", "publish"];

/** Serializable error trail: strings only, never Error objects. */
export interface PhaseErrorSummary {
  phase: string;
  message: string;
}

/** Durable run state carried through step returns (plain data only). */
export interface WorkflowRunState {
  trace_id: string;
  start_time: number;
  metrics: PipelineMetrics;
  errors: PhaseErrorSummary[];
  retry_count: number;
}

/**
 * Narrow a phase-step outcome to a failure path. Unexpected phase names
 * (which the legacy loop would silently step over) fail closed to
 * "revert" instead.
 */
export function toFailurePath(next: PipelinePhase | FailurePath): FailurePath {
  if (
    next === "revert" ||
    next === "quarantine" ||
    next === "concurrency_abort" ||
    next === "retry" ||
    next === "skipped_locked"
  ) {
    return next;
  }
  return "revert";
}

function emptyArrays(): Pick<
  PipelineContext,
  "candidates" | "normalized" | "deduped" | "validated" | "scored"
> {
  return {
    candidates: [],
    normalized: [],
    deduped: [],
    validated: [],
    scored: [],
  };
}

export function buildPhaseContext(
  run_id: string,
  state: WorkflowRunState,
  arrays: Partial<
    Pick<
      PipelineContext,
      | "candidates"
      | "normalized"
      | "deduped"
      | "validated"
      | "scored"
      | "snapshot"
    >
  >,
): PipelineContext {
  return {
    run_id,
    trace_id: state.trace_id,
    start_time: state.start_time,
    ...emptyArrays(),
    ...arrays,
    metrics: state.metrics,
    errors: state.errors.map((e) => ({
      phase: e.phase,
      error: new Error(e.message),
    })),
    retry_count: state.retry_count,
  };
}

/**
 * Run one phase with the legacy state-machine policy: lock extension for
 * long phases, timing metrics, bounded retry for retryable PipelineError
 * with linear backoff, error recording. Returns the next phase or a
 * failure path (never throws for phase faults; infrastructure faults
 * propagate to engine-level step retries).
 */
export async function runPhaseWithRetry(
  env: Env,
  phase: PipelinePhase,
  ctx: PipelineContext,
  state: WorkflowRunState,
): Promise<{ next: PipelinePhase | FailurePath; state: WorkflowRunState }> {
  let retry_count = state.retry_count;
  let metrics = state.metrics;
  const errors = [...state.errors];
  for (;;) {
    if (LONG_PHASES.includes(phase)) {
      await extendLock(env, ctx.trace_id, 300);
    }
    const phaseStartTime = Date.now();
    try {
      const next = await executePhase(phase, ctx, env);
      if (ctx.metrics) {
        recordPhaseTiming(
          ctx.metrics,
          phase,
          Date.now() - phaseStartTime,
          "success",
        );
      }
      metrics = ctx.metrics ?? metrics;
      return { next, state: { ...state, metrics, errors, retry_count } };
    } catch (error) {
      if (ctx.metrics) {
        recordPhaseTiming(
          ctx.metrics,
          phase,
          Date.now() - phaseStartTime,
          "failure",
        );
        recordError(ctx.metrics);
      }
      metrics = ctx.metrics ?? metrics;
      const err = toError(error);
      const retryable =
        error instanceof PipelineError &&
        error.retryable &&
        retry_count < CONFIG.MAX_RETRIES;
      if (retryable) {
        retry_count++;
        if (ctx.metrics) recordRetry(ctx.metrics);
        metrics = ctx.metrics ?? metrics;
        await new Promise((r) => setTimeout(r, 1000 * retry_count));
        ctx.retry_count = retry_count;
        continue;
      }
      errors.push({ phase, message: err.message });
      return {
        next: "revert",
        state: { ...state, metrics, errors, retry_count },
      };
    }
  }
}
