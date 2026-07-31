import { executePipeline } from "./state-machine";
import { notify } from "./notify";
import type { Env } from "./types";
import { checkDealExpirations, runFullValidationSweep } from "./lib/expiration";
import { runUrlHealthCheck } from "./lib/expiration/url-health";
import { logger } from "./lib/global-logger";
import { runAggregation } from "./lib/d1/experience";
import { toError } from "./lib/sanitize-error";
import { runContinuousVerification } from "./validation/gates/continuous-verification";
import { checkAndCleanPosts } from "./reddit";

export async function handleScheduled(
  event: ScheduledEvent,
  env: Env,
): Promise<void> {
  const cron = event.cron;
  const timestamp = new Date().toISOString();

  logger.info(`Scheduled event triggered: ${cron}`, {
    component: "scheduled",
    cron,
    timestamp,
  });

  try {
    if (cron === "*/30 * * * *") {
      const result = await checkAndCleanPosts(env);
      logger.info("Reddit moderation completed", {
        component: "scheduled",
        checked: result.checked,
        deleted: result.deleted,
        skipped: result.skipped,
        errors: result.errors,
      });
      return;
    }

    // Daily cron job at 9am - expiration checks and experience aggregation
    if (cron === "0 9 * * *") {
      logger.info("Running daily expiration check", {
        component: "scheduled",
      });

      const result = await checkDealExpirations(env);

      logger.info("Daily expiration check completed", {
        component: "scheduled",
        expiringFound: result.expiringFound,
        expiredMarked: result.expiredMarked,
        notificationsSent: result.notificationsSent,
      });

      logger.info("Running daily experience aggregation", {
        component: "scheduled",
      });

      const aggResult = await runAggregation(env.DEALS_DB!);

      logger.info("Daily experience aggregation completed", {
        component: "scheduled",
        dealsProcessed: aggResult.dealsProcessed,
        eventsProcessed: aggResult.eventsProcessed,
      });

      logger.info("Running daily URL health check", {
        component: "scheduled",
      });
      try {
        const healthResult = await runUrlHealthCheck(env);
        logger.info("Daily URL health check completed", {
          component: "scheduled",
          ...healthResult,
        });
      } catch (error) {
        logger.warn("URL health check failed (non-critical)", {
          component: "scheduled",
          error: error instanceof Error ? error.message : String(error),
        });
      }

      return;
    }

    // Weekly cron job - full validation sweep (Sunday midnight)
    // Matches wrangler.jsonc cron: "0 0 * * SUN"
    if (cron === "0 0 * * SUN") {
      logger.info("Running weekly full validation sweep", {
        component: "scheduled",
      });

      const result = await runFullValidationSweep(env);

      logger.info("Weekly validation sweep completed", {
        component: "scheduled",
        validated: result.validated,
        deactivated: result.deactivated,
        expiringNotified: result.expiringNotified,
        errors: result.errors.length,
      });

      if (result.errors.length > 0) {
        await notify(env, {
          type: "system_error",
          severity: "warning",
          run_id: `weekly-validation-${Date.now()}`,
          message: `Weekly validation completed with ${result.errors.length} errors`,
          context: {
            errors: result.errors,
            validated: result.validated,
            deactivated: result.deactivated,
          },
        });
      }

      // Regenerate embeddings for active deals on weekly cron
      // Uses production snapshot to get full Deal[] objects required by embedding pipeline
      if (env.DEAL_EMBEDDINGS && env.AI) {
        logger.info("Regenerating embeddings for active deals", {
          component: "scheduled",
        });
        try {
          const { getProductionSnapshot } = await import("./lib/storage");
          const { generateDealEmbeddings } =
            await import("./lib/search/embedding-pipeline");
          const snapshot = await getProductionSnapshot(env);
          if (snapshot && snapshot.deals.length > 0) {
            const embedResult = await generateDealEmbeddings(
              env,
              snapshot.deals,
            );
            logger.info("Embedding regeneration completed", {
              component: "scheduled",
              total: embedResult.total,
              successful: embedResult.successful,
              failed: embedResult.failed,
              duration_ms: embedResult.duration_ms,
            });
          }
        } catch (error) {
          logger.warn("Embedding regeneration failed (non-critical)", {
            component: "scheduled",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return;
    }

    // Default pipeline execution (every 6 hours)
    logger.info("Running pipeline execution", {
      component: "scheduled",
    });

    const result = await executePipeline(env);
    if (!result.success) {
      logger.error(`Pipeline failed at ${result.phase}: ${result.error}`, {
        component: "scheduled",
        phase: result.phase,
        error: result.error,
      });
      await notify(env, {
        type: "system_error",
        severity: "critical",
        run_id: `pipeline-${Date.now()}`,
        message: `Pipeline failed at ${result.phase}: ${result.error}`,
        context: {
          phase: result.phase,
          error: result.error,
        },
      });
    } else {
      logger.info("Pipeline execution completed successfully", {
        component: "scheduled",
        phase: result.phase,
      });
    }

    // Run continuous verification on recently published deals
    logger.info("Running continuous verification", {
      component: "scheduled",
    });

    try {
      const cvSummary = await runContinuousVerification(env);
      logger.info("Continuous verification completed", {
        component: "scheduled",
        totalChecked: cvSummary.totalChecked,
        healthy: cvSummary.healthy,
        unhealthy: cvSummary.unhealthy,
      });
    } catch (error) {
      const cvErr = toError(error);
      logger.error("Continuous verification failed", {
        component: "scheduled",
        error_message: cvErr.message,
      });
    }
  } catch (error) {
    const err = toError(error);
    logger.error("Scheduled execution error", {
      component: "scheduled",
      error_message: err.message,
    });
    await notify(env, {
      type: "system_error",
      severity: "critical",
      run_id: "scheduled",
      message: `Scheduled execution failed`,
      context: {
        cron,
        error: err.message,
      },
    });
  }
}
