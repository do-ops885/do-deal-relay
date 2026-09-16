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
import {
  chunkShadowKeys,
  validateBatchReadonly,
  validateBatchStepName,
  type ShadowValidateSummary,
} from "./validate-shadow";
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
  validate: ShadowValidateSummary;
}

/**
 * ADR-018 wave 1: read-only shadow discovery. One durable step plans the
 * run, then one durable step per source replays the fetch+parse+build core.
 * ADR-018 wave 2: `validate-batch-{n}` dry-run steps replay the fast-path
 * validation cache lookups over shadow-discovered keys.
 * Steps never write: no tally flush, no breaker writes, no KV/D1 writes,
 * no PipelineLock. Per-source and per-batch failure isolation: a failing
 * source or batch is recorded in its summary while the run continues.
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
          // Registry read stays inside the try so a registry failure is
          // isolated to this source summary instead of failing the run.
          try {
            const registry = await getSourceRegistry(this.env);
            const source = registry.find((s) => s.domain === item.domain);
            if (!source) {
              return {
                domain: item.domain,
                deal_count: 0,
                error_count: 1,
                sample_codes: [],
                sample_errors: [`${item.domain}: source vanished mid-run`],
                sample_keys: [],
              };
            }
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
              sample_keys: [],
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
      validate: { batches: 0, checked: 0, hits: 0, misses: 0, batch_errors: 0 },
    };

    // ADR-018 wave 2: dry-run validate-batch steps over the in-memory
    // summaries (no refetch, no extra source traffic). Read-only:
    // gets/selects only, never KV puts or D1 writes (no persist, no
    // D1-to-KV repopulation). A failing batch is
    // recorded, never thrown, so one bad batch cannot fail the run.
    const batches = chunkShadowKeys(sources);
    let batch_errors = 0;
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i] ?? [];
      try {
        const batchSummary = await step.do(
          validateBatchStepName(i, run_id),
          async () => validateBatchReadonly(this.env, i, batch),
        );
        summary.validate.batches += 1;
        summary.validate.checked += batchSummary.checked;
        summary.validate.hits += batchSummary.hits;
        summary.validate.misses += batchSummary.misses;
      } catch (error) {
        batch_errors += 1;
        logger.warn("Shadow validate batch failed (isolated)", {
          component: "workflow-shadow",
          run_id,
          batch_index: i,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    summary.validate.batch_errors = batch_errors;

    logger.info("Shadow discovery run completed", {
      component: "workflow-shadow",
      run_id,
      source_count: summary.source_count,
      total_deals: summary.total_deals,
      total_errors: summary.total_errors,
      validate_checked: summary.validate.checked,
      validate_hits: summary.validate.hits,
      validate_batch_errors: summary.validate.batch_errors,
    });

    return summary;
  }
}
