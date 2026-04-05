/**
 * Feature Flags CRUD Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isFeatureEnabled,
  getFeatureFlag,
  setFeatureFlag,
  deleteFeatureFlag,
  getAllFeatureFlags,
  getFeatureFlagStats,
} from "../../../worker/lib/feature-flags";
import type { Env } from "../../../worker/types";

// Type for KV namespace mock
type MockKVNamespace = {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
};

// Mock dependencies
vi.mock("../../../worker/lib/error-handler", () => ({
  handleError: vi.fn((error) => error),
}));

describe("Feature Flags CRUD", () => {
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

  // ==========================================================================
  // isFeatureEnabled Tests
  // ==========================================================================

  describe("isFeatureEnabled", () => {
    it("should return false for non-existent flag", async () => {
      const result = await isFeatureEnabled("non-existent", mockEnv);
      expect(result).toBe(false);
    });

    it("should return enabled status for boolean flag", async () => {
      await setFeatureFlag({ name: "test-flag", enabled: true }, mockEnv);

      const result = await isFeatureEnabled("test-flag", mockEnv);
      expect(result).toBe(true);
    });

    it("should return false for disabled flag", async () => {
      await setFeatureFlag({ name: "disabled-flag", enabled: false }, mockEnv);

      const result = await isFeatureEnabled("disabled-flag", mockEnv);
      expect(result).toBe(false);
    });

    it("should check userIds when provided", async () => {
      await setFeatureFlag(
        {
          name: "user-flag",
          enabled: true,
          userIds: ["user-1", "user-2"],
        },
        mockEnv,
      );

      const resultWithUser = await isFeatureEnabled(
        "user-flag",
        mockEnv,
        "user-1",
      );
      const resultWithoutUser = await isFeatureEnabled("user-flag", mockEnv);
      const resultWithOtherUser = await isFeatureEnabled(
        "user-flag",
        mockEnv,
        "user-3",
      );

      expect(resultWithUser).toBe(true);
      expect(resultWithoutUser).toBe(false);
      expect(resultWithOtherUser).toBe(false);
    });

    it("should return false for disabled flag even with userIds", async () => {
      await setFeatureFlag(
        {
          name: "disabled-user-flag",
          enabled: false,
          userIds: ["user-1"],
        },
        mockEnv,
      );

      const result = await isFeatureEnabled(
        "disabled-user-flag",
        mockEnv,
        "user-1",
      );
      expect(result).toBe(false);
    });

    it("should prioritize userIds over rolloutPercentage", async () => {
      await setFeatureFlag(
        {
          name: "priority-flag",
          enabled: true,
          rolloutPercentage: 0,
          userIds: ["user-1"],
        },
        mockEnv,
      );

      const result = await isFeatureEnabled("priority-flag", mockEnv, "user-1");
      expect(result).toBe(true);
    });

    it("should handle empty flag name", async () => {
      await setFeatureFlag({ name: "", enabled: true }, mockEnv);
      const result = await isFeatureEnabled("", mockEnv);
      expect(result).toBe(true);
    });

    it("should handle flag name with special characters", async () => {
      const flagName = "flag-with-dashes_and_underscores";
      await setFeatureFlag({ name: flagName, enabled: true }, mockEnv);
      const result = await isFeatureEnabled(flagName, mockEnv);
      expect(result).toBe(true);
    });

    it("should handle very long flag names", async () => {
      const flagName = "a".repeat(200);
      await setFeatureFlag({ name: flagName, enabled: true }, mockEnv);
      const result = await isFeatureEnabled(flagName, mockEnv);
      expect(result).toBe(true);
    });

    it("should handle KV errors gracefully", async () => {
      mockEnv = {
        DEALS_LOCK: {
          get: vi.fn().mockRejectedValue(new Error("KV Error")),
          put: vi.fn(),
          delete: vi.fn(),
          list: vi.fn().mockResolvedValue({ keys: [] }),
        } as unknown as MockKVNamespace,
      } as Env;

      const result = await isFeatureEnabled("any-flag", mockEnv as Env);
      expect(result).toBe(false);
    });

    it("should handle empty userIds array", async () => {
      await setFeatureFlag(
        { name: "empty-users", enabled: true, userIds: [] },
        mockEnv,
      );

      const result = await isFeatureEnabled("empty-users", mockEnv, "any-user");
      // Should fall through to check enabled, which is true
      expect(result).toBe(true);
    });

    it("should handle undefined rolloutPercentage", async () => {
      await setFeatureFlag(
        { name: "no-rollout-defined", enabled: true },
        mockEnv,
      );

      const flag = await getFeatureFlag("no-rollout-defined", mockEnv);
      expect(flag?.rolloutPercentage).toBeUndefined();
    });
  });

  // ==========================================================================
  // getFeatureFlag Tests
  // ==========================================================================

  describe("getFeatureFlag", () => {
    it("should return null for non-existent flag", async () => {
      const result = await getFeatureFlag("non-existent", mockEnv);
      expect(result).toBeNull();
    });

    it("should return flag when it exists", async () => {
      await setFeatureFlag(
        {
          name: "get-test",
          enabled: true,
          description: "Test flag",
        },
        mockEnv,
      );

      const result = await getFeatureFlag("get-test", mockEnv);
      expect(result).not.toBeNull();
      expect(result?.name).toBe("get-test");
      expect(result?.enabled).toBe(true);
      expect(result?.description).toBe("Test flag");
    });

    it("should include createdAt and updatedAt timestamps", async () => {
      await setFeatureFlag({ name: "timestamp-test", enabled: true }, mockEnv);

      const result = await getFeatureFlag("timestamp-test", mockEnv);
      expect(result?.createdAt).toBeDefined();
      expect(result?.updatedAt).toBeDefined();
    });

    it("should preserve existing createdAt on update", async () => {
      await setFeatureFlag({ name: "preserve-test", enabled: true }, mockEnv);

      const first = await getFeatureFlag("preserve-test", mockEnv);
      const createdAt = first?.createdAt;

      // Update the flag
      await new Promise((r) => setTimeout(r, 10));
      await setFeatureFlag({ name: "preserve-test", enabled: false }, mockEnv);

      const second = await getFeatureFlag("preserve-test", mockEnv);
      expect(second?.createdAt).toBe(createdAt);
      expect(second?.updatedAt).not.toBe(createdAt);
    });

    it("should return all flag properties", async () => {
      await setFeatureFlag(
        {
          name: "full-flag",
          enabled: true,
          rolloutPercentage: 75,
          userIds: ["user-1", "user-2"],
          description: "Full test flag",
        },
        mockEnv,
      );

      const result = await getFeatureFlag("full-flag", mockEnv);
      expect(result?.name).toBe("full-flag");
      expect(result?.enabled).toBe(true);
      expect(result?.rolloutPercentage).toBe(75);
      expect(result?.userIds).toEqual(["user-1", "user-2"]);
      expect(result?.description).toBe("Full test flag");
    });
  });

  // ==========================================================================
  // setFeatureFlag Tests
  // ==========================================================================

  describe("setFeatureFlag", () => {
    it("should create new flag", async () => {
      await setFeatureFlag({ name: "new-flag", enabled: true }, mockEnv);

      const result = await getFeatureFlag("new-flag", mockEnv);
      expect(result?.name).toBe("new-flag");
      expect(result?.enabled).toBe(true);
    });

    it("should update existing flag", async () => {
      await setFeatureFlag({ name: "update-flag", enabled: true }, mockEnv);

      await setFeatureFlag(
        { name: "update-flag", enabled: false, description: "Updated" },
        mockEnv,
      );

      const result = await getFeatureFlag("update-flag", mockEnv);
      expect(result?.enabled).toBe(false);
      expect(result?.description).toBe("Updated");
    });

    it("should set createdAt only on first creation", async () => {
      await setFeatureFlag({ name: "timestamp-flag", enabled: true }, mockEnv);

      const first = await getFeatureFlag("timestamp-flag", mockEnv);
      expect(first?.createdAt).toBeDefined();

      // Wait a bit then update
      await new Promise((r) => setTimeout(r, 10));
      await setFeatureFlag({ name: "timestamp-flag", enabled: false }, mockEnv);

      const second = await getFeatureFlag("timestamp-flag", mockEnv);
      expect(second?.createdAt).toBe(first?.createdAt);
    });

    it("should set updatedAt on every update", async () => {
      await setFeatureFlag({ name: "updated-at-flag", enabled: true }, mockEnv);

      const first = await getFeatureFlag("updated-at-flag", mockEnv);
      const firstUpdatedAt = first?.updatedAt;

      await new Promise((r) => setTimeout(r, 10));
      await setFeatureFlag(
        { name: "updated-at-flag", enabled: false },
        mockEnv,
      );

      const second = await getFeatureFlag("updated-at-flag", mockEnv);
      expect(second?.updatedAt).not.toBe(firstUpdatedAt);
    });
  });

  // ==========================================================================
  // deleteFeatureFlag Tests
  // ==========================================================================

  describe("deleteFeatureFlag", () => {
    it("should delete existing flag", async () => {
      await setFeatureFlag({ name: "delete-me", enabled: true }, mockEnv);

      await deleteFeatureFlag("delete-me", mockEnv);

      const result = await getFeatureFlag("delete-me", mockEnv);
      expect(result).toBeNull();
    });

    it("should handle deletion of non-existent flag gracefully", async () => {
      await expect(
        deleteFeatureFlag("non-existent", mockEnv),
      ).resolves.not.toThrow();
    });

    it("should not affect other flags when deleting one", async () => {
      await setFeatureFlag({ name: "flag-1", enabled: true }, mockEnv);
      await setFeatureFlag({ name: "flag-2", enabled: true }, mockEnv);

      await deleteFeatureFlag("flag-1", mockEnv);

      const result1 = await getFeatureFlag("flag-1", mockEnv);
      const result2 = await getFeatureFlag("flag-2", mockEnv);

      expect(result1).toBeNull();
      expect(result2).not.toBeNull();
    });
  });

  // ==========================================================================
  // getAllFeatureFlags Tests
  // ==========================================================================

  describe("getAllFeatureFlags", () => {
    it("should return empty map when no flags exist", async () => {
      const result = await getAllFeatureFlags(mockEnv);
      expect(result.size).toBe(0);
    });

    it("should return all flags", async () => {
      await setFeatureFlag({ name: "all-1", enabled: true }, mockEnv);
      await setFeatureFlag({ name: "all-2", enabled: false }, mockEnv);
      await setFeatureFlag({ name: "all-3", enabled: true }, mockEnv);

      const result = await getAllFeatureFlags(mockEnv);
      expect(result.size).toBe(3);
      expect(result.has("all-1")).toBe(true);
      expect(result.has("all-2")).toBe(true);
      expect(result.has("all-3")).toBe(true);
    });

    it("should include flag properties", async () => {
      await setFeatureFlag(
        {
          name: "props-flag",
          enabled: true,
          rolloutPercentage: 50,
        },
        mockEnv,
      );

      const result = await getAllFeatureFlags(mockEnv);
      const flag = result.get("props-flag");

      expect(flag?.enabled).toBe(true);
      expect(flag?.rolloutPercentage).toBe(50);
    });
  });

  // ==========================================================================
  // getFeatureFlagStats Tests
  // ==========================================================================

  describe("getFeatureFlagStats", () => {
    it("should return correct stats for empty flags", async () => {
      const stats = await getFeatureFlagStats(mockEnv);
      expect(stats.totalFlags).toBe(0);
      expect(stats.enabledFlags).toBe(0);
      expect(stats.disabledFlags).toBe(0);
    });

    it("should count enabled and disabled flags", async () => {
      await setFeatureFlag({ name: "enabled-1", enabled: true }, mockEnv);
      await setFeatureFlag({ name: "enabled-2", enabled: true }, mockEnv);
      await setFeatureFlag({ name: "disabled-1", enabled: false }, mockEnv);

      const stats = await getFeatureFlagStats(mockEnv);
      expect(stats.totalFlags).toBe(3);
      expect(stats.enabledFlags).toBe(2);
      expect(stats.disabledFlags).toBe(1);
    });

    it("should count flags with rollout and userIds", async () => {
      await setFeatureFlag(
        { name: "rollout-flag", enabled: true, rolloutPercentage: 50 },
        mockEnv,
      );
      await setFeatureFlag(
        { name: "user-flag", enabled: true, userIds: ["user-1"] },
        mockEnv,
      );
      await setFeatureFlag({ name: "simple-flag", enabled: true }, mockEnv);

      const stats = await getFeatureFlagStats(mockEnv);
      expect(stats.flagsWithRollout).toBe(1);
      expect(stats.flagsWithUserIds).toBe(1);
    });
  });
});
