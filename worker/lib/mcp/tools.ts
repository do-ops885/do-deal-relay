/**
 * MCP Tools Implementation
 *
 * Implements all MCP tools for the do-deal-relay deal discovery system:
 * - search_deals: Search deals by domain, category, status
 * - get_deal: Get specific deal by code
 * - add_referral: Add new referral code
 * - research_domain: Research referral codes for a domain
 * - list_categories: List available deal categories
 * - validate_deal: Validate a deal's URL and status
 *
 * @module worker/lib/mcp/tools
 */

import { z } from "zod";
import type { Env, ReferralInput } from "../../types";
import type { Tool, ToolCallResult, ToolHandler } from "./types";
import {
  searchReferrals,
  getReferralsByDomain,
  referralToDeal,
} from "../referral-storage/search";
import {
  getReferralByCode,
  storeReferralInput,
} from "../referral-storage/crud";
import { REFERRAL_KEYS } from "../referral-storage/types";
import { CATEGORY_DEFINITIONS } from "../categorization/definitions";
import { generateAnalyticsSummary } from "../analytics/index";
import { executeNLQ, parseNaturalLanguageQuery } from "../../routes/nlq/index";

// ============================================================================
// Tool Input/Output Schemas (Zod)
// ============================================================================

const SearchDealsInputSchema = z.object({
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
});

const GetDealInputSchema = z.object({
  code: z.string().describe("The referral code to look up"),
});

const AddReferralInputSchema = z.object({
  code: z.string().describe("The referral code"),
  url: z.string().url().describe("Full referral URL"),
  domain: z.string().describe("Domain (e.g., 'example.com')"),
  title: z.string().optional().describe("Title/description of the deal"),
  description: z.string().optional().describe("Detailed description"),
  reward_type: z
    .enum(["cash", "credit", "percent", "item"])
    .default("cash")
    .describe("Type of reward"),
  reward_value: z
    .union([z.string(), z.number()])
    .optional()
    .describe("Reward amount or description"),
  category: z
    .array(z.string())
    .optional()
    .describe("Categories (e.g., ['finance', 'investing'])"),
  expiry_date: z
    .string()
    .datetime()
    .optional()
    .describe("Expiration date in ISO format"),
});

const ResearchDomainInputSchema = z.object({
  domain: z.string().describe("Domain to research (e.g., 'dropbox.com')"),
  depth: z
    .enum(["quick", "thorough", "deep"])
    .default("thorough")
    .describe("Research depth"),
  max_results: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("Maximum results"),
});

const ListCategoriesInputSchema = z.object({
  include_descriptions: z
    .boolean()
    .default(false)
    .describe("Include category descriptions"),
});

const ValidateDealInputSchema = z.object({
  url: z.string().url().describe("URL to validate"),
  check_status: z.boolean().default(true).describe("Check if deal is active"),
});

