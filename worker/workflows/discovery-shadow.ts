import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import type { Env } from "../types";
import type { ShadowDiscoveryParams } from "../types/api";
import { getSourceRegistry } from "../lib/storage";
import {
  discoverSourceReadonly,
  type ShadowSourceSummary,
} from "../pipeline/discover";
import { buildShadowPlan, shadowStepName } from "./shadow-plan";
import { logger } from "../lib/global-logger";

/**
 * Compact whole-run summary. Plain serializable data only, far under
 * the 1 MiB step/instance limits.
 */
export interface ShadowRunSummary {
  run_id: string;
  source_count: number;
  total_deals: number;
  total_errors: number;
  sources: ShadowSourceSummary[];
}

/**
 * ADR-018 wave 1: read-only shadow discovery. One durable step plans the
 * run, then one durable step per source replays the fetch+parse+build core.
 * Steps never write: no tally flush, no breaker writes, no KV/D1 writes,
 * no PipelineLock. Per-source failure isolation: one source throwing fails
 * only its own step (recorded in its summary) while the run continues.
 */
export class DiscoveryShadowWorkflow extends WorkflowEntrypoint<
  Env,
  ShadowDiscoveryParams
> {
  async run(
    event: WorkflowEvent<ShadowDiscoveryParams>,
    step: WorkflowStep,
  ): Promise<ShadowRunSummary> {
    const run_id = event.payload.run_id;

    const plan = await step.do(`plan-${run_id}`, () =>
      buildShadowPlan(this.env, run_id),
    );

    const sources: ShadowSourceSummary[] = [];
    for (const item of plan.sources) {
      const summary = await step.do(
        shadowStepName(item.domain, run_id),
        async () => {
          // Full config is re-read inside the step so the callback is
          // self-contained and idempotent across replays and retries.
          const registry = await getSourceRegistry(this.env);
          const source = registry.find((s) => s.domain === item.domain);
          if (!source) {
            return {
              domain: item.domain,
              deal_count: 0,
              error_count: 1,
              sample_codes: [],
              sample_errors: [`${item.domain}: source vanished mid-run`],
            };
          }
          try {
            return await discoverSourceReadonly(source, item.limit);
          } catch (error) {
            // Isolated: a source failure is recorded, never thrown.
            return {
              domain: item.domain,
              deal_count: 0,
              error_count: 1,
              sample_codes: [],
              sample_errors: [
                `${item.domain}: ${error instanceof Error ? error.message : String(error)}`,
              ],
            };
          }
        },
      );
      sources.push(summary);
    }

    const summary: ShadowRunSummary = {
      run_id,
      source_count: sources.length,
      total_deals: sources.reduce((n, s) => n + s.deal_count, 0),
      total_errors: sources.reduce((n, s) => n + s.error_count, 0),
      sources,
    };

    logger.info("Shadow discovery run completed", {
      component: "workflow-shadow",
      run_id,
      source_count: summary.source_count,
      total_deals: summary.total_deals,
      total_errors: summary.total_errors,
    });

    return summary;
  }
}
