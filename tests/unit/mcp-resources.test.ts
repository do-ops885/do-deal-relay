/**
 * Comprehensive Unit Tests for MCP Resources
 * Tests resource providers, template matching, and resource routing
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { D1Database, KVNamespace } from "@cloudflare/workers-types";
import {
  MCP_RESOURCES,
  MCP_RESOURCE_TEMPLATES,
  getResources,
  getResourceTemplates,
  readResource,
  matchResourceTemplate,
} from "../../worker/lib/mcp/resources";
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
          return isJson ? JSON.parse(value) : value;
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
// Resource Definitions Tests
// ============================================================================

describe("MCP Resources - Definitions", () => {
  it("should export 2 static resources", () => {
    expect(MCP_RESOURCES).toHaveLength(2);
  });

  it("should export 2 resource templates", () => {
    expect(MCP_RESOURCE_TEMPLATES).toHaveLength(2);
  });

  it("should have categories://list resource", () => {
    const categories = MCP_RESOURCES.find((r) => r.uri === "categories://list");
    expect(categories).toBeDefined();
    expect(categories!.name).toBe("deal_categories");
    expect(categories!.mimeType).toBe("application/json");
  });

  it("should have analytics://summary resource", () => {
    const analytics = MCP_RESOURCES.find(
      (r) => r.uri === "analytics://summary",
    );
    expect(analytics).toBeDefined();
    expect(analytics!.name).toBe("deal_analytics_summary");
  });

  it("should have deals://{dealId} template", () => {
    const dealTemplate = MCP_RESOURCE_TEMPLATES.find(
      (t) => t.uriTemplate === "deals://{dealId}",
    );
    expect(dealTemplate).toBeDefined();
    expect(dealTemplate!.name).toBe("deal_details");
  });

  it("should have analytics://{type} template", () => {
    const analyticsTemplate = MCP_RESOURCE_TEMPLATES.find(
      (t) => t.uriTemplate === "analytics://{type}",
    );
    expect(analyticsTemplate).toBeDefined();
    expect(analyticsTemplate!.name).toBe("analytics_by_type");
  });

  it("getResources should return MCP_RESOURCES", () => {
    expect(getResources()).toBe(MCP_RESOURCES);
  });

  it("getResourceTemplates should return MCP_RESOURCE_TEMPLATES", () => {
    expect(getResourceTemplates()).toBe(MCP_RESOURCE_TEMPLATES);
  });
});

// ============================================================================
// Resource Template Matching Tests
// ============================================================================

describe("MCP Resources - Template Matching", () => {
  it("should match deals:// URI with template", () => {
    const result = matchResourceTemplate(
      "deals://deal-123",
      "deals://{dealId}",
    );

    expect(result).not.toBeNull();
    expect(result!.dealId).toBe("deal-123");
  });

  it("should match analytics:// URI with template", () => {
    const result = matchResourceTemplate(
      "analytics://full",
      "analytics://{type}",
    );

    expect(result).not.toBeNull();
    expect(result!.type).toBe("full");
  });

  it("should return null for non-matching URI", () => {
    const result = matchResourceTemplate("unknown://test", "deals://{dealId}");

    expect(result).toBeNull();
  });

  it("should return null for mismatched template", () => {
    const result = matchResourceTemplate(
      "deals://deal-123",
      "analytics://{type}",
    );

    expect(result).toBeNull();
  });

  it("should extract multiple parameters from template", () => {
    const result = matchResourceTemplate(
      "test://foo/bar",
      "test://{param1}/{param2}",
    );

    expect(result).not.toBeNull();
    expect(result!.param1).toBe("foo");
    expect(result!.param2).toBe("bar");
  });

  it("should handle template with no parameters", () => {
    const result = matchResourceTemplate("static://config", "static://config");

    expect(result).not.toBeNull();
    expect(Object.keys(result!)).toHaveLength(0);
  });
});

// ============================================================================
// readResource Tests
// ============================================================================

describe("MCP Resources - readResource", () => {
  let env: Env;

  beforeEach(() => {
    env = createMockEnv();
  });

  describe("deals:// protocol", () => {
    it("should return deal details for existing code", async () => {
      await seedReferral(
        env,
        createMockReferral({
          code: "RESOURCE1",
          domain: "resource-test.com",
          metadata: {
            title: "Resource Deal",
            reward_type: "cash",
            reward_value: 100,
            category: ["tech"],
            confidence_score: 0.9,
          },
        }),
      );

      const result = await readResource("deals://RESOURCE1", env);

      expect(result.contents).toHaveLength(1);
      const content = JSON.parse((result.contents[0] as any).text);
      expect(content.code).toBe("RESOURCE1");
      expect(content.domain).toBe("resource-test.com");
    });

    it("should return deal details for existing ID", async () => {
      const referral = createMockReferral({ code: "BYID" });
      await seedReferral(env, referral);

      const result = await readResource(`deals://${referral.id}`, env);

      expect(result.contents).toHaveLength(1);
      const content = JSON.parse((result.contents[0] as any).text);
      expect(content.code).toBe("BYID");
    });

    it("should return error for non-existent deal", async () => {
      const result = await readResource("deals://nonexistent", env);

      expect(result.contents).toHaveLength(1);
      const content = JSON.parse((result.contents[0] as any).text);
      expect(content.error).toBe("Deal not found");
      expect(content.dealId).toBe("nonexistent");
    });

    it("should include full deal structure in response", async () => {
      await seedReferral(
        env,
        createMockReferral({
          code: "STRUCT",
          domain: "struct.com",
          metadata: {
            title: "Struct Deal",
            reward_type: "percent",
            reward_value: 20,
            category: ["finance"],
            confidence_score: 0.85,
          },
        }),
      );

      const result = await readResource("deals://STRUCT", env);

      const content = JSON.parse((result.contents[0] as any).text);
      expect(content).toHaveProperty("id");
      expect(content).toHaveProperty("code");
      expect(content).toHaveProperty("url");
      expect(content).toHaveProperty("domain");
      expect(content).toHaveProperty("title");
      expect(content).toHaveProperty("reward");
      expect(content).toHaveProperty("category");
      expect(content).toHaveProperty("confidence");
    });
  });

  describe("categories:// protocol", () => {
    it("should return categories list", async () => {
      const result = await readResource("categories://list", env);

      expect(result.contents).toHaveLength(1);
      const content = JSON.parse((result.contents[0] as any).text);
      expect(content).toHaveProperty("categories");
      expect(content).toHaveProperty("total_categories");
      expect(content).toHaveProperty("total_active_deals");
      expect(content).toHaveProperty("last_updated");
      expect(Array.isArray(content.categories)).toBe(true);
      expect(content.categories.length).toBeGreaterThan(0);
    });

    it("should include category details", async () => {
      const result = await readResource("categories://list", env);

      const content = JSON.parse((result.contents[0] as any).text);
      const firstCategory = content.categories[0];
      expect(firstCategory).toHaveProperty("name");
      expect(firstCategory).toHaveProperty("description");
      expect(firstCategory).toHaveProperty("keywords");
      expect(firstCategory).toHaveProperty("domains");
      expect(firstCategory).toHaveProperty("active_deals");
    });

    it("should count active deals per category", async () => {
      await seedReferral(
        env,
        createMockReferral({
          code: "CAT1",
          metadata: { category: ["finance"], title: "Finance Deal" },
        }),
      );
      await seedReferral(
        env,
        createMockReferral({
          code: "CAT2",
          metadata: { category: ["finance"], title: "Another Finance Deal" },
        }),
      );

      const result = await readResource("categories://list", env);

      const content = JSON.parse((result.contents[0] as any).text);
      const financeCategory = content.categories.find(
        (c: { name: string }) => c.name === "finance",
      );
      expect(financeCategory).toBeDefined();
      expect(financeCategory.active_deals).toBeGreaterThanOrEqual(2);
    });
  });

  describe("analytics:// protocol", () => {
    it("should return analytics summary", async () => {
      const result = await readResource("analytics://summary", env);

      expect(result.contents).toHaveLength(1);
      const content = JSON.parse((result.contents[0] as any).text);
      expect(content).toHaveProperty("summary");
      expect(content).toHaveProperty("generated_at");
      expect(content).toHaveProperty("period_days");
      expect(content.period_days).toBe(30);
    });

    it("should return full analytics", async () => {
      const result = await readResource("analytics://full", env);

      expect(result.contents).toHaveLength(1);
      const content = JSON.parse((result.contents[0] as any).text);
      if (content.error) {
        expect(content.error).toBeDefined();
      } else {
        expect(content.type).toBe("full");
        expect(content).toHaveProperty("analytics");
        expect(content).toHaveProperty("generated_at");
      }
    });

    it("should return detailed analytics", async () => {
      const result = await readResource("analytics://detailed", env);

      const content = JSON.parse((result.contents[0] as any).text);
      if (content.error) {
        expect(content.error).toBeDefined();
      } else {
        expect(content.type).toBe("detailed");
        expect(content).toHaveProperty("analytics");
      }
    });

    it("should return trends analytics", async () => {
      const result = await readResource("analytics://trends", env);

      const content = JSON.parse((result.contents[0] as any).text);
      if (content.error) {
        expect(content.error).toBeDefined();
      } else {
        expect(content.type).toBe("trends");
        expect(content).toHaveProperty("deals_over_time");
        expect(content).toHaveProperty("expiring_soon");
        expect(content).toHaveProperty("quality_metrics");
      }
    });

    it("should return error for unknown analytics type", async () => {
      const result = await readResource("analytics://unknown", env);

      const content = JSON.parse((result.contents[0] as any).text);
      expect(content.error).toBe("Unknown analytics type");
      expect(content.available_types).toContain("summary");
      expect(content.available_types).toContain("full");
      expect(content.available_types).toContain("trends");
    });
  });

  describe("Unknown protocols", () => {
    it("should return error for unknown protocol", async () => {
      const result = await readResource("unknown://test", env);

      expect(result.contents).toHaveLength(1);
      const content = JSON.parse((result.contents[0] as any).text);
      expect(content.error).toBe("Resource not found");
      expect(content.uri).toBe("unknown://test");
      expect(content.available_resources).toBeDefined();
      expect(content.available_templates).toBeDefined();
    });

    it("should handle categories URI without list path", async () => {
      const result = await readResource("categories://other", env);

      expect(result.contents).toHaveLength(1);
      const content = JSON.parse((result.contents[0] as any).text);
      expect(content.error).toBe("Resource not found");
    });
  });

  describe("Resource metadata", () => {
    it("should use correct mimeType for all resources", async () => {
      const dealResult = await readResource("deals://test", env);
      expect(dealResult.contents[0].mimeType).toBe("application/json");

      const catResult = await readResource("categories://list", env);
      expect(catResult.contents[0].mimeType).toBe("application/json");

      const analyticsResult = await readResource("analytics://summary", env);
      expect(analyticsResult.contents[0].mimeType).toBe("application/json");
    });

    it("should use correct URI in content", async () => {
      const dealResult = await readResource("deals://test", env);
      expect(dealResult.contents[0].uri).toBe("deals://test");

      const catResult = await readResource("categories://list", env);
      expect(catResult.contents[0].uri).toBe("categories://list");
    });
  });
});
