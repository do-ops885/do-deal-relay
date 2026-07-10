import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  registerRoutes,
  getRegisteredRoutes,
  matchRoute,
} from "../../../worker/lib/middleware/pipeline";
import { authMiddleware } from "../../../worker/lib/middleware/auth";
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
});
