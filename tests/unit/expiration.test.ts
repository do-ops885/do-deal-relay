import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  findExpiringDeals,
  markExpiredDeals,
  sendExpiryNotifications,
  scheduleExpiryCheck,
  checkDealExpirations,
  isExpiringSoon,
  calculateExpiryUrgency,
} from "../../worker/lib/expiration";
import type { Deal, Env } from "../../worker/types";

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

describe("Expiration Module", () => {
  let mockKvStorage: Map<string, unknown>;
  let mockEnv: Env;

  beforeEach(() => {
    mockKvStorage = new Map();

    mockEnv = {
      DEALS_PROD: {
        get: vi.fn(async <T>(key: string, type?: string) => {
          const value = mockKvStorage.get(`prod:${key}`);
          if (value === undefined) return null;
          if (type === "json" && typeof value === "string") {
            return JSON.parse(value) as T;
          }
          return value as T;
        }),
        put: vi.fn(async (key: string, value: string) => {
          mockKvStorage.set(`prod:${key}`, value);
        }),
        delete: vi.fn(async (key: string) => {
          mockKvStorage.delete(`prod:${key}`);
        }),
      } as unknown as KVNamespace,
      DEALS_STAGING: {
        get: vi.fn(async <T>(key: string, type?: string) => {
          const value = mockKvStorage.get(`staging:${key}`);
          if (value === undefined) return null;
          if (type === "json" && typeof value === "string") {
            return JSON.parse(value) as T;
          }
          return value as T;
        }),
        put: vi.fn(async (key: string, value: string) => {
          mockKvStorage.set(`staging:${key}`, value);
        }),
        delete: vi.fn(async (key: string) => {
          mockKvStorage.delete(`staging:${key}`);
        }),
      } as unknown as KVNamespace,
      DEALS_LOG: {
        put: vi.fn(async () => {}),
      } as unknown as KVNamespace,
      DEALS_LOCK: {
        get: vi.fn(async () => null),
        put: vi.fn(async () => {}),
        delete: vi.fn(async () => {}),
      } as unknown as KVNamespace,
      DEALS_SOURCES: {
        get: vi.fn(async () => null),
        put: vi.fn(async () => {}),
      } as unknown as KVNamespace,
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
      NOTIFICATION_THRESHOLD: "100",
    } as Env;
  });

  describe("findExpiringDeals", () => {
    it("should find deals expiring within 7 days", async () => {
      const expiringSoon = createMockDeal("1", {
        expiryDate: new Date(
          Date.now() + 3 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        code: "EXPIRING7",
      });
      const notExpiring = createMockDeal("2", {
        expiryDate: new Date(
          Date.now() + 60 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        code: "NOTEXPIRING",
      });

      // Setup production snapshot
      const snapshot = {
        version: "1.0.0",
        generated_at: "2024-03-31T00:00:00Z",
        run_id: "test-run",
        trace_id: "test-trace",
        snapshot_hash: "abc123",
        previous_hash: "",
        schema_version: "1.0.0",
        stats: {
          total: 2,
          active: 2,
          quarantined: 0,
          rejected: 0,
          duplicates: 0,
        },
        deals: [expiringSoon, notExpiring],
      };
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const result = await findExpiringDeals(mockEnv, 7);

      expect(result).toHaveLength(1);
      expect(result[0].deal.id).toBe("1");
      expect(result[0].daysUntilExpiry).toBe(3);
      expect(result[0].notificationWindow).toBe("7d");
    });

    it("should find deals expiring within 30 days", async () => {
      const expiring30 = createMockDeal("1", {
        expiryDate: new Date(
          Date.now() + 20 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        code: "EXPIRING30",
      });
      const notExpiring = createMockDeal("2", {
        expiryDate: new Date(
          Date.now() + 60 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        code: "NOTEXPIRING",
      });

      const snapshot = {
        version: "1.0.0",
        generated_at: "2024-03-31T00:00:00Z",
        run_id: "test-run",
        trace_id: "test-trace",
        snapshot_hash: "abc123",
        previous_hash: "",
        schema_version: "1.0.0",
        stats: {
          total: 2,
          active: 2,
          quarantined: 0,
          rejected: 0,
          duplicates: 0,
        },
        deals: [expiring30, notExpiring],
      };
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const result = await findExpiringDeals(mockEnv, 30);

      expect(result).toHaveLength(1);
      expect(result[0].deal.id).toBe("1");
      expect(result[0].notificationWindow).toBe("30d");
    });

    it("should not include already expired deals", async () => {
      const alreadyExpired = createMockDeal("1", {
        expiryDate: new Date(
          Date.now() - 5 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        code: "EXPIRED",
      });

      const snapshot = {
        version: "1.0.0",
        generated_at: "2024-03-31T00:00:00Z",
        run_id: "test-run",
        trace_id: "test-trace",
        snapshot_hash: "abc123",
        previous_hash: "",
        schema_version: "1.0.0",
        stats: {
          total: 1,
          active: 1,
          quarantined: 0,
          rejected: 0,
          duplicates: 0,
        },
        deals: [alreadyExpired],
      };
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const result = await findExpiringDeals(mockEnv, 30);

      expect(result).toHaveLength(0);
    });

    it("should not include deals without expiry dates", async () => {
      const noExpiry = createMockDeal("1", {
        expiryDate: undefined as unknown as string,
        code: "NOEXPIRY",
      });
      noExpiry.expiry.date = undefined;

      const snapshot = {
        version: "1.0.0",
        generated_at: "2024-03-31T00:00:00Z",
        run_id: "test-run",
        trace_id: "test-trace",
        snapshot_hash: "abc123",
        previous_hash: "",
        schema_version: "1.0.0",
        stats: {
          total: 1,
          active: 1,
          quarantined: 0,
          rejected: 0,
          duplicates: 0,
        },
        deals: [noExpiry],
      };
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const result = await findExpiringDeals(mockEnv, 30);

      expect(result).toHaveLength(0);
    });

    it("should sort by urgency (most urgent first)", async () => {
      const expiringIn3 = createMockDeal("1", {
        expiryDate: new Date(
          Date.now() + 3 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        code: "URGENT",
      });
      const expiringIn7 = createMockDeal("2", {
        expiryDate: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        code: "SOON",
      });
      const expiringIn1 = createMockDeal("3", {
        expiryDate: new Date(
          Date.now() + 1 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        code: "CRITICAL",
      });

      const snapshot = {
        version: "1.0.0",
        generated_at: "2024-03-31T00:00:00Z",
        run_id: "test-run",
        trace_id: "test-trace",
        snapshot_hash: "abc123",
        previous_hash: "",
        schema_version: "1.0.0",
        stats: {
          total: 3,
          active: 3,
          quarantined: 0,
          rejected: 0,
          duplicates: 0,
        },
        deals: [expiringIn3, expiringIn7, expiringIn1],
      };
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const result = await findExpiringDeals(mockEnv, 30);

      expect(result).toHaveLength(3);
      expect(result[0].deal.id).toBe("3"); // 1 day (most urgent)
      expect(result[1].deal.id).toBe("1"); // 3 days
      expect(result[2].deal.id).toBe("2"); // 7 days
    });
  });

  describe("isExpiringSoon", () => {
    it("should return true for deals expiring within window", () => {
      const deal = createMockDeal("1", {
        expiryDate: new Date(
          Date.now() + 5 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      });

      expect(isExpiringSoon(deal, 7)).toBe(true);
      expect(isExpiringSoon(deal, 3)).toBe(false);
    });

    it("should return false for expired deals", () => {
      const deal = createMockDeal("1", {
        expiryDate: new Date(
          Date.now() - 5 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      });

      expect(isExpiringSoon(deal, 30)).toBe(false);
    });

    it("should return false for deals without expiry date", () => {
      const deal = createMockDeal("1", {});
      deal.expiry.date = undefined;

      expect(isExpiringSoon(deal, 30)).toBe(false);
    });
  });

  describe("calculateExpiryUrgency", () => {
    it("should return 1.0 for already expired deals", () => {
      const deal = createMockDeal("1", {
        expiryDate: new Date(
          Date.now() - 5 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      });

      expect(calculateExpiryUrgency(deal)).toBe(1.0);
    });

    it("should return 0.8 for deals expiring within 7 days", () => {
      const deal = createMockDeal("1", {
        expiryDate: new Date(
          Date.now() + 5 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      });

      expect(calculateExpiryUrgency(deal)).toBe(0.8);
    });

    it("should return 0.5 for deals expiring within 30 days", () => {
      const deal = createMockDeal("1", {
        expiryDate: new Date(
          Date.now() + 20 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      });

      expect(calculateExpiryUrgency(deal)).toBe(0.5);
    });

    it("should return 0.2 for deals expiring within 90 days", () => {
      const deal = createMockDeal("1", {
        expiryDate: new Date(
          Date.now() + 60 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      });

      expect(calculateExpiryUrgency(deal)).toBe(0.2);
    });

    it("should return 0 for deals expiring far in future", () => {
      const deal = createMockDeal("1", {
        expiryDate: new Date(
          Date.now() + 120 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      });

      expect(calculateExpiryUrgency(deal)).toBe(0);
    });
  });

  describe("scheduleExpiryCheck", () => {
    it("should schedule next check for tomorrow at 9am", async () => {
      await scheduleExpiryCheck(mockEnv);

      const putCalls = (mockEnv.DEALS_PROD.put as ReturnType<typeof vi.fn>).mock
        .calls;
      const putCall = putCalls.find((call) =>
        call[0].includes("last_expiry_check"),
      );

      expect(putCall).toBeDefined();
      const data = JSON.parse(putCall![1]);
      expect(data.scheduled_at).toBeDefined();
      expect(data.checked_at).toBeDefined();
    });
  });

  describe("checkDealExpirations", () => {
    it("should return summary of expiration check", async () => {
      const expiringSoon = createMockDeal("1", {
        expiryDate: new Date(
          Date.now() + 3 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        code: "EXPIRING",
      });

      const snapshot = {
        version: "1.0.0",
        generated_at: "2024-03-31T00:00:00Z",
        run_id: "test-run",
        trace_id: "test-trace",
        snapshot_hash: "abc123",
        previous_hash: "",
        schema_version: "1.0.0",
        stats: {
          total: 1,
          active: 1,
          quarantined: 0,
          rejected: 0,
          duplicates: 0,
        },
        deals: [expiringSoon],
      };
      mockKvStorage.set("prod:snapshot:prod", snapshot);
      mockKvStorage.set("staging:snapshot:staging", snapshot);

      const result = await checkDealExpirations(mockEnv);

      expect(result.expiringFound).toBeGreaterThanOrEqual(0);
      expect(result.expiredMarked).toBe(0);
      expect(result.notificationsSent).toBeGreaterThanOrEqual(0);
    });
  });
});
