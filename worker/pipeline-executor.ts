import { PipelinePhase, PipelineContext, FailurePath } from "./types";
import { createLogBuilder, appendLog } from "./lib/logger";
import { logger } from "./lib/global-logger";
import { discover } from "./pipeline/discover";
import { normalize } from "./pipeline/normalize";
import { deduplicate } from "./pipeline/dedupe";
import { validate } from "./validation/pipeline";
import { score, evolveSourceTrust } from "./pipeline/score";
import { stage } from "./pipeline/stage";
import { publishSnapshot } from "./publish";
import { notify } from "./notify";
import { enforceGuardRails, runGuardRails } from "./lib/guard-rails";
import { runExpirationCheck } from "./lib/expiration-manager";
import type { Env } from "./types";
import { recordDealCount } from "./lib/metrics/index";

export async function executePhase(
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
      if (ctx.metrics)
        recordDealCount(ctx.metrics, "discovered", ctx.candidates.length);

      if (ctx.candidates.length > 0) {
        try {
          await enforceGuardRails(ctx.candidates, "input");
        } catch (error) {
          logger.debug("Guard rail check failed", {
            component: "state-machine",
            phase: "discover",
            error: error instanceof Error ? error.message : String(error),
          });
          await notify(env, {
            type: "system_error",
            severity: "critical",
            run_id: ctx.run_id,
            message: `Guard rail failed on discovery input`,
          });
          return "revert";
        }
      }

      if (discovery.deals.length === 0) {
        return "finalize";
      }
      return "normalize";

    case "normalize":
      ctx.normalized = normalize(ctx.candidates, ctx);
      if (ctx.metrics)
        recordDealCount(ctx.metrics, "normalized", ctx.normalized.length);
      return "dedupe";

    case "dedupe":
      const dedupeResult = deduplicate(ctx.normalized, ctx);
      ctx.deduped = dedupeResult.unique;
      if (ctx.metrics)
        recordDealCount(ctx.metrics, "deduped", ctx.deduped.length);
      if (ctx.deduped.length === 0) {
        return "finalize";
      }
      return "validate";

    case "validate":
      const validation = await validate(ctx.deduped, ctx, env);
      ctx.validated = validation.valid;
      if (ctx.metrics) {
        recordDealCount(ctx.metrics, "validated", ctx.validated.length);
      }

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
        return "revert";
      }
      return "score";

    case "score":
      const scoring = await score(ctx.validated, ctx, env);
      ctx.scored = scoring.deals;
      if (ctx.metrics)
        recordDealCount(ctx.metrics, "scored", ctx.scored.length);

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

      await evolveSourceTrust(env, ctx.scored, true);

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
        if (ctx.metrics)
          recordDealCount(ctx.metrics, "published", ctx.scored.length);

        if (ctx.scored.length > 0 && env.DEAL_EMBEDDINGS) {
          try {
            const { generateDealEmbeddings } =
              await import("./lib/search/embedding-pipeline");
            await generateDealEmbeddings(env, ctx.scored);
          } catch (error) {
            logger.debug("Embedding generation failed", {
              component: "state-machine",
              phase: "publish",
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        return "verify";
      } catch (error) {
        logger.debug("Publish phase failed", {
          component: "state-machine",
          phase: "publish",
          error: error instanceof Error ? error.message : String(error),
        });
        return "revert";
      }

    case "verify":
      return "finalize";

    case "finalize":
      if (ctx.snapshot) {
        const expiryResult = await runExpirationCheck(
          env,
          ctx.snapshot.deals,
          ctx.previous_snapshot?.deals,
          ctx.run_id,
        );

        if (expiryResult.errors.length > 0) {
          logger.warn("Expiration check errors", {
            component: "state-machine",
            errors: expiryResult.errors,
          });
        }
      }

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

export async function handleFailure(
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
