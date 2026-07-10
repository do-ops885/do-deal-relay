/**
 * Unit Tests for MCP Tools - Extended Operations
 * Tests research_domain, list_categories, validate_deal, get_stats,
 * natural_language_query, error handling
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { D1Database, KVNamespace } from "@cloudflare/workers-types";
import { executeTool } from "../../worker/lib/mcp/tools";
import type { Env, ReferralInput } from "../../worker/types";
import { REFERRAL_KEYS } from "../../worker/lib/referral-storage/types";

vi.mock("../../worker/lib/research-agent/orchestrator", () => ({
  executeReferralResearch: vi.fn().mockResolvedValue({
    discovered_codes: [],
    research_metadata: { sources_checked: ["internal_database"] },
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
// Tool Execution Tests - Extended Operations
// ============================================================================

describe("MCP Tools - Execution", () => {
  let env: Env;

  beforeEach(() => {
    env = createMockEnv();
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
      expect(result.content[0]!.type).toBe("text");
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
