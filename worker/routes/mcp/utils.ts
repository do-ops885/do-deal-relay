/**
 * MCP Route Handler - Utils
 *
 * Rate limiting helpers, response builders, and shared constants.
 */

import type { Env } from "../../types";
import { CONFIG } from "../../config";
import {
  checkRateLimit,
  getClientIdentifier,
  createRateLimitHeaders,
} from "../../lib/rate-limit";
import {
  MCP_PROTOCOL_VERSION,
  type JSONRPCRequest,
  type JSONRPCResponse,
  MCPErrorCodes,
  JSONRPCRequestSchema,
  InitializeParamsSchema,
  ToolCallParamsSchema,
  ResourceReadParamsSchema,
  type InitializeParams,
  type ToolCallParams,
  type ResourceReadParams,
} from "../../lib/mcp/types";

// ============================================================================
// Server Configuration
// ============================================================================

export const SERVER_INFO = {
  name: "do-deal-relay",
  version: CONFIG.VERSION,
};

export const SERVER_CAPABILITIES = {
  tools: {
    listChanged: true,
  },
  resources: {
    subscribe: false,
    listChanged: true,
  },
  prompts: {
    listChanged: false,
  },
  logging: {},
};

export const SERVER_INSTRUCTIONS = `
# Do-Deal-Relay MCP Server

This server provides tools for discovering and managing referral deals.

## Available Tools

- **search_deals**: Search for referral deals by domain, category, or keywords
- **get_deal**: Get detailed information about a specific referral code
- **add_referral**: Add a new referral code to the system (requires quarantine review)
- **research_domain**: Research a domain for available referral programs
- **list_categories**: List all available deal categories
- **validate_deal**: Validate a deal's URL and check if it's active
- **get_stats**: Get system statistics and deal counts
- **experience_deal**: Report your success or failure with a specific referral code
- **report_deal**: Report a broken, expired, or fraudulent referral code
- **get_pipeline_status**: Get the current status of the deal discovery pipeline
- **trigger_discovery**: Manually trigger the deal discovery pipeline
- **get_similar_deals**: Find referral deals similar to a specific code or domain
- **get_deal_highlights**: Get top-rated, recently added, and soon-to-expire deals
- **get_logs**: Retrieve recent or specific run logs for the discovery pipeline
- **natural_language_query**: Search deals using natural language (e.g., "finance deals", "codes from trading212.com")

## Resources

- **deals://{dealId}**: Individual deal details
- **categories://list**: Deal categories list
- **analytics://summary**: Deal summary statistics
- **nlq://queries**: Natural language query templates and examples

## Rate Limits

- 60 requests per minute per client
- Some tools have additional limits

## EU AI Act Compliance

All operations are logged for compliance with EU AI Act Regulation (EU) 2024/1689.
`;

// ============================================================================
// CORS Headers
// ============================================================================

export const MCP_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": [
    "Content-Type",
    "MCP-Session-Id",
    "MCP-Protocol-Version",
    "Authorization",
    "X-API-Key",
  ].join(", "),
  "Access-Control-Expose-Headers": [
    "MCP-Session-Id",
    "MCP-Protocol-Version",
    "X-RateLimit-Limit",
    "X-RateLimit-Remaining",
    "X-RateLimit-Reset",
  ].join(", "),
};

// ============================================================================
// JSON-RPC Helpers
// ============================================================================

export function createSuccessResponse(
  id: string | number,
  result: unknown,
): JSONRPCResponse {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

export function createErrorResponse(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JSONRPCResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      data,
    },
  };
}

export function createJSONResponse(
  data: JSONRPCResponse,
  status: number = 200,
  extraHeaders: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...MCP_CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

// ============================================================================
// Type Guard Functions - Validate request structures to avoid unsafe casting
// ============================================================================

export function validateJSONRPCRequest(body: unknown): JSONRPCRequest | null {
  const result = JSONRPCRequestSchema.safeParse(body);
  return result.success ? (result.data as JSONRPCRequest) : null;
}

export function validateInitializeParams(
  params: unknown,
): InitializeParams | null {
  const result = InitializeParamsSchema.safeParse(params);
  return result.success ? (result.data as InitializeParams) : null;
}

export function validateToolCallParams(params: unknown): ToolCallParams | null {
  const result = ToolCallParamsSchema.safeParse(params);
  return result.success ? (result.data as ToolCallParams) : null;
}

export function validateResourceReadParams(
  params: unknown,
): ResourceReadParams | null {
  const result = ResourceReadParamsSchema.safeParse(params);
  return result.success ? (result.data as ResourceReadParams) : null;
}

// ============================================================================
// Rate Limiting Helper
// ============================================================================

export async function checkMCPRateLimit(request: Request, env: Env) {
  const clientId = getClientIdentifier(request);
  return checkRateLimit(env, clientId, "/mcp");
}

export { MCP_PROTOCOL_VERSION };
