import { Snapshot, SnapshotSchema, Deal, SourceConfig } from "../types";
import type { Env } from "../types";
import { CONFIG } from "../config";
import { generateSnapshotHash } from "./crypto";
import { executeInBatches } from "./utils";
import { logger } from "./global-logger";
import { toErrMessage } from "./errors";

// ============================================================================
// KV Storage Abstraction Layer
// ============================================================================

/**
 * Get production snapshot
 */
export async function getProductionSnapshot(
  env: Env,
): Promise<Snapshot | null> {
  try {
    const data = await env.DEALS_PROD.get<Snapshot>(
      CONFIG.KV_KEYS.PROD_SNAPSHOT,
      "json",
    );
    return data;
  } catch (error) {
    logger.error("Failed to get production snapshot", {
      component: "storage",
      error: toErrMessage(error),
    });
    return null;
  }
}

/**
 * Get staging snapshot
 */
export async function getStagingSnapshot(env: Env): Promise<Snapshot | null> {
  try {
    const data = await env.DEALS_STAGING.get<Snapshot>(
      CONFIG.KV_KEYS.STAGING_SNAPSHOT,
      "json",
    );
    return data;
  } catch (error) {
    logger.error("Failed to get staging snapshot", {
      component: "storage",
      error: toErrMessage(error),
    });
    return null;
  }
}

/**
 * Write snapshot to staging (candidate)
 */
export async function writeStagingSnapshot(
  env: Env,
  snapshot: Omit<Snapshot, "snapshot_hash">,
): Promise<Snapshot> {
  const hash = await generateSnapshotHash(snapshot.deals);
  const fullSnapshot: Snapshot = {
    ...snapshot,
    snapshot_hash: hash,
  };

  // Validate
  const result = SnapshotSchema.safeParse(fullSnapshot);
  if (!result.success) {
    throw new Error(`Invalid snapshot: ${result.error.message}`);
  }

  await env.DEALS_STAGING.put(
    CONFIG.KV_KEYS.STAGING_SNAPSHOT,
    JSON.stringify(fullSnapshot),
  );

  return fullSnapshot;
}

/**
 * Promote staging to production (atomic operation)
 */
export async function promoteToProduction(
  env: Env,
  expectedPreviousHash: string,
): Promise<Snapshot> {
  const staging = await getStagingSnapshot(env);

  if (!staging) {
    throw new Error("No staging snapshot found to promote");
  }

  // Verify hash chain
  const currentProd = await getProductionSnapshot(env);
  const actualPreviousHash = currentProd?.snapshot_hash || "";

  if (actualPreviousHash !== expectedPreviousHash) {
    throw new Error(
      `Hash chain broken: expected ${expectedPreviousHash}, got ${actualPreviousHash}`,
    );
  }

  // Write to production
  await env.DEALS_PROD.put(
    CONFIG.KV_KEYS.PROD_SNAPSHOT,
    JSON.stringify(staging),
  );

  // Clear staging (optional - keeps history)
  // await env.DEALS_STAGING.delete(CONFIG.KV_KEYS.STAGING_SNAPSHOT);

  return staging;
}

/**
 * Revert production to previous state
 */
export async function revertProduction(
  env: Env,
  previousSnapshot: Snapshot,
): Promise<void> {
  await env.DEALS_PROD.put(
    CONFIG.KV_KEYS.PROD_SNAPSHOT,
    JSON.stringify(previousSnapshot),
  );
}

/**
 * Get source registry
 */
