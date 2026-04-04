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
import {
  MCP_PROTOCOL_VERSION,
  type JSONRPCRequest,
  type JSONRPCResponse,
  type InitializeResult,
  type ToolsListResult,
  type ToolCallResult,
  type ResourcesListResult,
  type ResourceTemplatesListResult,
  type ResourceReadResult,
  type InitializeParams,
  type ToolsListParams,
  type ToolCallParams,
  type ResourcesListParams,
  type ResourceReadParams,
  MCPErrorCodes,
  JSONRPCRequestSchema,
  InitializeParamsSchema,
  ToolCallParamsSchema,
  ResourceReadParamsSchema,
} from "../../lib/mcp/types";
import { getTools, executeTool } from "../../lib/mcp/tools";
import {
  getResources,
  getResourceTemplates,
  readResource,
} from "../../lib/mcp/resources";
import {
  checkRateLimit,
  getClientIdentifier,
  createRateLimitHeaders,
} from "../../lib/rate-limit";

// ============================================================================
// Server Configuration
// ============================================================================

const SERVER_INFO = {
  name: "do-deal-relay",
  version: "0.1.2",
};

const SERVER_CAPABILITIES = {
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

const SERVER_INSTRUCTIONS = `
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

const MCP_CORS_HEADERS = {
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

function createSuccessResponse(
  id: string | number,
  result: unknown,
): JSONRPCResponse {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

function createErrorResponse(
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

// ============================================================================
// Type Guard Functions - Validate request structures to avoid unsafe casting
// ============================================================================

/**
 * Validate JSON-RPC request structure using Zod schema
 * Returns null if validation fails, otherwise returns the validated request
 */
function validateJSONRPCRequest(body: unknown): JSONRPCRequest | null {
  const result = JSONRPCRequestSchema.safeParse(body);
  return result.success ? (result.data as JSONRPCRequest) : null;
}

/**
 * Validate Initialize params structure
 */
function validateInitializeParams(params: unknown): InitializeParams | null {
  const result = InitializeParamsSchema.safeParse(params);
  return result.success ? (result.data as InitializeParams) : null;
}

/**
 * Validate ToolCall params structure
 */
function validateToolCallParams(params: unknown): ToolCallParams | null {
  const result = ToolCallParamsSchema.safeParse(params);
  return result.success ? (result.data as ToolCallParams) : null;
}

/**
 * Validate ResourceRead params structure
 */
function validateResourceReadParams(
  params: unknown,
): ResourceReadParams | null {
  const result = ResourceReadParamsSchema.safeParse(params);
  return result.success ? (result.data as ResourceReadParams) : null;
}

function createJSONResponse(
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
// Request Handlers
// ============================================================================

/**
 * Handle initialize request
 */
async function handleInitialize(
  params: InitializeParams,
): Promise<InitializeResult> {
  // Negotiate protocol version
  const protocolVersion =
    params.protocolVersion === MCP_PROTOCOL_VERSION
      ? MCP_PROTOCOL_VERSION
      : MCP_PROTOCOL_VERSION;

  return {
    protocolVersion,
    capabilities: SERVER_CAPABILITIES,
    serverInfo: SERVER_INFO,
    instructions: SERVER_INSTRUCTIONS,
  };
}

/**
 * Handle ping request
 */
async function handlePing(): Promise<{}> {
  return {};
}

/**
 * Handle tools/list request
 */
async function handleToolsList(): Promise<ToolsListResult> {
  const tools = getTools();

  // Convert Zod schemas to JSON Schema for output
  // The serialized tools have Zod schemas converted to plain objects for JSON serialization
  const serializedTools = tools.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema:
      typeof tool.inputSchema === "object"
        ? tool.inputSchema
        : { type: "object" },
    outputSchema:
      tool.outputSchema && typeof tool.outputSchema === "object"
        ? tool.outputSchema
        : undefined,
    annotations: tool.annotations,
  }));

  // Return type matches ToolsListResult with tools as plain objects
  return {
    tools: serializedTools,
  } as ToolsListResult;
}

/**
 * Handle tools/call request
 */
async function handleToolCall(
  params: ToolCallParams,
  env: Env,
  request: Request,
): Promise<ToolCallResult> {
  const { name, arguments: args = {} } = params;

  return executeTool(name, args, env, request);
}

/**
 * Handle resources/list request
 */
async function handleResourcesList(): Promise<ResourcesListResult> {
  const resources = getResources();
  return { resources };
}

/**
 * Handle resources/templates/list request
 */
async function handleResourceTemplatesList(): Promise<ResourceTemplatesListResult> {
  const resourceTemplates = getResourceTemplates();
  return { resourceTemplates };
}

/**
 * Handle resources/read request
 */
async function handleResourceRead(
  params: ResourceReadParams,
  env: Env,
): Promise<ResourceReadResult> {
  const { uri } = params;
  return readResource(uri, env);
}

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
  const clientId = getClientIdentifier(request);
  const rateLimitResult = await checkRateLimit(env, clientId, "/mcp");

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
  let rpcRequest: JSONRPCRequest;
  try {
    const body = (await request.json()) as { [key: string]: unknown };

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

    rpcRequest = validatedRequest;
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

  const { id, method, params = {} } = rpcRequest;

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

      case "tools/list":
        result = await handleToolsList();
        break;

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

      case "resources/list":
        result = await handleResourcesList();
        break;

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
        name: SERVER_INFO.name,
        version: SERVER_INFO.version,
        protocol_version: MCP_PROTOCOL_VERSION,
        capabilities: SERVER_CAPABILITIES,
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
      name: SERVER_INFO.name,
      description:
        "Autonomous deal discovery and referral code management system",
      version: SERVER_INFO.version,
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
