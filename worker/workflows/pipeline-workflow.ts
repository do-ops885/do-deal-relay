import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import type { Env, FailurePath, PipelinePhase } from "../types";
import type { PipelineWorkflowParams } from "../types/api";
import { generateUUID } from "../lib/crypto";
import { acquireLock, releaseLock } from "../lib/lock";
import { handleFailure } from "../pipeline-executor";
import {
  createMetrics,
  finalizeMetrics,
  storeMetrics,
} from "../lib/metrics/index";
import { getStagingSnapshot } from "../lib/storage";
import { notify } from "../notify";
import { toError } from "../lib/sanitize-error";
import { logger } from "../lib/global-logger";
import { clearHandoffs, getHandoff, putHandoff } from "./pipeline-handoff";
import {
  buildPhaseContext,
  runPhaseWithRetry,
  toFailurePath,
  type WorkflowRunState,
} from "./pipeline-phase-run";

// ============================================================================
// ADR-018 wave 4: production pipeline as a durable Cloudflare Workflow.
// One durable step per phase group (official Rules of Workflows: never
// encapsulate the whole run in a single step). Top-level state is step
// returns plus KV handoff keys — deal arrays never travel in step
// returns because the 500-deal production budget risks the 1MiB cap.
// The legacy state-machine.ts policy (lock extend, timings, bounded
// retry, failure paths) is mirrored step by step; shared phase bodies
// (executePhase/handleFailure) are reused, never duplicated.
// ============================================================================

export interface InitStepResult extends WorkflowRunState {
  acquired: boolean;
  error?: string;
}

export interface PhaseStepResult extends WorkflowRunState {
  next: PipelinePhase | FailurePath;
  counts: Record<string, number>;
}

export interface PipelineRunResult {
  success: boolean;
  phase: string;
  error?: string;
}

/**
 * Deterministic durable step name. Run id is sanitized so names stay
 * stable cache keys (Rules of Workflows: no Date.now/random in names).
 */
export function pipelineStepName(step: string, run_id: string): string {
  const safeRunId = run_id.replace(/[^a-zA-Z0-9-]/g, "-");
  return `wf-${step}-${safeRunId}`;
}

export class PipelineWorkflow extends WorkflowEntrypoint<
  Env,
  PipelineWorkflowParams
