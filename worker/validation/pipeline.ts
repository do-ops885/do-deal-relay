import { Deal, PipelineContext, Env } from "../types";
import type { ValidationCacheEntry } from "../types/validation-cache";
import { VALIDATION_GATES, type ValidationGate, CONFIG } from "../config";
import { getTrustThreshold } from "../lib/config-utils";
import {
  validateDealFastPath,
  type FastPathResult,
} from "../pipeline/validate-fast-path";
import {
  recordValidationGateRejection,
  recordValidationGatePass,
  recordDealCount,
} from "../lib/metrics";
import { getProductionSnapshot } from "../lib/storage";
import { fetchInBatches } from "../lib/utils";

import { ValidationResult, GateResult } from "./types";
import { validateSchema } from "./gates/schema-validation";
import { verifyNormalization } from "./gates/normalization-verification";
import { checkDeduplication } from "./gates/duplicate-check";
import { validateTrustScore } from "./gates/trust-score";
import { validatePriceSanity } from "./gates/price-sanity";
import { validateFreshness } from "./gates/freshness";
import { validateSecondPass } from "./gates/second-pass-validation";
import { checkIdempotency } from "./gates/idempotency-check";
import { verifySnapshotHash } from "./gates/snapshot-hash-verification";

/**
 * Run a single validation step on a deal, running independent synchronous
 * gates in parallel for better throughput.
 */
