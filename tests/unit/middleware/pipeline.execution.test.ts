import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  registerRoutes,
  matchRoute,
  handlePipelineRequest,
  executePipeline,
} from "../../../worker/lib/middleware/pipeline";
import { rateLimitMiddleware } from "../../../worker/lib/middleware/rate-limit";
import type { RouteConfig } from "../../../worker/lib/middleware/types";
import type { Env } from "../../../worker/types";

// ============================================================================
// Test Helpers
// ============================================================================

function createMockEnv(overrides?: Partial<Env>): Env {
  const mockKvGet = vi.fn();
  const mockKvPut = vi.fn();
  const mockKvDelete = vi.fn();
  const mockKvList = vi.fn();

  return {
    DEALS_LOCK: {
      get: mockKvGet,
      put: mockKvPut,
      delete: mockKvDelete,
      list: mockKvList,
    } as unknown as Env["DEALS_LOCK"],
    DEALS_SOURCES: {
      get: mockKvGet,
      put: mockKvPut,
      delete: mockKvDelete,
      list: mockKvList,
    } as unknown as Env["DEALS_SOURCES"],
    WEBHOOK_API_KEYS: {
      get: mockKvGet,
      put: mockKvPut,
      delete: mockKvDelete,
      list: mockKvList,
    } as unknown as Env["WEBHOOK_API_KEYS"],
    DEALS_PROD: {} as Env["DEALS_PROD"],
    DEALS_LOG: {} as Env["DEALS_LOG"],
    DEALS_STAGING: {} as Env["DEALS_STAGING"],
    DEALS_DB: {} as Env["DEALS_DB"],
    AI_GATEWAY_URL: "https://gateway.test",
    WEBHOOK_SECRET: "test-secret",
    API_ENCRYPTION_KEY: "test-key",
    TRUST_THRESHOLD: "0.3",
    NOTIFICATION_THRESHOLD: "0.5",
    ENVIRONMENT: "test",
    GITHUB_REPO: "test/repo",
    ...overrides,
  } as unknown as Env;
}

