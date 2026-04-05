/**
 * MCP (Model Context Protocol) Server Route Handler
 *
 * Complete MCP server implementation for do-deal-relay on Cloudflare Workers.
 * Implements MCP 2025-11-25 specification with stateless HTTP transport.
 *
 * Endpoints:
 * - POST /mcp/initialize - Protocol version negotiation
 * - POST /mcp/tools/list - List available tools with schemas
 * - POST /mcp/tools/call - Execute tools
 * - POST /mcp/resources/list - List available resources
 * - POST /mcp/resources/read - Read resource content
 *
 * @module worker/routes/mcp
 */

import type { Env } from "../../types";
import { CONFIG } from "../../config";
import { getTools, executeTool } from "../../lib/mcp/tools";
import { createRateLimitHeaders } from "../../lib/rate-limit";
import { handleInitialize, handlePing } from "./initialize";
import { handleToolsList, handleToolCall } from "./tools";
import {
  handleResourcesList,
  handleResourceTemplatesList,
  handleResourceRead,
} from "./resources";
import {
  MCP_CORS_HEADERS,
  MCP_PROTOCOL_VERSION,
  createSuccessResponse,
  createErrorResponse,
  createJSONResponse,
  validateJSONRPCRequest,
  validateInitializeParams,
  validateToolCallParams,
  validateResourceReadParams,
  checkMCPRateLimit,
} from "./utils";
import { MCPErrorCodes } from "../../lib/mcp/types";

// ============================================================================
// Main Route Handler
// ============================================================================

/**
 * Handle MCP JSON-RPC requests
 */
export async function handleMCPRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: MCP_CORS_HEADERS,
    });
  }

  // Only accept POST requests
  if (request.method !== "POST") {
    return createJSONResponse(
      createErrorResponse(
        null,
        MCPErrorCodes.INVALID_REQUEST,
        "Only POST method is supported for MCP endpoints",
      ),
      405,
    );
  }

  // Rate limiting
  const rateLimitResult = await checkMCPRateLimit(request, env);

  if (!rateLimitResult.allowed) {
    return createJSONResponse(
      createErrorResponse(
        null,
        -32000,
        "Rate limit exceeded. Please try again later.",
        {
          retry_after:
            rateLimitResult.resetTime - Math.floor(Date.now() / 1000),
        },
      ),
      429,
      Object.fromEntries(createRateLimitHeaders(rateLimitResult)),
    );
  }

  // Parse JSON-RPC request
  let body: { [key: string]: unknown };
  try {
    body = (await request.json()) as { [key: string]: unknown };
  } catch {
    return createJSONResponse(
      createErrorResponse(
        null,
        MCPErrorCodes.PARSE_ERROR,
        "Parse error: Invalid JSON",
      ),
      400,
    );
  }

  // Validate JSON-RPC 2.0 structure using type guard for type safety
  const validatedRequest = validateJSONRPCRequest(body);
  if (!validatedRequest) {
    return createJSONResponse(
      createErrorResponse(
        null,
        MCPErrorCodes.INVALID_REQUEST,
        "Invalid JSON-RPC 2.0 request",
      ),
      400,
    );
  }

  const { id, method, params = {} } = validatedRequest;

  // Handle the request based on method
  try {
    let result: unknown;

    switch (method) {
      case "initialize": {
        // Validate params using type guard for type safety
        const validatedParams = validateInitializeParams(params);
        if (!validatedParams) {
          return createJSONResponse(
            createErrorResponse(
              id,
              MCPErrorCodes.INVALID_PARAMS,
              "Invalid initialize params",
            ),
            400,
          );
        }
        result = await handleInitialize(validatedParams);
        break;
      }

      case "ping":
        result = await handlePing();
        break;

      case "tools/list": {
        const toolsListParams = params as { cursor?: string } | undefined;
        result = await handleToolsList(toolsListParams);
        break;
      }

      case "tools/call": {
        // Validate params using type guard for type safety
        const validatedParams = validateToolCallParams(params);
        if (!validatedParams) {
          return createJSONResponse(
            createErrorResponse(
              id,
              MCPErrorCodes.INVALID_PARAMS,
              "Invalid tools/call params",
            ),
            400,
          );
        }
        result = await handleToolCall(validatedParams, env, request);
        break;
      }

      case "resources/list": {
        const resourcesListParams = params as { cursor?: string } | undefined;
        result = await handleResourcesList(resourcesListParams);
        break;
      }

      case "resources/templates/list":
        result = await handleResourceTemplatesList();
        break;

      case "resources/read": {
        // Validate params using type guard for type safety
        const validatedParams = validateResourceReadParams(params);
        if (!validatedParams) {
          return createJSONResponse(
            createErrorResponse(
              id,
              MCPErrorCodes.INVALID_PARAMS,
              "Invalid resources/read params",
            ),
            400,
          );
        }
        result = await handleResourceRead(validatedParams, env);
        break;
      }

      case "notifications/initialized":
        // Notification, no response needed
        return new Response(null, { status: 202, headers: MCP_CORS_HEADERS });

      default:
        return createJSONResponse(
          createErrorResponse(
            id,
            MCPErrorCodes.METHOD_NOT_FOUND,
            `Method not found: ${method}`,
          ),
          404,
        );
    }

    // Return success response
    const rateLimitHeaders = Object.fromEntries(
      createRateLimitHeaders(rateLimitResult),
    );

    return createJSONResponse(createSuccessResponse(id, result), 200, {
      ...rateLimitHeaders,
      "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
    });
  } catch (error) {
    console.error("MCP handler error:", error);

    return createJSONResponse(
      createErrorResponse(
        id,
        MCPErrorCodes.INTERNAL_ERROR,
        `Internal error: ${(error as Error).message}`,
      ),
      500,
    );
  }
}

