/**
 * MCP Resources Implementation
 *
 * Resource providers for the do-deal-relay MCP server:
 * - deals://{dealId} - Individual deal details
 * - categories://list - Deal categories list
 * - analytics://summary - Deal summary statistics
 *
 * @module worker/lib/mcp/resources
 */

import type { Env, Deal } from "../../types";
import type {
  Resource,
  ResourceTemplate,
  ResourceReadResult,
  TextResourceContents,
} from "./types";
import { getReferralByCode, getReferralById } from "../referral-storage/crud";
import {
  getReferralsByStatus,
  referralToDeal,
} from "../referral-storage/search";
import { CATEGORY_DEFINITIONS } from "../categorization/definitions";
import {
  generateAnalyticsSummary,
  generateDealAnalytics,
} from "../analytics/index";

// ============================================================================
// Resource Definitions
// ============================================================================

export const MCP_RESOURCES: Resource[] = [
  {
    uri: "categories://list",
    name: "deal_categories",
    title: "Deal Categories",
    description: "List of all available deal categories",
    mimeType: "application/json",
  },
  {
    uri: "analytics://summary",
    name: "deal_analytics_summary",
    title: "Deal Analytics Summary",
    description: "Summary statistics of deals in the system",
    mimeType: "application/json",
  },
];

export const MCP_RESOURCE_TEMPLATES: ResourceTemplate[] = [
  {
    uriTemplate: "deals://{dealId}",
    name: "deal_details",
    title: "Deal Details",
    description: "Detailed information about a specific deal by ID or code",
    mimeType: "application/json",
  },
  {
    uriTemplate: "analytics://{type}",
    name: "analytics_by_type",
    title: "Analytics by Type",
    description: "Detailed analytics data by type (full, summary, trends)",
    mimeType: "application/json",
  },
];

// ============================================================================
// Resource Handlers
// ============================================================================

/**
 * Handle deal details resource
 * URI: deals://{dealId}
 */