async function validateSingleDeal(
  deal: Deal,
  ctx: PipelineContext,
  env: Env,
  existingDealIds: Set<string>,
  useCache: boolean,
): Promise<{
  deal: Deal;
  allPassed: boolean;
  failureReasons: string[];
  gateFailures: string[];
  gatePasses: string[];
  isQuarantined: boolean;
  passedTrust: boolean;
}> {
  let allPassed = true;
  const failureReasons: string[] = [];
  const gateFailures: string[] = [];
  const gatePasses: string[] = [];
  let fastPathDecision: FastPathResult | ValidationCacheEntry | null = null;
  let skipGates = false;

  if (useCache) {
    const fastPath = await validateDealFastPath(env, {
      url: deal.url,
      fingerprint: deal.id,
      source: deal.source.domain,
      traceId: ctx.trace_id,
      metrics: ctx.metrics,
    });

    if (fastPath.hit && fastPath.decision) {
      skipGates = true;
      fastPathDecision = fastPath.decision;
    } else {
      fastPathDecision = fastPath;
    }
  }

  if (skipGates && fastPathDecision && "status" in fastPathDecision) {
    allPassed = fastPathDecision.status === "accepted";
    if (!allPassed) {
      failureReasons.push(`cached_rejection: ${fastPathDecision.reason}`);
    }
  }

  if (!skipGates) {
    // Run independent synchronous gates in parallel for better throughput.
    // These gates are pure computation with no side effects on each other.
    const syncGates: ValidationGate[] = [
      "schema_validation",
      "normalization_verification",
      "source_trust",
      "reward_plausibility",
      "expiry_validation",
    ];
    // These gates may do async lookups or check mutable context
    const asyncGates: ValidationGate[] = [
      "deduplication_check",
      "second_pass_validation",
      "idempotency_check",
      "snapshot_hash_verification",
    ];

    // Run sync gates in parallel
    const syncResults = await Promise.all(
      syncGates.map(async (gate) => {
        const gateResult = await runGate(gate, deal, ctx, env, existingDealIds);
        return { gate, result: gateResult };
      }),
    );

    for (const { gate, result } of syncResults) {
      if (!result.passed) {
        allPassed = false;
        failureReasons.push(`${gate}: ${result.reason}`);
        gateFailures.push(gate);
      } else {
        gatePasses.push(gate);
      }
    }

    // Run async gates sequentially (they may depend on previous gate state)
    if (allPassed) {
      for (const gate of asyncGates) {
        const gateResult = await runGate(
          gate,
          deal,
          ctx,
          env,
          existingDealIds,
        );
        if (!gateResult.passed) {
          allPassed = false;
          failureReasons.push(`${gate}: ${gateResult.reason}`);
          gateFailures.push(gate);
          break;
        } else {
          gatePasses.push(gate);
        }
      }
    }
  }

  if (
    useCache &&
    fastPathDecision &&
    "persist" in fastPathDecision &&
    fastPathDecision.persist
  ) {
    const isDuplicate = failureReasons.some(
      (r) => r.includes("Deduplication Check") || r.includes("duplicate"),
    );
    await fastPathDecision.persist({
      status: allPassed
        ? "accepted"
        : isDuplicate
          ? "duplicate"
          : "rejected",
      reason: allPassed ? undefined : failureReasons.join("; "),
      trustScore: deal.source.trust_score,
    });
  }

  const isQuarantined = allPassed && shouldQuarantine(deal);
  if (allPassed) {
    deal.metadata.status = isQuarantined ? "quarantined" : "active";
  } else {
    deal.metadata.status = "rejected";
  }

  const passedTrust = skipGates
    ? fastPathDecision != null &&
      (fastPathDecision as ValidationCacheEntry).trustScore != null
      ? (fastPathDecision as ValidationCacheEntry).trustScore! >=
        getTrustThreshold(env)
      : false
    : gatePasses.includes("source_trust");

  return {
    deal,
    allPassed,
    failureReasons,
    gateFailures,
    gatePasses,
    isQuarantined,
    passedTrust,
  };
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
  const useCache = env.ENABLE_VALIDATION_CACHE === "true";
  const existingDealIds = new Set(
    productionSnapshot?.deals.map((d) => d.id) || [],
  );

  const validationResults = await fetchInBatches(
    deals,
    async (deal) =>
      validateSingleDeal(deal, ctx, env, existingDealIds, useCache),
    10, // Max 10 concurrent deals to stay under 50 subrequest limit
  );

  let passedTrustCount = 0;
  for (const r of validationResults) {
    if (r.passedTrust) {
      passedTrustCount++;
    }
    r.gateFailures.forEach((gate) => {
      result.stats.by_gate[gate] = (result.stats.by_gate[gate] || 0) + 1;
      if (ctx.metrics) {
        recordValidationGateRejection(ctx.metrics, gate);
      }
    });

    r.gatePasses.forEach((gate) => {
      if (ctx.metrics) {
        recordValidationGatePass(ctx.metrics, gate);
      }
    });

    if (r.allPassed) {
      if (r.isQuarantined) {
        result.quarantined.push(r.deal);
        result.stats.quarantined++;
      } else {
        result.valid.push(r.deal);
        result.stats.valid++;
      }
    } else {
      result.invalid.push({ deal: r.deal, reasons: r.failureReasons });
      result.stats.invalid++;
    }
  }

  // Record trust filter pass count for funnel observability
  if (ctx.metrics) {
    recordDealCount(ctx.metrics, "passed_trust_filter", passedTrustCount);
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
  env: Env,
  existingIds: Set<string>,
): Promise<GateResult> {
  switch (gate) {
    case "schema_validation":
      return validateSchema(deal);
    case "normalization_verification":
      return verifyNormalization(deal);
    case "deduplication_check":
      return checkDeduplication(deal, ctx);
    case "source_trust":
      return validateTrustScore(deal, env);
    case "reward_plausibility":
      return validatePriceSanity(deal);
    case "expiry_validation":
      return validateFreshness(deal);
    case "second_pass_validation":
      return validateSecondPass(deal);
    case "idempotency_check":
      return checkIdempotency(deal, existingIds);
    case "snapshot_hash_verification":
      return verifySnapshotHash(deal, ctx);
    default:
      return { passed: false, reason: "Unknown gate" };
  }
}

/**
 * Check if deal should be quarantined
 */
export function shouldQuarantine(deal: Deal): boolean {
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
