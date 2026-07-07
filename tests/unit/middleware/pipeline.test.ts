import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  registerRoutes,
  getRegisteredRoutes,
  matchRoute,
  handlePipelineRequest,
  executePipeline,
} from "../../../worker/lib/middleware/pipeline";
import { authMiddleware } from "../../../worker/lib/middleware/auth";
import { rateLimitMiddleware } from "../../../worker/lib/middleware/rate-limit";
import type {
  RouteConfig,
  AuthTier,
} from "../../../worker/lib/middleware/types";
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

const mockHandler = vi
  .fn()
  .mockResolvedValue(new Response("OK", { status: 200 })) as any;

const helloHandler = vi
  .fn()
  .mockImplementation(() =>
    Promise.resolve(new Response("hello", { status: 200 })),
  );

const paramHandler = vi
  .fn()
  .mockImplementation(
    (req: Request, env: Env, params: Record<string, string>) =>
      Promise.resolve(
        new Response(JSON.stringify(params), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
  );

// ============================================================================
// Route Registration
// ============================================================================

describe("Middleware Pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerRoutes([]);
  });

  describe("registerRoutes", () => {
    it("should register routes", () => {
      const routes: RouteConfig[] = [
        {
          method: "GET",
          path: "/test",
          handler: helloHandler,
          auth: "public",
          description: "Test route",
        },
      ];

      registerRoutes(routes);

      expect(getRegisteredRoutes()).toHaveLength(1);
      expect(getRegisteredRoutes()[0]!.path).toBe("/test");
    });

    it("should replace previously registered routes", () => {
      registerRoutes([
        {
          method: "GET",
          path: "/first",
          handler: helloHandler,
          auth: "public",
          description: "First",
        },
      ]);
      registerRoutes([
        {
          method: "GET",
          path: "/second",
          handler: helloHandler,
          auth: "public",
          description: "Second",
        },
      ]);

      expect(getRegisteredRoutes()).toHaveLength(1);
      expect(getRegisteredRoutes()[0]!.path).toBe("/second");
    });

    it("should support multiple HTTP methods per route", () => {
      registerRoutes([
        {
          method: ["GET", "POST"],
          path: "/multi",
          handler: helloHandler,
          auth: "public",
          description: "Multi-method",
        },
      ]);

      const match1 = matchRoute("GET", "/multi");
      const match2 = matchRoute("POST", "/multi");
      const match3 = matchRoute("DELETE", "/multi");

      expect(match1).not.toBeNull();
      expect(match2).not.toBeNull();
      expect(match3).toBeNull();
    });
  });

  // ============================================================================
  // Route Matching
  // ============================================================================

  describe("matchRoute", () => {
    beforeEach(() => {
      registerRoutes([
        {
          method: "GET",
          path: "/health",
          handler: helloHandler,
          auth: "public",
          description: "Health check",
        },
        {
          method: "POST",
          path: "/api/submit",
          handler: helloHandler,
          auth: "api-key",
          description: "Submit deal",
        },
        {
          method: "GET",
          path: "/api/referrals/:code",
          handler: paramHandler,
          auth: "public",
          description: "Get referral by code",
        },
        {
          method: ["GET", "POST"],
          path: "/api/d1",
          handler: helloHandler,
          auth: "internal",
          description: "D1 operations",
        },
      ]);
    });

    it("should match exact paths", () => {
      const match = matchRoute("GET", "/health");
      expect(match).not.toBeNull();
      expect(match!.config.path).toBe("/health");
      expect(match!.params).toEqual({});
    });

    it("should not match on wrong HTTP method", () => {
      const match = matchRoute("DELETE", "/health");
      expect(match).toBeNull();
    });

    it("should match routes with :param placeholders", () => {
      const match = matchRoute("GET", "/api/referrals/ABC123");
      expect(match).not.toBeNull();
      expect(match!.config.path).toBe("/api/referrals/:code");
      expect(match!.params).toEqual({ code: "ABC123" });
    });

    it("should match multiple methods", () => {
      expect(matchRoute("GET", "/api/d1")).not.toBeNull();
      expect(matchRoute("POST", "/api/d1")).not.toBeNull();
      expect(matchRoute("DELETE", "/api/d1")).toBeNull();
    });

    it("should return null for unmatched paths", () => {
      const match = matchRoute("GET", "/nonexistent");
      expect(match).toBeNull();
    });

    it("should not match partial paths", () => {
      const match = matchRoute("GET", "/health/extra");
      expect(match).toBeNull();
    });

    it("should return first matching route (priority by registration order)", () => {
      registerRoutes([
        {
          method: "GET",
          path: "/api/:id",
          handler: vi.fn(),
          auth: "public",
          description: "Generic",
        },
        {
          method: "GET",
          path: "/api/special",
          handler: vi.fn(),
          auth: "public",
          description: "Special",
        },
      ]);

      // "special" matches the first registered route (/:id)
      const match = matchRoute("GET", "/api/special");
      expect(match!.config.description).toBe("Generic");
      expect(match!.params).toEqual({ id: "special" });
    });
  });

  // ============================================================================
  // Auth Middleware
  // ============================================================================

  describe("authMiddleware", () => {
    it("should pass through for public routes", async () => {
      const config: RouteConfig = {
        method: "GET",
        path: "/health",
        handler: helloHandler,
        auth: "public",
        description: "Public",
      };

      const result = await authMiddleware(
        createRequest("/health"),
        createMockEnv(),
        config,
        {},
      );

      expect(result).toBeNull();
    });

    it("should reject unauthenticated requests for api-key routes", async () => {
      const config: RouteConfig = {
        method: "GET",
        path: "/api/test",
        handler: helloHandler,
        auth: "api-key",
        description: "Protected",
      };

      const result = await authMiddleware(
        createRequest("/api/test"),
        createMockEnv(),
        config,
        {},
      );

      expect(result).not.toBeNull();
      expect(result!.status).toBe(401);
    });

    it("should reject non-admin users for internal routes", async () => {
      const env = createMockEnv();
      // Mock a valid API key that returns user role (not admin)
      (env.WEBHOOK_API_KEYS!.get as any).mockResolvedValue(
        JSON.stringify({
          userId: "user-1",
          role: "user",
          rateLimit: { requestsPerMinute: 60, requestsPerHour: 1000 },
        }),
      );

      // Mock the hash comparison to return our test key
      const originalDigest = crypto.subtle.digest;
      crypto.subtle.digest = vi
        .fn()
        .mockResolvedValue(
          new Uint8Array([
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
          ]),
        );

      const config: RouteConfig = {
        method: "GET",
        path: "/api/d1",
        handler: helloHandler,
        auth: "internal",
        description: "Internal",
      };

      const result = await authMiddleware(
        createRequest("/api/d1", "GET", {
          Authorization: "Bearer ddr_test123_1234567890",
        }),
        env,
        config,
        {},
      );

      // Should reject because role is "user", not "admin"
      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);

      crypto.subtle.digest = originalDigest;
    });

    it("should pass through for internal routes with admin role", async () => {
      const env = createMockEnv();
      (env.WEBHOOK_API_KEYS!.get as any).mockResolvedValue(
        JSON.stringify({
          userId: "admin-1",
          role: "admin",
          rateLimit: { requestsPerMinute: 100, requestsPerHour: 5000 },
        }),
      );

      const originalDigest = crypto.subtle.digest;
      crypto.subtle.digest = vi
        .fn()
        .mockResolvedValue(
          new Uint8Array([
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
          ]),
        );

      const config: RouteConfig = {
        method: "GET",
        path: "/api/d1",
        handler: helloHandler,
        auth: "internal",
        description: "Internal",
      };

      const result = await authMiddleware(
        createRequest("/api/d1", "GET", {
          Authorization: "Bearer ddr_admin123_1234567890",
        }),
        env,
        config,
        {},
      );

      expect(result).toBeNull();

      crypto.subtle.digest = originalDigest;
    });
  });

  // ============================================================================
  // Rate Limit Middleware
  // ============================================================================

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
