import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleIncomingWebhook } from "../../../worker/lib/webhook/incoming";
import type { WebhookPartner } from "../../../worker/lib/webhook/types";

vi.mock("../../../worker/lib/hmac", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../worker/lib/hmac")>();
  return {
    ...actual,
    verifyHmacSignature: vi.fn(),
    hashIdempotencyKey: vi.fn(async (key: string) => {
      const buf = await globalThis.crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(key),
      );
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }),
    hashRequest: vi.fn(async (m: string, p: string, b: string) => {
      const buf = await globalThis.crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(`${m}:${p}:${b}`),
      );
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }),
  };
});
import { verifyHmacSignature } from "../../../worker/lib/hmac";

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
  return { DEALS_STAGING: kv } as any;
}

function createPartner(
  overrides: Partial<WebhookPartner> = {},
): WebhookPartner {
  return {
    id: "partner_test",
    name: "Test Partner",
    secret: "whsec_testsecret1234567890abcdef",
    active: true,
    allowed_events: ["referral.created", "referral.updated", "ping"],
    rate_limit_per_minute: 60,
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}
function createPayload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    event: "referral.created",
    data: {
      code: "TEST123",
      url: "https://example.com/deal",
      domain: "example.com",
      title: "Test Deal",
    },
    ...overrides,
  });
}
function createHeaders(overrides: Record<string, string> = {}) {
  return {
    signature: "sha256=abc123",
    timestamp: String(Math.floor(Date.now() / 1000)),
    webhookId: "wh_test123",
    ...overrides,
  };
}

