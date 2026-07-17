/**
 * Unit Tests for MCP Route Handlers - Pagination & Progress
 */

import { describe, it, expect, vi } from "vitest";
import type { D1Database, KVNamespace } from "@cloudflare/workers-types";
import type { Env } from "../../worker/types";

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
    expect(firstBody.result.tools.length).toBeGreaterThan(0);
    expect(firstBody.result.tools.length).toBeLessThanOrEqual(20);

    if (firstBody.result.nextCursor) {
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
    }
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