// ============================================================================
// Legacy Endpoints (for backwards compatibility)
// ============================================================================

/**
 * Handle legacy MCP v1 tool listing
 */
export async function handleMCPListTools(env: Env): Promise<Response> {
  const tools = getTools();

  return new Response(
    JSON.stringify({
      tools,
      server_info: {
        name: "do-deal-relay",
        version: CONFIG.VERSION,
        protocol_version: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: { listChanged: true },
          resources: { subscribe: false, listChanged: true },
          prompts: { listChanged: false },
          logging: {},
        },
      },
    }),
    {
      headers: {
        "Content-Type": "application/json",
        ...MCP_CORS_HEADERS,
      },
    },
  );
}

/**
 * Handle legacy MCP v1 tool call
 */
export async function handleMCPCall(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const body = (await request.json()) as {
      tool?: string;
      input?: { [key: string]: unknown };
      correlationId?: string;
    };

    const { tool, input = {}, correlationId } = body;

    if (!tool) {
      return new Response(JSON.stringify({ error: "Missing 'tool' field" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...MCP_CORS_HEADERS,
        },
      });
    }

    const result = await executeTool(tool, input, env, request);

    return new Response(JSON.stringify(result), {
      status: result.isError ? 400 : 200,
      headers: {
        "Content-Type": "application/json",
        ...MCP_CORS_HEADERS,
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Invalid request",
        message: (error as Error).message,
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...MCP_CORS_HEADERS,
        },
      },
    );
  }
}

/**
 * Handle MCP server information
 */
export async function handleMCPInfo(env: Env): Promise<Response> {
  const tools = getTools();

  return new Response(
    JSON.stringify({
      name: "do-deal-relay",
      description:
        "Autonomous deal discovery and referral code management system",
      version: CONFIG.VERSION,
      protocol_version: MCP_PROTOCOL_VERSION,
      provider: {
        name: "do-ops",
        contact: "compliance@do-ops.dev",
      },
      features: {
        tools: tools.map((t) => t.name),
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
    }),
    {
      headers: {
        "Content-Type": "application/json",
        ...MCP_CORS_HEADERS,
      },
    },
  );
}
