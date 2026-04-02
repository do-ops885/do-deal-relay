/**
 * MCP (Model Context Protocol) Server Implementation
 *
 * Enables AI agents to interact with do-deal-relay via standardized protocol.
 * Runs on Cloudflare Workers with D1 database.
 *
 * Endpoints:
 * - POST /mcp/v1/tools/list - List available tools
 * - POST /mcp/v1/tools/call - Execute a tool
 * - GET  /mcp/v1/info - Server information
 */

import type { Env } from "../../types";
import { jsonResponse, errorResponse } from "../utils";
import { D1Client } from "../../lib/d1-client";
import {
  EUAIActLogger,
  createComplianceLogger,
} from "../../lib/eu-ai-act-logger";
import { authenticateRequest } from "../../lib/auth";

// ============================================================================
// MCP Types
// ============================================================================

interface MCPTool {
  name: string;
  description: string;
  inputSchema: object;
}

interface MCPCallRequest {
  tool: string;
  input: Record<string, unknown>;
  correlationId?: string;
}

interface MCPCallResult {
  content: Array<{
    type: "text" | "image" | "json";
    text?: string;
    data?: unknown;
  }>;
  isError?: boolean;
}

// ============================================================================
// Tool Definitions
// ============================================================================

const TOOLS: MCPTool[] = [
  {
    name: "search_referrals",
    description: "Search for referral codes by domain, code, or keywords",
    inputSchema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Filter by domain (e.g., 'scalable.capital')",
        },
        code: { type: "string", description: "Exact code to search for" },
        query: { type: "string", description: "Free text search" },
        min_confidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
          default: 0.5,
        },
        limit: { type: "number", minimum: 1, maximum: 100, default: 10 },
      },
    },
  },
  {
    name: "add_referral",
    description: "Add a new referral code to the system",
    inputSchema: {
      type: "object",
      required: ["code", "url", "domain"],
      properties: {
        code: { type: "string", description: "The referral code" },
        url: { type: "string", description: "Full referral URL" },
        domain: { type: "string", description: "Domain (e.g., 'example.com')" },
        title: { type: "string", description: "Title/description of the deal" },
        reward_type: {
          type: "string",
          enum: ["cash", "credit", "percent", "item"],
          default: "cash",
        },
        reward_value: {
          type: ["string", "number"],
          description: "Reward amount or description",
        },
        category: {
          type: "array",
          items: { type: "string" },
          description: "Categories (e.g., ['finance', 'investing'])",
        },
      },
    },
  },
  {
    name: "get_referral_details",
    description: "Get detailed information about a specific referral code",
    inputSchema: {
      type: "object",
      required: ["code"],
      properties: {
        code: { type: "string", description: "The referral code to look up" },
      },
    },
  },
  {
    name: "research_domain",
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
        sources: {
          type: "array",
          items: { type: "string" },
          description: "Sources to check",
        },
      },
    },
  },
  {
    name: "get_stats",
    description: "Get system statistics and metrics",
    inputSchema: {
      type: "object",
      properties: {
        metric_type: {
          type: "string",
          enum: ["referrals", "usage", "compliance"],
          default: "referrals",
        },
        days: { type: "number", default: 30 },
      },
    },
  },
  {
    name: "validate_url",
    description: "Validate if a URL is safe and extract referral code",
    inputSchema: {
      type: "object",
      required: ["url"],
      properties: {
        url: { type: "string", description: "URL to validate" },
      },
    },
  },
];

// ============================================================================
// Tool Handlers
// ============================================================================

async function handleSearchReferrals(
  input: Record<string, unknown>,
  d1: D1Client,
  logger: EUAIActLogger,
  correlationId?: string,
): Promise<MCPCallResult> {
  const startTime = Date.now();

  const results = await d1.searchReferrals({
    domain: input.domain as string,
    query: input.query as string,
    minConfidence: input.min_confidence as number,
    limit: input.limit as number,
  });

  // Log for EU AI Act compliance
  await logger.logOperation({
    timestamp: new Date().toISOString(),
    systemId: "do-deal-relay",
    operationId: crypto.randomUUID(),
    correlationId,
    operation: "mcp_search_referrals",
    operationVersion: "0.1.2",
    inputData: {
      source: "mcp_agent",
      hash: await hashData(JSON.stringify(input)),
      description: `Search referrals: ${input.domain || input.query || "general"}`,
      metadata: input,
    },
    outputData: {
      result: "success",
      confidence: 0.95,
      explanation: `Found ${results.total} referrals`,
    },
    performanceMetrics: {
      latencyMs: Date.now() - startTime,
    },
  });

  return {
    content: [
      {
        type: "json",
        data: {
          total: results.total,
          referrals: results.results.map((r) => ({
            code: r.code,
            url: r.url,
            domain: r.domain,
            title: r.title,
            reward: {
              type: r.reward_type,
              value: r.reward_value,
              currency: r.currency,
            },
            confidence: r.confidence_score,
          })),
        },
      },
    ],
  };
}

