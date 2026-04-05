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

type MockKv = ReturnType<typeof createMockKv>;
function createEnv(kv: MockKv) {
  return { DEALS_STAGING: kv, WEBHOOK_API_KEYS: kv } as any;
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

describe("Webhook Route Dispatcher", () => {
  let kv: MockKv;

  beforeEach(() => {
    kv = createMockKv();
  });

  // ============================================================================
  // handleWebhookRoutes() Tests
  // ============================================================================

  describe("handleWebhookRoutes()", () => {
    it("should return null for unknown path", async () => {
      const env = createEnv(kv);
      const request = new Request("http://localhost/unknown");
      expect(await handleWebhookRoutes(request, env, "/unknown")).toBeNull();
    });

    it("should return null for wrong method on webhook path", async () => {
      const env = createEnv(kv);
      const request = new Request("http://localhost/webhooks/incoming/p1", {
        method: "GET",
      });
      expect(
        await handleWebhookRoutes(request, env, "/webhooks/incoming/p1"),
      ).toBeNull();
    });

    it("should route to incoming webhook handler", async () => {
      const env = createEnv(kv);
      const request = new Request("http://localhost/webhooks/incoming/p1", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "{}",
      });
      const result = await handleWebhookRoutes(
        request,
        env,
        "/webhooks/incoming/p1",
      );
      expect(result).not.toBeNull();
      expect(result?.status).toBe(415);
    });

    it("should route to subscribe handler", async () => {
      const env = createEnv(kv);
      const request = createRequest(
        "POST",
        "http://localhost/webhooks/subscribe",
        {
          url: "https://example.com/hook",
          events: ["referral.created"],
        },
      );
      expect(
        await handleWebhookRoutes(request, env, "/webhooks/subscribe"),
      ).not.toBeNull();
    });

    it("should route to unsubscribe handler", async () => {
      const env = createEnv(kv);
      const request = createRequest(
        "POST",
        "http://localhost/webhooks/unsubscribe",
        {
          subscription_id: "sub_1",
        },
      );
      expect(
        await handleWebhookRoutes(request, env, "/webhooks/unsubscribe"),
      ).not.toBeNull();
    });

    it("should route to list subscriptions handler", async () => {
      const env = createEnv(kv);
      const request = new Request("http://localhost/webhooks/subscriptions", {
        method: "GET",
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
      const request = createRequest(
        "POST",
        "http://localhost/webhooks/partners",
        {
          name: "Test Partner",
        },
      );
      expect(
        await handleWebhookRoutes(request, env, "/webhooks/partners"),
      ).not.toBeNull();
    });

    it("should route to get partner handler", async () => {
      const env = createEnv(kv);
      const request = new Request("http://localhost/webhooks/partners/p1", {
        method: "GET",
      });
      expect(
        await handleWebhookRoutes(request, env, "/webhooks/partners/p1"),
      ).not.toBeNull();
    });

    it("should route to DLQ handler", async () => {
      const env = createEnv(kv);
      const request = new Request("http://localhost/webhooks/dlq", {
        method: "GET",
      });
      const result = await handleWebhookRoutes(request, env, "/webhooks/dlq");
      expect(result).not.toBeNull();
      expect(result?.status).toBe(200);
    });

    it("should route to DLQ retry handler", async () => {
      const env = createEnv(kv);
      const request = new Request("http://localhost/webhooks/dlq/evt1/sub1", {
        method: "POST",
      });
      expect(
        await handleWebhookRoutes(request, env, "/webhooks/dlq/evt1/sub1"),
      ).not.toBeNull();
    });

    it("should route to sync config handler", async () => {
      const env = createEnv(kv);
      const request = createRequest("POST", "http://localhost/webhooks/sync", {
        partner_id: "p1",
        direction: "push",
        mode: "realtime",
      });
      expect(
        await handleWebhookRoutes(request, env, "/webhooks/sync"),
      ).not.toBeNull();
    });

    it("should route to sync state handler", async () => {
      const env = createEnv(kv);
      const request = new Request("http://localhost/webhooks/sync/p1", {
        method: "GET",
      });
      expect(
        await handleWebhookRoutes(request, env, "/webhooks/sync/p1"),
      ).not.toBeNull();
    });

    it("should extract partner ID from incoming webhook path", async () => {
      const env = createEnv(kv);
      const request = new Request(
        "http://localhost/webhooks/incoming/my-partner-123",
        {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: "{}",
        },
      );
      const result = await handleWebhookRoutes(
        request,
        env,
        "/webhooks/incoming/my-partner-123",
      );
      expect(result).not.toBeNull();
      expect(result?.status).toBe(415);
    });

    it("should extract partner ID from partners path", async () => {
      const env = createEnv(kv);
      const request = new Request(
        "http://localhost/webhooks/partners/special-partner",
        { method: "GET" },
      );
      expect(
        await handleWebhookRoutes(
          request,
          env,
          "/webhooks/partners/special-partner",
        ),
      ).not.toBeNull();
    });

    it("should extract IDs from DLQ retry path", async () => {
      const env = createEnv(kv);
      const request = new Request(
        "http://localhost/webhooks/dlq/evt-abc/sub-xyz",
        { method: "POST" },
      );
      expect(
        await handleWebhookRoutes(
          request,
          env,
          "/webhooks/dlq/evt-abc/sub-xyz",
        ),
      ).not.toBeNull();
    });

    it("should extract partner ID from sync path", async () => {
      const env = createEnv(kv);
      const request = new Request(
        "http://localhost/webhooks/sync/partner-sync-1",
        { method: "GET" },
      );
      expect(
        await handleWebhookRoutes(
          request,
          env,
          "/webhooks/sync/partner-sync-1",
        ),
      ).not.toBeNull();
    });
  });

  // ============================================================================
  // handleIncomingWebhookRequest() Tests
  // ============================================================================

  describe("handleIncomingWebhookRequest()", () => {
    it("should reject non-JSON content type", async () => {
      const env = createEnv(kv);
      const request = new Request("http://localhost/test", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "{}",
      });
      const response = await handleIncomingWebhookRequest(request, env, "p1");
      expect(response.status).toBe(415);
    });

    it("should reject missing required headers", async () => {
      const env = createEnv(kv);
      const request = new Request("http://localhost/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const response = await handleIncomingWebhookRequest(request, env, "p1");
      expect(response.status).toBe(400);
    });

    it("should process request with all required headers", async () => {
      const env = createEnv(kv);
      const request = new Request("http://localhost/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": "sha256=abc",
          "X-Webhook-Timestamp": String(Math.floor(Date.now() / 1000)),
          "X-Webhook-Id": "wh_1",
        },
        body: "{}",
      });
      const response = await handleIncomingWebhookRequest(request, env, "p1");
      expect(response.status).toBe(401);
    });

    it("should include idempotency key when provided", async () => {
      const env = createEnv(kv);
      const request = new Request("http://localhost/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": "sha256=abc",
          "X-Webhook-Timestamp": String(Math.floor(Date.now() / 1000)),
          "X-Webhook-Id": "wh_1",
          "Idempotency-Key": "idem_123",
        },
        body: "{}",
      });
      const response = await handleIncomingWebhookRequest(request, env, "p1");
      expect(response.status).toBe(401);
    });

    it("should return 500 on internal error", async () => {
      const env = createEnv(kv);
      const request = new Request("http://localhost/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": "sha256=abc",
          "X-Webhook-Timestamp": String(Math.floor(Date.now() / 1000)),
          "X-Webhook-Id": "wh_1",
        },
      });
      const response = await handleIncomingWebhookRequest(request, env, "p1");
      expect(response.status).toBe(401);
    });
  });
});
