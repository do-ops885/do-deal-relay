import { Snapshot, SnapshotSchema, Deal, SourceConfig } from '../types';
import type { Env } from '../types';
import { CONFIG } from '../config';
import { generateSnapshotHash } from './crypto';

// ============================================================================
// KV Storage Abstraction Layer
// ============================================================================

/**
 * Get production snapshot
 */
export async function getProductionSnapshot(env: Env): Promise<Snapshot | null> {
  try {
    const data = await env.DEALS_PROD.get<Snapshot>(
      CONFIG.KV_KEYS.PROD_SNAPSHOT,
      'json'
    );
    return data;
  } catch (error) {
    console.error('Failed to get production snapshot:', error);
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
      'json'
    );
    return data;
  } catch (error) {
    console.error('Failed to get staging snapshot:', error);
    return null;
  }
}

/**
 * Write snapshot to staging (candidate)
 */
export async function writeStagingSnapshot(
  env: Env,
  snapshot: Omit<Snapshot, 'snapshot_hash'>
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
    JSON.stringify(fullSnapshot)
  );

  return fullSnapshot;
}

/**
 * Promote staging to production (atomic operation)
 */
export async function promoteToProduction(
  env: Env,
  expectedPreviousHash: string
): Promise<Snapshot> {
  const staging = await getStagingSnapshot(env);

  if (!staging) {
    throw new Error('No staging snapshot found to promote');
  }

  // Verify hash chain
  const currentProd = await getProductionSnapshot(env);
  const actualPreviousHash = currentProd?.snapshot_hash || '';

  if (actualPreviousHash !== expectedPreviousHash) {
    throw new Error(
      `Hash chain broken: expected ${expectedPreviousHash}, got ${actualPreviousHash}`
    );
  }

  // Write to production
  await env.DEALS_PROD.put(
    CONFIG.KV_KEYS.PROD_SNAPSHOT,
    JSON.stringify(staging)
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
  previousSnapshot: Snapshot
): Promise<void> {
  await env.DEALS_PROD.put(
    CONFIG.KV_KEYS.PROD_SNAPSHOT,
    JSON.stringify(previousSnapshot)
  );
}

/**
 * Get source registry
 */
export async function getSourceRegistry(env: Env): Promise<SourceConfig[]> {
  try {
    const data = await env.DEALS_SOURCES.get<SourceConfig[]>('registry', 'json');
    return data || [];
  } catch {
    return [];
  }
}

/**
 * Update source registry
 */
export async function updateSourceRegistry(
  env: Env,
  sources: SourceConfig[]
): Promise<void> {
  await env.DEALS_SOURCES.put('registry', JSON.stringify(sources));
}

/**
 * Get specific source config
 */
export async function getSourceConfig(
  env: Env,
  domain: string
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
  adjustment: number
): Promise<void> {
  const registry = await getSourceRegistry(env);
  const source = registry.find((s) => s.domain === domain);

  if (source) {
    source.trust_initial = Math.max(
      0,
      Math.min(1, source.trust_initial + adjustment)
    );
    await updateSourceRegistry(env, registry);
  }
}

/**
 * Record validation result for source
 */
export async function recordSourceValidation(
  env: Env,
  domain: string,
  success: boolean
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
    await updateSourceRegistry(env, registry);
  }
}

/**
 * Get deal by ID
 */
export async function getDealById(
  env: Env,
  id: string
): Promise<Deal | null> {
  const snapshot = await getProductionSnapshot(env);
  if (!snapshot) return null;
  return snapshot.deals.find((d) => d.id === id) || null;
}

/**
 * Get deals by code
 */
export async function getDealsByCode(
  env: Env,
  code: string
): Promise<Deal[]> {
  const snapshot = await getProductionSnapshot(env);
  if (!snapshot) return [];
  return snapshot.deals.filter(
    (d) => d.code.toLowerCase() === code.toLowerCase()
  );
}

/**
 * Search deals by category
 */
export async function getDealsByCategory(
  env: Env,
  category: string
): Promise<Deal[]> {
  const snapshot = await getProductionSnapshot(env);
  if (!snapshot) return [];
  return snapshot.deals.filter((d) =>
    d.metadata.category.some(
      (c) => c.toLowerCase() === category.toLowerCase()
    )
  );
}

/**
 * Get active deals only
 */
export async function getActiveDeals(env: Env): Promise<Deal[]> {
  const snapshot = await getProductionSnapshot(env);
  if (!snapshot) return [];
  return snapshot.deals.filter((d) => d.metadata.status === 'active');
}

/**
 * Get quarantined deals
 */
export async function getQuarantinedDeals(env: Env): Promise<Deal[]> {
  const snapshot = await getProductionSnapshot(env);
  if (!snapshot) return [];
  return snapshot.deals.filter((d) => d.metadata.status === 'quarantined');
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
  }
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
  }>(CONFIG.KV_KEYS.LAST_RUN, 'json');
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
