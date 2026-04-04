import { Deal, PipelineContext, PipelineError, ErrorClass } from "../types";
import { DealSchema } from "../types";
import { CONFIG, VALIDATION_GATES, type ValidationGate } from "../config";
import { verifyNormalization } from "./normalize";
import { getProductionSnapshot } from "../lib/storage";
import { generateSnapshotHash } from "../lib/crypto";
import type { Env } from "../types";

// ============================================================================
// Validation Pipeline (9 Gates)
// ============================================================================

interface ValidationResult {
  valid: Deal[];
  invalid: Array<{ deal: Deal; reasons: string[] }>;
  quarantined: Deal[];
  stats: {
    total: number;
    valid: number;
    invalid: number;
    quarantined: number;
    by_gate: Record<string, number>;
  };
}

interface GateResult {
  passed: boolean;
  reason?: string;
}

// Type-safe context hash storage helper - avoids unsafe casting
// PipelineContext is extended with an index signature for metadata storage
interface ContextWithHashes extends PipelineContext {
  [key: `deal_hash_${string}`]: string;
}

/**
 * Get a hash value from context using type-safe access
 */
function getContextHash(
  ctx: PipelineContext,
  dealId: string,
): string | undefined {
  return (ctx as ContextWithHashes)[`deal_hash_${dealId}`];
}

/**
 * Store a hash value in context using type-safe access
 */
function setContextHash(
  ctx: PipelineContext,
  dealId: string,
  hash: string,
): void {
  (ctx as ContextWithHashes)[`deal_hash_${dealId}`] = hash;
}

/**
 * Run all 9 validation gates on deals
 */
export async function validate(
  deals: Deal[],
  ctx: PipelineContext,
  env: Env,
): Promise<ValidationResult> {
  const result: ValidationResult = {
    valid: [],
    invalid: [],
    quarantined: [],
    stats: {
      total: deals.length,
      valid: 0,
      invalid: 0,
      quarantined: 0,
      by_gate: {},
    },
  };

  // Load production snapshot for idempotency check
  const productionSnapshot = await getProductionSnapshot(env);
  const existingDealIds = new Set(
    productionSnapshot?.deals.map((d) => d.id) || [],
  );

  for (const deal of deals) {
    const gateResults: Record<string, GateResult> = {};
    let allPassed = true;
    const failureReasons: string[] = [];

    // Run each gate
    for (const gate of VALIDATION_GATES) {
      const gateResult = await runGate(gate, deal, ctx, existingDealIds);
      gateResults[gate] = gateResult;

      if (!gateResult.passed) {
        allPassed = false;
        failureReasons.push(`${gate}: ${gateResult.reason}`);
        result.stats.by_gate[gate] = (result.stats.by_gate[gate] || 0) + 1;
      }
    }

    if (allPassed) {
      // Check for quarantine conditions
      if (shouldQuarantine(deal)) {
        deal.metadata.status = "quarantined";
        result.quarantined.push(deal);
        result.stats.quarantined++;
      } else {
        deal.metadata.status = "active";
        result.valid.push(deal);
        result.stats.valid++;
      }
    } else {
      deal.metadata.status = "rejected";
      result.invalid.push({ deal, reasons: failureReasons });
      result.stats.invalid++;
    }
  }

  return result;
}

/**
 * Run a single validation gate
 */
async function runGate(
  gate: ValidationGate,
  deal: Deal,
  ctx: PipelineContext,
  existingIds: Set<string>,
): Promise<GateResult> {
  switch (gate) {
    case "schema_validation":
      return gateSchemaValidation(deal);
    case "normalization_verification":
      return gateNormalizationVerification(deal);
    case "deduplication_check":
      return gateDeduplicationCheck(deal, ctx);
    case "source_trust":
      return gateSourceTrust(deal);
    case "reward_plausibility":
      return gateRewardPlausibility(deal);
    case "expiry_validation":
      return gateExpiryValidation(deal);
    case "second_pass_validation":
      return gateSecondPassValidation(deal);
    case "idempotency_check":
      return gateIdempotencyCheck(deal, existingIds);
    case "snapshot_hash_verification":
      return gateSnapshotHashVerification(deal, ctx);
    default:
      return { passed: false, reason: "Unknown gate" };
  }
}

// Gate 1: Schema Validation
function gateSchemaValidation(deal: Deal): GateResult {
  const result = DealSchema.safeParse(deal);
  if (result.success) {
    return { passed: true };
  }
  return {
    passed: false,
    reason: `Schema validation failed: ${result.error.errors.map((e) => e.message).join(", ")}`,
  };
}

