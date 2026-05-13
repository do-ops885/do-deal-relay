import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleWebhookRoutes,
  handleIncomingWebhookRequest,
} from "../../../worker/routes/webhooks/index";

// ============================================================================
// Mock KV Namespace
// ============================================================================

function createMockKv() {
  const storage = new Map<string, string>();
  return {
    get: vi.fn(async (key: string, type?: string) => {
      const val = storage.get(key) ?? null;
      if (val && type === "json") return JSON.parse(val);
      return val;
    }),
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

type MockKv = ReturnType<typeof createMockKv>;
function createEnv(kv: MockKv) {
  return {
    DEALS_STAGING: kv,
    WEBHOOK_API_KEYS: kv,
    DEALS_SOURCES: kv,
    DEALS_PROD: kv,
    DEALS_LOG: kv,
    DEALS_WEBHOOKS: kv,
    AI_GATEWAY_URL: "https://gateway.test",
    TRUST_THRESHOLD: "0.3",
  } as any;
}

async function setupValidApiKey(
  kv: MockKv,
  key: string = "ddr_test_key_12345678901234567890",
) {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(key));
  const hash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  kv.storage.set(
    `apikey:${hash}`,
    JSON.stringify({
      userId: "test-user",
      role: "admin",
      createdAt: new Date().toISOString(),
    }),
  );
  return key;
}

function createRequest(
  method: string,
  url: string = "http://localhost/test",
  body?: unknown,
  headers?: Record<string, string>,
): Request {
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", ...headers },
  };
  if (body) init.body = JSON.stringify(body);
  return new Request(url, init);
}

// Mocking handleIncomingWebhook to control its behavior
vi.mock("../../../worker/lib/webhook/index", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    handleIncomingWebhook: vi
      .fn()
      .mockImplementation(async (env, partnerId, payload, opts) => {
        if (payload === "FAIL") throw new Error("Internal Error");
        if (opts && opts.signature === "sig")
          return { success: false, statusCode: 401, message: "Unauthorized" };
        return { success: true, statusCode: 200, message: "OK" };
      }),
  };
});

