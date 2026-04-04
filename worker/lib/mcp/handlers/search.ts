import { z } from "zod";
import type { Env } from "../../types";
import type { ToolCallResult } from "../types";
import { searchReferrals, referralToDeal } from "../../referral-storage/search";
import { rankDeals } from "../../ranking";

export const SearchDealsInputSchema = z.object({
  domain: z
    .string()
    .optional()
    .describe("Filter by domain (e.g., 'scalable.capital')"),
  category: z
    .string()
    .optional()
    .describe("Filter by category (e.g., 'finance', 'shopping')"),
  status: z
    .enum(["active", "inactive", "expired", "all"])
    .optional()
    .describe("Filter by status"),
  query: z.string().optional().describe("Free text search query"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(10)
    .describe("Maximum results to return"),
  sort_by: z
    .enum(["confidence", "recency", "value", "expiry", "trust"])
    .optional()
    .describe("Field to sort by"),
  order: z.enum(["asc", "desc"]).optional().describe("Sort order"),
  min_confidence: z.number().min(0).max(1).optional().describe("Minimum confidence score"),
  min_trust: z.number().min(0).max(1).optional().describe("Minimum trust score"),
});

/**
 * Search deals tool handler
 * Enhanced with advanced filtering and ranking
 */
export async function handleSearchDeals(
  args: z.infer<typeof SearchDealsInputSchema>,
  env: Env,
): Promise<ToolCallResult> {
  const { domain, category, status, query, limit, sort_by, order, min_confidence, min_trust } = args;

  // Build search filters for base search
  const filters = {
    domain,
    category,
    status: status || "all",
    q: query,
    limit: 1000, // Get more for ranking/filtering
    offset: 0,
  };

  const { referrals, total } = await searchReferrals(env, filters);

  // Convert to Deal format for ranking
  const deals = referrals.map((r) => {
    const dealBase = referralToDeal(r);
    return {
      ...dealBase,
      id: r.id || `ref-${r.domain || "unknown"}-${r.code}`,
    };
  });

  // Use rankDeals for advanced filtering and sorting
  const rankingResult = rankDeals(deals as any, {
    sortBy: (sort_by || "confidence") as any,
    order: (order || "desc") as any,
    limit: limit || 10,
    minConfidence: min_confidence,
    minTrustScore: min_trust,
    category: category,
  });

  const formattedDeals = rankingResult.deals.map((d) => ({
    code: d.code,
    url: d.url,
    domain: d.source.domain || "unknown",
    title: d.title || "Untitled",
    description: d.description || "",
    status: d.metadata.status || "unknown",
    reward: {
      type: d.reward.type || "unknown",
      value: d.reward.value || null,
    },
    confidence: d.metadata.confidence_score || 0.5,
  }));

  return {
    content: [
      {
        type: "text",
        text: `Found ${rankingResult.total} base deals, ${rankingResult.filtered} after filtering. Returning top ${formattedDeals.length}.`,
      },
      {
        type: "resource",
        resource: {
          uri: `deals://search?${new URLSearchParams({ domain: domain || "", category: category || "", status: status || "" }).toString()}`,
          mimeType: "application/json",
          text: JSON.stringify({ deals: formattedDeals, total: rankingResult.total, filtered: rankingResult.filtered }, null, 2),
        },
      },
    ],
    structuredContent: { deals: formattedDeals, total: rankingResult.total, filtered: rankingResult.filtered },
  };
}
