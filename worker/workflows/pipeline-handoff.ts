import type { Deal, Env } from "../types";
import { logger } from "../lib/global-logger";

// KV handoff for deal arrays between durable pipeline steps. Arrays never
// travel in step returns: the 500-deal production budget risks the 1MiB
// step-return cap, while KV values allow up to 25MiB. Keys are namespaced
// per run and deleted on release (best-effort).

const HANDOFF_PREFIX = "wf:";
const HANDOFF_NAMES = ["deduped", "validated", "scored"] as const;
export type HandoffName = (typeof HANDOFF_NAMES)[number];

function handoffKey(run_id: string, name: HandoffName): string {
  return `${HANDOFF_PREFIX}${run_id}:${name}`;
}

export async function putHandoff(
  env: Env,
  run_id: string,
  name: HandoffName,
  deals: Deal[],
): Promise<void> {
  await env.DEALS_STAGING.put(handoffKey(run_id, name), JSON.stringify(deals));
}

export async function getHandoff(
  env: Env,
  run_id: string,
  name: HandoffName,
): Promise<Deal[]> {
  const raw = await env.DEALS_STAGING.get(handoffKey(run_id, name), "json");
  return Array.isArray(raw) ? (raw as Deal[]) : [];
}

/** Best-effort handoff cleanup; leftovers are namespaced and bounded. */
export async function clearHandoffs(env: Env, run_id: string): Promise<void> {
  for (const name of HANDOFF_NAMES) {
    try {
      await env.DEALS_STAGING.delete(handoffKey(run_id, name));
    } catch (error) {
      logger.warn("Workflow handoff cleanup failed (non-critical)", {
        component: "pipeline-workflow",
        run_id,
        key: name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
