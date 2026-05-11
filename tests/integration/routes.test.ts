import { describe, it, expect, vi, beforeEach } from "vitest";
import worker from "../../worker/index";
import type { Env } from "../../worker/types";
import { hashApiKey } from "../../worker/lib/auth";

describe("Critical Routes Integration", () => {
  let mockKvStorage: Map<string, unknown>;
  let mockEnv: Env;

  beforeEach(() => {
    mockKvStorage = new Map();
    vi.stubGlobal("fetch", vi.fn());

    const mockKv = {
      get: vi.fn(async (key: string, type?: string) => {
        const value = mockKvStorage.get(key);
        if (value === undefined) return null;
        if (type === "json" && typeof value === "string") {
          return JSON.parse(value);
        }
        return value;
      }),
      put: vi.fn(async (key: string, value: string) => {
        mockKvStorage.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        mockKvStorage.delete(key);
      }),
      list: vi.fn(async () => ({ keys: [], list_complete: true })),
    };

    mockEnv = {
      DEALS_PROD: mockKv as any,
      DEALS_STAGING: mockKv as any,
      DEALS_LOG: mockKv as any,
      DEALS_LOCK: mockKv as any,
      DEALS_SOURCES: mockKv as any,
      DEALS_KV: mockKv as any,
      METRICS_KV: mockKv as any,
      DEALS_DB: {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
          get: vi.fn().mockResolvedValue(null),
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      } as any,
      ENVIRONMENT: "test",
      TRUST_THRESHOLD: "0.3",
      AI_GATEWAY_URL: "https://example.com/ai",
    } as any;
  });

  async function setupAuth(role: "admin" | "user" = "admin") {
    const key = "ddr_testkey1234567890123456789012";
    const hash = await hashApiKey(key);
    mockKvStorage.set(
      `apikey:${hash}`,
      JSON.stringify({
        userId: "1",
        role,
        rateLimit: { requestsPerMinute: 60, requestsPerHour: 1000 },
      }),
    );
    return key;
  }

  describe("Referral Deactivate/Reactivate Routes", () => {
    it("should match and handle deactivate route", async () => {
      const key = await setupAuth("admin");

      // Mock existing referral and index
      const referral = {
        id: "id1",
        code: "TESTCODE",
        domain: "example.com",
        status: "active",
      };
      mockKvStorage.set("referral:input:id1", JSON.stringify(referral));
      mockKvStorage.set(
        "referral:index:code",
        JSON.stringify({ testcode: "id1" }),
      );

      const request = new Request(
        "http://localhost/api/referrals/TESTCODE/deactivate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": key,
          },
          body: JSON.stringify({ id: "TESTCODE", reason: "inactive" }),
        },
      );

      const response = await worker.fetch(request, mockEnv);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.referral.status).toBe("inactive");
    });

    it("should match and handle reactivate route", async () => {
      const key = await setupAuth("admin");

      // Mock existing referral and index
      const referral = {
        id: "id1",
        code: "TESTCODE",
        domain: "example.com",
        status: "inactive",
      };
      mockKvStorage.set("referral:input:id1", JSON.stringify(referral));
      mockKvStorage.set(
        "referral:index:code",
        JSON.stringify({ testcode: "id1" }),
      );

      const request = new Request(
        "http://localhost/api/referrals/TESTCODE/reactivate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": key,
          },
        },
      );

      const response = await worker.fetch(request, mockEnv);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.referral.status).toBe("active");
    });
  });

  describe("Webhook Routes registration", () => {
    it("should route to webhook handlers", async () => {
      const key = await setupAuth("admin");

      const request = new Request("http://localhost/webhooks/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": key,
        },
        body: JSON.stringify({
          url: "https://example.com/webhook",
          events: ["referral.created"],
        }),
      });

      const response = await worker.fetch(request, mockEnv);
      expect(response.status).not.toBe(404);
      expect(response.status).not.toBe(401);
    });
  });
});
