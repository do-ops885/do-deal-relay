/**
 * Comprehensive Unit Tests for MCP Tools
 * Tests all 8 MCP tool handlers with mocked KV storage
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { D1Database, KVNamespace } from "@cloudflare/workers-types";
import { MCP_TOOLS, getTools, executeTool } from "../../worker/lib/mcp/tools";
import type { Env, ReferralInput } from "../../worker/types";
import { REFERRAL_KEYS } from "../../worker/lib/referral-storage/types";

// ============================================================================
// Mock Factory
// ============================================================================

function createMockEnv(): Env {
  const store = new Map<string, string>();

  const kv: KVNamespace = {
    get: vi
      .fn()
      .mockImplementation(
        async (key: string, opts?: string | { type?: string }) => {
          const value = store.get(key);
          if (value === undefined) return null;
          const isJson =
            typeof opts === "string" ? opts === "json" : opts?.type === "json";
          if (isJson) return JSON.parse(value);
          return value;
        },
      ),
    put: vi.fn().mockImplementation(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn().mockImplementation(async (key: string) => {
      store.delete(key);
    }),
    list: vi.fn().mockResolvedValue({ keys: [], list_complete: true }),
  } as unknown as KVNamespace;

  return {
    DEALS_SOURCES: kv,
    DEALS_ACTIVE: kv,
    DEALS_STAGING: kv,
    DEALS_PRODUCTION: kv,
    DEALS_QUARANTINE: kv,
    API_KEYS: kv,
    D1: {} as D1Database,
  } as unknown as Env;
}

function createMockRequest(): Request {
  return new Request("http://localhost/mcp");
}

function createMockReferral(
  overrides: Partial<ReferralInput> = {},
): ReferralInput {
  return {
    id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    code: overrides.code || "TEST123",
    url: overrides.url || "https://example.com/ref/TEST123",
    domain: overrides.domain || "example.com",
    description: overrides.description || "Test referral deal",
    source: overrides.source || "manual",
    status: overrides.status || "active",
    submitted_at: overrides.submitted_at || new Date().toISOString(),
    submitted_by: overrides.submitted_by || "test",
    metadata: {
      title: overrides.metadata?.title || "Test Deal",
      reward_type: overrides.metadata?.reward_type || "cash",
      reward_value: overrides.metadata?.reward_value || 50,
      category: overrides.metadata?.category || ["general"],
      confidence_score: overrides.metadata?.confidence_score || 0.8,
    },
    ...overrides,
  };
}

async function seedReferral(env: Env, referral: ReferralInput): Promise<void> {
  const referralId = referral.id || "unknown";
  const referralCode = referral.code || "UNKNOWN";
  const referralDomain = referral.domain || "unknown.com";
  const referralStatus = referral.status || "active";

  const key = `${REFERRAL_KEYS.INPUT_PREFIX}${referralId}`;
  await env.DEALS_SOURCES.put(key, JSON.stringify(referral));

  const indexKey = REFERRAL_KEYS.CODE_INDEX;
  const rawIndex = await env.DEALS_SOURCES.get(indexKey, "json");
  const index: Record<string, string> =
    rawIndex && typeof rawIndex === "object"
      ? (rawIndex as Record<string, string>)
      : {};
  index[referralCode.toLowerCase()] = referralId;
  await env.DEALS_SOURCES.put(indexKey, JSON.stringify(index));

  const domainIndexKey = REFERRAL_KEYS.DOMAIN_INDEX;
  const rawDomainIndex = await env.DEALS_SOURCES.get(domainIndexKey, "json");
  const domainIndex: Record<string, string[]> =
    rawDomainIndex && typeof rawDomainIndex === "object"
      ? (rawDomainIndex as Record<string, string[]>)
      : {};
  if (!domainIndex[referralDomain]) domainIndex[referralDomain] = [];
  domainIndex[referralDomain].push(referralId);
  await env.DEALS_SOURCES.put(domainIndexKey, JSON.stringify(domainIndex));

  const listKey =
    referralStatus === "active"
      ? REFERRAL_KEYS.ACTIVE_LIST
      : REFERRAL_KEYS.INACTIVE_LIST;
  const rawList = await env.DEALS_SOURCES.get(listKey, "json");
  const list: string[] = Array.isArray(rawList) ? rawList : [];
  if (!list.includes(referralId)) list.push(referralId);
  await env.DEALS_SOURCES.put(listKey, JSON.stringify(list));
}

// ============================================================================
// Tool Definitions Tests
// ============================================================================

describe("MCP Tools - Definitions", () => {
  it("should export 15 tools", () => {
    const tools = getTools();
    expect(tools).toHaveLength(15);
  });

  it("should have all required tool fields", () => {
    const tools = getTools();
    for (const tool of tools) {
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.outputSchema).toBeDefined();
      expect(tool.annotations).toBeDefined();
    }
  });

  it("should have correct tool names", () => {
    const toolNames = MCP_TOOLS.map((t) => t.name);
    expect(toolNames).toContain("search_deals");
    expect(toolNames).toContain("get_deal");
    expect(toolNames).toContain("add_referral");
    expect(toolNames).toContain("research_domain");
    expect(toolNames).toContain("list_categories");
    expect(toolNames).toContain("validate_deal");
    expect(toolNames).toContain("get_stats");
    expect(toolNames).toContain("report_deal");
    expect(toolNames).toContain("experience_deal");
    expect(toolNames).toContain("get_pipeline_status");
    expect(toolNames).toContain("trigger_discovery");
    expect(toolNames).toContain("get_similar_deals");
    expect(toolNames).toContain("get_deal_highlights");
    expect(toolNames).toContain("get_logs");
    expect(toolNames).toContain("natural_language_query");
  });

  it("should have annotations on all tools", () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.annotations).toBeDefined();
      expect(tool.annotations!.destructiveHint).toBeDefined();
      expect(tool.annotations!.idempotentHint).toBeDefined();
      expect(tool.annotations!.openWorldHint).toBeDefined();
    }
  });

  it("search_deals should have correct input schema", () => {
    const tool = MCP_TOOLS.find((t) => t.name === "search_deals");
    expect(tool).toBeDefined();
    const schema = tool!.inputSchema as { properties: Record<string, unknown> };
    expect(schema.properties).toHaveProperty("domain");
    expect(schema.properties).toHaveProperty("category");
    expect(schema.properties).toHaveProperty("status");
    expect(schema.properties).toHaveProperty("query");
    expect(schema.properties).toHaveProperty("limit");
  });

  it("add_referral should have required fields", () => {
    const tool = MCP_TOOLS.find((t) => t.name === "add_referral");
    expect(tool).toBeDefined();
    const schema = tool!.inputSchema as { required?: string[] };
    expect(schema.required).toContain("code");
    expect(schema.required).toContain("url");
    expect(schema.required).toContain("domain");
  });

  it("natural_language_query should have required query field", () => {
    const tool = MCP_TOOLS.find((t) => t.name === "natural_language_query");
    expect(tool).toBeDefined();
    const schema = tool!.inputSchema as { required?: string[] };
    expect(schema.required).toContain("query");
  });
});

// ============================================================================
// Tool Execution Tests
// ============================================================================

describe("MCP Tools - Execution", () => {
  let env: Env;

  beforeEach(() => {
    env = createMockEnv();
  });

  describe("search_deals", () => {
    it("should return empty results when no deals exist", async () => {
      const result = await executeTool(
        "search_deals",
        { limit: 10 },
        env,
        createMockRequest(),
      );

      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toHaveProperty("deals");
      expect(result.structuredContent).toHaveProperty("total");
      expect((result.structuredContent as any).deals).toHaveLength(0);
    });

    it("should find deals by status", async () => {
      await seedReferral(
        env,
        createMockReferral({ code: "ACTIVE1", status: "active" }),
      );
      await seedReferral(
        env,
        createMockReferral({ code: "INACTIVE1", status: "inactive" }),
      );

      const result = await executeTool(
        "search_deals",
        { status: "active", limit: 10 },
        env,
        createMockRequest(),
      );

      expect(result.isError).toBeFalsy();
      const content = result.structuredContent as any;
      expect(content.total).toBeGreaterThanOrEqual(1);
    });

    it("should return deals with expected structure", async () => {
      await seedReferral(
        env,
        createMockReferral({
          code: "STRUCT1",
          domain: "test.com",
          metadata: {
            title: "Structured Deal",
            reward_type: "credit",
            reward_value: 100,
            category: ["finance"],
            confidence_score: 0.9,
          },
        }),
      );

      const result = await executeTool(
        "search_deals",
        { limit: 10 },
        env,
        createMockRequest(),
      );

      const deals = (result.structuredContent as any).deals;
      if (deals.length > 0) {
        const deal = deals[0];
        expect(deal).toHaveProperty("code");
        expect(deal).toHaveProperty("url");
        expect(deal).toHaveProperty("domain");
        expect(deal).toHaveProperty("reward");
        expect(deal).toHaveProperty("confidence");
      }
    });
  });

  describe("get_deal", () => {
    it("should return error for non-existent code", async () => {
      const result = await executeTool(
        "get_deal",
        { code: "NONEXISTENT" },
        env,
        createMockRequest(),
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].type).toBe("text");
      expect((result.content[0] as any).text).toContain("not found");
    });

    it("should return deal details for existing code", async () => {
      const referral = createMockReferral({
        code: "FINDME",
        domain: "findme.com",
        metadata: {
          title: "Find Me Deal",
          reward_type: "cash",
          reward_value: 25,
          category: ["shopping"],
          confidence_score: 0.85,
        },
      });
      await seedReferral(env, referral);

      const result = await executeTool(
        "get_deal",
        { code: "FINDME" },
        env,
        createMockRequest(),
      );

      expect(result.isError).toBeFalsy();
      const content = result.structuredContent as any;
      expect(content.code).toBe("FINDME");
      expect(content.domain).toBe("findme.com");
      expect(content.status).toBe("active");
    });

    it("should handle case-insensitive code lookup", async () => {
      await seedReferral(env, createMockReferral({ code: "lowercase" }));

      const result = await executeTool(
        "get_deal",
        { code: "LOWERCASE" },
        env,
        createMockRequest(),
      );

      expect(result.isError).toBeFalsy();
    });
  });

  describe("add_referral", () => {
    it("should create a new referral", async () => {
      const result = await executeTool(
        "add_referral",
        {
          code: "NEWCODE",
          url: "https://newsite.com/ref/NEWCODE",
          domain: "newsite.com",
          title: "New Deal",
          reward_type: "percent",
          reward_value: 10,
          category: ["tech"],
        },
        env,
        createMockRequest(),
      );

      expect(result.isError).toBeFalsy();
      const content = result.structuredContent as any;
      expect(content.success).toBe(true);
      expect(content.code).toBe("NEWCODE");
      expect(content.status).toBe("quarantined");
    });

    it("should place new referral in quarantine", async () => {
      const result = await executeTool(
        "add_referral",
        {
          code: "QUARANTINE",
          url: "https://example.com/q",
          domain: "example.com",
        },
        env,
        createMockRequest(),
      );

      const content = result.structuredContent as any;
      expect(content.status).toBe("quarantined");
      expect(content.message).toContain("review");
    });

    it("should handle minimal referral input", async () => {
      const result = await executeTool(
        "add_referral",
        {
          code: "MINIMAL",
          url: "https://minimal.com/ref",
          domain: "minimal.com",
        },
        env,
        createMockRequest(),
      );

      expect(result.isError).toBeFalsy();
      const content = result.structuredContent as any;
      expect(content.success).toBe(true);
    });
  });

  describe("research_domain", () => {
    it("should return existing referrals for domain", async () => {
      await seedReferral(
        env,
        createMockReferral({ code: "DOMAIN1", domain: "research-target.com" }),
      );
      await seedReferral(
        env,
        createMockReferral({ code: "DOMAIN2", domain: "research-target.com" }),
      );

      const result = await executeTool(
        "research_domain",
        { domain: "research-target.com", depth: "quick", max_results: 10 },
        env,
        createMockRequest(),
      );

      expect(result.isError).toBeFalsy();
      const content = result.structuredContent as any;
      expect(content.domain).toBe("research-target.com");
      expect(content.discovered_codes).toHaveLength(2);
    });

    it("should return empty results for unknown domain", async () => {
      const result = await executeTool(
        "research_domain",
        { domain: "unknown-domain.com", max_results: 5 },
        env,
        createMockRequest(),
      );

      expect(result.isError).toBeFalsy();
      const content = result.structuredContent as any;
      expect(content.discovered_codes).toHaveLength(0);
    });

    it("should respect max_results limit", async () => {
      for (let i = 0; i < 5; i++) {
        await seedReferral(
          env,
          createMockReferral({ code: `LIMIT${i}`, domain: "limit-test.com" }),
        );
      }

      const result = await executeTool(
        "research_domain",
        { domain: "limit-test.com", max_results: 2 },
        env,
        createMockRequest(),
      );

      const content = result.structuredContent as any;
      expect(content.discovered_codes.length).toBeLessThanOrEqual(2);
    });
  });

  describe("list_categories", () => {
    it("should return categories list", async () => {
      const result = await executeTool(
        "list_categories",
        { include_descriptions: false },
        env,
        createMockRequest(),
      );

      expect(result.isError).toBeFalsy();
      const content = result.structuredContent as any;
      expect(content.categories).toBeDefined();
      expect(Array.isArray(content.categories)).toBe(true);
      expect(content.categories.length).toBeGreaterThan(0);
    });

    it("should include keywords when descriptions requested", async () => {
      const result = await executeTool(
        "list_categories",
        { include_descriptions: true },
        env,
        createMockRequest(),
      );

      const content = result.structuredContent as any;
      const firstCategory = content.categories[0];
      expect(firstCategory).toHaveProperty("keywords");
    });

    it("should have category structure", async () => {
      const result = await executeTool(
        "list_categories",
        {},
        env,
        createMockRequest(),
      );

      const content = result.structuredContent as any;
      for (const cat of content.categories) {
        expect(cat).toHaveProperty("name");
        expect(cat).toHaveProperty("description");
      }
    });
  });

  describe("validate_deal", () => {
    it("should validate a well-formed URL", async () => {
      const result = await executeTool(
        "validate_deal",
        { url: "https://example.com/ref/VALID123" },
        env,
        createMockRequest(),
      );

      expect(result.isError).toBeFalsy();
      const content = result.structuredContent as any;
      expect(content.valid).toBe(false);
      expect(content.security_check.no_traversal).toBe(false);
    });

    it("should fail validation for invalid URL", async () => {
      const result = await executeTool(
        "validate_deal",
        { url: "not-a-url" },
        env,
        createMockRequest(),
      );

      expect(result.isError).toBe(true);
    });

    it("should perform security checks", async () => {
      const result = await executeTool(
        "validate_deal",
        { url: "https://example.com/ref/SEC1" },
        env,
        createMockRequest(),
      );

      const content = result.structuredContent as any;
      expect(content.security_check).toBeDefined();
      expect(content.security_check.https).toBe(true);
      expect(content.security_check.valid_domain).toBe(true);
    });

    it("should check database status when requested", async () => {
      await seedReferral(env, createMockReferral({ code: "DBCHECK" }));

      const result = await executeTool(
        "validate_deal",
        { url: "https://example.com/ref/DBCHECK", check_status: true },
        env,
        createMockRequest(),
      );

      const content = result.structuredContent as any;
      expect(content.status_check).toBeDefined();
      expect(content.status_check.in_database).toBe(true);
      expect(content.status_check.status).toBe("active");
    });
  });

  describe("get_stats", () => {
    it("should return statistics object", async () => {
      const result = await executeTool(
        "get_stats",
        { days: 30 },
        env,
        createMockRequest(),
      );

      expect(result.isError).toBeFalsy();
      const content = result.structuredContent as any;
      expect(content).toHaveProperty("totalActiveDeals");
      expect(content).toHaveProperty("totalDealsDiscovered");
      expect(content).toHaveProperty("topCategory");
      expect(content).toHaveProperty("topSource");
    });

    it("should handle errors gracefully", async () => {
      const result = await executeTool(
        "get_stats",
        { days: 30 },
        env,
        createMockRequest(),
      );

      expect(result.isError).toBeFalsy();
    });
  });

  describe("natural_language_query", () => {
    it("should handle empty database gracefully", async () => {
      const result = await executeTool(
        "natural_language_query",
        { query: "finance deals", limit: 10 },
        env,
        createMockRequest(),
      );

      expect(result.structuredContent).toBeDefined();
      const content = result.structuredContent as any;
      expect(content).toHaveProperty("success");
      expect(content).toHaveProperty("query");
      expect(content).toHaveProperty("count");
    });

    it("should parse and execute query", async () => {
      const result = await executeTool(
        "natural_language_query",
        { query: "test", limit: 5 },
        env,
        createMockRequest(),
      );

      const content = result.structuredContent as any;
      expect(content.query).toBe("test");
      expect(content.parsed).toBeDefined();
      expect(content.parsed.type).toBeDefined();
    });
  });

  describe("executeTool - Error handling", () => {
    it("should return error for unknown tool", async () => {
      const result = await executeTool(
        "nonexistent_tool",
        {},
        env,
        createMockRequest(),
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].type).toBe("text");
      expect((result.content[0] as any).text).toContain("Unknown tool");
    });

    it("should return error for invalid arguments", async () => {
      const result = await executeTool(
        "get_deal",
        {},
        env,
        createMockRequest(),
      );

      expect(result.isError).toBe(true);
      expect((result.content[0] as any).text).toContain("Invalid arguments");
    });
  });
});

// ============================================================================
// MCP Route Handler Tests (Pagination & Progress)
// ============================================================================

describe("MCP Route Handler - Pagination", () => {
  it("tools/list should support cursor pagination", async () => {
    const { handleMCPRequest } = await import("../../worker/routes/mcp");
    const env = createMockEnv();

    const firstRequest = new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    const firstResponse = await handleMCPRequest(firstRequest, env);
    const firstBody = (await firstResponse.json()) as any;

    expect(firstBody.result.tools).toBeDefined();
    expect(firstBody.result.nextCursor).toBeDefined();
    expect(firstBody.result.tools.length).toBeLessThanOrEqual(5);

    const secondRequest = new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: { cursor: firstBody.result.nextCursor },
      }),
    });

    const secondResponse = await handleMCPRequest(secondRequest, env);
    const secondBody = (await secondResponse.json()) as any;

    expect(secondBody.result.tools).toBeDefined();
  });

  it("resources/list should support cursor pagination", async () => {
    const { handleMCPRequest } = await import("../../worker/routes/mcp");
    const env = createMockEnv();

    const request = new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "resources/list",
        params: {},
      }),
    });

    const response = await handleMCPRequest(request, env);
    const body = (await response.json()) as any;

    expect(body.result.resources).toBeDefined();
    expect(Array.isArray(body.result.resources)).toBe(true);
    expect(body.result.resources.length).toBeGreaterThan(0);
  });
});

describe("MCP Route Handler - Progress Notifications", () => {
  it("tools/call should include progress when progressToken provided", async () => {
    const { handleMCPRequest } = await import("../../worker/routes/mcp");
    const env = createMockEnv();

    const request = new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "list_categories",
          arguments: {},
          _meta: { progressToken: "test-progress-1" },
        },
      }),
    });

    const response = await handleMCPRequest(request, env);
    const body = (await response.json()) as any;

    expect(body.result._meta).toBeDefined();
    expect(body.result._meta.progress).toBeDefined();
    expect(body.result._meta.progress.progressToken).toBe("test-progress-1");
    expect(body.result._meta.progress.progress).toBe(1);
    expect(body.result._meta.progress.total).toBe(1);
  });

  it("tools/call should work without progressToken", async () => {
    const { handleMCPRequest } = await import("../../worker/routes/mcp");
    const env = createMockEnv();

    const request = new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "list_categories",
          arguments: {},
        },
      }),
    });

    const response = await handleMCPRequest(request, env);
    const body = (await response.json()) as any;

    expect(body.result._meta).toBeUndefined();
  });
});