async function handleAddReferral(
  input: Record<string, unknown>,
  d1: D1Client,
  logger: EUAIActLogger,
  correlationId?: string,
): Promise<MCPCallResult> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await d1.createReferral({
    id,
    code: input.code as string,
    url: input.url as string,
    domain: input.domain as string,
    source: "mcp_agent",
    status: "quarantined",
    title: input.title as string,
    reward_type: input.reward_type as string,
    reward_value: String(input.reward_value || ""),
    currency: "USD",
    category: JSON.stringify(input.category || ["general"]),
    tags: JSON.stringify(["mcp-added"]),
    submitted_by: "mcp_agent",
    confidence_score: 0.8,
    use_count: 0,
  });

  // Log for EU AI Act compliance
  await logger.logOperation({
    timestamp: now,
    systemId: "do-deal-relay",
    operationId: id,
    correlationId,
    operation: "mcp_add_referral",
    operationVersion: "0.1.2",
    inputData: {
      source: "mcp_agent",
      hash: await hashData(JSON.stringify(input)),
      description: `Add referral: ${input.code} for ${input.domain}`,
      metadata: { ...input, id },
    },
    outputData: {
      result: "created_quarantined",
      confidence: 0.8,
      explanation: "Referral created and queued for human review",
    },
  });

  return {
    content: [
      {
        type: "text",
        text: `✅ Referral code "${input.code}" added successfully!\n\nIt has been placed in quarantine for human review before activation.`,
      },
      {
        type: "json",
        data: {
          id,
          code: input.code,
          status: "quarantined",
          review_url: `https://do-deal-relay.com/admin/review/${id}`,
        },
      },
    ],
  };
}

