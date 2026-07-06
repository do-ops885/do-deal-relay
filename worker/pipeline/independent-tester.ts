// worker/pipeline/independent-tester.ts
// Independent tester role for the PEV loop.
// Tests are written from acceptance criteria, NOT from the author's code.
// This prevents the conflict of interest where author grades own work.

import type { Deal, PipelineContext, Env } from "../types";
import { CONFIG } from "../config";
import { logger } from "../lib/global-logger";

// ============================================================================
// Test Result Types
// ============================================================================

export interface TestResult {
  gate: string;
  passed: boolean;
  message: string;
  details?: string[];
  timestamp: string;
}

export interface VerificationReport {
  run_id: string;
  overall_pass: boolean;
  results: TestResult[];
  passed_count: number;
  failed_count: number;
  coverage_floor: number;
  timestamp: string;
}

// ============================================================================
// Acceptance Criteria Validators
// ============================================================================

/**
 * Validates a deal against acceptance criteria derived from the spec.
 * Each validator checks one acceptance criterion independently.
 */
const ACCEPTANCE_CRITERIA_VALIDATORS = [
  {
    name: "schema_validation",
    description: "Deal passes all schema validation gates",
    validate: (deal: Deal): TestResult => {
      const issues: string[] = [];

      if (!deal.id || deal.id.length === 0) {
        issues.push("Missing deal ID");
      }
      if (!deal.title || deal.title.length < 1 || deal.title.length > 200) {
        issues.push(`Invalid title length: ${deal.title.length}`);
      }
      if (
        !deal.description ||
        deal.description.length < 1 ||
        deal.description.length > 1000
      ) {
        issues.push(`Invalid description length: ${deal.description.length}`);
      }
      if (!deal.code || deal.code.length > 50) {
        issues.push(`Invalid code length: ${deal.code.length}`);
      }
      if (!deal.url || !isValidUrl(deal.url)) {
        issues.push(`Invalid URL: ${deal.url}`);
      }

      return {
        gate: "schema_validation",
        passed: issues.length === 0,
        message:
          issues.length === 0
            ? "Deal schema is valid"
            : `Schema issues: ${issues.join(", ")}`,
        details: issues.length > 0 ? issues : undefined,
        timestamp: new Date().toISOString(),
      };
    },
  },
  {
    name: "trust_score_initialized",
    description: "Trust score is within valid bounds",
    validate: (deal: Deal): TestResult => {
      const trust = deal.source.trust_score;
      const valid = trust >= 0 && trust <= 1;
      return {
        gate: "trust_score_initialized",
        passed: valid,
        message: valid
          ? `Trust score ${trust} is valid`
          : `Trust score ${trust} is out of bounds [0, 1]`,
        timestamp: new Date().toISOString(),
      };
    },
  },
  {
    name: "reward_plausibility",
    description: "Reward value is plausible and within bounds",
    validate: (deal: Deal): TestResult => {
      const issues: string[] = [];

      if (
        deal.reward.type === "cash" &&
        typeof deal.reward.value === "number"
      ) {
        if (deal.reward.value < 0) {
          issues.push("Negative cash reward");
        }
        if (deal.reward.value > CONFIG.MAX_REWARD_VALUE) {
          issues.push(
            `Cash reward ${deal.reward.value} exceeds max ${CONFIG.MAX_REWARD_VALUE}`,
          );
        }
      }

      if (
        deal.reward.type === "percent" &&
        typeof deal.reward.value === "number"
      ) {
        if (deal.reward.value < 0 || deal.reward.value > 100) {
          issues.push(
            `Percent reward ${deal.reward.value} out of range [0, 100]`,
          );
        }
      }

      return {
        gate: "reward_plausibility",
        passed: issues.length === 0,
        message:
          issues.length === 0
            ? "Reward is plausible"
            : `Reward issues: ${issues.join(", ")}`,
        details: issues.length > 0 ? issues : undefined,
        timestamp: new Date().toISOString(),
      };
    },
  },
  {
    name: "expiry_validation",
    description: "Expiry date is valid and not in the past",
    validate: (deal: Deal): TestResult => {
      const issues: string[] = [];

      if (deal.expiry.type === "hard" && deal.expiry.date) {
        const expiryDate = new Date(deal.expiry.date);
        if (isNaN(expiryDate.getTime())) {
          issues.push("Invalid expiry date format");
        } else if (expiryDate < new Date()) {
          issues.push("Expiry date is in the past");
        }
      }

      if (deal.expiry.confidence < 0 || deal.expiry.confidence > 1) {
        issues.push(
          `Expiry confidence ${deal.expiry.confidence} out of bounds`,
        );
      }

      return {
        gate: "expiry_validation",
        passed: issues.length === 0,
        message:
          issues.length === 0
            ? "Expiry is valid"
            : `Expiry issues: ${issues.join(", ")}`,
        details: issues.length > 0 ? issues : undefined,
        timestamp: new Date().toISOString(),
      };
    },
  },
  {
    name: "source_url_format",
    description: "Source URL is properly formatted",
    validate: (deal: Deal): TestResult => {
      const valid = isValidUrl(deal.source.url);
      return {
        gate: "source_url_format",
        passed: valid,
        message: valid
          ? "Source URL is valid"
          : `Invalid source URL: ${deal.source.url}`,
        timestamp: new Date().toISOString(),
      };
    },
  },
  {
    name: "metadata_integrity",
    description: "Metadata has required fields and valid values",
    validate: (deal: Deal): TestResult => {
      const issues: string[] = [];

      if (!deal.metadata.category) {
        issues.push("Missing category tags");
      }
      if (!deal.metadata.tags) {
        issues.push("Missing metadata tags");
      }
      if (!deal.metadata.normalized_at) {
        issues.push("Missing normalized_at timestamp");
      }
      if (deal.metadata.confidence_score < 0) {
        issues.push("Invalid confidence_score");
      }
      if (
        !["active", "quarantined", "rejected"].includes(deal.metadata.status)
      ) {
        issues.push(`Invalid status: ${deal.metadata.status}`);
      }

      return {
        gate: "metadata_integrity",
        passed: issues.length === 0,
        message:
          issues.length === 0
            ? "Metadata is valid"
            : `Metadata issues: ${issues.join(", ")}`,
        details: issues.length > 0 ? issues : undefined,
        timestamp: new Date().toISOString(),
      };
    },
  },
];

