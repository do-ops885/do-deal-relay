import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createWebhookPartner,
  updateSubscription,
  deleteSubscription,
  getSubscription,
  getPartnerSubscriptions,
  getSyncState,
  saveSyncState,
  createSyncConfig,
  createSubscription,
} from "../../../worker/lib/webhook/subscriptions";
import type { SyncConfig } from "../../../worker/lib/webhook/types";

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

describe("Webhook Subscriptions - Mutations & Sync", () => {
  let kv: MockKv;
  let partnerId: string;

  beforeEach(async () => {
    kv = createMockKv();
    const env = createEnv(kv);
    const partner = await createWebhookPartner(env, "Test Partner");
    partnerId = partner.id;
  });

  // ============================================================================
  // updateSubscription() Tests
  // ============================================================================

  describe("updateSubscription()", () => {
    it("should update subscription fields", async () => {
      const env = createEnv(kv);
      const created = await createSubscription(
        env,
        partnerId,
        "https://example.com/webhook",
        ["referral.created"],
      );

      // Ensure time has passed so updated_at differs
      await new Promise((r) => setTimeout(r, 2));

      const updated = await updateSubscription(env, created.id, {
        url: "https://example.com/new-webhook",
        active: false,
      });

      expect(updated).not.toBeNull();
      expect(updated?.url).toBe("https://example.com/new-webhook");
      expect(updated?.active).toBe(false);
      expect(updated?.id).toBe(created.id);
      expect(updated?.created_at).toBe(created.created_at);
      expect(updated?.updated_at).not.toBe(created.updated_at);
    });

    it("should return null for nonexistent subscription", async () => {
      const env = createEnv(kv);
      expect(
        await updateSubscription(env, "sub_nonexistent", { active: false }),
      ).toBeNull();
    });

    it("should return null when KV is unavailable", async () => {
      expect(
        await updateSubscription({} as any, "sub_any", { active: false }),
      ).toBeNull();
    });

    it("should update events list", async () => {
      const env = createEnv(kv);
      const created = await createSubscription(
        env,
        partnerId,
        "https://example.com/webhook",
        ["referral.created"],
      );
      const updated = await updateSubscription(env, created.id, {
        events: ["referral.created", "referral.updated", "ping"],
      });
      expect(updated?.events).toHaveLength(3);
    });
  });

  // ============================================================================
  // deleteSubscription() Tests
  // ============================================================================

  describe("deleteSubscription()", () => {
    it("should delete subscription and remove from partner list", async () => {
      const env = createEnv(kv);
      const created = await createSubscription(
        env,
        partnerId,
        "https://example.com/webhook",
        ["referral.created"],
      );

      expect(await deleteSubscription(env, created.id)).toBe(true);
      expect(await getSubscription(env, created.id)).toBeNull();
      expect(await getPartnerSubscriptions(env, partnerId)).toHaveLength(0);
    });

    it("should return false for nonexistent subscription", async () => {
      expect(await deleteSubscription(createEnv(kv), "sub_nonexistent")).toBe(
        false,
      );
    });

    it("should return false when KV is unavailable", async () => {
      expect(await deleteSubscription({} as any, "sub_any")).toBe(false);
    });

    it("should not affect other subscriptions of same partner", async () => {
      const env = createEnv(kv);
      const sub1 = await createSubscription(
        env,
        partnerId,
        "https://example.com/1",
        ["referral.created"],
      );
      const sub2 = await createSubscription(
        env,
        partnerId,
        "https://example.com/2",
        ["referral.updated"],
      );

      await deleteSubscription(env, sub1.id);

      const remaining = await getPartnerSubscriptions(env, partnerId);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(sub2.id);
    });
  });

  // ============================================================================
  // Sync State Tests
  // ============================================================================

  describe("Sync State Management", () => {
    describe("getSyncState()", () => {
      it("should return null when no sync state exists", async () => {
        expect(await getSyncState(createEnv(kv), "partner_1")).toBeNull();
      });

      it("should return null when KV is unavailable", async () => {
        expect(await getSyncState({} as any, "partner_1")).toBeNull();
      });

      it("should return saved sync state", async () => {
        const env = createEnv(kv);
        const state = {
          partner_id: "partner_1",
          last_sync_at: "2024-01-01T00:00:00Z",
          sync_version: 5,
          pending_changes: 3,
          status: "idle" as const,
        };
        await saveSyncState(env, state);
        expect(await getSyncState(env, "partner_1")).toEqual(state);
      });
    });

    describe("saveSyncState()", () => {
      it("should save sync state to KV", async () => {
        const env = createEnv(kv);
        const state = {
          partner_id: "partner_save",
          last_sync_at: "2024-06-01T00:00:00Z",
          sync_version: 1,
          pending_changes: 0,
          status: "idle" as const,
        };
        await saveSyncState(env, state);
        expect(await getSyncState(env, "partner_save")).toEqual(state);
      });

      it("should do nothing when KV is unavailable", async () => {
        const state = {
          partner_id: "partner_none",
          last_sync_at: "2024-01-01T00:00:00Z",
          sync_version: 0,
          pending_changes: 0,
          status: "idle" as const,
        };
        await expect(saveSyncState({} as any, state)).resolves.toBeUndefined();
      });

      it("should overwrite previous sync state", async () => {
        const env = createEnv(kv);
        const s1 = {
          partner_id: "partner_overwrite",
          last_sync_at: "2024-01-01T00:00:00Z",
          sync_version: 1,
          pending_changes: 0,
          status: "idle" as const,
        };
        const s2 = {
          partner_id: "partner_overwrite",
          last_sync_at: "2024-06-01T00:00:00Z",
          sync_version: 2,
          pending_changes: 5,
          status: "syncing" as const,
        };
        await saveSyncState(env, s1);
        await saveSyncState(env, s2);

        const result = await getSyncState(env, "partner_overwrite");
        expect(result?.sync_version).toBe(2);
        expect(result?.status).toBe("syncing");
      });
    });

    describe("createSyncConfig()", () => {
      it("should create sync config with all fields", async () => {
        const env = createEnv(kv);
        const config: Omit<SyncConfig, "id"> = {
          partner_id: "partner_sync",
          direction: "bidirectional",
          mode: "realtime",
          conflict_resolution: "timestamp",
          priority: "local",
        };
        const result = await createSyncConfig(env, config);
        expect(result.partner_id).toBe("partner_sync");
        expect(result.direction).toBe("bidirectional");
        expect(result.mode).toBe("realtime");
        expect(result.id).toMatch(/^sync_/);
      });

      it("should initialize sync state", async () => {
        const env = createEnv(kv);
        const config: Omit<SyncConfig, "id"> = {
          partner_id: "partner_init",
          direction: "push",
          mode: "scheduled",
          conflict_resolution: "priority",
          priority: "remote",
        };
        await createSyncConfig(env, config);
        const state = await getSyncState(env, "partner_init");
        expect(state).not.toBeNull();
        expect(state?.status).toBe("idle");
        expect(state?.sync_version).toBe(0);
      });

      it("should throw when KV is unavailable", async () => {
        const config: Omit<SyncConfig, "id"> = {
          partner_id: "partner_fail",
          direction: "pull",
          mode: "manual",
          conflict_resolution: "manual",
          priority: "local",
        };
        await expect(createSyncConfig({} as any, config)).rejects.toThrow(
          "No KV namespace available",
        );
      });

      it("should support schedule configuration", async () => {
        const env = createEnv(kv);
        const config: Omit<SyncConfig, "id"> = {
          partner_id: "partner_schedule",
          direction: "push",
          mode: "scheduled",
          schedule: { cron: "0 */6 * * *", timezone: "UTC" },
          conflict_resolution: "timestamp",
          priority: "local",
        };
        const result = await createSyncConfig(env, config);
        expect(result.schedule).toEqual({
          cron: "0 */6 * * *",
          timezone: "UTC",
        });
      });

      it("should support filters and field mapping", async () => {
        const env = createEnv(kv);
        const config: Omit<SyncConfig, "id"> = {
          partner_id: "partner_filters",
          direction: "pull",
          mode: "manual",
          conflict_resolution: "timestamp",
          priority: "local",
          filters: { domains: ["example.com"], status: ["active"] },
          field_mapping: { code: "referral_code", url: "link" },
        };
        const result = await createSyncConfig(env, config);
        expect(result.filters).toEqual({
          domains: ["example.com"],
          status: ["active"],
        });
        expect(result.field_mapping).toEqual({
          code: "referral_code",
          url: "link",
        });
      });
    });
  });
});
