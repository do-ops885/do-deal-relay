import type { Env } from "../types";
import type { PipelineWorkflowParams } from "../types/api";
import { isFeatureEnabled } from "../lib/feature-flags";
import { logger } from "../lib/global-logger";

export const CUTOVER_FLAG = "workflow_pipeline_cutover";

/**
 * Flag-gated, exception-isolated cutover trigger. Creates one
 * `PipelineWorkflow` instance and returns; legacy direct execution is
 * the fallback for flag_disabled / binding_missing / error.
 */
export async function maybeTriggerPipelineWorkflow(
  env: Env,
  run_id: string,
  cron: string,
): Promise<{ triggered: boolean; reason: string }> {
  try {
    if (!(await isFeatureEnabled(CUTOVER_FLAG, env))) {
      return { triggered: false, reason: "flag_disabled" };
    }
    const binding = env.PIPELINE_WORKFLOW;
    if (!binding) {
      logger.warn("Pipeline workflow skipped: binding missing", {
        component: "pipeline-workflow",
        run_id,
      });
      return { triggered: false, reason: "binding_missing" };
    }
    await binding.create({
      id: `pipeline-${run_id}`,
      params: { run_id, cron } satisfies PipelineWorkflowParams,
    });
    logger.info("Pipeline workflow instance created", {
      component: "pipeline-workflow",
      run_id,
      cron,
    });
    return { triggered: true, reason: "created" };
  } catch (error) {
    logger.warn("Pipeline workflow trigger failed (isolated)", {
      component: "pipeline-workflow",
      run_id,
      error: error instanceof Error ? error.message : String(error),
    });
    return { triggered: false, reason: "error" };
  }
}