async function handleDealResource(
  dealId: string,
  env: Env,
): Promise<ResourceReadResult> {
  // Try to get by code first, then by ID
  let referral = await getReferralByCode(env, dealId);

  if (!referral) {
    referral = await getReferralById(env, dealId);
  }

  if (!referral) {
    return {
      contents: [
        {
          uri: `deals://${dealId}`,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              error: "Deal not found",
              dealId,
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  // Convert to Deal format for complete info
  const dealBase = referralToDeal(referral);
  const deal: Deal = {
    ...dealBase,
    id: referral.id || `ref-${referral.domain || "unknown"}-${referral.code}`,
  } as Deal;

  const content: TextResourceContents = {
    uri: `deals://${dealId}`,
    mimeType: "application/json",
    text: JSON.stringify(
      {
        id: deal.id,
        code: deal.code,
        url: deal.url,
        domain: deal.source.domain,
        title: deal.title,
        description: deal.description,
        status: deal.metadata.status,
        reward: deal.reward,
        expiry: deal.expiry,
        category: deal.metadata.category,
        tags: deal.metadata.tags,
        confidence: deal.metadata.confidence_score,
        trust_score: deal.source.trust_score,
        discovered_at: deal.source.discovered_at,
        normalized_at: deal.metadata.normalized_at,
      },
      null,
      2,
    ),
  };

  return { contents: [content] };
}

/**
 * Handle categories list resource
 * URI: categories://list
 */
async function handleCategoriesResource(env: Env): Promise<ResourceReadResult> {
  // Get active deals to count per category
  const activeReferrals = await getReferralsByStatus(env, "active");
  const deals = activeReferrals.map((r) => referralToDeal(r));

  // Count deals per category
  const categoryCounts: { [key: string]: number } = {};
  for (const deal of deals) {
    for (const cat of deal.metadata.category) {
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
  }

  const categories = Object.entries(CATEGORY_DEFINITIONS).map(
    ([name, def]) => ({
      name,
      description: def.description,
      keywords: def.keywords.slice(0, 5),
      domains: def.domains.slice(0, 5),
      active_deals: categoryCounts[name] || 0,
    }),
  );

  const content: TextResourceContents = {
    uri: "categories://list",
    mimeType: "application/json",
    text: JSON.stringify(
      {
        categories,
        total_categories: categories.length,
        total_active_deals: deals.length,
        last_updated: new Date().toISOString(),
      },
      null,
      2,
    ),
  };

  return { contents: [content] };
}

/**
 * Handle analytics summary resource
 * URI: analytics://summary
 */
async function handleAnalyticsSummaryResource(
  env: Env,
): Promise<ResourceReadResult> {
  const summary = await generateAnalyticsSummary(env, 30);

  const content: TextResourceContents = {
    uri: "analytics://summary",
    mimeType: "application/json",
    text: JSON.stringify(
      {
        summary,
        generated_at: new Date().toISOString(),
        period_days: 30,
      },
      null,
      2,
    ),
  };

  return { contents: [content] };
}

/**
 * Handle detailed analytics resource
 * URI: analytics://{type}
 */
async function handleAnalyticsDetailResource(
  type: string,
  env: Env,
): Promise<ResourceReadResult> {
  let content: TextResourceContents;

  switch (type.toLowerCase()) {
    case "full":
    case "detailed": {
      const analytics = await generateDealAnalytics(env, 30);
      content = {
        uri: `analytics://${type}`,
        mimeType: "application/json",
        text: JSON.stringify(
          {
            type,
            analytics,
            generated_at: new Date().toISOString(),
          },
          null,
          2,
        ),
      };
      break;
    }
    case "trends": {
      const analytics = await generateDealAnalytics(env, 30);
      content = {
        uri: `analytics://${type}`,
        mimeType: "application/json",
        text: JSON.stringify(
          {
            type: "trends",
            deals_over_time: analytics.dealsOverTime,
            expiring_soon: analytics.expiringSoon,
            quality_metrics: analytics.qualityMetrics,
            generated_at: new Date().toISOString(),
          },
          null,
          2,
        ),
      };
      break;
    }
    default:
      content = {
        uri: `analytics://${type}`,
        mimeType: "application/json",
        text: JSON.stringify(
          {
            error: "Unknown analytics type",
            available_types: ["summary", "full", "detailed", "trends"],
          },
          null,
          2,
        ),
      };
  }

  return { contents: [content] };
}

// ============================================================================
// Resource Router
// ============================================================================

/**
 * Read a resource by URI
 */
export async function readResource(
  uri: string,
  env: Env,
): Promise<ResourceReadResult> {
  const url = new URL(uri);
  const protocol = url.protocol.replace(":", "");
  const pathname = url.pathname.replace(/^\//, "");

  try {
    switch (protocol) {
      case "deals":
        return await handleDealResource(pathname || url.hostname, env);

      case "categories":
        if (pathname === "list" || url.hostname === "list") {
          return await handleCategoriesResource(env);
        }
        break;

      case "analytics":
        if (pathname === "summary" || url.hostname === "summary") {
          return await handleAnalyticsSummaryResource(env);
        }
        return await handleAnalyticsDetailResource(
          pathname || url.hostname,
          env,
        );
    }

    // Resource not found
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              error: "Resource not found",
              uri,
              available_resources: MCP_RESOURCES.map((r) => r.uri),
              available_templates: MCP_RESOURCE_TEMPLATES.map(
                (t) => t.uriTemplate,
              ),
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              error: "Failed to read resource",
              message: (error as Error).message,
              uri,
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}

/**
 * Get all static resources
 */
export function getResources(): Resource[] {
  return MCP_RESOURCES;
}

/**
 * Get all resource templates
 */
export function getResourceTemplates(): ResourceTemplate[] {
  return MCP_RESOURCE_TEMPLATES;
}

/**
 * Check if a URI matches a resource template
 */
export function matchResourceTemplate(
  uri: string,
  template: string,
): { [key: string]: string } | null {
  // Convert template to regex
  // e.g., "deals://{dealId}" becomes /^deals:\/\/([^\/]+)$/
  const regexPattern = template.replace(/\{([^}]+)\}/g, "([^/]+)");
  const regex = new RegExp(`^${regexPattern}$`);

  const match = uri.match(regex);
  if (!match) return null;

  // Extract parameter names from template
  const paramNames: string[] = [];
  const paramRegex = /\{([^}]+)\}/g;
  let paramMatch;
  while ((paramMatch = paramRegex.exec(template)) !== null) {
    paramNames.push(paramMatch[1]);
  }

  // Build result object
  const result: { [key: string]: string } = {};
  for (let i = 0; i < paramNames.length; i++) {
    result[paramNames[i]] = match[i + 1];
  }

  return result;
}