const NaturalLanguageQueryInputSchema = z.object({
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

// ============================================================================
// Tool Definitions
// ============================================================================

export const MCP_TOOLS: Tool[] = [
  {
    name: "search_deals",
    title: "Search Deals",
    description:
      "Search for referral deals by domain, category, status, or keywords",
    inputSchema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Filter by domain (e.g., 'scalable.capital')",
        },
        category: {
          type: "string",
          description: "Filter by category (e.g., 'finance', 'shopping')",
        },
        status: {
          type: "string",
          enum: ["active", "inactive", "expired", "all"],
          description: "Filter by status",
        },
        query: { type: "string", description: "Free text search query" },
        limit: {
          type: "number",
          minimum: 1,
          maximum: 100,
          default: 10,
          description: "Maximum results",
        },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        deals: {
          type: "array",
          items: {
            type: "object",
            properties: {
              code: { type: "string" },
              url: { type: "string" },
              domain: { type: "string" },
              title: { type: "string" },
              description: { type: "string" },
              status: { type: "string" },
              reward: { type: "object" },
              confidence: { type: "number" },
            },
          },
        },
        total: { type: "number" },
      },
    },
    annotations: {
      title: "Search Deals",
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "get_deal",
    title: "Get Deal Details",
    description: "Get detailed information about a specific referral code",
    inputSchema: {
      type: "object",
      required: ["code"],
      properties: {
        code: { type: "string", description: "The referral code to look up" },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        code: { type: "string" },
        url: { type: "string" },
        domain: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        status: { type: "string" },
        reward: { type: "object" },
        confidence: { type: "number" },
        submitted_at: { type: "string" },
      },
    },
    annotations: {
      title: "Get Deal",
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "add_referral",
    title: "Add Referral Code",
    description: "Add a new referral code to the system",
    inputSchema: {
      type: "object",
      required: ["code", "url", "domain"],
      properties: {
        code: { type: "string", description: "The referral code" },
        url: { type: "string", description: "Full referral URL" },
        domain: { type: "string", description: "Domain (e.g., 'example.com')" },
        title: { type: "string", description: "Title/description of the deal" },
        description: { type: "string", description: "Detailed description" },
        reward_type: {
          type: "string",
          enum: ["cash", "credit", "percent", "item"],
          default: "cash",
        },
        reward_value: {
          type: ["string", "number"],
          description: "Reward amount",
        },
        category: {
          type: "array",
          items: { type: "string" },
          description: "Categories",
        },
        expiry_date: {
          type: "string",
          description: "Expiration date (ISO format)",
        },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        id: { type: "string" },
        code: { type: "string" },
        status: { type: "string" },
        message: { type: "string" },
      },
    },
    annotations: {
      title: "Add Referral",
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "research_domain",
    title: "Research Domain",
    description: "Research a domain for available referral programs",
    inputSchema: {
      type: "object",
      required: ["domain"],
      properties: {
        domain: {
          type: "string",
          description: "Domain to research (e.g., 'dropbox.com')",
        },
        depth: {
          type: "string",
          enum: ["quick", "thorough", "deep"],
          default: "thorough",
        },
        max_results: { type: "number", minimum: 1, maximum: 50, default: 10 },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        domain: { type: "string" },
        discovered_codes: { type: "array" },
        research_metadata: { type: "object" },
      },
    },
    annotations: {
      title: "Research Domain",
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "list_categories",
    title: "List Categories",
    description: "List all available deal categories with descriptions",
    inputSchema: {
      type: "object",
      properties: {
        include_descriptions: { type: "boolean", default: false },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        categories: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              keywords: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
    annotations: {
      title: "List Categories",
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "validate_deal",
    title: "Validate Deal",
    description: "Validate a deal's URL and check if it's still active",
    inputSchema: {
      type: "object",
      required: ["url"],
      properties: {
        url: { type: "string", description: "URL to validate" },
        check_status: { type: "boolean", default: true },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        valid: { type: "boolean" },
        url: { type: "string" },
        extracted_code: { type: ["string", "null"] },
        domain: { type: "string" },
        security_check: { type: "object" },
        status_check: { type: "object" },
      },
    },
    annotations: {
      title: "Validate Deal",
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "get_stats",
    title: "Get System Statistics",
    description: "Get system statistics and deal counts",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number", default: 30 },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        totalActiveDeals: { type: "number" },
        totalDealsDiscovered: { type: "number" },
        topCategory: { type: "string" },
        topSource: { type: "string" },
        expiringNext7Days: { type: "number" },
      },
    },
    annotations: {
      title: "Get Stats",
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "natural_language_query",
    title: "Natural Language Query",
    description:
      "Search deals using natural language. Understands queries like 'finance deals', 'codes from trading212.com', 'best offers expiring this week'",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description:
            "Natural language query (e.g., 'finance deals', 'codes from trading212.com')",
        },
        limit: {
          type: "number",
          minimum: 1,
          maximum: 50,
          default: 10,
          description: "Maximum results to return",
        },
        includeSql: {
          type: "boolean",
          default: false,
          description: "Include generated SQL in response (debug mode)",
        },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        query: { type: "string" },
        parsed: {
          type: "object",
          properties: {
            type: { type: "string" },
            params: { type: "object" },
            originalQuery: { type: "string" },
          },
        },
        count: { type: "number" },
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              deal_id: { type: "string" },
              title: { type: "string" },
              description: { type: "string" },
              domain: { type: "string" },
              code: { type: "string" },
              url: { type: "string" },
              reward_type: { type: "string" },
              reward_value: { type: "number" },
              status: { type: "string" },
              category: { type: "array", items: { type: "string" } },
              confidence_score: { type: "number" },
            },
          },
        },
        suggestions: {
          type: "array",
          items: { type: "string" },
          description: "Alternative search suggestions if no results found",
        },
      },
    },
    annotations: {
      title: "Natural Language Query",
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];

// ============================================================================
// Tool Handlers
// ============================================================================

/**
 * Search deals tool handler
 */
async function handleSearchDeals(
  args: z.infer<typeof SearchDealsInputSchema>,
  env: Env,
): Promise<ToolCallResult> {
  const { domain, category, status, query, limit } = args;

  // Build search filters
  const filters = {
    domain,
    category,
    status: status || "all",
    q: query,
    limit: limit || 10,
    offset: 0,
  };

  const { referrals, total } = await searchReferrals(env, filters);

  const deals = referrals.map((r) => ({
    code: r.code,
    url: r.url,
    domain: r.domain || "unknown",
    title: r.metadata?.title || r.description || "Untitled",
    description: r.description || "",
    status: r.status || "unknown",
    reward: {
      type: r.metadata?.reward_type || "unknown",
      value: r.metadata?.reward_value || null,
    },
    confidence: r.metadata?.confidence_score || 0.5,
  }));

  return {
    content: [
      {
        type: "text",
        text: `Found ${total} deals matching your criteria`,
      },
      {
        type: "resource",
        resource: {
          uri: `deals://search?${new URLSearchParams({ domain: domain || "", category: category || "", status: status || "" }).toString()}`,
          mimeType: "application/json",
          text: JSON.stringify({ deals, total }, null, 2),
        },
      },
    ],
    structuredContent: { deals, total },
  };
}

/**
 * Get deal by code tool handler
 */
async function handleGetDeal(
  args: z.infer<typeof GetDealInputSchema>,
  env: Env,
): Promise<ToolCallResult> {
  const { code } = args;

  const referral = await getReferralByCode(env, code);

  if (!referral) {
    return {
      content: [
        {
          type: "text",
          text: `❌ Referral code "${code}" not found.`,
        },
      ],
      isError: true,
    };
  }

  const result = {
    code: referral.code,
    url: referral.url,
    domain: referral.domain || "unknown",
    title: referral.metadata?.title || referral.description || "Untitled",
    description: referral.description || "",
    status: referral.status || "unknown",
    reward: {
      type: referral.metadata?.reward_type || "unknown",
      value: referral.metadata?.reward_value || null,
    },
    confidence: referral.metadata?.confidence_score || 0.5,
    submitted_at: referral.submitted_at || "unknown",
  };

  return {
    content: [
      {
        type: "text",
        text: `✅ Found referral code "${code}"`,
      },
      {
        type: "resource",
        resource: {
          uri: `deals://${code}`,
          mimeType: "application/json",
          text: JSON.stringify(result, null, 2),
        },
      },
    ],
    structuredContent: result,
  };
}

/**
 * Add referral tool handler
 */
async function handleAddReferral(
  args: z.infer<typeof AddReferralInputSchema>,
  env: Env,
): Promise<ToolCallResult> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const referral: ReferralInput = {
    id,
    code: args.code,
    url: args.url,
    domain: args.domain,
    description: args.description,
    source: "mcp_agent",
    status: "quarantined",
    submitted_at: now,
    submitted_by: "mcp_agent",
    expires_at: args.expiry_date,
    metadata: {
      title: args.title,
      reward_type: args.reward_type,
      reward_value: args.reward_value,
      category: args.category || ["general"],
      confidence_score: 0.8,
      notes: "Added via MCP protocol",
    },
  };

  await storeReferralInput(env, referral);

  return {
    content: [
      {
        type: "text",
        text: `✅ Referral code "${args.code}" added successfully!\n\nIt has been placed in quarantine for human review before activation.`,
      },
      {
        type: "resource",
        resource: {
          uri: `deals://${id}`,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              success: true,
              id,
              code: args.code,
              status: "quarantined",
              message: "Referral created and queued for review",
            },
            null,
            2,
          ),
        },
      },
    ],
    structuredContent: {
      success: true,
      id,
      code: args.code,
      status: "quarantined",
      message: "Referral created and queued for review",
    },
  };
}

