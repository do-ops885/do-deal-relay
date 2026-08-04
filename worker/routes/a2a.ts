import type { Env } from "../types";
import {
  executeReferralResearch,
  convertResearchToReferrals,
} from "../lib/research-agent";
import { VERSION } from "../version";
import { jsonResponse } from "./utils";

const A2A_TASK_PATH = "/a2a";
const MAX_TASK_DOMAIN_LENGTH = 253;
const MAX_TASK_QUERY_LENGTH = 240;

interface A2ATaskRequest {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

interface A2ATaskParams {
  domain?: unknown;
  query?: unknown;
  depth?: unknown;
}

interface A2ATaskRecord {
  id: string;
  status: "working" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
  result?: unknown;
  error?: string;
}

/**
 * A2A (Agent-to-Agent) Agent Card.
 *
 * Exposed at /.well-known/agent.json per the A2A protocol specification.
 */
export async function handleA2AAgentCard(
  request: Request,
  env: Env,
): Promise<Response> {
  const baseUrl = new URL(request.url).origin;

  const card = {
    agent: {
      name: "do-deal-relay",
      description:
        "Autonomous deal discovery agent that finds, validates, and publishes referral codes from financial platforms, crypto exchanges, and e-commerce sites.",
      version: VERSION,
      provider: {
        name: "do-ops885",
        url: "https://github.com/do-ops885/do-deal-relay",
      },
    },
    capabilities: {
      mcp: true,
      a2a: true,
      nlq: true,
      semanticSearch: true,
      taskDelegation: true,
    },
    interfaces: [
      {
        type: "mcp",
        url: `${baseUrl}/mcp`,
        version: "2025-11-25",
        description:
          "Model Context Protocol interface for tool execution, resource access, and agent communication.",
      },
    ],
    endpoints: {
      api: `${baseUrl}/api`,
      a2a: `${baseUrl}${A2A_TASK_PATH}`,
      health: `${baseUrl}/health`,
      docs: `${baseUrl}/docs`,
      metrics: `${baseUrl}/metrics`,
      nlq: `${baseUrl}/api/nlq`,
      semanticSearch: `${baseUrl}/api/semantic-search`,
    },
    tools: [
      {
        name: "search_deals",
        description:
          "Search for referral deals with advanced filtering and ranking",
      },
      {
        name: "get_deal",
        description: "Get detailed information about a specific referral code",
      },
      {
        name: "add_referral",
        description: "Add a new referral code to the system (requires review)",
      },
      {
        name: "research_domain",
        description: "Research a domain for available referral programs",
      },
      {
        name: "natural_language_query",
        description: "Search deals using natural language via NLQ API",
      },
      {
        name: "list_categories",
        description: "List all available deal categories with descriptions",
      },
      {
        name: "validate_deal",
        description: "Validate a deal URL and check if it is active",
      },
      {
        name: "get_stats",
        description: "Get system statistics and deal counts",
      },
      {
        name: "get_pipeline_status",
        description: "Get current status of the discovery pipeline",
      },
    ],
    resources: [
      {
        uri: "deals://{dealId}",
        description: "Individual deal details by ID",
      },
      {
        uri: "categories://list",
        description: "Deal categories list",
      },
      {
        uri: "analytics://summary",
        description: "Deal summary statistics",
      },
      {
        uri: "nlq://results?query={q}",
        description: "Natural language query results",
      },
      {
        uri: "dora://metrics",
        description: "DORA (DevOps Research and Assessment) pipeline metrics",
      },
    ],
    authentication: {
      types: ["api_key", "jwt"],
      apiKey: {
        header: "X-API-Key",
        description: "API key for programmatic access",
      },
      jwt: {
        header: "Authorization",
        scheme: "Bearer",
        description: "JWT access token from /api/auth/login",
      },
    },
    rateLimiting: {
      default: {
        windowSeconds: 60,
        maxRequests: 100,
      },
      research: {
        windowSeconds: 60,
        maxRequests: 20,
      },
    },
  };

  return jsonResponse(card, 200, request, env);
}

/**
 * Handle the intentionally small A2A task surface.
 *
 * Supported JSON-RPC methods:
 * - tasks/send: starts a domain research task and returns its completed result
 * - tasks/get: retrieves a previously stored task by id
 *
 * Unsupported methods return a protocol error instead of pretending to
 * delegate arbitrary tools.
 */
export async function handleA2ATask(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse(
      { error: "A2A task endpoint requires POST" },
      405,
      request,
      env,
    );
  }

