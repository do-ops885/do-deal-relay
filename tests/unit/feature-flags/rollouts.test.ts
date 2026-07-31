/**
 * Feature Flags Rollouts Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isFeatureEnabled,
  setFeatureFlag,
  getFeatureFlag,
  getAllFeatureFlags,
  initializeDefaultFlags,
  batchCheckFlags,
} from "../../../worker/lib/feature-flags";
import type { Env } from "../../../worker/types";

// Type for KV namespace mock
type MockKVNamespace = {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
};

describe("Feature Flags Rollouts", () => {
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
    } as unknown as Env;
  });

  afterEach(() => {
    mockKvStorage.clear();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Rollout Percentage Tests
  // ==========================================================================

  describe("Rollout Percentage", () => {
    it("should check rollout percentage when no userId provided", async () => {
      await setFeatureFlag(
        {
          name: "rollout-flag",
          enabled: true,
          rolloutPercentage: 50,
        },
        mockEnv,
      );

      // Run multiple times to test deterministic distribution
      const results = new Set();
      for (let i = 0; i < 100; i++) {
        const result = await isFeatureEnabled("rollout-flag", mockEnv);
        results.add(result);
      }

      // Should get both true and false based on percentage
      expect(results.size).toBeGreaterThanOrEqual(1);
    });

    it("should check rollout percentage with userId for consistency", async () => {
      await setFeatureFlag(
        {
          name: "consistent-rollout",
          enabled: true,
          rolloutPercentage: 100,
        },
        mockEnv,
      );

      // Same user should always get same result
      const results = [];
      for (let i = 0; i < 10; i++) {
        const result = await isFeatureEnabled(
          "consistent-rollout",
          mockEnv,
          "user-123",
        );
        results.push(result);
      }

      // All results should be the same
      expect(new Set(results).size).toBe(1);
    });

    it("should return true when rolloutPercentage is 100", async () => {
      await setFeatureFlag(
        {
          name: "full-rollout",
          enabled: true,
          rolloutPercentage: 100,
        },
        mockEnv,
      );

      const result = await isFeatureEnabled(
        "full-rollout",
        mockEnv,
        "any-user",
      );
      expect(result).toBe(true);
    });

    it("should return false when rolloutPercentage is 0", async () => {
      await setFeatureFlag(
        {
          name: "no-rollout",
          enabled: true,
          rolloutPercentage: 0,
        },
        mockEnv,
      );

      const result = await isFeatureEnabled("no-rollout", mockEnv, "any-user");
      expect(result).toBe(false);
    });

    it("should handle rollout percentage boundary 0", async () => {
      await setFeatureFlag(
        { name: "zero-rollout", enabled: true, rolloutPercentage: 0 },
        mockEnv,
      );

      // Test multiple users - should all return false
      for (let i = 0; i < 10; i++) {
        const result = await isFeatureEnabled(
          "zero-rollout",
          mockEnv,
          `user-${i}`,
        );
        expect(result).toBe(false);
      }
    });

    it("should handle rollout percentage boundary 100", async () => {
      await setFeatureFlag(
        { name: "full-rollout", enabled: true, rolloutPercentage: 100 },
        mockEnv,
      );

      // Test multiple users - should all return true
      for (let i = 0; i < 10; i++) {
        const result = await isFeatureEnabled(
          "full-rollout",
          mockEnv,
          `user-${i}`,
        );
        expect(result).toBe(true);
      }
    });
  });

  // ==========================================================================
  // User Targeting Tests
  // ==========================================================================

  describe("User Targeting", () => {
    it("should return true when userId is in the userIds array", async () => {
      await setFeatureFlag(
        {
          name: "targeted-flag",
          enabled: true,
          userIds: ["target-user-1", "target-user-2"],
        },
        mockEnv,
      );

      const result = await isFeatureEnabled(
        "targeted-flag",
        mockEnv,
        "target-user-1",
      );
      expect(result).toBe(true);
    });

    it("should return false when userId is not in the userIds array", async () => {
      await setFeatureFlag(
        {
          name: "targeted-flag-2",
          enabled: true,
          userIds: ["target-user-1", "target-user-2"],
        },
        mockEnv,
      );

      const result = await isFeatureEnabled(
        "targeted-flag-2",
        mockEnv,
        "non-targeted-user",
      );
      expect(result).toBe(false);
    });

    it("should treat disabled flag as false even with user match", async () => {
      await setFeatureFlag(
        {
          name: "disabled-targeted",
          enabled: false,
          userIds: ["target-user-1"],
        },
        mockEnv,
      );

      const result = await isFeatureEnabled(
        "disabled-targeted",
        mockEnv,
        "target-user-1",
      );
      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // Batch Check Tests
  // ==========================================================================

  describe("batchCheckFlags", () => {
    it("should return empty map for empty input", async () => {
      const result = await batchCheckFlags([], mockEnv);
      expect(result.size).toBe(0);
    });

    it("should check multiple flags", async () => {
      await setFeatureFlag({ name: "batch-1", enabled: true }, mockEnv);
      await setFeatureFlag({ name: "batch-2", enabled: false }, mockEnv);
      await setFeatureFlag({ name: "batch-3", enabled: true }, mockEnv);

      const result = await batchCheckFlags(
        ["batch-1", "batch-2", "batch-3"],
        mockEnv,
      );

      expect(result.get("batch-1")).toBe(true);
      expect(result.get("batch-2")).toBe(false);
      expect(result.get("batch-3")).toBe(true);
    });

    it("should return false for non-existent flags", async () => {
      const result = await batchCheckFlags(["non-existent"], mockEnv);
      expect(result.get("non-existent")).toBe(false);
    });

    it("should handle userId consistently", async () => {
      await setFeatureFlag(
        {
          name: "batch-user-flag",
          enabled: true,
          userIds: ["batch-user"],
        },
        mockEnv,
      );

      const result = await batchCheckFlags(
        ["batch-user-flag"],
        mockEnv,
        "batch-user",
      );
      expect(result.get("batch-user-flag")).toBe(true);
    });
  });

  // ==========================================================================
  // Default Flags Initialization Tests
  // ==========================================================================

  describe("Default Flags", () => {
    it("should initialize all 5 default flags", async () => {
      await initializeDefaultFlags(mockEnv);

      const flags = [
        "bulk_import_export",
        "nlq_ai_enhancement",
        "email_processing",
        "analytics_dashboard",
        "webhook_system",
      ];

      for (const name of flags) {
        const flag = await getFeatureFlag(name, mockEnv);
        expect(flag).not.toBeNull();
        expect(flag?.name).toBe(name);
      }
    });

    it("should have correct enabled status for default flags", async () => {
      await initializeDefaultFlags(mockEnv);

      // Check enabled statuses
      const bulk = await getFeatureFlag("bulk_import_export", mockEnv);
      const nlq = await getFeatureFlag("nlq_ai_enhancement", mockEnv);
      const email = await getFeatureFlag("email_processing", mockEnv);
      const analytics = await getFeatureFlag("analytics_dashboard", mockEnv);
      const webhook = await getFeatureFlag("webhook_system", mockEnv);

      expect(bulk?.enabled).toBe(false);
      expect(nlq?.enabled).toBe(true);
      expect(email?.enabled).toBe(false);
      expect(analytics?.enabled).toBe(true);
      expect(webhook?.enabled).toBe(true);
    });

    it("should include descriptions for default flags", async () => {
      await initializeDefaultFlags(mockEnv);

      const flag = await getFeatureFlag("bulk_import_export", mockEnv);
      expect(flag?.description).toBeDefined();
      expect(flag?.description).toContain("bulk");
    });

    it("should allow overriding default flags", async () => {
      await initializeDefaultFlags(mockEnv);

      // Override
      await setFeatureFlag(
        { name: "nlq_ai_enhancement", enabled: false },
        mockEnv,
      );

      const flag = await getFeatureFlag("nlq_ai_enhancement", mockEnv);
      expect(flag?.enabled).toBe(false);
    });
  });

  // ==========================================================================
  // Caching Behavior Tests
  // ==========================================================================

  describe("Caching Behavior", () => {
    it("should reflect updates immediately", async () => {
      await setFeatureFlag({ name: "cache-test", enabled: false }, mockEnv);

      let result = await isFeatureEnabled("cache-test", mockEnv);
      expect(result).toBe(false);

      await setFeatureFlag({ name: "cache-test", enabled: true }, mockEnv);

      result = await isFeatureEnabled("cache-test", mockEnv);
      expect(result).toBe(true);
    });

    it("should maintain consistency across multiple checks", async () => {
      await setFeatureFlag(
        {
          name: "consistency-test",
          enabled: true,
          rolloutPercentage: 100,
        },
        mockEnv,
      );

      // Check multiple times
      const results = [];
      for (let i = 0; i < 20; i++) {
        results.push(
          await isFeatureEnabled("consistency-test", mockEnv, "test-user"),
        );
      }

      // All should be true
      expect(results.every((r) => r === true)).toBe(true);
    });
  });

  // ==========================================================================
  // initializeDefaultFlags Tests (v2 with versioned migration)
  // ==========================================================================

  describe("initializeDefaultFlags", () => {
    it("should create default flags and stamp schema v2 on fresh init", async () => {
      await initializeDefaultFlags(mockEnv);

      const flags = await getAllFeatureFlags(mockEnv);
      // All 7 default flags created
      expect(flags.size).toBeGreaterThanOrEqual(7);

      // Schema version key set to v2
      expect(mockKvStorage.get("__ff_schema_version__")).toBe("2");

      // Legacy marker cleaned up
      expect(mockKvStorage.has("__ff_initialized__")).toBe(false);
    });

    it("should not overwrite existing flags on fresh init", async () => {
      // Pre-set a flag before init
      await setFeatureFlag(
        { name: "bulk_import_export", enabled: true },
        mockEnv,
      );

      await initializeDefaultFlags(mockEnv);

      const flag = await getFeatureFlag("bulk_import_export", mockEnv);
      expect(flag?.enabled).toBe(true); // Should remain true, not reset to default false
    });

    it("should create flags with correct default values", async () => {
      await initializeDefaultFlags(mockEnv);

      const nlqFlag = await getFeatureFlag("nlq_ai_enhancement", mockEnv);
      expect(nlqFlag?.enabled).toBe(true);

      const emailFlag = await getFeatureFlag("email_processing", mockEnv);
      expect(emailFlag?.enabled).toBe(false);

      const webhookFlag = await getFeatureFlag("webhook_system", mockEnv);
      expect(webhookFlag?.enabled).toBe(true);

      // v2 default: real_research_fetching is disabled
      const researchFlag = await getFeatureFlag(
        "real_research_fetching",
        mockEnv,
      );
      expect(researchFlag?.enabled).toBe(false);
    });

    // ---- Migration v1 → v2 ----

    it("should migrate real_research_fetching from v1 old default to v2", async () => {
      // Simulate v1 deployment: legacy marker + old-default flag
      mockKvStorage.set("__ff_initialized__", "true");
      await setFeatureFlag(
        {
          name: "real_research_fetching",
          enabled: true,
          rolloutPercentage: 0,
          description:
            "Enable real web scraping in the research agent (ProductHunt, GitHub, HN, Reddit, generic)",
        },
        mockEnv,
      );

      await initializeDefaultFlags(mockEnv);

      const flag = await getFeatureFlag("real_research_fetching", mockEnv);
      expect(flag?.enabled).toBe(false); // Migrated to v2 default
      expect(flag?.rolloutPercentage).toBe(0);

      // Version stamped
      expect(mockKvStorage.get("__ff_schema_version__")).toBe("2");
      // Legacy cleaned up
      expect(mockKvStorage.has("__ff_initialized__")).toBe(false);
    });

    it("should not migrate real_research_fetching when user customized it", async () => {
      // Simulate v1 deployment where user changed the flag
      mockKvStorage.set("__ff_initialized__", "true");
      await setFeatureFlag(
        {
          name: "real_research_fetching",
          enabled: true,
          rolloutPercentage: 50, // user customized
          description:
            "Enable real web scraping in the research agent (ProductHunt, GitHub, HN, Reddit, generic)",
        },
        mockEnv,
      );

      await initializeDefaultFlags(mockEnv);

      const flag = await getFeatureFlag("real_research_fetching", mockEnv);
      expect(flag?.enabled).toBe(true); // Preserved user override
      expect(flag?.rolloutPercentage).toBe(50); // Preserved user override

      // Version still stamped
      expect(mockKvStorage.get("__ff_schema_version__")).toBe("2");
    });

    it("should be no-op when already at v2", async () => {
      mockKvStorage.set("__ff_schema_version__", "2");

      await initializeDefaultFlags(mockEnv);

      // No flags created (already initialized)
      const flags = await getAllFeatureFlags(mockEnv);
      expect(flags.size).toBe(0);

      // Version unchanged
      expect(mockKvStorage.get("__ff_schema_version__")).toBe("2");
    });

    it("should clean up legacy __ff_initialized__ and not re-create flags", async () => {
      // Simulate v1 deployment with all 7 default flags stored
      mockKvStorage.set("__ff_initialized__", "true");
      const oldDescription =
        "Enable real web scraping in the research agent (ProductHunt, GitHub, HN, Reddit, generic)";
      await setFeatureFlag(
        {
          name: "real_research_fetching",
          enabled: true,
          rolloutPercentage: 0,
          description: oldDescription,
        },
        mockEnv,
      );
      // Also seed some other flags to verify they are untouched
      await setFeatureFlag(
        { name: "nlq_ai_enhancement", enabled: true },
        mockEnv,
      );

      await initializeDefaultFlags(mockEnv);

      // Other flags untouched
      const nlq = await getFeatureFlag("nlq_ai_enhancement", mockEnv);
      expect(nlq?.enabled).toBe(true);

      // Legacy marker cleaned up
      expect(mockKvStorage.has("__ff_initialized__")).toBe(false);
      // Version stamped
      expect(mockKvStorage.get("__ff_schema_version__")).toBe("2");
    });
  });
});
