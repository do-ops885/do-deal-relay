import { z } from "zod";
import type { Env } from "../../../types";
import type { ToolCallResult } from "../types";
import { getProductionSnapshot } from "../../storage";
import { getTopDeals, getExpiringDeals, getRecentDeals } from "../../ranking";
import { calculateStringSimilarity } from "../../crypto";

export const GetSimilarDealsInputSchema = z.object({
  code: z
    .string()
    .optional()
    .describe("The referral code to find similar deals for"),
  domain: z
    .string()
    .optional()
    .describe("Alternatively, find deals for this domain"),
  limit: z.number().int().min(1).max(50).default(5).describe("Maximum results"),
});

/**
 * Get similar deals tool handler
 * Consolidated from /deals/similar
 */
export async function handleGetSimilarDeals(
  args: z.infer<typeof GetSimilarDealsInputSchema>,
  env: Env,
): Promise<ToolCallResult> {
  const { code, domain, limit } = args;

  if (!code && !domain) {
    return {
      content: [
        {
          type: "text",
          text: "❌ Either 'code' or 'domain' parameter is required.",
        },
      ],
      isError: true,
    };
  }

  const snapshot = await getProductionSnapshot(env);
  if (!snapshot) {
    return {
      content: [{ type: "text", text: "❌ No deals available in production." }],
      isError: true,
    };
  }

  const targetDeal = snapshot.deals.find(
    (d) => code && d.code.toLowerCase() === code.toLowerCase(),
  );

  if (!targetDeal && domain) {
    const byDomain = snapshot.deals.filter(
      (d) => d.source.domain.toLowerCase() === domain.toLowerCase(),
    );
    if (byDomain.length === 0) {
      return {
        content: [
          { type: "text", text: `❌ No deals found for domain "${domain}".` },
        ],
        isError: true,
      };
    }
    return {
      content: [
        {
          type: "text",
          text: `Found ${byDomain.length} deals for domain "${domain}".`,
        },
      ],
      structuredContent: {
        similar: [],
        total: 0,
        reason: "No reference deal found, showing domain deals",
        domain_deals: byDomain.slice(0, limit),
      },
    };
  }

  if (!targetDeal) {
    return {
      content: [
        { type: "text", text: `❌ Deal with code "${code}" not found.` },
      ],
      isError: true,
    };
  }

  const targetCategories = new Set(
    targetDeal.metadata.category.map((c) => c.toLowerCase()),
  );
  const targetTags = new Set(
    targetDeal.metadata.tags.map((t) => t.toLowerCase()),
  );
  const targetDomain = targetDeal.source.domain.toLowerCase();

  const similar = snapshot.deals
    .filter((d) => d.id !== targetDeal.id)
    .map((d) => {
      let score = 0;
      const dealCategories = new Set(
        d.metadata.category.map((c) => c.toLowerCase()),
      );
      for (const cat of targetCategories) {
        if (dealCategories.has(cat)) score += 3;
      }
      if (d.source.domain.toLowerCase() === targetDomain) {
        score += 2;
      }
      const dealTags = new Set(d.metadata.tags.map((t) => t.toLowerCase()));
      for (const tag of targetTags) {
        if (dealTags.has(tag)) score += 1;
      }
      const codeSim = calculateStringSimilarity(targetDeal.code, d.code);
      score += codeSim;
      return { deal: d, similarity: score };
    })
    .filter((s) => s.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .map((s) => s.deal);

  return {
    content: [
      {
        type: "text",
        text: `Found ${similar.length} similar deals for code "${code}".`,
      },
      {
        type: "resource",
        resource: {
          uri: `deals://${code}/similar`,
          mimeType: "application/json",
          text: JSON.stringify({ reference: targetDeal.id, similar }, null, 2),
        },
      },
    ],
    structuredContent: {
      reference: {
        id: targetDeal.id,
        title: targetDeal.title,
        code: targetDeal.code,
        domain: targetDeal.source.domain,
      },
      similar,
      total: similar.length,
    },
  };
}

/**
 * Get deal highlights tool handler
 * Consolidated from /deals/highlights
 */
export async function handleGetDealHighlights(
  args: { limit?: number },
  env: Env,
): Promise<ToolCallResult> {
  const limit = args.limit || 5;
  const snapshot = await getProductionSnapshot(env);

  if (!snapshot) {
    return {
      content: [{ type: "text", text: "❌ No deals available." }],
      isError: true,
    };
  }

  const topDeals = getTopDeals(snapshot.deals, limit);
  const expiringSoon = getExpiringDeals(snapshot.deals, 7);
  const recentlyAdded = getRecentDeals(snapshot.deals, 7);

  const result = {
    top_deals: topDeals,
    expiring_soon: expiringSoon,
    recently_added: recentlyAdded,
    meta: {
      top_deals_count: topDeals.length,
      expiring_soon_count: expiringSoon.length,
      recently_added_count: recentlyAdded.length,
    },
  };

  return {
    content: [
      {
        type: "text",
        text: `🌟 Deal Highlights: ${topDeals.length} top deals, ${expiringSoon.length} expiring soon, ${recentlyAdded.length} new.`,
      },
      {
        type: "resource",
        resource: {
          uri: "deals://highlights",
          mimeType: "application/json",
          text: JSON.stringify(result, null, 2),
        },
      },
    ],
    structuredContent: result,
  };
}
