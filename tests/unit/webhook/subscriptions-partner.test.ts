import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getWebhookPartner,
  getWebhookPartners,
  saveWebhookPartner,
  createWebhookPartner,
  createSubscription,
  getSubscription,
  getPartnerSubscriptions,
} from "../../../worker/lib/webhook/subscriptions";
import type {
  WebhookPartner,
  WebhookSubscription,
} from "../../../worker/lib/webhook/types";

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
  return { DEALS_STAGING: kv } as any;
}

describe("Webhook Subscriptions - Partner & Subscription", () => {
  let kv: MockKv;

  beforeEach(() => {
    kv = createMockKv();
  });

  // ============================================================================
  // Partner Management Tests
  // ============================================================================

  describe("Partner Management", () => {
    describe("getWebhookPartners()", () => {
      it("should return empty array when no partners exist", async () => {
        expect(await getWebhookPartners(createEnv(kv))).toEqual([]);
      });

      it("should return empty array when KV is unavailable", async () => {
        expect(await getWebhookPartners({} as any)).toEqual([]);
      });

      it("should return partners when they exist", async () => {
        const env = createEnv(kv);
        const partner: WebhookPartner = {
          id: "partner_1",
          name: "Test Partner",
          secret: "whsec_test",
          active: true,
          allowed_events: ["referral.created"],
          rate_limit_per_minute: 60,
          created_at: "2024-01-01T00:00:00Z",
        };
        kv.storage.set("webhook_partners", JSON.stringify([partner]));

        const partners = await getWebhookPartners(env);
        expect(partners).toHaveLength(1);
        expect(partners[0].name).toBe("Test Partner");
      });

      it("should return empty array on JSON parse error", async () => {
        const env = createEnv(kv);
        kv.storage.set("webhook_partners", "invalid json");
        expect(await getWebhookPartners(env)).toEqual([]);
      });
    });

    describe("getWebhookPartner()", () => {
      it("should return partner by ID", async () => {
        const env = createEnv(kv);
        const partner: WebhookPartner = {
          id: "partner_abc",
          name: "Find Me",
          secret: "whsec_test",
          active: true,
          allowed_events: ["referral.created"],
          rate_limit_per_minute: 30,
          created_at: "2024-01-01T00:00:00Z",
        };
        kv.storage.set("webhook_partners", JSON.stringify([partner]));

        expect(await getWebhookPartner(env, "partner_abc")).toEqual(partner);
      });

      it("should return null when partner not found", async () => {
        const env = createEnv(kv);
        kv.storage.set("webhook_partners", JSON.stringify([]));
        expect(await getWebhookPartner(env, "nonexistent")).toBeNull();
      });

      it("should return null when no partners exist", async () => {
        expect(await getWebhookPartner(createEnv(kv), "any")).toBeNull();
      });
    });

    describe("saveWebhookPartner()", () => {
      it("should add new partner to list", async () => {
        const env = createEnv(kv);
        const partner: WebhookPartner = {
          id: "partner_new",
          name: "New Partner",
          secret: "whsec_secret",
          active: true,
          allowed_events: ["referral.created"],
          rate_limit_per_minute: 60,
          created_at: "2024-01-01T00:00:00Z",
        };
        await saveWebhookPartner(env, partner);

        const partners = await getWebhookPartners(env);
        expect(partners).toHaveLength(1);
        expect(partners[0].id).toBe("partner_new");
      });

      it("should update existing partner", async () => {
        const env = createEnv(kv);
        const partner: WebhookPartner = {
          id: "partner_update",
          name: "Original",
          secret: "whsec_old",
          active: true,
          allowed_events: ["referral.created"],
          rate_limit_per_minute: 60,
          created_at: "2024-01-01T00:00:00Z",
        };
        kv.storage.set("webhook_partners", JSON.stringify([partner]));

        await saveWebhookPartner(env, {
          ...partner,
          name: "Updated Name",
          active: false,
        });

        const partners = await getWebhookPartners(env);
        expect(partners[0].name).toBe("Updated Name");
        expect(partners[0].active).toBe(false);
      });

      it("should throw when KV is unavailable", async () => {
        const partner: WebhookPartner = {
          id: "partner_x",
          name: "X",
          secret: "whsec_x",
          active: true,
          allowed_events: [],
          rate_limit_per_minute: 60,
          created_at: "2024-01-01T00:00:00Z",
        };
        await expect(saveWebhookPartner({} as any, partner)).rejects.toThrow(
          "No KV namespace available",
        );
      });
    });

    describe("createWebhookPartner()", () => {
      it("should create partner with defaults", async () => {
        const env = createEnv(kv);
        const partner = await createWebhookPartner(env, "Default Partner");

        expect(partner.name).toBe("Default Partner");
        expect(partner.active).toBe(true);
        expect(partner.allowed_events).toEqual(["referral.created"]);
        expect(partner.rate_limit_per_minute).toBe(60);
        expect(partner.id).toMatch(/^partner_/);
        expect(partner.secret).toMatch(/^whsec_/);
      });

      it("should create partner with custom events and rate limit", async () => {
        const env = createEnv(kv);
        const partner = await createWebhookPartner(
          env,
          "Custom Partner",
          ["referral.created", "referral.updated", "ping"],
          120,
        );
        expect(partner.allowed_events).toHaveLength(3);
        expect(partner.rate_limit_per_minute).toBe(120);
      });

      it("should persist partner to KV", async () => {
        const env = createEnv(kv);
        await createWebhookPartner(env, "Persisted");
        const partners = await getWebhookPartners(env);
        expect(partners).toHaveLength(1);
        expect(partners[0].name).toBe("Persisted");
      });

      it("should generate unique IDs for multiple partners", async () => {
        const env = createEnv(kv);
        const p1 = await createWebhookPartner(env, "Partner 1");
        const p2 = await createWebhookPartner(env, "Partner 2");
        expect(p1.id).not.toBe(p2.id);
        expect(p1.secret).not.toBe(p2.secret);
      });
    });
  });

  // ============================================================================
  // Subscription Management Tests
  // ============================================================================

  describe("Subscription Management", () => {
    let partnerId: string;

    beforeEach(async () => {
      const env = createEnv(kv);
      const partner = await createWebhookPartner(env, "Test Partner");
      partnerId = partner.id;
    });

    describe("createSubscription()", () => {
      it("should create subscription with defaults", async () => {
        const env = createEnv(kv);
        const sub = await createSubscription(
          env,
          partnerId,
          "https://example.com/webhook",
          ["referral.created"],
        );

        expect(sub.partner_id).toBe(partnerId);
        expect(sub.url).toBe("https://example.com/webhook");
        expect(sub.events).toEqual(["referral.created"]);
        expect(sub.active).toBe(true);
        expect(sub.id).toMatch(/^sub_/);
        expect(sub.secret).toMatch(/^whsec_/);
      });

      it("should merge custom retry policy with defaults", async () => {
        const env = createEnv(kv);
        const sub = await createSubscription(
          env,
          partnerId,
          "https://example.com/webhook",
          ["referral.created"],
          undefined,
          { max_attempts: 3 },
        );
        expect(sub.retry_policy?.max_attempts).toBe(3);
        expect(sub.retry_policy?.initial_delay_ms).toBe(1000); // default
      });

      it("should store filters", async () => {
        const env = createEnv(kv);
        const sub = await createSubscription(
          env,
          partnerId,
          "https://example.com/webhook",
          ["referral.created"],
          undefined,
          undefined,
          { domains: ["example.com"], status: ["active"] },
        );
        expect(sub.filters).toEqual({
          domains: ["example.com"],
          status: ["active"],
        });
      });

      it("should store metadata", async () => {
        const env = createEnv(kv);
        const sub = await createSubscription(
          env,
          partnerId,
          "https://example.com/webhook",
          ["referral.created"],
          { source: "test" },
        );
        expect(sub.metadata).toEqual({ source: "test" });
      });

      it("should throw when KV is unavailable", async () => {
        await expect(
          createSubscription({} as any, partnerId, "https://example.com", [
            "referral.created",
          ]),
        ).rejects.toThrow("No KV namespace available");
      });
    });

    describe("getSubscription()", () => {
      it("should retrieve subscription by ID", async () => {
        const env = createEnv(kv);
        const created = await createSubscription(
          env,
          partnerId,
          "https://example.com/webhook",
          ["referral.created"],
        );
        const sub = await getSubscription(env, created.id);
        expect(sub?.id).toBe(created.id);
        expect(sub?.url).toBe("https://example.com/webhook");
      });

      it("should return null for nonexistent subscription", async () => {
        expect(
          await getSubscription(createEnv(kv), "sub_nonexistent"),
        ).toBeNull();
      });

      it("should return null when KV is unavailable", async () => {
        expect(await getSubscription({} as any, "sub_any")).toBeNull();
      });
    });

    describe("getPartnerSubscriptions()", () => {
      it("should return all subscriptions for a partner", async () => {
        const env = createEnv(kv);
        await createSubscription(env, partnerId, "https://example.com/1", [
          "referral.created",
        ]);
        await createSubscription(env, partnerId, "https://example.com/2", [
          "referral.updated",
        ]);
        expect(await getPartnerSubscriptions(env, partnerId)).toHaveLength(2);
      });

      it("should return empty array when no subscriptions exist", async () => {
        expect(await getPartnerSubscriptions(createEnv(kv), partnerId)).toEqual(
          [],
        );
      });

      it("should return empty array for unknown partner", async () => {
        expect(
          await getPartnerSubscriptions(createEnv(kv), "partner_unknown"),
        ).toEqual([]);
      });
    });
  });
});
