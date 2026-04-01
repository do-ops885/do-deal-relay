import { Snapshot, SnapshotSchema, Deal, SourceConfig } from "../types";
import type { Env } from "../types";
import { CONFIG } from "../config";
import { generateSnapshotHash } from "./crypto";
import {
  createSourceCache,
  createSnapshotCache,
  createStagingSnapshotCache,
} from "./cache";

// ============================================================================
// KV Storage Abstraction Layer with Caching
// ============================================================================

const SNAPSHOT_CACHE_KEY = "production_snapshot";
const STAGING_SNAPSHOT_CACHE_KEY = "staging_snapshot";
const SOURCE_REGISTRY_CACHE_KEY = "registry";

/**
 * Get production snapshot (with caching)
 */
export async function getProductionSnapshot(
  env: Env,
): Promise<Snapshot | null> {
  try {
    const cache = createSnapshotCache(env);

    // Try cache first
    const cached = await cache.get<Snapshot>(SNAPSHOT_CACHE_KEY);
    if (cached) {
      return cached;
    }

    // Fetch from KV
    const data = await env.DEALS_PROD.get<Snapshot>(
      CONFIG.KV_KEYS.PROD_SNAPSHOT,
      "json",
    );

    // Cache if found
    if (data) {
      await cache.set(SNAPSHOT_CACHE_KEY, data);
    }

    return data;
  } catch (error) {
    console.error("Failed to get production snapshot:", error);
    return null;
  }
}

/**
 * Get staging snapshot (with caching)
 */
export async function getStagingSnapshot(env: Env): Promise<Snapshot | null> {
  try {
    const cache = createStagingSnapshotCache(env);

    // Try cache first
    const cached = await cache.get<Snapshot>(STAGING_SNAPSHOT_CACHE_KEY);
    if (cached) {
      return cached;
    }

    // Fetch from KV
    const data = await env.DEALS_STAGING.get<Snapshot>(
      CONFIG.KV_KEYS.STAGING_SNAPSHOT,
      "json",
    );

    // Cache if found
    if (data) {
      await cache.set(STAGING_SNAPSHOT_CACHE_KEY, data);
    }

    return data;
  } catch (error) {
    console.error("Failed to get staging snapshot:", error);
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

  // Update cache
  const cache = createStagingSnapshotCache(env);
  await cache.set(STAGING_SNAPSHOT_CACHE_KEY, fullSnapshot);

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

  // Update production cache
  const prodCache = createSnapshotCache(env);
  await prodCache.set(SNAPSHOT_CACHE_KEY, staging);

  // Clear staging after successful promotion
  await env.DEALS_STAGING.delete(CONFIG.KV_KEYS.STAGING_SNAPSHOT);

  // Clear staging cache
  const stagingCache = createStagingSnapshotCache(env);
  await stagingCache.delete(STAGING_SNAPSHOT_CACHE_KEY);

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

  // Update cache
  const cache = createSnapshotCache(env);
  await cache.set(SNAPSHOT_CACHE_KEY, previousSnapshot);
}

/**
 * Get source registry (with caching)
 */
export async function getSourceRegistry(env: Env): Promise<SourceConfig[]> {
  try {
    const cache = createSourceCache(env);

    // Try cache first
    const cached = await cache.get<SourceConfig[]>(SOURCE_REGISTRY_CACHE_KEY);
    if (cached) {
      return cached;
    }

    // Fetch from KV
    const data = await env.DEALS_SOURCES.get<SourceConfig[]>(
      "registry",
      "json",
    );

    const registry = data || [];

    // Cache the result
    await cache.set(SOURCE_REGISTRY_CACHE_KEY, registry);

    return registry;
  } catch {
    return [];
  }
}

/**
 * Update source registry (invalidates cache)
 */
export async function updateSourceRegistry(
  env: Env,
  sources: SourceConfig[],
): Promise<void> {
  await env.DEALS_SOURCES.put("registry", JSON.stringify(sources));

  // Invalidate cache
  const cache = createSourceCache(env);
  await cache.delete(SOURCE_REGISTRY_CACHE_KEY);
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
 * Update source trust score (invalidates cache)
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
    await env.DEALS_SOURCES.put("registry", JSON.stringify(registry));

    // Invalidate cache
    const cache = createSourceCache(env);
    await cache.delete(SOURCE_REGISTRY_CACHE_KEY);
  }
}

/**
 * Record validation result for source (invalidates cache)
 */
export async function recordSourceValidation(
  env: Env,
  domain: string,
  success: boolean,
): Promise<void> {
  const registry = await getSourceRegistry(env);
  const source = registry.find((s) => s.domain === domain);

  if (source) {
    if (success) {
      source.validation_success_count =
        (source.validation_success_count || 0) + 1;
    } else {
      source.validation_failure_count =
        (source.validation_failure_count || 0) + 1;
    }
    await env.DEALS_SOURCES.put("registry", JSON.stringify(registry));

    // Invalidate cache
    const cache = createSourceCache(env);
    await cache.delete(SOURCE_REGISTRY_CACHE_KEY);
  }
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
  for (const key of list.keys) {
    await env.DEALS_STAGING.delete(key.name);
  }
}
