/**
 * E2E Integration Tests for MCP Tools
 *
 * Tests the full MCP endpoint flow through the worker:
 * - POST /mcp/v1/tools/call
 * - POST /mcp/v1/tools/list
 * - POST /mcp/v1/info
 * - Tool execution with real KV storage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { KVNamespace } from "@cloudflare/workers-types";
import worker from "../../worker/index";
import type { Env, ReferralInput } from "../../worker/types";
import { REFERRAL_KEYS } from "../../worker/lib/referral-storage/types";

// Hardcoded test key for the mock
const TEST_KEY = "ddr_test_key_123456789";

// Mock auth module
vi.mock("../../worker/lib/auth", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    authenticateRequest: vi.fn(async (request: Request) => {
      const key =
        request.headers.get("X-API-Key") ||
        request.headers.get("Authorization")?.replace("Bearer ", "");
      if (key === "ddr_test_key_123456789") {
        return { authenticated: true, userId: "test-user", role: "admin" };
      }
      return { authenticated: false, error: "Invalid API key" };
    }),
    createAuthMiddleware: vi.fn((_env, requiredRole) => {
      return async (
        request: Request,
        handler: (auth: any) => Promise<Response>,
      ) => {
        const key =
          request.headers.get("X-API-Key") ||
          request.headers.get("Authorization")?.replace("Bearer ", "");
        if (key === "ddr_test_key_123456789") {
          const auth = {
            authenticated: true,
            userId: "test-user",
            role: "admin",
          };
          return handler(auth);
        }
        return new Response(JSON.stringify({ error: "Invalid API key" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      };
    }),
  };
});

// ============================================================================
// Mock Setup
// ============================================================================

function createMockEnv(): Env {
  const store = new Map<string, string>();

  const createKV = (): KVNamespace =>
    ({
      get: vi
        .fn()
        .mockImplementation(
          async (key: string, opts?: string | { type?: string }) => {
            const value = store.get(key);
            if (value === undefined) return null;
            const isJson =
              typeof opts === "string"
                ? opts === "json"
                : opts?.type === "json";
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
    }) as unknown as KVNamespace;

  return {
    DEALS_PROD: createKV(),
    DEALS_STAGING: createKV(),
    DEALS_LOG: createKV(),
    DEALS_LOCK: createKV(),
    DEALS_SOURCES: createKV(),
    DEALS_ACTIVE: createKV(),
    DEALS_PRODUCTION: createKV(),
    DEALS_QUARANTINE: createKV(),
    API_KEYS: createKV(),
    ENVIRONMENT: "test",
    GITHUB_REPO: "test/repo",
    NOTIFICATION_THRESHOLD: "100",
  } as Env;
}

async function seedReferral(env: Env, referral: ReferralInput): Promise<void> {
  const referralId = referral.id || "unknown";
  const referralCode = referral.code || "UNKNOWN";
  const referralDomain = referral.domain || "unknown.com";

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
  if (!domainIndex[referralDomain]) {
    domainIndex[referralDomain] = [];
  }
  if (!domainIndex[referralDomain].includes(referralId)) {
    domainIndex[referralDomain].push(referralId);
  }
  await env.DEALS_SOURCES.put(domainIndexKey, JSON.stringify(domainIndex));
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

// ============================================================================
// MCP Protocol Tests
// ============================================================================

describe("MCP Protocol E2E", () => {
  let mockEnv: Env;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    mockEnv = createMockEnv();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("POST /mcp/v1/tools/list", () => {
    it("should return list of available MCP tools", async () => {
      const request = new Request("http://localhost/mcp/v1/tools/list", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": TEST_KEY,
        },
        body: JSON.stringify({}),
      });

      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.tools).toBeDefined();
      expect(Array.isArray(body.tools)).toBe(true);
      expect(body.tools.length).toBeGreaterThan(0);
    });

    it("should include search_deals tool", async () => {
      const request = new Request("http://localhost/mcp/v1/tools/list", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": TEST_KEY,
        },
        body: JSON.stringify({}),
      });

      const response = await worker.fetch(request, mockEnv);
      const body = await response.json();

      const toolNames = body.tools.map((t: { name: string }) => t.name);
      expect(toolNames).toContain("search_deals");
    });

    it("should include add_referral tool", async () => {
      const request = new Request("http://localhost/mcp/v1/tools/list", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": TEST_KEY,
        },
        body: JSON.stringify({}),
      });

      const response = await worker.fetch(request, mockEnv);
      const body = await response.json();

      const toolNames = body.tools.map((t: { name: string }) => t.name);
      expect(toolNames).toContain("add_referral");
    });

    it("should include research_domain tool", async () => {
      const request = new Request("http://localhost/mcp/v1/tools/list", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": TEST_KEY,
        },
        body: JSON.stringify({}),
      });

      const response = await worker.fetch(request, mockEnv);
      const body = await response.json();

      const toolNames = body.tools.map((t: { name: string }) => t.name);
      expect(toolNames).toContain("research_domain");
    });
  });

  describe("POST /mcp/v1/tools/call", () => {
    it("should execute search_deals tool", async () => {
      const referral = createMockReferral({
        code: "E2E001",
        domain: "test-deal.com",
        metadata: { title: "E2E Test Deal", category: ["finance"] },
      });
      await seedReferral(mockEnv, referral);

      const request = new Request("http://localhost/mcp/v1/tools/call", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": TEST_KEY,
        },
        body: JSON.stringify({
          tool: "search_deals",
          input: { domain: "test-deal.com" },
        }),
      });

      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.content).toBeDefined();
    });

    it("should execute add_referral tool", async () => {
      const request = new Request("http://localhost/mcp/v1/tools/call", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": TEST_KEY,
        },
        body: JSON.stringify({
          tool: "add_referral",
          input: {
            code: "NEWREF001",
            url: "https://newref.com/invite/NEWREF001",
            domain: "newref.com",
            title: "New Referral Deal",
            reward_type: "cash",
            reward_value: 25,
          },
        }),
      });

      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.content).toBeDefined();
    });

    it("should execute list_categories tool", async () => {
      const request = new Request("http://localhost/mcp/v1/tools/call", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": TEST_KEY,
        },
        body: JSON.stringify({
          tool: "list_categories",
          input: {},
        }),
      });

      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.content).toBeDefined();
    });

    it("should return error for unknown tool", async () => {
      const request = new Request("http://localhost/mcp/v1/tools/call", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": TEST_KEY,
        },
        body: JSON.stringify({
          tool: "nonexistent_tool",
          input: {},
        }),
      });

      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.content).toBeDefined();
      expect(body.isError).toBe(true);
    });

    it("should handle missing tool field", async () => {
      const request = new Request("http://localhost/mcp/v1/tools/call", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": TEST_KEY,
        },
        body: JSON.stringify({ input: {} }),
      });

      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBeDefined();
    });
  });

  describe("POST /mcp/v1/info", () => {
    it("should return server info", async () => {
      const request = new Request("http://localhost/mcp/v1/info", {
        method: "GET",
        headers: {
          "X-API-Key": TEST_KEY,
        },
      });

      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.name).toBeDefined();
      expect(body.version).toBeDefined();
    });
  });

  describe("MCP Tool Integration", () => {
    it("should add referral then search for it", async () => {
      // Step 1: Add a referral
      const addRequest = new Request("http://localhost/mcp/v1/tools/call", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": TEST_KEY,
        },
        body: JSON.stringify({
          tool: "add_referral",
          input: {
            code: "CHAIN001",
            url: "https://chain-test.com/ref/CHAIN001",
            domain: "chain-test.com",
            title: "Chain Test Deal",
            reward_type: "percent",
            reward_value: 10,
            category: ["shopping"],
          },
        }),
      });

      const addResponse = await worker.fetch(addRequest, mockEnv);
      expect(addResponse.status).toBe(200);

      // Step 2: Search for the referral
      const searchRequest = new Request("http://localhost/mcp/v1/tools/call", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": TEST_KEY,
        },
        body: JSON.stringify({
          tool: "search_deals",
          input: { domain: "chain-test.com" },
        }),
      });

      const searchResponse = await worker.fetch(searchRequest, mockEnv);
      expect(searchResponse.status).toBe(200);

      const body = await searchResponse.json();
      expect(body.content).toBeDefined();
    });

    it("should handle multiple sequential tool calls", async () => {
      // Add first referral
      await worker.fetch(
        new Request("http://localhost/mcp/v1/tools/call", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": TEST_KEY,
          },
          body: JSON.stringify({
            tool: "add_referral",
            input: {
              code: "SEQ001",
              url: "https://seq-test.com/SEQ001",
              domain: "seq-test.com",
            },
          }),
        }),
        mockEnv,
      );

      // Add second referral
      await worker.fetch(
        new Request("http://localhost/mcp/v1/tools/call", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": TEST_KEY,
          },
          body: JSON.stringify({
            tool: "add_referral",
            input: {
              code: "SEQ002",
              url: "https://seq-test.com/SEQ002",
              domain: "seq-test.com",
            },
          }),
        }),
        mockEnv,
      );

      // Search for both
      const searchResponse = await worker.fetch(
        new Request("http://localhost/mcp/v1/tools/call", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": TEST_KEY,
          },
          body: JSON.stringify({
            tool: "search_deals",
            input: { domain: "seq-test.com" },
          }),
        }),
        mockEnv,
      );

      expect(searchResponse.status).toBe(200);
    });
  });
});
