import type { Env } from "../../../types";
import type { ToolCallResult } from "../types";
import { generateAnalyticsSummary } from "../../analytics/index";

/**
 * Get stats tool handler
 */
export async function handleGetStats(
  args: { days?: number },
  env: Env,
): Promise<ToolCallResult> {
  const days = args.days || 30;

  try {
    const stats = await generateAnalyticsSummary(env, days);

    return {
      content: [
        {
          type: "text",
          text: `📊 System Statistics (last ${days} days)\n\nActive Deals: ${stats.totalActiveDeals}\nDiscovered: ${stats.totalDealsDiscovered}\nTop Category: ${stats.topCategory}\nTop Source: ${stats.topSource}`,
        },
        {
          type: "resource",
          resource: {
            uri: "analytics://summary",
            mimeType: "application/json",
            text: JSON.stringify(stats, null, 2),
          },
        },
      ],
      structuredContent: stats,
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `⚠️ Could not generate full statistics: ${(error as Error).message}`,
        },
        {
          type: "resource",
          resource: {
            uri: "analytics://summary",
            mimeType: "application/json",
            text: JSON.stringify(
              {
                totalActiveDeals: 0,
                totalDealsDiscovered: 0,
                topCategory: "N/A",
                topSource: "N/A",
                expiringNext7Days: 0,
                error: (error as Error).message,
              },
              null,
              2,
            ),
          },
        },
      ],
      isError: false,
    };
  }
}