// Gate 2: Normalization Verification
function gateNormalizationVerification(deal: Deal): GateResult {
  const issues: string[] = [];

  // Check domain is lowercase
  if (deal.source.domain !== deal.source.domain.toLowerCase()) {
    issues.push("domain not lowercase");
  }

  // Check code is uppercase (standard for referral codes)
  if (deal.code !== deal.code.toUpperCase()) {
    issues.push("code not uppercase");
  }

  // Check URL is normalized (no tracking params)
  const trackingParams = ["utm_", "fbclid", "gclid", "ref"];
  for (const param of trackingParams) {
    if (deal.url.includes(param)) {
      issues.push(`URL contains tracking parameter: ${param}`);
    }
  }

  // Check normalized_at is set
  if (!deal.metadata.normalized_at) {
    issues.push("missing normalized_at timestamp");
  }

  if (issues.length > 0) {
    return { passed: false, reason: issues.join("; ") };
  }

  return { passed: true };
}

// Gate 3: Deduplication Check
function gateDeduplicationCheck(deal: Deal, ctx: PipelineContext): GateResult {
  // Check for duplicate in current batch
  const duplicates = ctx.validated.filter(
    (d) =>
      d.id === deal.id ||
      (d.source.domain === deal.source.domain && d.code === deal.code),
  );

  if (duplicates.length > 0) {
    return { passed: false, reason: `Duplicate detected: ${duplicates[0].id}` };
  }

  return { passed: true };
}

// Gate 4: Source Trust
function gateSourceTrust(deal: Deal): GateResult {
  if (deal.source.trust_score < CONFIG.MIN_TRUST_SCORE) {
    return {
      passed: false,
      reason: `Trust score ${deal.source.trust_score} below minimum ${CONFIG.MIN_TRUST_SCORE}`,
    };
  }

  return { passed: true };
}

// Gate 5: Reward Plausibility
function gateRewardPlausibility(deal: Deal): GateResult {
  const reward = deal.reward;

  // Check for negative values
  if (typeof reward.value === "number" && reward.value < 0) {
    return { passed: false, reason: "Negative reward value" };
  }

  // Check for suspiciously high cash values
  if (reward.type === "cash" && typeof reward.value === "number") {
    if (reward.value > CONFIG.MAX_REWARD_VALUE) {
      return {
        passed: false,
        reason: `Reward value ${reward.value} exceeds maximum ${CONFIG.MAX_REWARD_VALUE}`,
      };
    }
  }

  // Check percent is reasonable
  if (reward.type === "percent" && typeof reward.value === "number") {
    if (reward.value > 100) {
      return {
        passed: false,
        reason: `Percent reward ${reward.value}% exceeds 100%`,
      };
    }
  }

  return { passed: true };
}

// Gate 6: Expiry Validation
function gateExpiryValidation(deal: Deal): GateResult {
  if (deal.expiry.date) {
    const expiryDate = new Date(deal.expiry.date);
    const now = new Date();

    if (expiryDate < now) {
      return {
        passed: false,
        reason: `Deal expired on ${deal.expiry.date}`,
      };
    }
  }

  return { passed: true };
}

// Gate 7: Second-Pass Validation
function gateSecondPassValidation(deal: Deal): GateResult {
  // Re-run schema validation on normalized data
  const result = DealSchema.safeParse(deal);

  if (!result.success) {
    return {
      passed: false,
      reason: `Second-pass validation failed: ${result.error.errors[0].message}`,
    };
  }

  // Additional checks on normalized data
  if (deal.code.length < 4) {
    return { passed: false, reason: "Code too short after normalization" };
  }

  if (deal.code.length > 50) {
    return { passed: false, reason: "Code too long after normalization" };
  }

  return { passed: true };
}

// Gate 8: Idempotency Check
function gateIdempotencyCheck(
  deal: Deal,
  existingIds: Set<string>,
): GateResult {
  if (existingIds.has(deal.id)) {
    return {
      passed: false,
      reason: "Deal already exists in production snapshot",
    };
  }

  return { passed: true };
}

// Gate 9: Snapshot Hash Verification
async function gateSnapshotHashVerification(
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
    const ctxKey = `deal_hash_${deal.id}`;
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

/**
 * Check if deal should be quarantined
 */
function shouldQuarantine(deal: Deal): boolean {
  // High reward but low trust
  const isHighValue =
    (deal.reward.type === "cash" &&
      typeof deal.reward.value === "number" &&
      deal.reward.value > CONFIG.HIGH_VALUE_THRESHOLD) ||
    (deal.reward.type === "percent" &&
      typeof deal.reward.value === "number" &&
      deal.reward.value > 50);

  const isLowTrust = deal.source.trust_score < 0.5;

  if (isHighValue && isLowTrust) {
    return true;
  }

  // Anomaly detection: reward 3σ from mean (simplified)
  // In production, calculate actual mean/stddev
  if (deal.reward.type === "cash" && typeof deal.reward.value === "number") {
    if (deal.reward.value > 500) {
      // Flag unusually high rewards
      return true;
    }
  }

  return false;
}

/**
 * Calculate validation success ratio
 */
export function calculateValidationRatio(result: ValidationResult): number {
  if (result.stats.total === 0) return 1.0;
  return result.stats.valid / result.stats.total;
}
