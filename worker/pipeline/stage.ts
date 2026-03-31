import { Deal, Snapshot, PipelineContext } from '../types';
import { SnapshotSchema } from '../types';
import { CONFIG } from '../config';
import { generateSnapshotHash, generateRunId, generateUUID } from '../lib/crypto';
import { writeStagingSnapshot } from '../lib/storage';
import type { Env } from '../types';

// ============================================================================
// Staging Pipeline
// ============================================================================

interface StageResult {
  snapshot: Snapshot;
  verified: boolean;
}

/**
 * Build and stage candidate snapshot
 */
export async function stage(
  deals: Deal[],
  ctx: PipelineContext,
  env: Env
): Promise<StageResult> {
  const now = new Date().toISOString();

  // Build snapshot without hash first
  const snapshotBase = {
    version: CONFIG.VERSION,
    generated_at: now,
    run_id: ctx.run_id,
    trace_id: ctx.trace_id,
    previous_hash: '', // Will be set from previous snapshot
    schema_version: CONFIG.SCHEMA_VERSION,
    stats: {
      total: deals.length,
      active: deals.filter((d) => d.metadata.status === 'active').length,
      quarantined: deals.filter((d) => d.metadata.status === 'quarantined').length,
      rejected: deals.filter((d) => d.metadata.status === 'rejected').length,
      duplicates: 0, // Already filtered
    },
    deals,
  };

  // Calculate hash
  const hash = await generateSnapshotHash(deals);

  // Complete snapshot
  const snapshot: Snapshot = {
    ...snapshotBase,
    snapshot_hash: hash,
  };

  // Validate snapshot
  const validation = SnapshotSchema.safeParse(snapshot);
  if (!validation.success) {
    throw new Error(`Invalid snapshot: ${validation.error.message}`);
  }

  // Write to staging
  await writeStagingSnapshot(env, snapshotBase);

  // Read-after-write verification
  const verified = await verifyStaging(env, snapshot);

  return {
    snapshot,
    verified,
  };
}

/**
 * Verify staging write succeeded
 */
async function verifyStaging(env: Env, expected: Snapshot): Promise<boolean> {
  const { getStagingSnapshot } = await import('../lib/storage');
  const staged = await getStagingSnapshot(env);

  if (!staged) {
    return false;
  }

  // Verify key fields match
  return (
    staged.run_id === expected.run_id &&
    staged.trace_id === expected.trace_id &&
    staged.snapshot_hash === expected.snapshot_hash &&
    staged.deals.length === expected.deals.length
  );
}

/**
 * Prepare snapshot for production
 */
export function prepareSnapshot(
  deals: Deal[],
  ctx: PipelineContext,
  previousHash: string
): Promise<Snapshot> {
  const now = new Date().toISOString();

  const snapshotBase = {
    version: CONFIG.VERSION,
    generated_at: now,
    run_id: ctx.run_id,
    trace_id: ctx.trace_id,
    previous_hash: previousHash,
    schema_version: CONFIG.SCHEMA_VERSION,
    stats: {
      total: deals.length,
      active: deals.filter((d) => d.metadata.status === 'active').length,
      quarantined: deals.filter((d) => d.metadata.status === 'quarantined').length,
      rejected: 0, // Already filtered
      duplicates: 0,
    },
    deals,
  };

  // Calculate hash
  return generateSnapshotHash(deals).then((hash) => ({
    ...snapshotBase,
    snapshot_hash: hash,
  }));
}
