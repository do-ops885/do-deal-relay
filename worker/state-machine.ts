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
import { getProductionSnapshot } from "./lib/storage";
import {
  createLogBuilder,
  appendLog,
  createStructuredLogger,
  type Logger,
} from "./lib/logger";
import { discover } from "./pipeline/discover";
import { normalize } from "./pipeline/normalize";
import { deduplicate, calculateSourceDiversity } from "./pipeline/dedupe";
import { validate, calculateValidationRatio } from "./pipeline/validate";
import { score } from "./pipeline/score";
import { stage } from "./pipeline/stage";
import { publishSnapshot, rollbackSnapshot } from "./publish";
import { notify } from "./notify";
import { enforceGuardRails, runGuardRails } from "./lib/guard-rails";
import {
  createMetrics,
  recordPhaseTiming,
  recordDealCount,
  recordError,
  recordRetry,
  finalizeMetrics,
  storeMetrics,
  type PipelineMetrics,
} from "./lib/metrics";
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
  metrics?: PipelineMetrics;
}> {
  const startTime = Date.now();
  const run_id = generateRunId();
  const trace_id = generateUUID();

  // Initialize metrics
  const metrics = createMetrics(run_id);

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

  // Initialize previous snapshot for rollback capability
  const prodSnapshot = await getProductionSnapshot(env);
  ctx.previous_snapshot = prodSnapshot ?? undefined;

  // Create structured logger with correlation ID
  const logger = createStructuredLogger(env, run_id, trace_id);
  logger.info("Pipeline starting", {
    version: CONFIG.VERSION,
    schema_version: CONFIG.SCHEMA_VERSION,
    has_previous_snapshot: !!ctx.previous_snapshot,
  });

  let currentPhase: PipelinePhase = "init";
  let phaseIndex = 0;
  let phaseStartTime = Date.now();

  try {
    // Acquire lock
    logger.info("Acquiring pipeline lock");
    await acquireLock(env, run_id, trace_id);
    logger.info("Pipeline lock acquired");

    // Record init phase timing (just lock acquisition)
    recordPhaseTiming(metrics, "init", Date.now() - phaseStartTime);

    // Execute phases
    while (phaseIndex < PHASES.length) {
      currentPhase = PHASES[phaseIndex];
      phaseStartTime = Date.now();

      // Create phase-scoped logger for correlation tracking
      const phaseLogger = logger.withPhase(currentPhase);
      phaseLogger.info(`Phase ${currentPhase} started`);

      // Log phase start (legacy)
      const logBuilder = createLogBuilder(run_id, trace_id)
        .phase(currentPhase)
        .status("complete");

      try {
        // Extend lock for long operations
        if (["discover", "validate", "publish"].includes(currentPhase)) {
          phaseLogger.debug("Extending lock for long operation");
          await extendLock(env, trace_id, 300);
        }

        // Execute phase with structured logging and metrics
        const result = await executePhase(
          currentPhase,
          ctx,
          env,
          phaseLogger,
          metrics,
        );

        // Record phase timing
        const phaseDuration = Date.now() - phaseStartTime;
        recordPhaseTiming(metrics, currentPhase, phaseDuration);
        phaseLogger.info(`Phase ${currentPhase} completed`, {
          duration_ms: phaseDuration,
        });

        if (result === "finalize") {
          // Success path - finalize and store metrics
          finalizeMetrics(metrics, true, "finalize");
          await storeMetrics(env, metrics);

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
          phaseLogger.error(
            `Phase ${currentPhase} returned failure path`,
            undefined,
            {
              failure_path: result,
            },
          );
          // Record error and finalize metrics
          recordError(metrics);
          finalizeMetrics(metrics, false, currentPhase);
          await storeMetrics(env, metrics);
          await handleFailure(result, ctx, env, logger);
          return {
            success: false,
            phase: currentPhase,
            error: result,
            metrics,
          };
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
          recordRetry(metrics);
          phaseLogger.warn(`Retrying phase ${currentPhase}`, {
            retry_count: ctx.retry_count,
            max_retries: CONFIG.MAX_RETRIES,
          });
          // Retry same phase with backoff
          await new Promise((r) => setTimeout(r, 1000 * ctx.retry_count));
          continue;
        }

        // Non-retryable or max retries reached
        phaseLogger.error(
          `Phase ${currentPhase} failed permanently`,
          error as Error,
          {
            total_duration_ms: Date.now() - startTime,
            retry_count: ctx.retry_count,
          },
        );
        // Record error and finalize metrics
        recordError(metrics);
        finalizeMetrics(metrics, false, currentPhase);
        await storeMetrics(env, metrics);
        await handleFailure("revert", ctx, env, logger);
        return {
          success: false,
          phase: currentPhase,
          error: errorMessage,
          metrics,
        };
      }
    }

    // Success
    return { success: true, phase: "finalize", metrics };
  } catch (error) {
    const errorMessage = (error as Error).message;
    // Record error and finalize metrics on unexpected error
    recordError(metrics);
    finalizeMetrics(metrics, false, currentPhase);
    await storeMetrics(env, metrics);
    return {
      success: false,
      phase: currentPhase,
      error: errorMessage,
      metrics,
    };
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
  logger: Logger,
  metrics: PipelineMetrics,
): Promise<PipelinePhase | FailurePath> {
  switch (phase) {
    case "init":
      return "discover";

    case "discover":
      logger.debug("Starting discovery");
      const discovery = await discover(env, ctx);
      ctx.candidates = discovery.deals;
      logger.info("Discovery complete", { deals_found: ctx.candidates.length });

      // Record discovered deal count
      recordDealCount(metrics, "discovered", ctx.candidates.length);

      // Guard rail: Check input resources
      if (ctx.candidates.length > 0) {
        try {
          logger.debug("Running guard rails on input");
          await enforceGuardRails(ctx.candidates, "input");
          logger.info("Guard rails passed");
        } catch (error) {
          logger.error("Guard rail failed on discovery input", error as Error);
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
        logger.info("No deals found, skipping to finalize");
        return "finalize"; // No deals found, skip rest
      }
      return "normalize";

    case "normalize":
      logger.debug("Starting normalization", {
        candidates: ctx.candidates.length,
      });
      ctx.normalized = normalize(ctx.candidates, ctx);
      logger.info("Normalization complete", {
        normalized: ctx.normalized.length,
      });
      // Record normalized deal count
      recordDealCount(metrics, "normalized", ctx.normalized.length);
      return "dedupe";

    case "dedupe":
      logger.debug("Starting deduplication", {
        normalized: ctx.normalized.length,
      });
      const dedupeResult = deduplicate(ctx.normalized, ctx);
      ctx.deduped = dedupeResult.unique;
      logger.info("Deduplication complete", {
        unique: dedupeResult.unique.length,
        duplicates: dedupeResult.duplicates?.length || 0,
      });
      // Record deduped deal count
      recordDealCount(metrics, "deduped", ctx.deduped.length);
      if (ctx.deduped.length === 0) {
        logger.info(
          "No unique deals after deduplication, skipping to finalize",
        );
        return "finalize"; // No unique deals
      }
      return "validate";

    case "validate":
      logger.debug("Starting validation", { deduped: ctx.deduped.length });
      const validation = await validate(ctx.deduped, ctx, env);
      ctx.validated = validation.valid;
      logger.info("Validation complete", {
        total: validation.stats.total,
        valid: validation.stats.valid,
        invalid: validation.stats.invalid,
        by_gate: validation.stats.by_gate,
      });
      // Record validated deal count
      recordDealCount(metrics, "validated", ctx.validated.length);

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
      logger.debug("Starting scoring", { validated: ctx.validated.length });
      const scoring = await score(ctx.validated, ctx, env);
      ctx.scored = scoring.deals;
      logger.info("Scoring complete", {
        scored: ctx.scored.length,
        avg_confidence: scoring.stats.avg_confidence,
      });
      // Record scored deal count
      recordDealCount(metrics, "scored", ctx.scored.length);

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
      logger.debug("Starting staging", { scored: ctx.scored.length });
      const stageResult = await stage(ctx.scored, ctx, env);
      ctx.snapshot = stageResult.snapshot;
      logger.info("Staging complete", {
        verified: stageResult.verified,
        snapshot_hash: stageResult.snapshot?.snapshot_hash,
      });

      if (!stageResult.verified) {
        logger.error("Staging verification failed", undefined, {
          snapshot_created: !!stageResult.snapshot,
        });
        return "revert";
      }
      return "publish";

    case "publish":
      logger.debug("Starting publish");
      try {
        // Guard rail: Check output quality before publishing
        if (ctx.scored.length > 0) {
          logger.debug("Running guard rails on output");
          const guardRailReport = await runGuardRails(ctx.scored, "output");

          if (!guardRailReport.allPassed) {
            logger.error("Guard rails blocked publish", undefined, {
              fatal_errors: guardRailReport.fatalErrors,
            });
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
            logger.warn("Guard rail warnings", {
              warnings: guardRailReport.warnings,
            });
            await appendLog(
              env,
              createLogBuilder(ctx.run_id, ctx.trace_id)
                .phase("publish")
                .status("complete")
                .build(),
            );
          }
        }

        logger.info("Publishing snapshot", {
          deals_count: ctx.scored.length,
          snapshot_hash: ctx.snapshot?.snapshot_hash,
        });
        await publishSnapshot(env, ctx.snapshot!, ctx);
        logger.info("Snapshot published successfully");
        return "verify";
      } catch (error) {
        logger.error("Publish failed", error as Error);
        return "revert";
      }

    case "verify":
      logger.debug("Verification phase (post-publish checks)");
      // Verification happens in publish
      // Record published deal count from scored deals
      recordDealCount(metrics, "published", ctx.scored.length);
      return "finalize";

    case "finalize":
      logger.info("Finalizing pipeline", { total_deals: ctx.scored.length });
      // Send success notification if needed
      await notify(env, {
        type: "system_error",
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
  logger: Logger,
): Promise<void> {
  switch (path) {
    case "revert":
      logger.error("Handling revert failure", undefined, {
        has_previous_snapshot: !!ctx.previous_snapshot,
        errors: ctx.errors.map((e) => ({
          phase: e.phase,
          message: e.error.message,
        })),
      });
      if (ctx.previous_snapshot) {
        const { revertProduction } = await import("./lib/storage");
        await revertProduction(env, ctx.previous_snapshot);
        logger.info("Production snapshot reverted");
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
      logger.warn("Handling quarantine failure");
      // Quarantine deals are already marked
      await notify(env, {
        type: "trust_anomaly",
        severity: "warning",
        run_id: ctx.run_id,
        message: "Deals quarantined due to anomalies",
      });
      break;

    case "concurrency_abort":
      logger.warn("Handling concurrency abort");
      await notify(env, {
        type: "concurrency_abort",
        severity: "warning",
        run_id: ctx.run_id,
        message: "Pipeline aborted due to concurrent execution",
      });
      break;

    default:
      logger.warn(`Unknown failure path: ${path}`);
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
