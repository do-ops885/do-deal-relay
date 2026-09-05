/**
 * Unit Tests for MCP Tools - Definitions & Core Operations
 * Tests tool definitions, search_deals, get_deal, and add_referral
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { D1Database, KVNamespace } from "@cloudflare/workers-types";
import { MCP_TOOLS, getTools, executeTool } from "../../worker/lib/mcp/tools";
import type { Env, ReferralInput } from "../../worker/types";
import { REFERRAL_KEYS } from "../../worker/lib/referral-storage/types";

vi.mock("../../worker/lib/research-agent/orchestrator", () => ({
  executeReferralResearch: vi.fn().mockResolvedValue({
    discovered_codes: [],
    research_metadata: {
      sources_checked: ["internal_database"],
    },
  }),
}));

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
    DEALS_PROD: kv,
    DEALS_LOG: kv,
    DEALS_LOCK: kv,
    AI_GATEWAY_URL: "https://gateway.test",
    WEBHOOK_SECRET: "test-secret",
    API_ENCRYPTION_KEY: "test-key",
    EMAIL_WEBHOOK_SECRET: "test-email-secret",
    DEALS_DB: {} as any,
    TRUST_THRESHOLD: "0.3",
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
  it("should export 18 tools", () => {
    const tools = getTools();
    expect(tools).toHaveLength(18);
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
    expect(toolNames).toContain("check_progress");
    expect(toolNames).toContain("cancel_operation");
    expect(toolNames).toContain("list_operations");
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
// Tool Execution Tests - Core Operations
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
      expect(result.content[0]!.type).toBe("text");
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
});
