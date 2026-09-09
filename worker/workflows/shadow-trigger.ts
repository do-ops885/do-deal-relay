import type { Env } from "../types";
import { isFeatureEnabled } from "../lib/feature-flags";
import { logger } from "../lib/global-logger";

/**
 * Shadow trigger outcome for observability. `triggered` is true only
 * when an instance was actually created.
 */
export interface ShadowTriggerResult {
  triggered: boolean;
  reason: string;
}

/**
 * Flag-gated, exception-isolated shadow trigger. Runs after the main 6h
 * pipeline: creates one `DiscoveryShadowWorkflow` instance and returns.
 * Never throws into the cron path; a missing binding (local/test envs)
 * is a clean skip. No PipelineLock interaction by design.
 */
export async function maybeTriggerShadowDiscovery(
  env: Env,
  run_id: string,
): Promise<ShadowTriggerResult> {
  try {
    if (!(await isFeatureEnabled("workflow_shadow_discovery", env))) {
      return { triggered: false, reason: "flag_disabled" };
    }
    const binding = env.DISCOVERY_WORKFLOW;
    if (!binding) {
      logger.warn("Shadow discovery skipped: binding missing", {
        component: "workflow-shadow",
        run_id,
      });
      return { triggered: false, reason: "binding_missing" };
    }
    await binding.create({ id: `shadow-${run_id}`, params: { run_id } });
    logger.info("Shadow discovery instance created", {
      component: "workflow-shadow",
      run_id,
    });
    return { triggered: true, reason: "created" };
  } catch (error) {
    logger.warn("Shadow discovery trigger failed (isolated)", {
      component: "workflow-shadow",
      run_id,
      error: error instanceof Error ? error.message : String(error),
    });
    return { triggered: false, reason: "error" };
  }
}
