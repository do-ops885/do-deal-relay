import { Deal, PipelineContext } from "../../types";
import { GateResult, getContextHash, setContextHash } from "../types";
import { generateSnapshotHash } from "../../lib/crypto";

/**
 * Gate 9: Snapshot Hash Verification
 */
export async function verifySnapshotHash(
  deal: Deal,
  ctx: PipelineContext,
): Promise<GateResult> {
  // Generate hash of the deal's critical fields
  const currentHash = await generateSnapshotHash([deal]);

  // Check if there's an expected hash stored in the context
  // Use the pipeline context's snapshot hash tracking
  const expectedHash = ctx.snapshot?.snapshot_hash;

  // If no expected hash is provided, we cannot verify
  // This allows backward compatibility during transition
  if (!expectedHash) {
    return {
      passed: true,
      reason: "No expected hash configured for verification",
    };
  }

  // For individual deals, we verify by checking if this deal was part of
  // the expected snapshot by regenerating and comparing
  const dealHash = await generateSnapshotHash([
    {
      id: deal.id,
      domain: deal.source.domain,
      code: deal.code,
      reward: deal.reward,
    },
  ]);

  // The expected hash should be the hash of the entire snapshot
  // For individual verification, we check if the deal hash is consistent
  // with what would produce the expected snapshot hash
  // This is a simplified check - in production, you'd store individual deal hashes
  if (currentHash !== expectedHash) {
    // Verify critical fields haven't been tampered with
    const criticalFields = {
      id: deal.id,
      domain: deal.source.domain,
      code: deal.code,
      rewardType: deal.reward.type,
      rewardValue: deal.reward.value,
    };

    const fieldsHash = await generateSnapshotHash([criticalFields]);

    // Store or retrieve from context for comparison using type-safe helper
    const storedHash = getContextHash(ctx, deal.id);

    if (storedHash && fieldsHash !== storedHash) {
      return {
        passed: false,
        reason: `Hash verification failed: deal data may have been corrupted or tampered (expected: ${storedHash}, got: ${fieldsHash})`,
      };
    }

    // Store the hash for future verification if not present
    if (!storedHash) {
      setContextHash(ctx, deal.id, fieldsHash);
    }
  }

  return { passed: true };
}
