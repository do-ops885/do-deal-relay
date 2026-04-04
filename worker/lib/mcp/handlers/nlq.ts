import { z } from "zod";
import type { Env } from "../../types";
import type { ToolCallResult } from "../types";
import { executeNLQ } from "../../../routes/nlq/index";

export const NaturalLanguageQueryInputSchema = z.object({
  query: z
    .string()
    .describe(
      "Natural language query (e.g., 'finance deals', 'codes from trading212.com')",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("Maximum results to return"),
  includeSql: z
    .boolean()
    .default(false)
    .describe("Include generated SQL in response (debug mode)"),
});

/**
 * Natural Language Query tool handler
 */
export async function handleNaturalLanguageQuery(
  args: z.infer<typeof NaturalLanguageQueryInputSchema>,
  env: Env,
): Promise<ToolCallResult> {
  const { query, limit, includeSql } = args;

  const result = await executeNLQ(env, query, limit);

  if (!result.success) {
    return {
      content: [
        {
          type: "text",
          text: `❌ Natural language query failed for: "${query}"`,
        },
      ],
      isError: true,
      structuredContent: result,
    };
  }

  interface DealResult {
    deal_id: string;
    title: string;
    description: string;
    domain: string;
    code: string;
    url: string;
    reward_type: string;
    reward_value: number;
    status: string;
    category: string[];
    confidence_score: number;
  }

  const deals = result.results.map((r) => {
    const deal = r as DealResult;
    return {
      deal_id: deal.deal_id,
      title: deal.title,
      description: deal.description,
      domain: deal.domain,
      code: deal.code,
      url: deal.url,
      reward_type: deal.reward_type,
      reward_value: deal.reward_value,
      status: deal.status,
      category: deal.category,
      confidence_score: deal.confidence_score,
    };
  });

  // Build response text
  let responseText = `🔍 Natural Language Query: "${query}"\n\n`;
  responseText += `Parsed as: ${result.parsed.type}\n`;
  responseText += `Found ${result.count} deals\n\n`;

  if (result.count > 0) {
    responseText += "Top results:\n";
    deals.slice(0, 5).forEach((d, i) => {
      responseText += `${i + 1}. ${d.title} (${d.domain}) - ${d.code}\n`;
    });
  } else if (result.suggestions && result.suggestions.length > 0) {
    responseText += `No results found. Did you mean: ${result.suggestions.join(", ")}?`;
  }

  const content: Array<
    | { type: "text"; text: string }
    | {
        type: "resource";
        resource: { uri: string; mimeType: string; text: string };
      }
  > = [
    {
      type: "text",
      text: responseText,
    },
  ];

  // Add SQL if requested
  if (includeSql && result.sql) {
    content.push({
      type: "resource",
      resource: {
        uri: `nlq://sql?${encodeURIComponent(query)}`,
        mimeType: "text/plain",
        text: `-- Generated SQL\n${result.sql}`,
      },
    });
  }

  // Add results resource
  content.push({
    type: "resource",
    resource: {
      uri: `nlq://results?${encodeURIComponent(query)}`,
      mimeType: "application/json",
      text: JSON.stringify({ deals, count: result.count }, null, 2),
    },
  });

  return {
    content,
    structuredContent: {
      success: result.success,
      query: result.query,
      parsed: result.parsed,
      count: result.count,
      deals,
      suggestions: result.suggestions,
      sql: includeSql ? result.sql : undefined,
    },
  };
}
