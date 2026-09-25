import type { Deal, DealMetadata } from "../../types";
import { calculateCategoryScores, calculateTagScores } from "./scoring";

// ============================================================================
// Auto-Categorization
// ============================================================================

export function autoCategorize(deal: Deal): DealMetadata {
  const categoryScores = calculateCategoryScores(deal);
  const tagScores = calculateTagScores(deal);

  const categories: string[] = [];

  // Performance optimization: Track top two categories in a single O(N) pass
  // without allocating intermediate arrays via Array.from(categoryScores.entries()).sort().
  let topCat: string | null = null;
  let topScore = -1;
  let secondCat: string | null = null;
  let secondScore = -1;

  for (const [cat, score] of categoryScores) {
    if (score > topScore) {
      secondCat = topCat;
      secondScore = topScore;
      topCat = cat;
      topScore = score;
    } else if (score > secondScore) {
      secondCat = cat;
      secondScore = score;
    }
  }

  if (topCat && topScore >= 2) {
    categories.push(topCat);

    if (secondCat && secondScore >= topScore * 0.5 && secondScore >= 2) {
      categories.push(secondCat);
    }
  }

  // Default to "general" if no categories found
  if (categories.length === 0) {
    categories.push("general");
  }

  // Always add "referral" if it's a referral deal
  if (!categories.includes("referral")) {
    categories.push("referral");
  }

  const tags: string[] = [];

  // Add domain as tag
  tags.push(deal.source.domain.replace(/\.[a-z]+$/, ""));

  // Add source type
  tags.push("auto-categorized");

  // Performance optimization: Extract top 5 high-scoring tags directly without
  // intermediate .slice().map() array allocations.
  if (tagScores.size > 0) {
    const sortedTagEntries = Array.from(tagScores.entries()).sort(
      (a, b) => b[1] - a[1],
    );
    const topTagCount = Math.min(5, sortedTagEntries.length);
    for (let i = 0; i < topTagCount; i++) {
      tags.push(sortedTagEntries[i][0]);
    }
  }

  // Remove duplicates and limit
  const uniqueTags = [...new Set(tags)].slice(0, 8);

  return {
    ...deal.metadata,
    category: categories,
    tags: uniqueTags,
  };
}

export function batchAutoCategorize(deals: Deal[]): Deal[] {
  return deals.map((deal) => ({
    ...deal,
    metadata: autoCategorize(deal),
  }));
}

// ============================================================================
// Statistics
// ============================================================================

export function getCategoryStats(deals: Deal[]): Record<string, number> {
  const stats: Record<string, number> = {};

  for (const deal of deals) {
    for (const category of deal.metadata.category) {
      stats[category] = (stats[category] || 0) + 1;
    }
  }

  return stats;
}

export function getTagStats(deals: Deal[]): Record<string, number> {
  const stats: Record<string, number> = {};

  for (const deal of deals) {
    for (const tag of deal.metadata.tags) {
      stats[tag] = (stats[tag] || 0) + 1;
    }
  }

  return stats;
}
