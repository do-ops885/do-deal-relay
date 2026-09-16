import type { Env } from "../types";
import { getProductionSnapshot, getStagingSnapshot } from "../lib/storage";
import { logger } from "../lib/global-logger";

/**
 * Compact dry-run outcome for the publish phase. No snapshot is promoted,
 * no referrals are inserted, no GitHub commit is made; counts only.
 */
export interface PublishDryRunSummary {
  staging_present: boolean;
  production_present: boolean;
  hashes_match: boolean;
  would_publish: boolean;
  sampled_deals: number;
}

/**
 * Deterministic durable step name. Run id is sanitized like
 * `shadowStepName` so names stay stable cache keys (Rules of Workflows:
 * no Date.now/random in names).
 */
export function publishStepName(run_id: string): string {
  const safeRunId = run_id.replace(/[^a-zA-Z0-9-]/g, "-");
  return `publish-dry-run-${safeRunId}`;
}

/**
 * Dry-run the publish decision for one shadow run. Read-only by
 * construction: reads staging + production snapshots via KV gets only
 * (helpers swallow errors to null). It never promotes staging, never
 * inserts referrals, never commits to GitHub, and never writes
 * metrics/audit rows. `would_publish` mirrors the main path's gate
 * (staging present and hash differs from production).
 */
export async function planPublishReadonly(
  env: Env,
  sampledDealCount: number,
): Promise<PublishDryRunSummary> {
  const [staging, production] = await Promise.all([
    getStagingSnapshot(env),
    getProductionSnapshot(env),
  ]);

  const staging_present = staging !== null;
  const production_present = production !== null;
  const hashes_match =
    staging !== null &&
    production !== null &&
    staging.snapshot_hash === production.snapshot_hash;
  const would_publish = staging_present && !hashes_match;

  logger.info("Shadow publish dry-run completed", {
    component: "workflow-shadow",
    staging_present,
    production_present,
    would_publish,
    sampled_deals: sampledDealCount,
  });

  return {
    staging_present,
    production_present,
    hashes_match,
    would_publish,
    sampled_deals: sampledDealCount,
  };
}
