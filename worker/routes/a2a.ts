import type { Env } from "../types";
import { jsonResponse } from "./utils";

/**
 * A2A (Agent-to-Agent) Agent Card
 *
 * Exposed at /.well-known/agent.json per the A2A protocol specification.
 * Describes the do-deal-relay agent's identity, capabilities, and interfaces
 * so other agents can discover and interoperate with it.
 *
 * @see https://a2a-protocol.org/spec
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
      version: "0.1.9",
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
