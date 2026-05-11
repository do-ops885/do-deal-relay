import { Deal } from "../../types";
import { GateResult } from "../types";

/**
 * Gate 2: Normalization Verification
 */
export function verifyNormalization(deal: Deal): GateResult {
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
