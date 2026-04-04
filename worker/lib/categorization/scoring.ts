import type { Deal } from "../../types";
import { CATEGORY_DEFINITIONS } from "./definitions";

// ============================================================================
// Tag Definitions
// ============================================================================

export interface TagDefinition {
  keywords: string[];
  relatedCategories: string[];
}

export const TAG_DEFINITIONS: Record<string, TagDefinition> = {
  signup_bonus: {
    keywords: [
      "sign up",
      "new account",
      "first deposit",
      "welcome bonus",
      "new user",
    ],
    relatedCategories: ["finance", "referral", "shopping"],
  },
  cashback: {
    keywords: ["cashback", "cash back", "percent back", "% back", "reward"],
    relatedCategories: ["finance", "shopping"],
  },
  crypto: {
    keywords: [
      "bitcoin",
      "ethereum",
      "crypto",
      "cryptocurrency",
      "btc",
      "eth",
      "wallet",
    ],
    relatedCategories: ["finance"],
  },
  stock_trading: {
    keywords: ["stock", "share", "equity", "trade", "trade", "commission free"],
    relatedCategories: ["finance"],
  },
  high_value: {
    keywords: [],
    relatedCategories: [], // Determined by reward value
  },
  limited_time: {
    keywords: ["limited", "expires", "deadline", "ends soon", "while supplies"],
    relatedCategories: [],
  },
  recurring: {
    keywords: [
      "monthly",
      "annual",
      "subscription",
      "recurring",
      "per month",
      "per year",
    ],
    relatedCategories: [],
  },
};

// ============================================================================
// Scoring Functions
// ============================================================================

export function calculateCategoryScores(deal: Deal): Map<string, number> {
  const scores = new Map<string, number>();
  const text =
    `${deal.title} ${deal.description} ${deal.source.domain}`.toLowerCase();
  const code = deal.code.toLowerCase();

  // Score each category
  for (const [category, definition] of Object.entries(CATEGORY_DEFINITIONS)) {
    let score = 0;

    // Check domain match (highest weight)
    if (
      definition.domains.some((d) =>
        deal.source.domain.toLowerCase().includes(d),
      )
    ) {
      score += 10;
    }

    // Check keyword matches
    for (const keyword of definition.keywords) {
      if (text.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }

    // Bonus for code relevance
    if (code.includes(category.toLowerCase().replace("_", ""))) {
      score += 0.5;
    }

    if (score > 0) {
      scores.set(category, score);
    }
  }

  return scores;
}

export function calculateTagScores(deal: Deal): Map<string, number> {
  const scores = new Map<string, number>();
  const text = `${deal.title} ${deal.description}`.toLowerCase();

  // Check keyword-based tags
  for (const [tag, definition] of Object.entries(TAG_DEFINITIONS)) {
    let score = 0;

    // Check keyword matches
    for (const keyword of definition.keywords) {
      if (text.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }

    if (score > 0) {
      scores.set(tag, score);
    }
  }

  // High value tag based on reward
  const rewardValue =
    typeof deal.reward.value === "number" ? deal.reward.value : 0;
  if (rewardValue >= 50) {
    scores.set("high_value", rewardValue);
  }

  return scores;
}
