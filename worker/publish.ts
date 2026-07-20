import { Snapshot, PipelineContext, PipelineError } from "./types";
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
import { logAuditEvent } from "./lib/d1/audit-log";
import { writeMetricsBatch } from "./lib/d1/system-metrics";
import {
  insertReferralsBatch,
  type ReferralRecord,
} from "./lib/d1/referrals-batch";

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
  const publishStartTime = Date.now();
  const auditId = crypto.randomUUID();

  // Audit: log publish initiation
  await logAuditEvent(env.DEALS_DB, {
    id: auditId,
    action: "publish.started",
    resource: "snapshot",
    resourceType: "pipeline",
    resourceId: snapshot.snapshot_hash,
    details: {
      run_id: ctx.run_id,
      trace_id: ctx.trace_id,
      deals_total: snapshot.stats.total,
      deals_active: snapshot.stats.active,
    },
    correlationId: ctx.trace_id,
  });

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

    // Step 5: Batch-insert referral records from snapshot into D1
    const referrals: ReferralRecord[] = publishedSnapshot.deals.map((deal) => ({
      id: deal.id,
      code: deal.code,
      url: deal.url,
      domain: deal.source.domain,
      source: deal.source.url,
      title: deal.title,
      description: deal.description,
      rewardType: deal.reward.type,
      rewardValue:
        typeof deal.reward.value === "number"
          ? String(deal.reward.value)
          : deal.reward.value,
      currency: deal.reward.currency,
      status: deal.metadata.status,
    }));
    await insertReferralsBatch(env.DEALS_DB, referrals);

    // Step 6: Commit to GitHub
    const commitSha = await commitSnapshot(env.GITHUB_REPO, publishedSnapshot, {
      total: publishedSnapshot.stats.total,
      active: publishedSnapshot.stats.active,
    });

    // Step 7: Verify commit
    const verified = await verifyCommit(env.GITHUB_REPO, commitSha);
    if (!verified) {
      throw new PipelineError(
        "PublishError",
        "GitHub commit verification failed",
        "publish",
        false,
      );
    }

    // Step 8: Update metadata
    await setLastRunMetadata(env, {
      run_id: ctx.run_id,
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - ctx.start_time,
      deals_count: publishedSnapshot.stats.active,
    });

    // Write system metrics for successful publish
    const publishDurationMs = Date.now() - publishStartTime;
    await writeMetricsBatch(env.DEALS_DB, [
      {
        name: "publish.duration_ms",
        value: publishDurationMs,
        type: "histogram",
        labels: { status: "success" },
        runId: ctx.run_id,
        phase: "publish",
        durationMs: publishDurationMs,
      },
      {
        name: "publish.deals_total",
        value: publishedSnapshot.stats.total,
        type: "gauge",
        runId: ctx.run_id,
        phase: "publish",
      },
      {
        name: "publish.deals_active",
        value: publishedSnapshot.stats.active,
        type: "gauge",
        runId: ctx.run_id,
        phase: "publish",
      },
      {
        name: "publish.referrals_written",
        value: referrals.length,
        type: "counter",
        runId: ctx.run_id,
        phase: "publish",
      },
    ]);

    // Audit: log publish completion
    await logAuditEvent(env.DEALS_DB, {
      id: crypto.randomUUID(),
      action: "publish.completed",
      resource: "snapshot",
      resourceType: "pipeline",
      resourceId: snapshot.snapshot_hash,
      details: {
        run_id: ctx.run_id,
        commit_sha: commitSha,
        deals_published: publishedSnapshot.stats.active,
        duration_ms: publishDurationMs,
        referrals_written: referrals.length,
      },
      correlationId: ctx.trace_id,
    });

    return { success: true, commitSha };
  } catch (error) {
    // Write failure metric
    const publishDurationMs = Date.now() - publishStartTime;
    await writeMetricsBatch(env.DEALS_DB, [
      {
        name: "publish.duration_ms",
        value: publishDurationMs,
        type: "histogram",
        labels: { status: "failure" },
        runId: ctx.run_id,
        phase: "publish",
        durationMs: publishDurationMs,
      },
      {
        name: "publish.errors",
        value: 1,
        type: "counter",
        runId: ctx.run_id,
        phase: "publish",
      },
    ]);

    // Audit: log publish failure
    const errorInfo = toError(error);
    await logAuditEvent(env.DEALS_DB, {
      id: crypto.randomUUID(),
      action: "publish.failed",
      resource: "snapshot",
      resourceType: "pipeline",
      resourceId: snapshot.snapshot_hash,
      details: {
        run_id: ctx.run_id,
        error: errorInfo.message,
        duration_ms: publishDurationMs,
      },
      correlationId: ctx.trace_id,
    });

    if (error instanceof PipelineError) {
      throw error;
    }
    throw new PipelineError(
      "PublishError",
      `Publish failed: ${errorInfo.message}`,
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
  const rollbackId = crypto.randomUUID();

  // Audit: log rollback initiation
  await logAuditEvent(env.DEALS_DB, {
    id: rollbackId,
    action: "rollback.started",
    resource: "snapshot",
    resourceType: "pipeline",
    resourceId: previousSnapshot.snapshot_hash,
    details: {
      target_hash: previousSnapshot.snapshot_hash,
    },
  });

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

    // Audit: log rollback completion
    await logAuditEvent(env.DEALS_DB, {
      id: crypto.randomUUID(),
      action: "rollback.completed",
      resource: "snapshot",
      resourceType: "pipeline",
      resourceId: previousSnapshot.snapshot_hash,
      details: {
        restored_hash: previousSnapshot.snapshot_hash,
      },
    });
  } catch (error) {
    const err = toError(error);

    // Audit: log rollback failure
    await logAuditEvent(env.DEALS_DB, {
      id: crypto.randomUUID(),
      action: "rollback.failed",
      resource: "snapshot",
      resourceType: "pipeline",
      resourceId: previousSnapshot.snapshot_hash,
      details: {
        error: err.message,
      },
    });

    throw new PipelineError("PublishError", err.message, "publish", false);
  }
}
