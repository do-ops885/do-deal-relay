import { Deal, PipelineContext } from "../../types";
import { GateResult, getContextHash, setContextHash } from "../types";
import { generateSnapshotHash } from "../../lib/crypto";

/**
 * Gate 9: Field Integrity Verification
 *
 * Verifies deal critical fields are internally consistent and haven't been
 * tampered with between pipeline phases. Runs during the validate phase
 * (before snapshot creation), so uses per-deal field hashing stored in
 * context rather than comparing against ctx.snapshot.
 */
export async function verifySnapshotHash(
  deal: Deal,
  ctx: PipelineContext,
): Promise<GateResult> {
  if (!deal.id || !deal.source?.domain || !deal.code || !deal.reward) {
    return {
      passed: false,
      reason: "Field integrity check failed: missing critical fields",
    };
  }

  const criticalFields = {
    id: deal.id,
    domain: deal.source.domain,
    code: deal.code,
    rewardType: deal.reward.type,
    rewardValue: deal.reward.value,
  };

  const fieldsHash = await generateSnapshotHash([criticalFields]);

  const storedHash = getContextHash(ctx, deal.id);

  if (storedHash && fieldsHash !== storedHash) {
    return {
      passed: false,
      reason: `Field integrity check failed: deal mutated since creation (expected: ${storedHash}, got: ${fieldsHash})`,
    };
  }

  if (!storedHash) {
    setContextHash(ctx, deal.id, fieldsHash);
  }

  return { passed: true };
}