// ============================================================================
// Independent Tester
// ============================================================================

/**
 * Runs independent verification against acceptance criteria.
 * This is separate from the author agent to prevent conflict of interest.
 *
 * @param deals - Deals to verify
 * @param ctx - Pipeline context with run metadata
 * @param env - Environment bindings
 * @returns Verification report with pass/fail per criterion
 */
export async function runIndependentVerification(
  deals: Deal[],
  ctx: PipelineContext,
  _env: Env,
): Promise<VerificationReport> {
  const results: TestResult[] = [];
  let passedCount = 0;
  let failedCount = 0;

  logger.info("Starting independent verification", {
    run_id: ctx.run_id,
    deal_count: deals.length,
    criteria_count: ACCEPTANCE_CRITERIA_VALIDATORS.length,
  });

  for (const deal of deals) {
    for (const validator of ACCEPTANCE_CRITERIA_VALIDATORS) {
      try {
        const result = validator.validate(deal);
        results.push(result);

        if (result.passed) {
          passedCount++;
        } else {
          failedCount++;
          logger.warn(`Verification failed: ${validator.name}`, {
            run_id: ctx.run_id,
            deal_id: deal.id,
            gate: validator.name,
            message: result.message,
          });
        }
      } catch (error) {
        failedCount++;
        results.push({
          gate: validator.name,
          passed: false,
          message: `Verification error: ${error instanceof Error ? error.message : String(error)}`,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  const overallPass = failedCount === 0;
  const coverageFloor = CONFIG.MIN_CONFIDENCE_SCORE;

  const report: VerificationReport = {
    run_id: ctx.run_id,
    overall_pass: overallPass,
    results,
    passed_count: passedCount,
    failed_count: failedCount,
    coverage_floor: coverageFloor,
    timestamp: new Date().toISOString(),
  };

  logger.info("Independent verification complete", {
    run_id: ctx.run_id,
    overall_pass: overallPass,
    passed: passedCount,
    failed: failedCount,
  });

  return report;
}

/**
 * Summarizes verification failures for feedback to the PLAN phase.
 * This is the structured failure output that sharpens the next plan attempt.
 */
export function summarizeVerificationFailures(
  report: VerificationReport,
): string {
  const failures = report.results.filter((r) => !r.passed);
  if (failures.length === 0) return "";

  const lines = [
    `Verification failed: ${failures.length} gate(s) failed`,
    "",
    ...failures.map((f) => `- ${f.gate}: ${f.message}`),
    "",
    "Failed gates must be addressed before merge.",
  ];

  return lines.join("\n");
}

// ============================================================================
// Helpers
// ============================================================================

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