> {
  async run(
    event: WorkflowEvent<PipelineWorkflowParams>,
    step: WorkflowStep,
  ): Promise<PipelineRunResult> {
    const run_id = event.payload.run_id;

    const init = await step.do(
      pipelineStepName("init", run_id),
      async (): Promise<InitStepResult> => {
        const trace_id = generateUUID();
        const start_time = Date.now();
        const metrics = createMetrics(run_id);
        const base: WorkflowRunState = {
          trace_id,
          start_time,
          metrics,
          errors: [],
          retry_count: 0,
        };
        try {
          await acquireLock(this.env, run_id, trace_id);
          return { ...base, acquired: true };
        } catch (error) {
          const err = toError(error);
          return { ...base, acquired: false, error: err.message };
        }
      },
    );

    if (!init.acquired) {
      // Legacy parity: lock contention fails the run and notifies critical
      // (scheduled() did this for direct-path failures).
      await step.do(
        pipelineStepName("failure", run_id),
        async (): Promise<{ notified: boolean }> => {
          await notify(this.env, {
            type: "system_error",
            severity: "critical",
            run_id,
            message: `Pipeline failed at init: ${init.error ?? "lock contention"}`,
            context: { phase: "init", error: init.error ?? "lock contention" },
          });
          return { notified: true };
        },
      );
      return {
        success: false,
        phase: "init",
        error: init.error ?? "lock contention",
      };
    }

    let state: WorkflowRunState = init;
    try {
      // Discover + normalize + dedupe ride one step: normalize/dedupe are
      // pure CPU over the fetched candidates (no external calls).
      const discover = await step.do(
        pipelineStepName("discover", run_id),
        async (): Promise<PhaseStepResult> => {
          const ctx = buildPhaseContext(run_id, state, {});
          let current: PhaseStepResult = {
            ...state,
            next: "discover",
            counts: {},
          };
          for (const phase of ["discover", "normalize", "dedupe"] as const) {
            const outcome = await runPhaseWithRetry(this.env, phase, ctx, {
              ...state,
              metrics: current.metrics,
              errors: current.errors,
              retry_count: current.retry_count,
            });
            current = {
              ...outcome.state,
              next: outcome.next,
              counts: { ...current.counts, [phase]: ctx.candidates.length },
            };
            if (
              outcome.next !== "normalize" &&
              outcome.next !== "dedupe" &&
              outcome.next !== "validate"
            ) {
              break;
            }
            ctx.retry_count = outcome.state.retry_count;
          }
          if (current.next === "validate") {
            await putHandoff(this.env, run_id, "deduped", ctx.deduped);
            current.counts["deduped"] = ctx.deduped.length;
          }
          return current;
        },
      );
      state = discover;
      if (discover.next !== "validate" && discover.next !== "finalize") {
        return await this.failRun(step, run_id, state, discover.next);
      }
      if (discover.next === "finalize") {
        return await this.finishRun(step, run_id, state, true, "finalize");
      }

      const validate = await step.do(
        pipelineStepName("validate", run_id),
        async (): Promise<PhaseStepResult> => {
          const deduped = await getHandoff(this.env, run_id, "deduped");
          const ctx = buildPhaseContext(run_id, state, {
            deduped,
            normalized: deduped,
            candidates: deduped,
          });
          const outcome = await runPhaseWithRetry(
            this.env,
            "validate",
            ctx,
            state,
          );
          const result: PhaseStepResult = {
            ...outcome.state,
            next: outcome.next,
            counts: { validated: ctx.validated.length },
          };
          if (outcome.next === "score") {
            await putHandoff(this.env, run_id, "validated", ctx.validated);
          }
          return result;
        },
      );
      state = validate;
      if (validate.next !== "score") {
        return await this.failRun(step, run_id, state, validate.next);
      }

      const score = await step.do(
        pipelineStepName("score", run_id),
        async (): Promise<PhaseStepResult> => {
          const validated = await getHandoff(this.env, run_id, "validated");
          const ctx = buildPhaseContext(run_id, state, {
            validated,
            deduped: validated,
          });
          const outcome = await runPhaseWithRetry(
            this.env,
            "score",
            ctx,
            state,
          );
          const result: PhaseStepResult = {
            ...outcome.state,
            next: outcome.next,
            counts: { scored: ctx.scored.length },
          };
          if (outcome.next === "stage") {
            await putHandoff(this.env, run_id, "scored", ctx.scored);
          }
          return result;
        },
      );
      state = score;
      if (score.next !== "stage") {
        return await this.failRun(step, run_id, state, score.next);
      }

      const stage = await step.do(
        pipelineStepName("stage", run_id),
        async (): Promise<PhaseStepResult> => {
          const scored = await getHandoff(this.env, run_id, "scored");
          const ctx = buildPhaseContext(run_id, state, { scored });
          const outcome = await runPhaseWithRetry(
            this.env,
            "stage",
            ctx,
            state,
          );
          return { ...outcome.state, next: outcome.next, counts: {} };
        },
      );
      state = stage;
      if (stage.next !== "publish") {
        return await this.failRun(step, run_id, state, stage.next);
      }

      const publish = await step.do(
        pipelineStepName("publish", run_id),
        async (): Promise<PhaseStepResult> => {
          const scored = await getHandoff(this.env, run_id, "scored");
          const snapshot = await getStagingSnapshot(this.env);
          const ctx = buildPhaseContext(run_id, state, {
            scored,
            ...(snapshot ? { snapshot } : {}),
          });
          const outcome = await runPhaseWithRetry(
            this.env,
            "publish",
            ctx,
            state,
          );
          return { ...outcome.state, next: outcome.next, counts: {} };
        },
      );
      state = publish;
      if (publish.next !== "verify") {
        return await this.failRun(step, run_id, state, publish.next);
      }

      // Verify is trivial and finalize notifies completion; one step.
      const finalize = await step.do(
        pipelineStepName("finalize", run_id),
        async (): Promise<PhaseStepResult> => {
          const scored = await getHandoff(this.env, run_id, "scored");
          const ctx = buildPhaseContext(run_id, state, { scored });
          const verifyOutcome = await runPhaseWithRetry(
            this.env,
            "verify",
            ctx,
            state,
          );
          if (verifyOutcome.next !== "finalize") {
            return {
              ...verifyOutcome.state,
              next: verifyOutcome.next,
              counts: {},
            };
          }
          const finalOutcome = await runPhaseWithRetry(
            this.env,
            "finalize" as PipelinePhase,
            ctx,
            verifyOutcome.state,
          );
          return { ...finalOutcome.state, next: finalOutcome.next, counts: {} };
        },
      );
      state = finalize;
      if (finalize.next !== "finalize") {
        return await this.failRun(step, run_id, state, finalize.next);
      }
      return await this.finishRun(step, run_id, state, true, "finalize");
    } catch (error) {
      // Infrastructure fault past in-step policy: notify + release before
      // the instance can settle, mirroring the legacy outer catch.
      const err = toError(error);
      const failed: WorkflowRunState = {
        ...state,
        errors: [...state.errors, { phase: "unknown", message: err.message }],
      };
      await this.failRun(step, run_id, failed, "revert");
      return { success: false, phase: "unknown", error: err.message };
    }
  }

  private async failRun(
    step: WorkflowStep,
    run_id: string,
    state: WorkflowRunState,
    path: PipelinePhase | FailurePath,
  ): Promise<PipelineRunResult> {
    const failurePath = toFailurePath(path);
    const phase = state.errors[state.errors.length - 1]?.phase ?? "unknown";
    await step.do(
      pipelineStepName("failure", run_id),
      async (): Promise<{ handled: boolean }> => {
        const ctx = buildPhaseContext(run_id, state, {});
        await handleFailure(failurePath, ctx, this.env);
        return { handled: true };
      },
    );
    await this.releaseRun(step, run_id, state, false, phase);
    const message = state.errors[state.errors.length - 1]?.message;
    return {
      success: false,
      phase,
      ...(message !== undefined ? { error: message } : {}),
    };
  }

  private async finishRun(
    step: WorkflowStep,
    run_id: string,
    state: WorkflowRunState,
    success: boolean,
    phase: string,
  ): Promise<PipelineRunResult> {
    await this.releaseRun(step, run_id, state, success, phase);
    return success
      ? { success: true, phase: "finalize" }
      : { success: false, phase };
  }

  private async releaseRun(
    step: WorkflowStep,
    run_id: string,
    state: WorkflowRunState,
    success: boolean,
    phase: string,
  ): Promise<void> {
    await step.do(
      pipelineStepName("release", run_id),
      async (): Promise<{ released: boolean }> => {
        const metrics = state.metrics;
        finalizeMetrics(metrics, success, phase as PipelinePhase);
        try {
          await storeMetrics(this.env, metrics);
        } catch (error) {
          logger.warn("Workflow metrics store failed (non-critical)", {
            component: "pipeline-workflow",
            run_id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        try {
          await releaseLock(this.env, state.trace_id);
        } catch (error) {
          logger.warn("Workflow lock release failed (non-critical)", {
            component: "pipeline-workflow",
            run_id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        await clearHandoffs(this.env, run_id);
        return { released: true };
      },
    );
  }
}
