import { executePipeline } from "./state-machine";
import { notify } from "./notify";
import type { Env } from "./types";
import { checkDealExpirations, runFullValidationSweep } from "./lib/expiration";
import { logger } from "./lib/global-logger";
import { runAggregation } from "./lib/d1/experience";

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

      return;
    }

    // Weekly cron job - full validation sweep
    if (cron === "0 0 * * 0") {
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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Scheduled execution error:", {
      component: "scheduled",
      error: errorMessage,
    });
    await notify(env, {
      type: "system_error",
      severity: "critical",
      run_id: "scheduled",
      message: `Scheduled execution failed: ${errorMessage}`,
      context: {
        cron,
        error: errorMessage,
      },
    });
  }
}
