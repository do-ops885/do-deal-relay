import {
  PipelinePhase,
  PipelineContext,
  FailurePath,
  PipelineError,
  ErrorClass,
} from "./types";
import { CONFIG } from "./config";
import { generateRunId, generateUUID } from "./lib/crypto";
import { acquireLock, releaseLock, extendLock } from "./lib/lock";
import { createLogBuilder, appendLog } from "./lib/logger";
import { discover } from "./pipeline/discover";
import { normalize } from "./pipeline/normalize";
import { deduplicate } from "./pipeline/dedupe";
import { validate, calculateValidationRatio } from "./pipeline/validate";
import { score, calculateSourceDiversity } from "./pipeline/score";
import { stage } from "./pipeline/stage";
import { publishSnapshot, rollbackSnapshot } from "./publish";
import { notify } from "./notify";
import { enforceGuardRails, runGuardRails } from "./lib/guard-rails";
import { runExpirationCheck } from "./lib/expiration-manager";
import type { Env } from "./types";

// ============================================================================
// State Machine Implementation
// ============================================================================

type StateHandler = (
  ctx: PipelineContext,
  env: Env,
) => Promise<PipelinePhase | FailurePath>;

interface StateMachine {
  current: PipelinePhase;
  handlers: Record<PipelinePhase, StateHandler>;
}

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
      currentPhase = PHASES[phaseIndex];

      // Log phase start
      const logBuilder = createLogBuilder(run_id, trace_id)
        .phase(currentPhase)
        .status("complete");

      try {
        // Extend lock for long operations
        if (["discover", "validate", "publish"].includes(currentPhase)) {
          await extendLock(env, trace_id, 300);
        }

        // Execute phase
        const result = await executePhase(currentPhase, ctx, env);

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
        const errorMessage = (error as Error).message;
        ctx.errors.push({ phase: currentPhase, error: error as Error });

        // Log error
        await appendLog(
          env,
          logBuilder
            .status("error")
            .error(
              (error as PipelineError).errorClass || "UnknownError",
              errorMessage,
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
          // Retry same phase with backoff
          await new Promise((r) => setTimeout(r, 1000 * ctx.retry_count));
          continue;
        }

        // Non-retryable or max retries reached
        await handleFailure("revert", ctx, env);
        return { success: false, phase: currentPhase, error: errorMessage };
      }
    }

    // Success
    return { success: true, phase: "finalize" };
  } catch (error) {
    const errorMessage = (error as Error).message;
    return { success: false, phase: currentPhase, error: errorMessage };
  } finally {
    // Always release lock
    await releaseLock(env, trace_id);
  }
}

/**
 * Execute a single phase
 */
