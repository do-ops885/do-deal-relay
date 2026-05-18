import { describe, it, expect, vi, beforeEach } from "vitest";
import worker from "../../worker/index";
import { jsonResponse } from "../../worker/routes/utils";

function createMockKv() {
  const storage = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => storage.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      storage.delete(key);
    }),
    list: vi.fn(async ({ prefix }: { prefix: string }) => {
      const keys: { name: string }[] = [];
      for (const [key] of storage.entries()) {
        if (key.startsWith(prefix)) keys.push({ name: key });
      }
      return { keys };
    }),
    storage,
  };
}

const env = {
  DEALS_STAGING: createMockKv(),
  DEALS_PROD: createMockKv(),
  DEALS_LOG: createMockKv(),
  DEALS_LOCK: createMockKv(),
  DEALS_SOURCES: createMockKv(),
  ENVIRONMENT: "test",
  AI_GATEWAY_URL: "https://gateway.test",
  TRUST_THRESHOLD: "0.3",
  NOTIFICATION_THRESHOLD: "0.5",
} as any;

describe("Webhook Routing Integration", () => {
  const notificationEndpoints = [
    "/api/webhooks/deals/created",
    "/api/webhooks/deals/updated",
    "/api/webhooks/deals/expiring",
    "/api/webhooks/referrals/created",
    "/api/webhooks/referrals/completed",
    "/api/webhooks/research/completed",
    "/api/webhooks/research/failed",
    "/api/webhooks/system/health",
    "/api/webhooks/system/alert",
    "/api/webhooks/system/maintenance",
  ];

  const managementEndpoints = [
    "/api/webhooks/subscribe",
    "/api/webhooks/unsubscribe",
    "/api/webhooks/subscriptions",
    "/api/webhooks/partners",
    "/api/webhooks/dlq",
    "/api/webhooks/sync",
  ];

  it.each(notificationEndpoints)(
    "should reach notification endpoint %s",
    async (path) => {
      const request = new Request(`http://localhost${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": "sig",
          "X-Webhook-Timestamp": "123",
          "X-Webhook-Id": "wh_1",
        },
        body: JSON.stringify({ event: "test", data: {} }),
      });
      const response = await worker.fetch(request, env);
      // Since we didn't setup a partner, it should return 401 Unauthorized or 400 Bad Request
      // but definitely NOT 404
      expect(response.status).not.toBe(404);
    },
  );

  it.each(managementEndpoints)(
    "should reach management endpoint %s",
    async (path) => {
      const method =
        path === "/api/webhooks/subscriptions" || path === "/api/webhooks/dlq"
          ? "GET"
          : "POST";
      const request = new Request(`http://localhost${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
      });
      const response = await worker.fetch(request, env);
      // Should require auth, so 401
      expect(response.status).not.toBe(404);
    },
  );
});
