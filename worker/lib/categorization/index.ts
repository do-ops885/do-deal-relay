import type { Deal, DealMetadata } from "../../types";
import { calculateCategoryScores, calculateTagScores } from "./scoring";

// ============================================================================
// Auto-Categorization
// ============================================================================

export function autoCategorize(deal: Deal): DealMetadata {
  const categoryScores = calculateCategoryScores(deal);
  const tagScores = calculateTagScores(deal);

  // Get top categories (score >= 2)
  const categories: string[] = [];
  const sortedCategories = Array.from(categoryScores.entries()).sort(
    (a, b) => b[1] - a[1],
  );

  // Always include top category if score >= 2
  if (sortedCategories.length > 0 && sortedCategories[0][1] >= 2) {
    categories.push(sortedCategories[0][0]);

    // Include second category if score is close (within 50%)
    if (sortedCategories.length > 1) {
      const topScore = sortedCategories[0][1];
      const secondScore = sortedCategories[1][1];
      if (secondScore >= topScore * 0.5 && secondScore >= 2) {
        categories.push(sortedCategories[1][0]);
      }
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

  // Get top tags (score >= 1, max 5 tags)
  const tags: string[] = [];
  const sortedTags = Array.from(tagScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag);

  // Add domain as tag
  tags.push(deal.source.domain.replace(/\.[a-z]+$/, ""));

  // Add source type
  tags.push("auto-categorized");

  // Add high-scoring tags
  tags.push(...sortedTags);

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
