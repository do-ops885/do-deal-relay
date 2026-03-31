import { Snapshot, PipelineContext, PipelineError, ErrorClass } from "./types";
import { CONFIG } from "./config";
import { promoteToProduction, revertProduction } from "./lib/storage";
import { commitSnapshot, isSnapshotCommitted } from "./lib/github";
import { setLastRunMetadata } from "./lib/storage";
import type { Env } from "./types";

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
  // Validate GitHub token is configured
  if (!env.GITHUB_TOKEN) {
    throw new PipelineError(
      "PublishError",
      "GITHUB_TOKEN not configured",
      "publish",
      false,
    );
  }

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
      env.GITHUB_TOKEN,
      snapshot.snapshot_hash,
    );

    if (alreadyCommitted) {
      console.warn(`Snapshot ${snapshot.snapshot_hash} already committed`);
      return { success: true };
    }

    // Step 4: Promote to production KV
    const publishedSnapshot = await promoteToProduction(
      env,
      expectedPreviousHash,
    );

    // Step 5: Commit to GitHub
    const commitSha = await commitSnapshot(
      env.GITHUB_REPO,
      env.GITHUB_TOKEN,
      publishedSnapshot,
      {
        total: publishedSnapshot.stats.total,
        active: publishedSnapshot.stats.active,
      },
    );

    // Step 6: Verify commit
    const verified = await verifyCommit(
      env.GITHUB_REPO,
      env.GITHUB_TOKEN,
      commitSha,
    );
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
    throw new PipelineError(
      "PublishError",
      `Publish failed: ${(error as Error).message}`,
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
    await revertProduction(env, previousSnapshot);
    console.log(`Rolled back to snapshot ${previousSnapshot.snapshot_hash}`);
  } catch (error) {
    console.error("Rollback failed:", error);
    throw new PipelineError(
      "PublishError",
      `Rollback failed: ${(error as Error).message}`,
      "publish",
      false,
    );
  }
}

/**
 * Verify GitHub commit
 */
async function verifyCommit(
  repo: string,
  token: string,
  expectedSha: string,
): Promise<boolean> {
  const { getRecentCommits } = await import("./lib/github");
  const commits = await getRecentCommits(repo, token, CONFIG.SNAPSHOT_FILE, 1);

  if (commits.length === 0) {
    return false;
  }

  return commits[0].sha === expectedSha;
}
