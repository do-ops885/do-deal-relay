/**
 * MCP Tools Implementation
 *
 * Implements all MCP tools for the do-deal-relay deal discovery system.
 * This file contains tool definitions and the main registry.
 * Handlers are implemented in the individual modules under handlers/.
 *
 * @module worker/lib/mcp/tools
 */

import { z } from "zod";
import type { Env } from "../../types";
import type { Tool, ToolCallResult, ToolHandler } from "./types";

import { handleSearchDeals, SearchDealsInputSchema } from "./handlers/search";
import {
  handleGetDeal,
  handleAddReferral,
  GetDealInputSchema,
  AddReferralInputSchema,
} from "./handlers/referrals";
import {
  handleResearchDomain,
  ResearchDomainInputSchema,
} from "./handlers/research";
import {
  handleListCategories,
  ListCategoriesInputSchema,
} from "./handlers/categories";
import {
  handleValidateDeal,
  ValidateDealInputSchema,
} from "./handlers/validation";
import { handleGetStats } from "./handlers/stats";
import {
  handleNaturalLanguageQuery,
  NaturalLanguageQueryInputSchema,
} from "./handlers/nlq";
import {
  handleExperienceDeal,
  ExperienceDealInputSchema,
} from "./handlers/experience";
import {
  handleReportDeal,
  ReportDealInputSchema,
} from "./handlers/report";
import {
  handleGetPipelineStatus,
  handleTriggerDiscovery,
} from "./handlers/pipeline";
import {
  handleGetSimilarDeals,
  handleGetDealHighlights,
  GetSimilarDealsInputSchema,
} from "./handlers/discovery";
import {
  handleGetLogs,
  GetLogsInputSchema,
} from "./handlers/logging";

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
        sort_by: {
          type: "string",
          enum: ["confidence", "recency", "value", "expiry", "trust"],
          description: "Field to sort by",
        },
        order: {
          type: "string",
          enum: ["asc", "desc"],
          description: "Sort order",
        },
        min_confidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Minimum confidence score",
        },
        min_trust: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Minimum trust score",
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
    name: "report_deal",
    title: "Report Deal",
    description: "Report a broken, expired, or fraudulent referral code",
    inputSchema: {
      type: "object",
      required: ["code", "reason"],
      properties: {
        code: { type: "string", description: "The referral code to report" },
        reason: {
          type: "string",
          enum: ["broken", "expired", "fraudulent", "inaccurate", "duplicate"],
          description: "Reason for reporting",
        },
        comment: { type: "string", description: "Optional details" },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        code: { type: "string" },
        reason: { type: "string" },
        status: { type: "string" },
      },
    },
    annotations: {
      title: "Report Deal",
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "experience_deal",
    title: "Experience Deal",
    description: "Report your success or failure with a specific referral code",
    inputSchema: {
      type: "object",
      required: ["code", "success"],
      properties: {
        code: { type: "string", description: "The referral code used" },
        success: { type: "boolean", description: "Whether the deal worked" },
        comment: { type: "string", description: "Optional comment" },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        code: { type: "string" },
        reported_success: { type: "boolean" },
        new_confidence: { type: "number" },
        total_experiences: { type: "number" },
      },
    },
    annotations: {
      title: "Experience Deal",
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "get_pipeline_status",
    title: "Get Pipeline Status",
    description: "Get the current status of the deal discovery pipeline",
    inputSchema: { type: "object", properties: {} },
    outputSchema: {
      type: "object",
      properties: {
        locked: { type: "boolean" },
        last_run: { type: "object" },
      },
    },
    annotations: {
      title: "Pipeline Status",
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "trigger_discovery",
    title: "Trigger Discovery",
    description: "Manually trigger the deal discovery pipeline",
    inputSchema: { type: "object", properties: {} },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        message: { type: "string" },
      },
    },
    annotations: {
      title: "Trigger Discovery",
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "get_similar_deals",
    title: "Get Similar Deals",
    description: "Find referral deals similar to a specific code or domain",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string" },
        domain: { type: "string" },
        limit: { type: "number", minimum: 1, maximum: 50, default: 5 },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        reference: { type: "object" },
        similar: { type: "array" },
        total: { type: "number" },
      },
    },
    annotations: {
      title: "Similar Deals",
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "get_deal_highlights",
    title: "Get Deal Highlights",
    description: "Get top-rated, recently added, and soon-to-expire deals",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", minimum: 1, maximum: 20, default: 5 },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        top_deals: { type: "array" },
        expiring_soon: { type: "array" },
        recently_added: { type: "array" },
      },
    },
    annotations: {
      title: "Deal Highlights",
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "get_logs",
    title: "Get Pipeline Logs",
    description: "Retrieve recent or specific run logs for the discovery pipeline",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string" },
        count: { type: "number", minimum: 1, maximum: 1000, default: 100 },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        logs: { type: "array" },
        count: { type: "number" },
      },
    },
    annotations: {
      title: "Pipeline Logs",
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
  experience_deal: (args, env) =>
    handleExperienceDeal(ExperienceDealInputSchema.parse(args), env),
  report_deal: (args, env) =>
    handleReportDeal(ReportDealInputSchema.parse(args), env),
  get_pipeline_status: (args, env) => handleGetPipelineStatus(args, env),
  trigger_discovery: (args, env) => handleTriggerDiscovery(args, env),
  get_similar_deals: (args, env) =>
    handleGetSimilarDeals(GetSimilarDealsInputSchema.parse(args), env),
  get_deal_highlights: (args, env) => handleGetDealHighlights(args, env),
  get_logs: (args, env) => handleGetLogs(GetLogsInputSchema.parse(args), env),
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
