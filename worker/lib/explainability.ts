import { Deal, PipelineContext } from "../pipeline/types"

/**
 * Interface for the deal status explanation
 */
export interface DealExplanation {
  deal_id: string;
  status: string;
  summary: string;
  factors: {
    validation: {
      passed: string[];
      failed: string[];
    };
    scoring: {
      confidence: number;
      trust: number;
      recency: number;
      value: number;
      expiry: number;
      total: number;
    };
  };
  recommendation: string;
}

/**
 * Generates an explanation for a deal's current status and quality
 */
export function explainDeal(
  deal: Deal,
  ctx?: PipelineContext,
): DealExplanation {
  const status = deal.metadata.status;
  const confidence = deal.metadata.confidence_score;
  const trust = deal.source.trust_score;

  // Recency calculation
  const discoveredAt = new Date(deal.source.discovered_at).getTime();
  const now = Date.now();
  const ageInHours = (now - discoveredAt) / (1000 * 60 * 60);
  const recencyScore = Math.max(0, 1 - ageInHours / (24 * 7)); // 1 week decay

  // Value calculation
  let valueScore = 0;
  if (deal.reward.type === "cash" && typeof deal.reward.value === "number") {
    valueScore = Math.min(1, deal.reward.value / 500);
  } else if (
    deal.reward.type === "percent" &&
    typeof deal.reward.value === "number"
  ) {
    valueScore = Math.min(1, deal.reward.value / 100);
  }

  // Expiry calculation
  const expiryScore = deal.expiry.confidence;

  const totalScore =
    confidence * 0.25 +
    trust * 0.2 +
    recencyScore * 0.2 +
    valueScore * 0.2 +
    expiryScore * 0.15;

  let summary = `This deal is ${status}. `;
  if (status === "active") {
    if (totalScore > 0.8) {
      summary +=
        "It is a high-quality deal with strong evidence and a trusted source.";
    } else if (totalScore > 0.5) {
      summary += "It is a valid deal with moderate confidence.";
    } else {
      summary += "It is valid but has low overall confidence.";
    }
  } else if (status === "quarantined") {
    summary +=
      "It has been quarantined due to high value combined with low source trust.";
  } else {
    summary += "It was rejected during the validation process.";
  }

  const recommendation =
    status === "active" && totalScore > 0.7
      ? "Highly recommended for promotion."
      : status === "active"
        ? "Suitable for regular listing."
        : "Requires further verification or should be ignored.";

  return {
    deal_id: deal.id,
    status,
    summary,
    factors: {
      validation: {
        passed: [], // Note: Validation gate details would need per-deal persistence
        failed: [],
      },
      scoring: {
        confidence,
        trust,
        recency: parseFloat(recencyScore.toFixed(2)),
        value: parseFloat(valueScore.toFixed(2)),
        expiry: parseFloat(expiryScore.toFixed(2)),
        total: parseFloat(totalScore.toFixed(2)),
      },
    },
    recommendation,
  };
}
