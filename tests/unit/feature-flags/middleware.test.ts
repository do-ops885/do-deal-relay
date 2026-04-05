/**
 * Feature Flags Middleware Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createFeatureFlagMiddleware } from "../../../worker/lib/feature-flags";
import type { Env } from "../../../worker/types";

// Type for KV namespace mock
type MockKVNamespace = {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
};

describe("Feature Flags Middleware", () => {
  let mockKvStorage: Map<string, unknown>;
  let mockEnv: Env;

  beforeEach(() => {
    mockKvStorage = new Map();

    mockEnv = {
      DEALS_LOCK: {
        get: vi.fn(async <T>(key: string, type?: string): Promise<T | null> => {
          const value = mockKvStorage.get(key);
          if (value === undefined) return null;
          if (type === "json" && typeof value === "string") {
            return JSON.parse(value) as T;
          }
          return value as T;
        }),
        put: vi.fn(
          async (
            key: string,
            value: string,
            _options?: { expirationTtl?: number },
          ) => {
            mockKvStorage.set(key, value);
          },
        ),
        delete: vi.fn(async (key: string) => {
          mockKvStorage.delete(key);
        }),
        list: vi.fn(
          async (options?: {
            prefix?: string;
          }): Promise<{ keys: { name: string }[] }> => {
            const keys: { name: string }[] = [];
            for (const key of mockKvStorage.keys()) {
              if (!options?.prefix || key.startsWith(options.prefix)) {
                keys.push({ name: key });
              }
            }
            return { keys };
          },
        ),
      } as unknown as MockKVNamespace,
    } as Env;
  });

  afterEach(() => {
    mockKvStorage.clear();
    vi.clearAllMocks();
  });

  describe("createFeatureFlagMiddleware", () => {
    it("should allow request when flag is enabled", async () => {
      const { setFeatureFlag } =
        await import("../../../worker/lib/feature-flags");
      await setFeatureFlag({ name: "middleware-flag", enabled: true }, mockEnv);

      const middleware = createFeatureFlagMiddleware(
        mockEnv,
        "middleware-flag",
      );
      const handler = vi.fn().mockResolvedValue(new Response("OK"));

      const request = new Request("http://localhost/test");
      const response = await middleware(request, handler);

      expect(handler).toHaveBeenCalled();
      expect(response.status).toBe(200);
    });

    it("should block request when flag is disabled", async () => {
      const { setFeatureFlag } =
        await import("../../../worker/lib/feature-flags");
      await setFeatureFlag({ name: "blocked-flag", enabled: false }, mockEnv);

      const middleware = createFeatureFlagMiddleware(mockEnv, "blocked-flag");
      const handler = vi.fn().mockResolvedValue(new Response("OK"));

      const request = new Request("http://localhost/test");
      const response = await middleware(request, handler);

      expect(handler).not.toHaveBeenCalled();
      expect(response.status).toBe(404);
    });

    it("should use custom getUserId function", async () => {
      const { setFeatureFlag } =
        await import("../../../worker/lib/feature-flags");
      await setFeatureFlag(
        {
          name: "custom-user-flag",
          enabled: true,
          userIds: ["custom-user"],
        },
        mockEnv,
      );

      const middleware = createFeatureFlagMiddleware(
        mockEnv,
        "custom-user-flag",
        {
          getUserId: (req) => "custom-user",
        },
      );
      const handler = vi.fn().mockResolvedValue(new Response("OK"));

      const request = new Request("http://localhost/test");
      const response = await middleware(request, handler);

      expect(handler).toHaveBeenCalled();
    });

    it("should use custom onDisabled handler", async () => {
      const { setFeatureFlag } =
        await import("../../../worker/lib/feature-flags");
      await setFeatureFlag(
        { name: "custom-disabled", enabled: false },
        mockEnv,
      );

      const customResponse = new Response("Custom disabled", { status: 403 });
      const middleware = createFeatureFlagMiddleware(
        mockEnv,
        "custom-disabled",
        {
          onDisabled: () => customResponse,
        },
      );
      const handler = vi.fn().mockResolvedValue(new Response("OK"));

      const request = new Request("http://localhost/test");
      const response = await middleware(request, handler);

      expect(response.status).toBe(403);
      expect(await response.text()).toBe("Custom disabled");
    });

    it("should handle non-existent flag", async () => {
      const middleware = createFeatureFlagMiddleware(
        mockEnv,
        "non-existent-flag",
      );
      const handler = vi.fn().mockResolvedValue(new Response("OK"));

      const request = new Request("http://localhost/test");
      const response = await middleware(request, handler);

      expect(response.status).toBe(404);
    });
  });
});