export async function getSourceRegistry(env: Env): Promise<SourceConfig[]> {
  try {
    const data = await env.DEALS_SOURCES.get<SourceConfig[]>(
      "registry",
      "json",
    );
    return data || [];
  } catch (error) {
    logger.warn("storage: getSourceRegistry failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Update source registry
 */
export async function updateSourceRegistry(
  env: Env,
  sources: SourceConfig[],
): Promise<void> {
  await env.DEALS_SOURCES.put("registry", JSON.stringify(sources));
}

/**
 * Get specific source config
 */
export async function getSourceConfig(
  env: Env,
  domain: string,
): Promise<SourceConfig | null> {
  const registry = await getSourceRegistry(env);
  return registry.find((s) => s.domain === domain) || null;
}

/**
 * Update source trust score
 */
export async function updateSourceTrust(
  env: Env,
  domain: string,
  adjustment: number,
): Promise<void> {
  const registry = await getSourceRegistry(env);
  const source = registry.find((s) => s.domain === domain);

  if (source) {
    source.trust_initial = Math.max(
      0,
      Math.min(1, source.trust_initial + adjustment),
    );
    await updateSourceRegistry(env, registry);
  }
}

/**
 * In-memory tally of source validation results collected during one discovery
 * run. Counters are keyed by the exact domain string used in the registry
 * entries (same equality semantics as the previous per-call implementation).
 */
export interface ValidationTally {
  readonly successes: Map<string, number>;
  readonly failures: Map<string, number>;
}

/**
 * Create an empty validation tally for a discovery run
 */
export function createValidationTally(): ValidationTally {
  return { successes: new Map(), failures: new Map() };
}

/**
 * Add one validation result to the tally.
 *
 * Synchronous and lock-free: safe to call from parallel pattern batches that
 * all target the same domain. Replaces per-pattern KV read-modify-write,
 * which lost counter updates under CONCURRENCY>1.
 */
export function tallyValidation(
  tally: ValidationTally,
  domain: string,
  success: boolean,
): void {
  const bucket = success ? tally.successes : tally.failures;
  bucket.set(domain, (bucket.get(domain) || 0) + 1);
}

/**
 * Flush tallied validation counters to the source registry.
 *
 * Performs ONE registry GET + at most ONE PUT for every domain touched
 * during the run (KV stores the registry as a single JSON blob, so partial
 * entry updates are not possible; merging into a freshly read registry is
 * the closest equivalent).
 *
 * RESIDUAL RACE WINDOW: Cloudflare KV has no compare-and-swap, so if two
 * isolates flush concurrently they read-modify-write the same "registry"
 * key and last-writer-wins can drop the other writer's delta. The window
 * spans only this function's GET-to-PUT interval (merge is synchronous,
 * sub-millisecond), instead of the whole discovery run as before, and
 * per-source flushing keeps concurrent batches on different domains in
 * practice. A full fix requires serializing writes through a Durable
 * Object and is out of scope here.
 */
export async function flushValidationTally(
  env: Env,
  tally: ValidationTally,
): Promise<void> {
  const touchedDomains = new Set<string>([
    ...tally.successes.keys(),
    ...tally.failures.keys(),
  ]);
  if (touchedDomains.size === 0) return;

  const registry = await getSourceRegistry(env);
  let updatedAnyEntry = false;

  for (const domain of touchedDomains) {
    const source = registry.find((s) => s.domain === domain);
    if (!source) continue;

    const successes = tally.successes.get(domain);
    const failures = tally.failures.get(domain);
    if (successes !== undefined) {
      source.validation_success_count =
        (source.validation_success_count || 0) + successes;
    }
    if (failures !== undefined) {
      source.validation_failure_count =
        (source.validation_failure_count || 0) + failures;
    }
    updatedAnyEntry = true;
  }

  // Preserve prior semantics: unknown domains are silently skipped and no
  // write happens when nothing matched.
  if (updatedAnyEntry) {
    await updateSourceRegistry(env, registry);
  }
}

/**
 * Record a single validation result for a source.
 * Convenience wrapper over the batched tally/flush API for callers that
 * record one result at a time; batched callers should use
 * createValidationTally + tallyValidation + flushValidationTally instead.
 */
export async function recordSourceValidation(
  env: Env,
  domain: string,
  success: boolean,
): Promise<void> {
  const tally = createValidationTally();
  tallyValidation(tally, domain, success);
  await flushValidationTally(env, tally);
}

/**
 * Get deal by ID
 */
export async function getDealById(env: Env, id: string): Promise<Deal | null> {
  const snapshot = await getProductionSnapshot(env);
  if (!snapshot) return null;
  return snapshot.deals.find((d) => d.id === id) || null;
}

/**
 * Get deals by code
 */
export async function getDealsByCode(env: Env, code: string): Promise<Deal[]> {
  const snapshot = await getProductionSnapshot(env);
  if (!snapshot) return [];
  return snapshot.deals.filter(
    (d) => d.code.toLowerCase() === code.toLowerCase(),
  );
}

/**
 * Search deals by category
 */
export async function getDealsByCategory(
  env: Env,
  category: string,
): Promise<Deal[]> {
  const snapshot = await getProductionSnapshot(env);
  if (!snapshot) return [];
  return snapshot.deals.filter((d) =>
    d.metadata.category.some((c) => c.toLowerCase() === category.toLowerCase()),
  );
}

/**
 * Get active deals only
 */
export async function getActiveDeals(env: Env): Promise<Deal[]> {
  const snapshot = await getProductionSnapshot(env);
  if (!snapshot) return [];
  return snapshot.deals.filter((d) => d.metadata.status === "active");
}

/**
 * Get quarantined deals
 */
export async function getQuarantinedDeals(env: Env): Promise<Deal[]> {
  const snapshot = await getProductionSnapshot(env);
  if (!snapshot) return [];
  return snapshot.deals.filter((d) => d.metadata.status === "quarantined");
}

/**
 * Store metadata about last run
 */
export async function setLastRunMetadata(
  env: Env,
  metadata: {
    run_id: string;
    timestamp: string;
    duration_ms: number;
    deals_count: number;
  },
): Promise<void> {
  await env.DEALS_PROD.put(CONFIG.KV_KEYS.LAST_RUN, JSON.stringify(metadata));
}

/**
 * Get last run metadata
 */
export async function getLastRunMetadata(env: Env) {
  return env.DEALS_PROD.get<{
    run_id: string;
    timestamp: string;
    duration_ms: number;
    deals_count: number;
  }>(CONFIG.KV_KEYS.LAST_RUN, "json");
}

/**
 * Clear all staging data
 */
export async function clearStaging(env: Env): Promise<void> {
  const list = await env.DEALS_STAGING.list();

  // Optimization: Parallel batch delete instead of sequential loop
  // This reduces latency from O(N) to O(N/batchSize)
  await executeInBatches(list.keys, (key) =>
    env.DEALS_STAGING.delete(key.name),
  );
}
