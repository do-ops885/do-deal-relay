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
    keywords: ["stock", "share", "equity", "trade", "commission free"],
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
// Pre-computed Lowercased Definitions for High-Performance Iteration
// ============================================================================

interface PreprocessedCategory {
  category: string;
  categoryCodeMatch: string;
  lowercasedDomains: string[];
  lowercasedKeywords: string[];
}

const PREPROCESSED_CATEGORIES: PreprocessedCategory[] = Object.entries(
  CATEGORY_DEFINITIONS,
).map(([category, definition]) => ({
  category,
  categoryCodeMatch: category.toLowerCase().replace(/_/g, ""),
  lowercasedDomains: definition.domains.map((d) => d.toLowerCase()),
  lowercasedKeywords: definition.keywords.map((kw) => kw.toLowerCase()),
}));

interface PreprocessedTag {
  tag: string;
  lowercasedKeywords: string[];
}

const PREPROCESSED_TAGS: PreprocessedTag[] = Object.entries(
  TAG_DEFINITIONS,
).map(([tag, definition]) => ({
  tag,
  lowercasedKeywords: definition.keywords.map((kw) => kw.toLowerCase()),
}));

// ============================================================================
// Scoring Functions
// ============================================================================

export function calculateCategoryScores(deal: Deal): Map<string, number> {
  const scores = new Map<string, number>();
  const text =
    `${deal.title} ${deal.description} ${deal.source.domain}`.toLowerCase();
  const code = deal.code.toLowerCase();
  const sourceDomain = deal.source.domain.toLowerCase();

  // Score each category using preprocessed lowercased structures
  // to avoid redundant string lowercasing and replace regex operations in hot loops.
  for (const item of PREPROCESSED_CATEGORIES) {
    let score = 0;

    // Check domain match (highest weight)
    for (const domain of item.lowercasedDomains) {
      if (sourceDomain.includes(domain)) {
        score += 10;
        break;
      }
    }

    // Check keyword matches
    for (const keyword of item.lowercasedKeywords) {
      if (text.includes(keyword)) {
        score += 1;
      }
    }

    // Bonus for code relevance
    if (code.includes(item.categoryCodeMatch)) {
      score += 0.5;
    }

    if (score > 0) {
      scores.set(item.category, score);
    }
  }

  return scores;
}

export function calculateTagScores(deal: Deal): Map<string, number> {
  const scores = new Map<string, number>();
  const text = `${deal.title} ${deal.description}`.toLowerCase();

  // Check keyword-based tags using preprocessed lowercased structures
  for (const item of PREPROCESSED_TAGS) {
    let score = 0;

    // Check keyword matches
    for (const keyword of item.lowercasedKeywords) {
      if (text.includes(keyword)) {
        score += 1;
      }
    }

    if (score > 0) {
      scores.set(item.tag, score);
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
