import { Snapshot, PipelineContext, PipelineError, ErrorClass } from "./types";
import { CONFIG } from "./config";
import { promoteToProduction, revertProduction } from "./lib/storage";
import {
  commitSnapshot,
  isSnapshotCommitted,
  verifyCommit,
} from "./lib/github/index";
import { setLastRunMetadata } from "./lib/storage";
import type { Env } from "./types";
import { toError } from "./lib/sanitize-error";
import { logger } from "./lib/global-logger";

// ============================================================================
// Production Publish Flow
// ============================================================================

/**
 * Publish snapshot to production
 * Two-phase: Staging → Production + GitHub Commit
 */
export async function publishSnapshot(
  env: Env,
  snapshot: Snapshot,
  ctx: PipelineContext,
): Promise<{
  success: boolean;
  commitSha?: string;
}> {
  try {
    // Step 1: Verify staging exists and matches
    const { getStagingSnapshot } = await import("./lib/storage");
    const staging = await getStagingSnapshot(env);

    if (!staging) {
      throw new PipelineError(
        "PublishError",
        "No staging snapshot found",
        "publish",
        false,
      );
    }

    if (staging.snapshot_hash !== snapshot.snapshot_hash) {
      throw new PipelineError(
        "PublishError",
        "Staging hash mismatch",
        "publish",
        false,
      );
    }

    // Step 2: Get previous production hash for idempotency
    const { getProductionSnapshot } = await import("./lib/storage");
    const production = await getProductionSnapshot(env);
    const expectedPreviousHash = production?.snapshot_hash || "";

    // Step 3: Check if already published (idempotency)
    const alreadyCommitted = await isSnapshotCommitted(
      env.GITHUB_REPO,
      snapshot.snapshot_hash,
    );

    if (alreadyCommitted) {
      logger.warn(`Snapshot ${snapshot.snapshot_hash} already committed`, {
        component: "publish",
        snapshot_hash: snapshot.snapshot_hash,
      });
      return { success: true };
    }

    // Step 4: Promote to production KV
    const publishedSnapshot = await promoteToProduction(
      env,
      expectedPreviousHash,
    );

    // Step 5: Commit to GitHub
    const commitSha = await commitSnapshot(env.GITHUB_REPO, publishedSnapshot, {
      total: publishedSnapshot.stats.total,
      active: publishedSnapshot.stats.active,
    });

    // Step 6: Verify commit
    const verified = await verifyCommit(env.GITHUB_REPO, commitSha);
    if (!verified) {
      throw new PipelineError(
        "PublishError",
        "GitHub commit verification failed",
        "publish",
        false,
      );
    }

    // Step 7: Update metadata
    await setLastRunMetadata(env, {
      run_id: ctx.run_id,
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - ctx.start_time,
      deals_count: publishedSnapshot.stats.active,
    });

    return { success: true, commitSha };
  } catch (error) {
    if (error instanceof PipelineError) {
      throw error;
    }
    const err = toError(error);
    throw new PipelineError(
      "PublishError",
      `Publish failed: ${err.message}`,
      "publish",
      true,
    );
  }
}

/**
 * Rollback to previous snapshot
 */
export async function rollbackSnapshot(
  env: Env,
  previousSnapshot: Snapshot,
): Promise<void> {
  try {
    const { revertProduction, getProductionSnapshot } =
      await import("./lib/storage");
    await revertProduction(env, previousSnapshot);

    // Verify rollback succeeded
    const verified = await getProductionSnapshot(env);
    if (verified?.snapshot_hash !== previousSnapshot.snapshot_hash) {
      throw new PipelineError(
        "PublishError",
        `Rollback verification failed: expected ${previousSnapshot.snapshot_hash}, got ${verified?.snapshot_hash}`,
        "publish",
        false,
      );
    }

    // Rollback verification logging is handled by structured logger
  } catch (error) {
    const err = toError(error);
    throw new PipelineError("PublishError", err.message, "publish", false);
  }
}
