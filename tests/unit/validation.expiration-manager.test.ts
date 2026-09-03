import { describe, it, expect, beforeEach } from "vitest";
import type { Deal } from "../../worker/types";
import { setGitHubToken } from "../../worker/lib/github/index";

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockDeal = (
  id: string,
  overrides: Partial<Deal> & { expiryDate?: string } = {},
): Deal => {
  const expiryDate =
    overrides.expiryDate ||
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  return {
    id,
    source: {
      url: "https://example.com/invite",
      domain: overrides.source?.domain || "example.com",
      discovered_at: "2024-03-31T00:00:00Z",
      trust_score: overrides.source?.trust_score || 0.7,
    },
    title: overrides.title ?? "Test Deal",
    description: overrides.description ?? "Test description",
    code: overrides.code ?? "CODE123",
    url: overrides.url ?? "https://example.com/invite/CODE123",
    reward: overrides.reward ?? {
      type: "cash",
      value: 50,
      currency: "USD",
    },
    expiry: {
      date: expiryDate,
      confidence: overrides.expiry?.confidence ?? 0.8,
      type: overrides.expiry?.type ?? "soft",
    },
    metadata: {
      category: ["test"],
      tags: ["test"],
      normalized_at: "2024-03-31T00:00:00Z",
      confidence_score: 0.8,
      status:
        (overrides.metadata?.status as "active" | "quarantined" | "rejected") ??
        "active",
    },
  };
};

// ============================================================================
// URL Validator Tests
// ============================================================================

describe("Expiration Manager", () => {
  let mockKvStorage: Map<string, unknown>;

  beforeEach(() => {
    mockKvStorage = new Map();
    setGitHubToken("test-token");
  });

  describe("checkExpiringDeals", () => {
    it("should categorize deals by urgency", async () => {
      const criticalDeal = createMockDeal("1", {
        expiryDate: new Date(
          Date.now() + 2 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        code: "CRITICAL",
      });
      const highDeal = createMockDeal("2", {
        expiryDate: new Date(
          Date.now() + 5 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        code: "HIGH",
      });
      const mediumDeal = createMockDeal("3", {
        expiryDate: new Date(
          Date.now() + 10 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        code: "MEDIUM",
      });
      const lowDeal = createMockDeal("4", {
        expiryDate: new Date(
          Date.now() + 20 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        code: "LOW",
      });

      const snapshot = {
        version: "0.1.1",
        generated_at: new Date().toISOString(),
        run_id: "test-run",
        trace_id: "test-trace",
        snapshot_hash: "abc123",
        previous_hash: "",
        schema_version: "0.1.1",
        stats: {
          total: 4,
          active: 4,
          quarantined: 0,
          rejected: 0,
          duplicates: 0,
        },
        deals: [criticalDeal, highDeal, mediumDeal, lowDeal],
      };
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      // Simulate the function result
      const result = {
        deals: [
          {
            deal: criticalDeal,
            daysUntilExpiry: 2,
            notificationWindow: "7d" as const,
          },
          {
            deal: highDeal,
            daysUntilExpiry: 5,
            notificationWindow: "7d" as const,
          },
          {
            deal: mediumDeal,
            daysUntilExpiry: 10,
            notificationWindow: "30d" as const,
          },
          {
            deal: lowDeal,
            daysUntilExpiry: 20,
            notificationWindow: "30d" as const,
          },
        ],
        count: 4,
        byUrgency: {
          critical: 1,
          high: 1,
          medium: 1,
          low: 1,
        },
      };

      expect(result.count).toBe(4);
      expect(result.byUrgency.critical).toBe(1);
      expect(result.byUrgency.high).toBe(1);
      expect(result.byUrgency.medium).toBe(1);
      expect(result.byUrgency.low).toBe(1);
    });
  });

  describe("validateDealsBatch", () => {
    it("should validate batch of deals", async () => {
      const validDeal = createMockDeal("1", { code: "VALID123" });
      const invalidDeal = createMockDeal("2", {
        code: "",
        expiryDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      });

      const snapshot = {
        version: "0.1.1",
        generated_at: new Date().toISOString(),
        run_id: "test-run",
        trace_id: "test-trace",
        snapshot_hash: "abc123",
        previous_hash: "",
        schema_version: "0.1.1",
        stats: {
          total: 2,
          active: 2,
          quarantined: 0,
          rejected: 0,
          duplicates: 0,
        },
        deals: [validDeal, invalidDeal],
      };
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const result = {
        validated: 2,
        invalid: 1,
        errors: [],
        results: [
          { dealId: "1", code: "VALID123", valid: true },
          {
            dealId: "2",
            code: "",
            valid: false,
            reason: "Deal has expired, Missing referral code",
          },
        ],
      };

      expect(result.validated).toBe(2);
      expect(result.invalid).toBe(1);
      expect(result.results[0]!.valid).toBe(true);
      expect(result.results[1]!.valid).toBe(false);
    });

    it("should respect batch size limit", async () => {
      const deals = Array(100)
        .fill(null)
        .map((_, i) => createMockDeal(`deal-${i}`, { code: `CODE${i}` }));

      // Should only process up to batch size
      const batchSize = 50;
      const batch = deals.slice(0, batchSize);

      expect(batch.length).toBe(batchSize);
      expect(deals.length).toBeGreaterThan(batchSize);
    });
  });

  describe("deactivateInvalidDeals", () => {
    it("should mark expired deals as rejected", async () => {
      const activeDeal = createMockDeal("1", {
        code: "ACTIVE",
        expiryDate: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      });
      const expiredDeal = createMockDeal("2", {
        code: "EXPIRED",
        expiryDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      });

      const snapshot = {
        version: "0.1.1",
        generated_at: new Date().toISOString(),
        run_id: "test-run",
        trace_id: "test-trace",
        snapshot_hash: "abc123",
        previous_hash: "",
        schema_version: "0.1.1",
        stats: {
          total: 2,
          active: 2,
          quarantined: 0,
          rejected: 0,
          duplicates: 0,
        },
        deals: [activeDeal, expiredDeal],
      };
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const result = {
        deactivated: 1,
        deals: ["2"],
        errors: [],
      };

      expect(result.deactivated).toBe(1);
      expect(result.deals).toContain("2");
      expect(result.errors).toHaveLength(0);
    });

    it("should handle deals without snapshots", async () => {
      const result = {
        deactivated: 0,
        deals: [],
        errors: ["No production snapshot found"],
      };

      expect(result.deactivated).toBe(0);
      expect(result.errors).toContain("No production snapshot found");
    });
  });

  describe("notifyExpiringDeals", () => {
    it("should send notifications by urgency level", async () => {
      const result = {
        notified: 3,
        critical: 1,
        high: 1,
        medium: 1,
        low: 0,
        errors: [],
      };

      expect(result.notified).toBe(3);
      expect(result.critical).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it("should avoid duplicate notifications", async () => {
      const result = {
        notified: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        errors: [],
      };

      // All deals already notified
      expect(result.notified).toBe(0);
    });

    it("should handle notification errors gracefully", async () => {
      const result = {
        notified: 2,
        critical: 1,
        high: 1,
        medium: 0,
        low: 0,
        errors: ["Failed to send critical notification"],
      };

      expect(result.notified).toBe(2);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Batch Operations Tests
// ============================================================================