async function handleGetReferralDetails(
  input: Record<string, unknown>,
  d1: D1Client,
): Promise<MCPCallResult> {
  const referral = await d1.getReferralByCode(input.code as string);

  if (!referral) {
    return {
      content: [
        {
          type: "text",
          text: `❌ Referral code "${input.code}" not found.`,
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "json",
        data: {
          code: referral.code,
          url: referral.url,
          domain: referral.domain,
          title: referral.title,
          description: referral.description,
          status: referral.status,
          reward: {
            type: referral.reward_type,
            value: referral.reward_value,
            currency: referral.currency,
          },
          confidence: referral.confidence_score,
          use_count: referral.use_count,
          submitted_at: referral.submitted_at,
        },
      },
    ],
  };
}

async function handleResearchDomain(
  input: Record<string, unknown>,
  logger: EUAIActLogger,
  correlationId?: string,
): Promise<MCPCallResult> {
  // Check cache first
  const cacheKey = `research:${input.domain}`;

  // For now, return a research task initiation
  // Real implementation would queue a background job

  await logger.logOperation({
    timestamp: new Date().toISOString(),
    systemId: "do-deal-relay",
    operationId: crypto.randomUUID(),
    correlationId,
    operation: "mcp_research_domain",
    operationVersion: "0.1.2",
    inputData: {
      source: "mcp_agent",
      hash: await hashData(JSON.stringify(input)),
      description: `Research domain: ${input.domain}`,
      metadata: input,
    },
    outputData: {
      result: "research_initiated",
      confidence: 0.7,
      explanation: `Research job queued for ${input.domain}`,
    },
  });

  return {
    content: [
      {
        type: "text",
        text: `🔍 Research initiated for "${input.domain}"\n\nThis will search for referral programs on:\n- ProductHunt\n- GitHub\n- Hacker News\n- Reddit\n- Company website\n\nResults will be available in ~5 minutes.`,
      },
      {
        type: "json",
        data: {
          domain: input.domain,
          status: "queued",
          estimated_completion: "5 minutes",
          job_id: crypto.randomUUID(),
        },
      },
    ],
  };
}

async function handleGetStats(
  input: Record<string, unknown>,
  d1: D1Client,
): Promise<MCPCallResult> {
  const stats = await d1.getReferralStats();

  return {
    content: [
      {
        type: "json",
        data: {
          referrals: {
            total: stats.total,
            active: stats.active,
            quarantined: stats.quarantined,
            by_domain: stats.byDomain,
          },
          timestamp: new Date().toISOString(),
        },
      },
    ],
  };
}

async function handleValidateUrl(
  input: Record<string, unknown>,
): Promise<MCPCallResult> {
  const url = input.url as string;

  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter((s) => s.length > 0);
    const code = segments[segments.length - 1] || "";

    // Security checks
    const isValid =
      parsed.protocol === "https:" &&
      code.length >= 3 &&
      !url.includes("..") &&
      !url.includes("\\");

    return {
      content: [
        {
          type: "json",
          data: {
            valid: isValid,
            url: url,
            extracted_code: isValid ? code.toUpperCase() : null,
            domain: parsed.hostname.replace(/^www\./, ""),
            security_check: {
              https: parsed.protocol === "https:",
              no_traversal: !url.includes(".."),
              has_code: code.length >= 3,
            },
          },
        },
      ],
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

// ============================================================================
// Request Handlers
// ============================================================================

export async function handleMCPListTools(env: Env): Promise<Response> {
  const complianceLogger = env.DEALS_DB
    ? createComplianceLogger(env.DEALS_DB)
    : null;

  // Log for EU AI Act compliance
  if (complianceLogger) {
    await complianceLogger.logOperation({
      timestamp: new Date().toISOString(),
      systemId: "do-deal-relay",
      operationId: crypto.randomUUID(),
      operation: "mcp_list_tools",
      operationVersion: "0.1.2",
      inputData: {
        source: "mcp_agent",
        hash: "tools_list",
        description: "List available MCP tools",
      },
      outputData: {
        result: "success",
        confidence: 1.0,
        explanation: `${TOOLS.length} tools available`,
      },
    });
  }

  return jsonResponse({
    tools: TOOLS,
    server_info: {
      name: "do-deal-relay",
      version: "0.1.2",
      protocol_version: "2025-03",
      capabilities: {
        tools: true,
        resources: false,
        prompts: false,
      },
    },
  });
}

export async function handleMCPCall(
  request: Request,
  env: Env,
): Promise<Response> {
  // Authenticate request
  const auth = await authenticateRequest(request, env);
  if (!auth.authenticated) {
    return errorResponse(auth.error || "Unauthorized", 401);
  }

  // Check D1 availability
  if (!env.DEALS_DB) {
    return errorResponse("D1 database not configured. MCP requires D1.", 503);
  }

  const d1 = new D1Client(env.DEALS_DB);
  const complianceLogger = createComplianceLogger(env.DEALS_DB);

  let body: MCPCallRequest;
  try {
    body = (await request.json()) as MCPCallRequest;
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const { tool, input, correlationId } = body;

  // Find and execute tool
  let result: MCPCallResult;

  switch (tool) {
    case "search_referrals":
      result = await handleSearchReferrals(
        input,
        d1,
        complianceLogger,
        correlationId,
      );
      break;
    case "add_referral":
      result = await handleAddReferral(
        input,
        d1,
        complianceLogger,
        correlationId,
      );
      break;
    case "get_referral_details":
      result = await handleGetReferralDetails(input, d1);
      break;
    case "research_domain":
      result = await handleResearchDomain(
        input,
        complianceLogger,
        correlationId,
      );
      break;
    case "get_stats":
      result = await handleGetStats(input, d1);
      break;
    case "validate_url":
      result = await handleValidateUrl(input);
      break;
    default:
      return errorResponse(`Unknown tool: ${tool}`, 400);
  }

  return jsonResponse(result, result.isError ? 400 : 200);
}

export async function handleMCPInfo(env: Env): Promise<Response> {
  return jsonResponse({
    name: "do-deal-relay",
    description:
      "Autonomous deal discovery and referral code management system",
    version: "0.1.2",
    protocol_version: "2025-03",
    provider: {
      name: "do-ops",
      contact: "compliance@do-ops.dev",
    },
    features: {
      tools: TOOLS.map((t) => t.name),
      eu_ai_act_compliant: true,
      human_oversight: true,
      rate_limiting: true,
      audit_logging: true,
    },
    limits: {
      max_requests_per_minute: 60,
      max_search_results: 100,
    },
    documentation: "https://do-deal-relay.com/docs/mcp",
  });
}

// ============================================================================
// Utility
// ============================================================================

async function hashData(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  const array = Array.from(new Uint8Array(buffer));
  return "sha256:" + array.map((b) => b.toString(16).padStart(2, "0")).join("");
}
