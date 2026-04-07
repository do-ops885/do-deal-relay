import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleSubscribe,
  handleUnsubscribe,
  handleListSubscriptions,
  handleCreatePartner,
  handleGetPartner,
  handleGetDeadLetterQueue,
  handleRetryDeadLetter,
  handleCreateSyncConfig,
  handleGetSyncState,
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

describe("Webhook Route Handlers", () => {
  let kv: MockKv;

  beforeEach(() => {
    kv = createMockKv();
  });

  // ============================================================================
  // handleSubscribe() Tests
  // ============================================================================

  describe("handleSubscribe()", () => {
    it("should reject without API key", async () => {
      const env = createEnv(kv);
      const request = createRequest("POST", "http://localhost/test", {
        url: "https://example.com/hook",
        events: ["referral.created"],
      });
      const response = await handleSubscribe(request, env);
      expect(response.status).toBe(401);
    });

    it("should reject missing required fields", async () => {
      const env = createEnv(kv);
      kv.storage.set("api-keys", JSON.stringify(["valid-key"]));
      const request = createRequest(
        "POST",
        "http://localhost/test",
        { url: "https://example.com/hook" },
        { "X-API-Key": "valid-key" },
      );
      const response = await handleSubscribe(request, env);
      expect(response.status).toBe(400);
    });

    it("should reject invalid URL", async () => {
      const env = createEnv(kv);
      kv.storage.set("api-keys", JSON.stringify(["valid-key"]));
      const request = createRequest(
        "POST",
        "http://localhost/test",
        { url: "not-a-url", events: ["referral.created"] },
        { "X-API-Key": "valid-key" },
      );
      const response = await handleSubscribe(request, env);
      expect(response.status).toBe(400);
    });

    it("should reject invalid event types", async () => {
      const env = createEnv(kv);
      kv.storage.set("api-keys", JSON.stringify(["valid-key"]));
      const request = createRequest(
        "POST",
        "http://localhost/test",
        { url: "https://example.com/hook", events: ["invalid.event"] },
        { "X-API-Key": "valid-key" },
      );
      const response = await handleSubscribe(request, env);
      expect(response.status).toBe(400);
    });

    it("should create subscription with valid input", async () => {
      const env = createEnv(kv);
      kv.storage.set("api-keys", JSON.stringify(["valid-key"]));
      const request = createRequest(
        "POST",
        "http://localhost/test",
        { url: "https://example.com/hook", events: ["referral.created"] },
        { "X-API-Key": "valid-key" },
      );
      const response = await handleSubscribe(request, env);
      expect(response.status).toBe(201);
    });
  });

  // ============================================================================
  // handleUnsubscribe() Tests
  // ============================================================================

  describe("handleUnsubscribe()", () => {
    it("should reject without API key", async () => {
      const env = createEnv(kv);
      const request = createRequest("POST", "http://localhost/test", {
        subscription_id: "sub_1",
      });
      const response = await handleUnsubscribe(request, env);
      expect(response.status).toBe(401);
    });

    it("should reject missing subscription_id", async () => {
      const env = createEnv(kv);
      kv.storage.set("api-keys", JSON.stringify(["valid-key"]));
      const request = createRequest(
        "POST",
        "http://localhost/test",
        {},
        { "X-API-Key": "valid-key" },
      );
      const response = await handleUnsubscribe(request, env);
      expect(response.status).toBe(400);
    });

    it("should return 404 for nonexistent subscription", async () => {
      const env = createEnv(kv);
      kv.storage.set("api-keys", JSON.stringify(["valid-key"]));
      const request = createRequest(
        "POST",
        "http://localhost/test",
        { subscription_id: "sub_nonexistent" },
        { "X-API-Key": "valid-key" },
      );
      const response = await handleUnsubscribe(request, env);
      expect(response.status).toBe(404);
    });
  });

  // ============================================================================
  // handleListSubscriptions() Tests
  // ============================================================================

  describe("handleListSubscriptions()", () => {
    it("should reject without API key", async () => {
      const env = createEnv(kv);
      const request = new Request("http://localhost/webhooks/subscriptions", {
        method: "GET",
      });
      const response = await handleListSubscriptions(request, env);
      expect(response.status).toBe(401);
    });

    it("should return empty list when no subscriptions exist", async () => {
      const env = createEnv(kv);
      kv.storage.set("api-keys", JSON.stringify(["valid-key"]));
      const request = new Request("http://localhost/webhooks/subscriptions", {
        method: "GET",
        headers: { "X-API-Key": "valid-key" },
      });
      const response = await handleListSubscriptions(request, env);
      expect(response.status).toBe(200);
    });

    it("should use partner_id from query params", async () => {
      const env = createEnv(kv);
      kv.storage.set("api-keys", JSON.stringify(["valid-key"]));
      const request = new Request(
        "http://localhost/webhooks/subscriptions?partner_id=custom",
        {
          method: "GET",
          headers: { "X-API-Key": "valid-key" },
        },
      );
      const response = await handleListSubscriptions(request, env);
      expect(response.status).toBe(200);
    });
  });

  // ============================================================================
  // handleCreatePartner() Tests
  // ============================================================================

  describe("handleCreatePartner()", () => {
    it("should reject without API key", async () => {
      const env = createEnv(kv);
      const request = createRequest("POST", "http://localhost/test", {
        name: "Partner",
      });
      const response = await handleCreatePartner(request, env);
      expect(response.status).toBe(401);
    });

    it("should reject missing name", async () => {
      const env = createEnv(kv);
      kv.storage.set("api-keys", JSON.stringify(["valid-key"]));
      const request = createRequest(
        "POST",
        "http://localhost/test",
        {},
        { "X-API-Key": "valid-key" },
      );
      const response = await handleCreatePartner(request, env);
      expect(response.status).toBe(400);
    });

    it("should create partner with valid input", async () => {
      const env = createEnv(kv);
      kv.storage.set("api-keys", JSON.stringify(["valid-key"]));
      const request = createRequest(
        "POST",
        "http://localhost/test",
        { name: "New Partner" },
        { "X-API-Key": "valid-key" },
      );
      const response = await handleCreatePartner(request, env);
      expect(response.status).toBe(201);
    });
  });

  // ============================================================================
  // handleGetPartner() Tests
  // ============================================================================

  describe("handleGetPartner()", () => {
    it("should reject without API key", async () => {
      const env = createEnv(kv);
      const request = createRequest("GET", "http://localhost/test");
      const response = await handleGetPartner(request, env, "nonexistent");
      expect(response.status).toBe(401);
    });

    it("should return 404 for nonexistent partner", async () => {
      const env = createEnv(kv);
      kv.storage.set("api-keys", JSON.stringify(["valid-key"]));
      const request = createRequest("GET", "http://localhost/test", undefined, {
        "X-API-Key": "valid-key",
      });
      const response = await handleGetPartner(request, env, "nonexistent");
      expect(response.status).toBe(404);
    });
  });

  // ============================================================================
  // handleGetDeadLetterQueue() Tests
  // ============================================================================

  describe("handleGetDeadLetterQueue()", () => {
    it("should reject without API key", async () => {
      const env = createEnv(kv);
      const request = createRequest("GET", "http://localhost/test");
      const response = await handleGetDeadLetterQueue(request, env);
      expect(response.status).toBe(401);
    });

    it("should return empty DLQ", async () => {
      const env = createEnv(kv);
      kv.storage.set("api-keys", JSON.stringify(["valid-key"]));
      const request = createRequest("GET", "http://localhost/test", undefined, {
        "X-API-Key": "valid-key",
      });
      const response = await handleGetDeadLetterQueue(request, env);
      expect(response.status).toBe(200);
    });
  });

  // ============================================================================
  // handleRetryDeadLetter() Tests
  // ============================================================================

  describe("handleRetryDeadLetter()", () => {
    it("should reject without API key", async () => {
      const env = createEnv(kv);
      const request = createRequest("POST", "http://localhost/test");
      const response = await handleRetryDeadLetter(
        request,
        env,
        "evt_1",
        "sub_1",
      );
      expect(response.status).toBe(401);
    });

    it("should return 404 for nonexistent DLQ entry", async () => {
      const env = createEnv(kv);
      kv.storage.set("api-keys", JSON.stringify(["valid-key"]));
      const request = createRequest(
        "POST",
        "http://localhost/test",
        undefined,
        { "X-API-Key": "valid-key" },
      );
      const response = await handleRetryDeadLetter(
        request,
        env,
        "evt_1",
        "sub_1",
      );
      expect(response.status).toBe(404);
    });
  });

  // ============================================================================
  // handleCreateSyncConfig() Tests
  // ============================================================================

  describe("handleCreateSyncConfig()", () => {
    it("should reject without API key", async () => {
      const env = createEnv(kv);
      const request = createRequest("POST", "http://localhost/test", {
        partner_id: "p1",
      });
      const response = await handleCreateSyncConfig(request, env);
      expect(response.status).toBe(401);
    });

    it("should reject missing required fields", async () => {
      const env = createEnv(kv);
      kv.storage.set("api-keys", JSON.stringify(["valid-key"]));
      const request = createRequest(
        "POST",
        "http://localhost/test",
        { partner_id: "p1" },
        { "X-API-Key": "valid-key" },
      );
      const response = await handleCreateSyncConfig(request, env);
      expect(response.status).toBe(400);
    });

    it("should create sync config with valid input", async () => {
      const env = createEnv(kv);
      kv.storage.set("api-keys", JSON.stringify(["valid-key"]));
      const request = createRequest(
        "POST",
        "http://localhost/test",
        {
          partner_id: "p1",
          direction: "push",
          mode: "realtime",
        },
        { "X-API-Key": "valid-key" },
      );
      const response = await handleCreateSyncConfig(request, env);
      expect(response.status).toBe(201);
    });
  });

  // ============================================================================
  // handleGetSyncState() Tests
  // ============================================================================

  describe("handleGetSyncState()", () => {
    it("should reject without API key", async () => {
      const env = createEnv(kv);
      const request = createRequest("GET", "http://localhost/test");
      const response = await handleGetSyncState(request, env, "p1");
      expect(response.status).toBe(401);
    });

    it("should return 404 when no sync state exists", async () => {
      const env = createEnv(kv);
      kv.storage.set("api-keys", JSON.stringify(["valid-key"]));
      const request = createRequest("GET", "http://localhost/test", undefined, {
        "X-API-Key": "valid-key",
      });
      const response = await handleGetSyncState(request, env, "p1");
      expect(response.status).toBe(404);
    });
  });
});