describe("Webhook Route Dispatcher", () => {
  let kv: MockKv;

  beforeEach(() => {
    kv = createMockKv();
    vi.clearAllMocks();
  });

  // ============================================================================
  // handleWebhookRoutes() Tests
  // ============================================================================

  describe("handleWebhookRoutes()", () => {
    it("should return null for unknown path", async () => {
      const env = createEnv(kv);
      const request = new Request("http://localhost/other");
      const result = await handleWebhookRoutes(request, env, "/other");
      expect(result).toBeNull();
    });

    it("should return null for wrong method on webhook path", async () => {
      const env = createEnv(kv);
      const request = new Request("http://localhost/webhooks/subscribe", {
        method: "GET",
      });
      const result = await handleWebhookRoutes(
        request,
        env,
        "/webhooks/subscribe",
      );
      expect(result).toBeNull();
    });

    it("should route to incoming webhook handler", async () => {
      const env = createEnv(kv);
      const request = new Request("http://localhost/webhooks/incoming/p1", {
        method: "POST",
        body: JSON.stringify({ event: "ping", data: {} }),
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": "sig",
          "X-Webhook-Timestamp": Date.now().toString(),
          "X-Webhook-Id": "id",
        },
      });
      const result = await handleWebhookRoutes(
        request,
        env,
        "/webhooks/incoming/p1",
      );
      expect(result).not.toBeNull();
      // Status will be 401 because signature validation fails
      expect(result?.status).toBe(401);
    });

    it("should route to subscribe handler", async () => {
      const env = createEnv(kv);
      const key = await setupValidApiKey(kv);
      const request = createRequest(
        "POST",
        "http://localhost/webhooks/subscribe",
        { url: "http://test.com", events: ["referral.created"] },
        { "X-API-Key": key },
      );
      const result = await handleWebhookRoutes(
        request,
        env,
        "/webhooks/subscribe",
      );
      expect(result).not.toBeNull();
      expect(result?.status).toBe(201);
    });

    it("should route to unsubscribe handler", async () => {
      const env = createEnv(kv);
      const key = await setupValidApiKey(kv);
      const request = createRequest(
        "POST",
        "http://localhost/webhooks/unsubscribe",
        { subscription_id: "sub1" },
        { "X-API-Key": key },
      );
      const result = await handleWebhookRoutes(
        request,
        env,
        "/webhooks/unsubscribe",
      );
      expect(result).not.toBeNull();
      // Will be 404 since sub doesn't exist
      expect(result?.status).toBe(404);
    });

    it("should route to list subscriptions handler", async () => {
      const env = createEnv(kv);
      const key = await setupValidApiKey(kv);
      const request = new Request("http://localhost/webhooks/subscriptions", {
        method: "GET",
        headers: { "X-API-Key": key },
      });
      const result = await handleWebhookRoutes(
        request,
        env,
        "/webhooks/subscriptions",
      );
      expect(result).not.toBeNull();
      expect(result?.status).toBe(200);
    });

    it("should route to create partner handler", async () => {
      const env = createEnv(kv);
      const key = await setupValidApiKey(kv);
      const request = createRequest(
        "POST",
        "http://localhost/webhooks/partners",
        { name: "Partner" },
        { "X-API-Key": key },
      );
      const result = await handleWebhookRoutes(
        request,
        env,
        "/webhooks/partners",
      );
      expect(result).not.toBeNull();
      expect(result?.status).toBe(201);
    });

    it("should route to get partner handler", async () => {
      const env = createEnv(kv);
      const key = await setupValidApiKey(kv);
      const request = new Request("http://localhost/webhooks/partners/p1", {
        method: "GET",
        headers: { "X-API-Key": key },
      });
      const result = await handleWebhookRoutes(
        request,
        env,
        "/webhooks/partners/p1",
      );
      expect(result).not.toBeNull();
      // Will be 404 since partner doesn't exist
      expect(result?.status).toBe(404);
    });

    it("should route to DLQ handler", async () => {
      const env = createEnv(kv);
      const key = await setupValidApiKey(kv);
      const request = new Request("http://localhost/webhooks/dlq", {
        method: "GET",
        headers: { "X-API-Key": key },
      });
      const result = await handleWebhookRoutes(request, env, "/webhooks/dlq");
      expect(result).not.toBeNull();
      expect(result?.status).toBe(200);
    });

    it("should route to DLQ retry handler", async () => {
      const env = createEnv(kv);
      const key = await setupValidApiKey(kv);
      const request = new Request("http://localhost/webhooks/dlq/evt1/sub1", {
        method: "POST",
        headers: { "X-API-Key": key },
      });
      const result = await handleWebhookRoutes(
        request,
        env,
        "/webhooks/dlq/evt1/sub1",
      );
      expect(result).not.toBeNull();
      // 404 since no event found
      expect(result?.status).toBe(404);
    });

    it("should route to sync config handler", async () => {
      const env = createEnv(kv);
      const key = await setupValidApiKey(kv);
      const request = createRequest(
        "POST",
        "http://localhost/webhooks/sync",
        { partner_id: "p1", direction: "push", mode: "realtime" },
        { "X-API-Key": key },
      );
      const result = await handleWebhookRoutes(request, env, "/webhooks/sync");
      expect(result).not.toBeNull();
      expect(result?.status).toBe(201);
    });

    it("should route to sync state handler", async () => {
      const env = createEnv(kv);
      const key = await setupValidApiKey(kv);
      const request = new Request("http://localhost/webhooks/sync/p1", {
        method: "GET",
        headers: { "X-API-Key": key },
      });
      const result = await handleWebhookRoutes(
        request,
        env,
        "/webhooks/sync/p1",
      );
      expect(result).not.toBeNull();
      // 404 since no sync state exists
      expect(result?.status).toBe(404);
    });
  });

  describe("handleIncomingWebhookRequest()", () => {
    it("should reject non-POST requests", async () => {
      const env = createEnv(kv);
      const request = new Request("http://localhost/webhooks/incoming/p1", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": "sig",
          "X-Webhook-Timestamp": Date.now().toString(),
          "X-Webhook-Id": "wh_1",
        },
      });
      const result = await handleIncomingWebhookRequest(request, env, "p1");
      expect(result.status).toBe(405);
    });

    it("should reject non-JSON content type", async () => {
      const env = createEnv(kv);
      const request = new Request("http://localhost/webhooks/incoming/p1", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "test",
      });
      const result = await handleIncomingWebhookRequest(request, env, "p1");
      expect(result.status).toBe(415);
    });

    it("should reject missing required headers", async () => {
      const env = createEnv(kv);
      const request = createRequest("POST", "http://localhost/test", {
        event: "ping",
        data: {},
      });
      const result = await handleIncomingWebhookRequest(request, env, "p1");
      expect(result.status).toBe(400);
    });

    it("should process request with all required headers", async () => {
      const env = createEnv(kv);
      const request = createRequest(
        "POST",
        "http://localhost/test",
        JSON.stringify({ event: "ping", data: {} }),
        {
          "Content-Type": "application/json",
          "X-Webhook-Signature": "sig",
          "X-Webhook-Timestamp": Date.now().toString(),
          "X-Webhook-Id": "wh_1",
        },
      );
      const result = await handleIncomingWebhookRequest(request, env, "p1");
      // Status 401 because signature validation fails
      expect(result.status).toBe(401);
    });

    it("should include idempotency key when provided", async () => {
      const env = createEnv(kv);
      const request = createRequest(
        "POST",
        "http://localhost/test",
        JSON.stringify({ event: "ping", data: {} }),
        {
          "Content-Type": "application/json",
          "X-Webhook-Signature": "sig",
          "X-Webhook-Timestamp": Date.now().toString(),
          "X-Webhook-Id": "wh_1",
          "Idempotency-Key": "idem_1",
        },
      );
      const result = await handleIncomingWebhookRequest(request, env, "p1");
      expect(result.status).toBe(401);
    });

    it("should return 500 on internal error", async () => {
      const env = createEnv(kv);
      const request = new Request("http://localhost/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": "none",
          "X-Webhook-Timestamp": Date.now().toString(),
          "X-Webhook-Id": "wh_1",
        },
        body: "FAIL",
      });
      const result = await handleIncomingWebhookRequest(request, env, "p1");
      expect(result.status).toBe(500);
    });
  });
});