describe("Webhook Incoming - Auth & Validation", () => {
  let kv: MockKv;
  beforeEach(() => {
    kv = createMockKv();
    vi.mocked(verifyHmacSignature).mockReset();
  });

  describe("Partner Validation", () => {
    it("should return 401 when partner not found", async () => {
      const result = await handleIncomingWebhook(
        createEnv(kv),
        "nonexistent",
        "{}",
        createHeaders(),
      );
      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.error).toBe("Partner not found");
    });

    it("should return 403 when partner is inactive", async () => {
      const env = createEnv(kv);
      kv.storage.set(
        "webhook_partners",
        JSON.stringify([createPartner({ active: false })]),
      );
      const result = await handleIncomingWebhook(
        env,
        "partner_test",
        "{}",
        createHeaders(),
      );
      expect(result.statusCode).toBe(403);
      expect(result.error).toBe("Partner account is not active");
    });
  });

  describe("Rate Limiting", () => {
    it("should allow request within rate limit", async () => {
      const env = createEnv(kv);
      kv.storage.set(
        "webhook_partners",
        JSON.stringify([createPartner({ rate_limit_per_minute: 60 })]),
      );
      vi.mocked(verifyHmacSignature).mockResolvedValue({
        valid: false,
        error: "test",
      });
      const result = await handleIncomingWebhook(
        env,
        "partner_test",
        createPayload(),
        createHeaders(),
      );
      expect(result.statusCode).not.toBe(429);
    });

    it("should return 429 when rate limit exceeded", async () => {
      const env = createEnv(kv);
      kv.storage.set(
        "webhook_partners",
        JSON.stringify([createPartner({ rate_limit_per_minute: 1 })]),
      );
      const now = Date.now();
      kv.storage.set(
        "webhook_ratelimit:partner_test",
        JSON.stringify({ count: 1, window: Math.floor(now / 60000) * 60000 }),
      );
      const result = await handleIncomingWebhook(
        env,
        "partner_test",
        createPayload(),
        createHeaders(),
      );
      expect(result.statusCode).toBe(429);
    });

    it("should reset rate limit in new window", async () => {
      const env = createEnv(kv);
      kv.storage.set(
        "webhook_partners",
        JSON.stringify([createPartner({ rate_limit_per_minute: 1 })]),
      );
      kv.storage.set(
        "webhook_ratelimit:partner_test",
        JSON.stringify({
          count: 999,
          window: Math.floor(Date.now() / 60000) * 60000 - 60000,
        }),
      );
      vi.mocked(verifyHmacSignature).mockResolvedValue({
        valid: false,
        error: "test",
      });
      const result = await handleIncomingWebhook(
        env,
        "partner_test",
        createPayload(),
        createHeaders(),
      );
      expect(result.statusCode).not.toBe(429);
    });
  });

  describe("Idempotency", () => {
    it("should return cached result for duplicate event", async () => {
      const env = createEnv(kv);
      kv.storage.set("webhook_partners", JSON.stringify([createPartner()]));
      const idempotencyKey = "idem_key_1";
      const payload = createPayload();
      const crypto = globalThis.crypto.subtle;
      const hk = await crypto.digest(
        "SHA-256",
        new TextEncoder().encode(idempotencyKey),
      );
      const hkHex = Array.from(new Uint8Array(hk))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const ph = await crypto.digest(
        "SHA-256",
        new TextEncoder().encode(`POST:/webhook:${payload}`),
      );
      const phHex = Array.from(new Uint8Array(ph))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const now = new Date();
      kv.storage.set(
        `idempotency:${hkHex}`,
        JSON.stringify({
          key: hkHex,
          payload_hash: phHex,
          referral_id: "ref_existing",
          created_at: now.toISOString(),
          expires_at: new Date(now.getTime() + 86400000).toISOString(),
        }),
      );
      const result = await handleIncomingWebhook(env, "partner_test", payload, {
        ...createHeaders(),
        idempotencyKey,
      });
      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.referralId).toBe("ref_existing");
    });

    it("should process new event when idempotency key not found", async () => {
      const env = createEnv(kv);
      kv.storage.set("webhook_partners", JSON.stringify([createPartner()]));
      vi.mocked(verifyHmacSignature).mockResolvedValue({
        valid: false,
        error: "test",
      });
      const result = await handleIncomingWebhook(
        env,
        "partner_test",
        createPayload(),
        { ...createHeaders(), idempotencyKey: "new_key" },
      );
      expect(result.statusCode).not.toBe(200);
    });

    it("should throw on idempotency key conflict", async () => {
      const env = createEnv(kv);
      kv.storage.set("webhook_partners", JSON.stringify([createPartner()]));
      const idempotencyKey = "conflict_key";
      const payload = createPayload();
      const crypto = globalThis.crypto.subtle;
      const hk = await crypto.digest(
        "SHA-256",
        new TextEncoder().encode(idempotencyKey),
      );
      const hkHex = Array.from(new Uint8Array(hk))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const now = new Date();
      kv.storage.set(
        `idempotency:${hkHex}`,
        JSON.stringify({
          key: hkHex,
          payload_hash: "different_hash",
          referral_id: "ref_other",
          created_at: now.toISOString(),
          expires_at: new Date(now.getTime() + 86400000).toISOString(),
        }),
      );
      const result = await handleIncomingWebhook(env, "partner_test", payload, {
        ...createHeaders(),
        idempotencyKey,
      });
      expect(result.statusCode).toBe(500);
    });

    it("should ignore expired idempotency record", async () => {
      const env = createEnv(kv);
      kv.storage.set("webhook_partners", JSON.stringify([createPartner()]));
      const idempotencyKey = "expired_key";
      const payload = createPayload();
      const crypto = globalThis.crypto.subtle;
      const hk = await crypto.digest(
        "SHA-256",
        new TextEncoder().encode(idempotencyKey),
      );
      const hkHex = Array.from(new Uint8Array(hk))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const ph = await crypto.digest(
        "SHA-256",
        new TextEncoder().encode(`POST:/webhook:${payload}`),
      );
      const phHex = Array.from(new Uint8Array(ph))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      kv.storage.set(
        `idempotency:${hkHex}`,
        JSON.stringify({
          key: hkHex,
          payload_hash: phHex,
          referral_id: "ref_old",
          created_at: "2020-01-01T00:00:00Z",
          expires_at: "2020-01-02T00:00:00Z",
        }),
      );
      vi.mocked(verifyHmacSignature).mockResolvedValue({
        valid: false,
        error: "test",
      });
      const result = await handleIncomingWebhook(env, "partner_test", payload, {
        ...createHeaders(),
        idempotencyKey,
      });
      expect(result.statusCode).not.toBe(200);
    });
  });

  describe("Signature Verification", () => {
    it("should return 401 for invalid signature", async () => {
      const env = createEnv(kv);
      kv.storage.set("webhook_partners", JSON.stringify([createPartner()]));
      vi.mocked(verifyHmacSignature).mockResolvedValue({
        valid: false,
        error: "Invalid signature",
      });
      const result = await handleIncomingWebhook(
        env,
        "partner_test",
        createPayload(),
        { ...createHeaders(), signature: "sha256=invalid" },
      );
      expect(result.statusCode).toBe(401);
      expect(result.message).toBe("Invalid signature");
    });

    it("should return 401 for expired timestamp", async () => {
      const env = createEnv(kv);
      kv.storage.set("webhook_partners", JSON.stringify([createPartner()]));
      vi.mocked(verifyHmacSignature).mockResolvedValue({
        valid: false,
        error: "Webhook timestamp too old",
      });
      const result = await handleIncomingWebhook(
        env,
        "partner_test",
        createPayload(),
        {
          ...createHeaders(),
          timestamp: String(Math.floor(Date.now() / 1000) - 600),
        },
      );
      expect(result.statusCode).toBe(401);
    });
  });

  describe("Payload Validation", () => {
    it("should return 400 for invalid JSON", async () => {
      const env = createEnv(kv);
      kv.storage.set("webhook_partners", JSON.stringify([createPartner()]));
      vi.mocked(verifyHmacSignature).mockResolvedValue({ valid: true });
      const result = await handleIncomingWebhook(
        env,
        "partner_test",
        "not valid json",
        createHeaders(),
      );
      expect(result.statusCode).toBe(400);
      expect(result.message).toBe("Invalid JSON payload");
    });

    it("should return 400 for disallowed event type", async () => {
      const env = createEnv(kv);
      kv.storage.set(
        "webhook_partners",
        JSON.stringify([
          createPartner({ allowed_events: ["referral.created"] }),
        ]),
      );
      vi.mocked(verifyHmacSignature).mockResolvedValue({ valid: true });
      const payload = JSON.stringify({
        event: "referral.expired",
        data: {
          code: "TEST",
          url: "https://example.com",
          domain: "example.com",
        },
      });
      const result = await handleIncomingWebhook(
        env,
        "partner_test",
        payload,
        createHeaders(),
      );
      expect(result.statusCode).toBe(400);
      expect(result.message).toBe("Event type not allowed");
    });
  });
});