async function executePhase(
  phase: PipelinePhase,
  ctx: PipelineContext,
  env: Env,
): Promise<PipelinePhase | FailurePath> {
  switch (phase) {
    case "init":
      return "discover";

    case "discover":
      const discovery = await discover(env, ctx);
      ctx.candidates = discovery.deals;

      // Guard rail: Check input resources
      if (ctx.candidates.length > 0) {
        try {
          await enforceGuardRails(ctx.candidates, "input");
        } catch (error) {
          await notify(env, {
            type: "system_error",
            severity: "critical",
            run_id: ctx.run_id,
            message: `Guard rail failed on discovery input: ${(error as Error).message}`,
          });
          return "revert";
        }
      }

      if (discovery.deals.length === 0) {
        return "finalize"; // No deals found, skip rest
      }
      return "normalize";

    case "normalize":
      ctx.normalized = normalize(ctx.candidates, ctx);
      return "dedupe";

    case "dedupe":
      const dedupeResult = deduplicate(ctx.normalized, ctx);
      ctx.deduped = dedupeResult.unique;
      if (ctx.deduped.length === 0) {
        return "finalize"; // No unique deals
      }
      return "validate";

    case "validate":
      const validation = await validate(ctx.deduped, ctx, env);
      ctx.validated = validation.valid;

      // Log validation stats
      await appendLog(
        env,
        createLogBuilder(ctx.run_id, ctx.trace_id)
          .phase("validate")
          .status(validation.stats.valid > 0 ? "complete" : "incomplete")
          .counts({
            candidate: validation.stats.total,
            valid: validation.stats.valid,
            rejected: validation.stats.invalid,
          })
          .reasons(Object.keys(validation.stats.by_gate))
          .build(),
      );

      if (ctx.validated.length === 0) {
        return "revert"; // No valid deals
      }
      return "score";

    case "score":
      const scoring = await score(ctx.validated, ctx, env);
      ctx.scored = scoring.deals;

      // Log scoring stats
      await appendLog(
        env,
        createLogBuilder(ctx.run_id, ctx.trace_id)
          .phase("score")
          .status("complete")
          .scores({
            confidence: scoring.stats.avg_confidence,
          })
          .build(),
      );

      return "stage";

    case "stage":
      const stageResult = await stage(ctx.scored, ctx, env);
      ctx.snapshot = stageResult.snapshot;

      if (!stageResult.verified) {
        return "revert";
      }
      return "publish";

    case "publish":
      try {
        // Guard rail: Check output quality before publishing
        if (ctx.scored.length > 0) {
          const guardRailReport = await runGuardRails(ctx.scored, "output");

          if (!guardRailReport.allPassed) {
            await notify(env, {
              type: "checks_failed",
              severity: "critical",
              run_id: ctx.run_id,
              message: `Guard rails blocked publish: ${guardRailReport.fatalErrors.join("; ")}`,
              context: {
                checks: guardRailReport.checks,
                warnings: guardRailReport.warnings,
              },
            });
            return "revert";
          }

          // Log warnings if any
          if (guardRailReport.warnings.length > 0) {
            await appendLog(
              env,
              createLogBuilder(ctx.run_id, ctx.trace_id)
                .phase("publish")
                .status("complete")
                .build(),
            );
          }
        }

        await publishSnapshot(env, ctx.snapshot!, ctx);
        return "verify";
      } catch (error) {
        return "revert";
      }

    case "verify":
      // Verification happens in publish
      return "finalize";

    case "finalize":
      // Run expiration check
      if (ctx.snapshot) {
        const expiryResult = await runExpirationCheck(
          env,
          ctx.snapshot.deals,
          ctx.previous_snapshot?.deals,
          ctx.run_id,
        );

        if (expiryResult.errors.length > 0) {
          console.warn("Expiration check errors:", expiryResult.errors);
        }
      }

      // Send success notification if needed
      await notify(env, {
        type: "pipeline_complete",
        severity: "info",
        run_id: ctx.run_id,
        message: `Pipeline completed successfully. ${ctx.scored.length} deals published.`,
      });
      return "finalize";

    default:
      throw new Error(`Unknown phase: ${phase}`);
  }
}

/**
 * Handle failure path
 */
async function handleFailure(
  path: FailurePath,
  ctx: PipelineContext,
  env: Env,
): Promise<void> {
  switch (path) {
    case "revert":
      if (ctx.previous_snapshot) {
        const { revertProduction } = await import("./lib/storage");
        await revertProduction(env, ctx.previous_snapshot);
      }
      await notify(env, {
        type: "publish_incomplete",
        severity: "critical",
        run_id: ctx.run_id,
        message: `Pipeline failed at ${ctx.errors[ctx.errors.length - 1]?.phase || "unknown"}. Rolled back.`,
        context: {
          errors: ctx.errors.map((e) => ({
            phase: e.phase,
            message: e.error.message,
          })),
        },
      });
      break;

    case "quarantine":
      // Quarantine deals are already marked
      await notify(env, {
        type: "trust_anomaly",
        severity: "warning",
        run_id: ctx.run_id,
        message: "Deals quarantined due to anomalies",
      });
      break;

    case "concurrency_abort":
      await notify(env, {
        type: "system_error",
        severity: "warning",
        run_id: ctx.run_id,
        message: "Pipeline aborted due to concurrent execution",
      });
      break;

    default:
      break;
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

  const lockStatus = await getLockStatus(env);
  const lastRun = await getLastRunMetadata(env);

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