function createRequest(
  path: string,
  method = "GET",
  headers?: Record<string, string>,
): Request {
  return new Request(`https://example.com${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

const helloHandler = vi
  .fn()
  .mockImplementation(() =>
    Promise.resolve(new Response("hello", { status: 200 })),
  );

// ============================================================================
// Rate Limit Middleware
// ============================================================================

describe("Middleware Pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerRoutes([]);
  });

  describe("rateLimitMiddleware", () => {
    it("should pass through when no rate limit config and no default exists", async () => {
      const env = createMockEnv();
      // No rate limit state in KV → checkRateLimit allows the request
      (env.DEALS_LOCK.get as any).mockResolvedValue(null);

      const config: RouteConfig = {
        method: "GET",
        path: "/unknown-endpoint",
        handler: helloHandler,
        auth: "public",
        description: "No rate limit",
      };

      const result = await rateLimitMiddleware(
        createRequest("/unknown-endpoint"),
        env,
        config,
        {},
      );

      expect(result).toBeNull();
    });

    it("should enforce custom rate limits from route config", async () => {
      const env = createMockEnv();
      (env.DEALS_LOCK.get as any).mockResolvedValue(null);

      const config: RouteConfig = {
        method: "POST",
        path: "/api/test",
        handler: helloHandler,
        auth: "public",
        rateLimit: { windowSeconds: 60, maxRequests: 2 },
        description: "Rate limited",
      };

      // First request — should pass
      const result1 = await rateLimitMiddleware(
        createRequest("/api/test", "POST"),
        env,
        config,
        {},
      );
      expect(result1).toBeNull();
      expect(env.DEALS_LOCK.put).toHaveBeenCalled();
    });

    it("should enforce default rate limits when no custom config", async () => {
      const env = createMockEnv();
      // Simulate hitting the /api/submit default limit (maxRequests: 10)
      const now = Math.floor(Date.now() / 1000);
      const windowStart = Math.floor(now / 60) * 60;
      (env.DEALS_LOCK.get as any).mockResolvedValue({
        count: 10,
        windowStart,
      });

      const config: RouteConfig = {
        method: "POST",
        path: "/api/submit",
        handler: helloHandler,
        auth: "public",
        description: "Submit (default rate limit)",
      };

      const result = await rateLimitMiddleware(
        createRequest("/api/submit", "POST"),
        env,
        config,
        {},
      );

      expect(result).not.toBeNull();
      expect(result!.status).toBe(429);
      const body = (await result!.json()) as { error: string };
      expect(body.error).toBe("Rate limit exceeded");
    });

    it("should fail open on KV errors", async () => {
      const env = createMockEnv();
      (env.DEALS_LOCK.get as any).mockRejectedValue(new Error("KV failure"));

      const config: RouteConfig = {
        method: "GET",
        path: "/api/test",
        handler: helloHandler,
        auth: "public",
        rateLimit: { windowSeconds: 60, maxRequests: 10 },
        description: "Should fail open",
      };

      const result = await rateLimitMiddleware(
        createRequest("/api/test"),
        env,
        config,
        {},
      );

      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // Pipeline Execution (Integration)
  // ============================================================================

  describe("executePipeline", () => {
    it("should execute handler for public routes", async () => {
      const env = createMockEnv();
      const handler = vi
        .fn()
        .mockResolvedValue(new Response("OK", { status: 200 }));

      registerRoutes([
        {
          method: "GET",
          path: "/test",
          handler,
          auth: "public",
          description: "Test",
        },
      ]);

      const match = matchRoute("GET", "/test");
      expect(match).not.toBeNull();

      const response = await executePipeline(
        createRequest("/test"),
        env,
        match!,
      );

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
    });

    it("should pass extracted params to handler", async () => {
      const env = createMockEnv();
      const handler = vi
        .fn()
        .mockImplementation(
          (req: Request, _env: Env, params: Record<string, string>) =>
            Promise.resolve(
              new Response(JSON.stringify(params), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              }),
            ),
        );

      registerRoutes([
        {
          method: "GET",
          path: "/api/items/:id",
          handler,
          auth: "public",
          description: "Get item",
        },
      ]);

      const match = matchRoute("GET", "/api/items/42");
      const response = await executePipeline(
        createRequest("/api/items/42"),
        env,
        match!,
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({ id: "42" });
    });

    it("should return 401 for unauthenticated api-key routes", async () => {
      const env = createMockEnv();
      const handler = vi.fn();

      registerRoutes([
        {
          method: "GET",
          path: "/api/secret",
          handler,
          auth: "api-key",
          description: "Secret",
        },
      ]);

      const match = matchRoute("GET", "/api/secret");
      const response = await executePipeline(
        createRequest("/api/secret"),
        env,
        match!,
      );

      expect(response.status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
    });

    it("should block non-admin for internal routes", async () => {
      const env = createMockEnv();
      (env.WEBHOOK_API_KEYS!.get as any).mockResolvedValue(
        JSON.stringify({
          userId: "user-1",
          role: "user",
          rateLimit: { requestsPerMinute: 60, requestsPerHour: 1000 },
        }),
      );

      const handler = vi.fn();
      registerRoutes([
        {
          method: "GET",
          path: "/api/admin-only",
          handler,
          auth: "internal",
          description: "Admin only",
        },
      ]);

      const match = matchRoute("GET", "/api/admin-only");
      const response = await executePipeline(
        createRequest("/api/admin-only", "GET", {
          Authorization: "Bearer ddr_test123_1234567890",
        }),
        env,
        match!,
      );

      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    });

    it("should handle OPTIONS preflight with CORS headers", async () => {
      const env = createMockEnv();
      const handler = vi.fn();

      registerRoutes([
        {
          method: "GET",
          path: "/api/test",
          handler,
          auth: "public",
          description: "Test",
        },
      ]);

      const match = matchRoute("GET", "/api/test");
      const request = new Request("https://example.com/api/test", {
        method: "OPTIONS",
        headers: { Origin: "https://do-deal-relay.pages.dev" },
      });

      const response = await executePipeline(request, env, match!);

      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://do-deal-relay.pages.dev",
      );
      expect(handler).not.toHaveBeenCalled();
    });

    it("should return 500 on handler error", async () => {
      const env = createMockEnv();
      const handler = vi.fn().mockRejectedValue(new Error("boom"));

      registerRoutes([
        {
          method: "GET",
          path: "/api/crash",
          handler,
          auth: "public",
          description: "Crash",
        },
      ]);

      const match = matchRoute("GET", "/api/crash");
      const response = await executePipeline(
        createRequest("/api/crash"),
        env,
        match!,
      );

      expect(response.status).toBe(500);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Internal server error");
    });
  });

  // ============================================================================
  // Pipeline Router Entry Point
  // ============================================================================

  describe("handlePipelineRequest", () => {
    it("should return Response for matching routes", async () => {
      registerRoutes([
        {
          method: "GET",
          path: "/health",
          handler: vi
            .fn()
            .mockResolvedValue(new Response("healthy", { status: 200 })),
          auth: "public",
          description: "Health",
        },
      ]);

      const response = await handlePipelineRequest(
        createRequest("/health"),
        createMockEnv(),
      );

      expect(response).not.toBeNull();
      expect(response!.status).toBe(200);
    });

    it("should return null for unmatched routes (fall through to legacy)", async () => {
      registerRoutes([]);

      const response = await handlePipelineRequest(
        createRequest("/api/legacy"),
        createMockEnv(),
      );

      expect(response).toBeNull();
    });

    it("should return null when HTTP method does not match", async () => {
      registerRoutes([
        {
          method: "GET",
          path: "/test",
          handler: vi.fn().mockResolvedValue(new Response("OK")),
          auth: "public",
          description: "Test",
        },
      ]);

      const response = await handlePipelineRequest(
        createRequest("/test", "DELETE"),
        createMockEnv(),
      );

      expect(response).toBeNull();
    });
  });
});