  let body: A2ATaskRequest;
  try {
    body = (await request.json()) as A2ATaskRequest;
  } catch {
    return jsonResponse(
      { error: "Request body must be valid JSON" },
      400,
      request,
      env,
    );
  }

  const requestId =
    typeof body.id === "string" || typeof body.id === "number" ? body.id : null;
  const method = typeof body.method === "string" ? body.method : "";
  if (body.jsonrpc !== "2.0" || requestId === null || !method) {
    return jsonResponse(
      {
        jsonrpc: "2.0",
        id: requestId,
        error: { code: -32600, message: "Invalid A2A JSON-RPC request" },
      },
      400,
      request,
      env,
    );
  }

  if (method === "tasks/get") {
    const params = asParams(body.params);
    const taskId = typeof params.taskId === "string" ? params.taskId : "";
    if (!taskId)
      return protocolError(
        requestId,
        "taskId is required",
        -32602,
        request,
        env,
      );
    const task = await env.DEALS_LOG.get<A2ATaskRecord>(
      `a2a:task:${taskId}`,
      "json",
    );
    if (!task)
      return protocolError(requestId, "Task not found", -32004, request, env);
    return jsonResponse(
      { jsonrpc: "2.0", id: requestId, result: task },
      200,
      request,
      env,
    );
  }

  if (method !== "tasks/send") {
    return protocolError(
      requestId,
      `Unsupported A2A method: ${method}`,
      -32601,
      request,
      env,
    );
  }

  const params = asParams(body.params);
  const taskParams = asTaskParams(params.message ?? params);
  const domain =
    typeof taskParams.domain === "string" ? taskParams.domain.trim() : "";
  const query =
    typeof taskParams.query === "string"
      ? taskParams.query.trim()
      : `${domain} referral`;
  const depth =
    taskParams.depth === "quick" ||
    taskParams.depth === "thorough" ||
    taskParams.depth === "deep"
      ? taskParams.depth
      : "thorough";

  if (
    !domain ||
    domain.length > MAX_TASK_DOMAIN_LENGTH ||
    !isValidDomain(domain)
  ) {
    return protocolError(
      requestId,
      "A valid domain is required",
      -32602,
      request,
      env,
    );
  }
  if (!query || query.length > MAX_TASK_QUERY_LENGTH) {
    return protocolError(
      requestId,
      "Query is required and must be short",
      -32602,
      request,
      env,
    );
  }

  const taskId = crypto.randomUUID();
  const now = new Date().toISOString();
  const task: A2ATaskRecord = {
    id: taskId,
    status: "working",
    createdAt: now,
    updatedAt: now,
  };
  await env.DEALS_LOG.put(`a2a:task:${taskId}`, JSON.stringify(task), {
    expirationTtl: 86_400,
  });

  try {
    const research = await executeReferralResearch(env, {
      query,
      domain,
      depth,
      max_results: 20,
    });
    const referrals = await convertResearchToReferrals(env, research, 0.5);
    const completed: A2ATaskRecord = {
      ...task,
      status: "completed",
      updatedAt: new Date().toISOString(),
      result: {
        domain,
        discovered_codes: research.discovered_codes,
        stored_referrals: referrals.length,
        research_metadata: research.research_metadata,
      },
    };
    await env.DEALS_LOG.put(`a2a:task:${taskId}`, JSON.stringify(completed), {
      expirationTtl: 86_400,
    });
    return jsonResponse(
      { jsonrpc: "2.0", id: requestId, result: completed },
      200,
      request,
      env,
    );
  } catch (error) {
    const failed: A2ATaskRecord = {
      ...task,
      status: "failed",
      updatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Task failed",
    };
    await env.DEALS_LOG.put(`a2a:task:${taskId}`, JSON.stringify(failed), {
      expirationTtl: 86_400,
    });
    return jsonResponse(
      { jsonrpc: "2.0", id: requestId, result: failed },
      200,
      request,
      env,
    );
  }
}

function asParams(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function asTaskParams(value: unknown): A2ATaskParams {
  return asParams(value) as A2ATaskParams;
}

function isValidDomain(domain: string): boolean {
  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(
    domain,
  );
}

function protocolError(
  id: string | number,
  message: string,
  code: number,
  request: Request,
  env: Env,
): Response {
  return jsonResponse(
    { jsonrpc: "2.0", id, error: { code, message } },
    400,
    request,
    env,
  );
}