/**
 * Research domain tool handler
 */
async function handleResearchDomain(
  args: z.infer<typeof ResearchDomainInputSchema>,
  env: Env,
): Promise<ToolCallResult> {
  const { domain, depth, max_results } = args;

  // First check existing referrals for this domain
  const existing = await getReferralsByDomain(env, domain);

  // Build research response
  const discovered_codes = existing.slice(0, max_results).map((r) => ({
    code: r.code,
    url: r.url,
    source: r.source || "existing_database",
    discovered_at: r.submitted_at || new Date().toISOString(),
    reward_summary: r.metadata?.reward_value
      ? `${r.metadata.reward_value} ${r.metadata.reward_type || ""}`
      : undefined,
    confidence: r.metadata?.confidence_score || 0.5,
  }));

  const result = {
    query: domain,
    domain,
    discovered_codes,
    research_metadata: {
      sources_checked: ["internal_database", "kv_storage"],
      search_queries: [domain, `${domain} referral`, `${domain} promo`],
      research_duration_ms: 0,
      agent_id: "mcp-server",
      used_real_fetching: false,
      note: "Research queueing not yet implemented. Showing existing database results.",
    },
  };

  return {
    content: [
      {
        type: "text",
        text: `🔍 Research results for "${domain}"\n\nFound ${discovered_codes.length} existing referral codes in the database.`,
      },
      {
        type: "resource",
        resource: {
          uri: `research://${domain}`,
          mimeType: "application/json",
          text: JSON.stringify(result, null, 2),
        },
      },
    ],
    structuredContent: result,
  };
}

