import type { Env } from "../types";
import type { SourceConfig } from "../types";
import { getSourceRegistry } from "../lib/storage";
import { getDiscoveryBudgets } from "../pipeline/discover";
import { calculateAdaptiveBudget } from "../pipeline/discovery-budget";
import { logger } from "../lib/global-logger";

/**
 * One planned source: full config for the fetch core plus its budget.
 * Only domain+limit leave the planning step (see ShadowPlanStep below);
 * full configs are re-read inside each per-source step so step returns
 * stay plain serializable scalars.
 */
export interface ShadowPlannedSource {
  domain: string;
  limit: number;
}

/**
 * Serializable planning-step output: deterministic plain data only,
 * safe for the 1 MiB durable step-return limit.
 */
export interface ShadowPlanStep {
  run_id: string;
  sources: ShadowPlannedSource[];
}

/**
 * Deterministic durable step name. Domains are sanitized so names are
 * stable cache keys (Rules of Workflows: no Date.now/random in names).
 */
export function shadowStepName(domain: string, run_id: string): string {
  const safeDomain = domain.replace(/[^a-zA-Z0-9-]/g, "-");
  return `discover-${safeDomain}-${run_id}`;
}

/**
 * Resolve the shadow run's source list with the same trust filter, sort,
 * and adaptive budgets as the main discovery path. Read-only: registry
 * reads only, no writes.
 */
export async function buildShadowPlan(
  env: Env,
  run_id: string,
): Promise<ShadowPlanStep> {
  const sources: SourceConfig[] = await getSourceRegistry(env);
  const budgets = getDiscoveryBudgets(env);
  const planned = sources
    .filter(
      (s) =>
        s.active &&
        s.classification !== "blocked" &&
        s.trust_initial >= budgets.trustThreshold,
    )
    .sort((a, b) => b.trust_initial - a.trust_initial)
    .map((source) => ({
      domain: source.domain,
      limit: calculateAdaptiveBudget(
        source,
        budgets.perSourceBase,
        budgets.highTrustBonus,
      ),
    }));

  logger.info("Shadow discovery plan built", {
    component: "workflow-shadow",
    run_id,
    sourceCount: planned.length,
  });

  return { run_id, sources: planned };
}