/**
 * List categories tool handler
 */
async function handleListCategories(
  args: z.infer<typeof ListCategoriesInputSchema>,
): Promise<ToolCallResult> {
  const { include_descriptions } = args;

  const categories = Object.entries(CATEGORY_DEFINITIONS).map(
    ([name, def]) => ({
      name,
      description: def.description,
      keywords: include_descriptions ? def.keywords.slice(0, 10) : undefined,
    }),
  );

  return {
    content: [
      {
        type: "text",
        text: `📂 Available categories: ${categories.map((c) => c.name).join(", ")}`,
      },
      {
        type: "resource",
        resource: {
          uri: "categories://list",
          mimeType: "application/json",
          text: JSON.stringify({ categories }, null, 2),
        },
      },
    ],
    structuredContent: { categories },
  };
}

/**
 * Validate deal tool handler
 */
async function handleValidateDeal(
  args: z.infer<typeof ValidateDealInputSchema>,
  env: Env,
): Promise<ToolCallResult> {
  const { url, check_status } = args;

  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter((s) => s.length > 0);
    const code = segments[segments.length - 1] || "";

    // Security checks
    const securityCheck = {
      https: parsed.protocol === "https:",
      no_traversal: !url.includes("..") && !url.includes("."),
      has_code: code.length >= 3,
      valid_domain: parsed.hostname.includes("."),
    };

    const isValid = Object.values(securityCheck).every(Boolean);

    // Check status if requested
    let statusCheck = null;
    if (check_status) {
      // Try to find existing referral with this URL
      const codeFromDb = await getReferralByCode(env, code.toUpperCase());
      statusCheck = {
        in_database: !!codeFromDb,
        status: codeFromDb?.status || "unknown",
        last_validated: codeFromDb?.validation?.last_validated || null,
      };
    }

    const result = {
      valid: isValid,
      url: url,
      extracted_code: isValid ? code.toUpperCase() : null,
      domain: parsed.hostname.replace(/^www\./, ""),
      security_check: securityCheck,
      status_check: statusCheck,
    };

    return {
      content: [
        {
          type: "text",
          text: isValid
            ? `✅ URL validation passed for ${parsed.hostname}`
            : `⚠️ URL validation failed - security issues detected`,
        },
        {
          type: "resource",
          resource: {
            uri: `validation://${encodeURIComponent(url)}`,
            mimeType: "application/json",
            text: JSON.stringify(result, null, 2),
          },
        },
      ],
      structuredContent: result,
    };
  } catch {
    return {
      content: [
        {
          type: "text",
          text: "❌ Invalid URL format",
        },
      ],
      isError: true,
    };
  }
}

/**
 * Get stats tool handler
 */
async function handleGetStats(
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

/**
 * Natural Language Query tool handler
 */
async function handleNaturalLanguageQuery(
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

// ============================================================================
// Tool Registry
// ============================================================================

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  search_deals: (args, env) =>
    handleSearchDeals(SearchDealsInputSchema.parse(args), env),
  get_deal: (args, env) => handleGetDeal(GetDealInputSchema.parse(args), env),
  add_referral: (args, env) =>
    handleAddReferral(AddReferralInputSchema.parse(args), env),
  research_domain: (args, env) =>
    handleResearchDomain(ResearchDomainInputSchema.parse(args), env),
  list_categories: (args) =>
    handleListCategories(ListCategoriesInputSchema.parse(args)),
  validate_deal: (args, env) =>
    handleValidateDeal(ValidateDealInputSchema.parse(args), env),
  get_stats: (args, env) => handleGetStats(args, env),
  natural_language_query: (args, env) =>
    handleNaturalLanguageQuery(
      NaturalLanguageQueryInputSchema.parse(args),
      env,
    ),
};

/**
 * Execute a tool by name with arguments
 */
export async function executeTool(
  name: string,
  args: { [key: string]: unknown },
  env: Env,
  request: Request,
): Promise<ToolCallResult> {
  const handler = TOOL_HANDLERS[name];

  if (!handler) {
    return {
      content: [
        {
          type: "text",
          text: `❌ Unknown tool: "${name}"`,
        },
      ],
      isError: true,
    };
  }

  try {
    return await handler(args, env, request);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      return {
        content: [
          {
            type: "text",
            text: `❌ Invalid arguments: ${issues}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `❌ Tool execution failed: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Get all available tools
 */
export function getTools(): Tool[] {
  return MCP_TOOLS;
}
