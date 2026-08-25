/**
 * Unit tests for worker/lib/expiration helper functions.
 *
 * Covers the pure helpers isExpiringSoon and calculateExpiryUrgency with
 * exact boundary timestamps and malformed dates, plus the KV-backed
 * scheduling helpers (stats, validation results, notified-deal tracking)
 * with a fixed system clock for determinism.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isExpiringSoon,
  calculateExpiryUrgency,
  getValidationStats,
  getLastValidationResults,
} from "../../worker/lib/expiration";
import {
  scheduleExpiryCheck,
  storeValidationStats,
  getNotifiedExpiringDeals,
  recordNotifiedExpiringDeals,
  EXPIRY_CHECK_KEY,
  VALIDATION_STATS_KEY,
  NOTIFIED_EXPIRING_KEY,
  LAST_VALIDATION_KEY,
} from "../../worker/lib/expiration/scheduling";
import type { Deal, Env } from "../../worker/types";

// ============================================================================
// Fixed clock and test fixtures
// ============================================================================

const NOW = new Date("2026-06-01T12:00:00.000Z");

function isoAt(offsetMs: number): string {
  return new Date(NOW.getTime() + offsetMs).toISOString();
}

type DealOverrides = Partial<Deal> & { expiryDate?: string };

function createDeal(overrides: DealOverrides = {}): Deal {
  const { expiryDate, ...rest } = overrides;
  const deal: Deal = {
    id: "deal-1",
    source: {
      url: "https://example.com/invite",
      domain: "example.com",
      discovered_at: "2026-05-01T00:00:00Z",
      trust_score: 0.7,
    },
    title: "Test Deal",
    description: "Test description",
    code: "CODE123",
    url: "https://example.com/invite/CODE123",
    reward: { type: "cash", value: 50, currency: "USD" },
    expiry: {
      date: isoAt(30 * DAY_MS),
      confidence: 0.8,
      type: "soft",
    },
    metadata: {
      category: ["test"],
      tags: ["test"],
      normalized_at: "2026-05-01T00:00:00Z",
      confidence_score: 0.8,
      status: "active",
    },
    ...rest,
  };
  if (expiryDate !== undefined) {
    deal.expiry = { ...deal.expiry, date: expiryDate };
  }
  return deal;
}

interface KvBacking {
  get<T>(key: string, type?: string): Promise<T | null>;
  put(key: string, value: string): Promise<void>;
}

function createMockEnv(): { env: Env; kv: Map<string, string> } {
  const kv = new Map<string, string>();
  const backing: KvBacking = {
    async get<T>(key: string, type?: string) {
      const value = kv.get(key);
      if (value === undefined) return null;
      if (type === "json") return JSON.parse(value) as T;
      return value as T;
    },
    async put(key: string, value: string) {
      kv.set(key, value);
    },
  };
  const env = { DEALS_PROD: backing } as unknown as Env;
  return { env, kv };
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// ============================================================================
// Tests
// ============================================================================

describe("expiration helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==========================================================================
  // isExpiringSoon
  // ==========================================================================

  describe("isExpiringSoon", () => {
    it("returns true for an active deal inside the window", () => {
      const deal = createDeal({ expiryDate: isoAt(5 * DAY_MS) });
      expect(isExpiringSoon(deal, 7)).toBe(true);
    });

    it("returns false when the deal expires beyond the window", () => {
      const deal = createDeal({ expiryDate: isoAt(8 * DAY_MS) });
      expect(isExpiringSoon(deal, 7)).toBe(false);
    });

    it("returns true when days-until-expiry equals the window exactly", () => {
      const deal = createDeal({ expiryDate: isoAt(7 * DAY_MS - HOUR_MS) });
      expect(isExpiringSoon(deal, 7)).toBe(true);
    });

    it("rounds fractional days up before comparing", () => {
      const deal = createDeal({ expiryDate: isoAt(2 * DAY_MS + 1) });
      expect(isExpiringSoon(deal, 3)).toBe(true);
      expect(isExpiringSoon(deal, 2)).toBe(false);
    });

    it("returns false for an already expired deal even with a wide window", () => {
      const deal = createDeal({ expiryDate: isoAt(-5 * DAY_MS) });
      expect(isExpiringSoon(deal, 365)).toBe(false);
    });

    it("returns false at exactly the expiry instant", () => {
      const deal = createDeal({ expiryDate: NOW.toISOString() });
      expect(isExpiringSoon(deal, 30)).toBe(false);
    });

    it("returns false when the deal has no expiry date", () => {
      const deal = createDeal();
      deal.expiry.date = undefined;
      expect(isExpiringSoon(deal, 30)).toBe(false);
    });

    it("returns false for non-active deals regardless of expiry", () => {
      const quarantined = createDeal({
        metadata: {
          category: [],
          tags: [],
          normalized_at: "2026-05-01T00:00:00Z",
          confidence_score: 0.8,
          status: "quarantined",
        },
        expiryDate: isoAt(3 * DAY_MS),
      });
      const rejected = createDeal({
        metadata: {
          category: [],
          tags: [],
          normalized_at: "2026-05-01T00:00:00Z",
          confidence_score: 0.8,
          status: "rejected",
        },
        expiryDate: isoAt(3 * DAY_MS),
      });
      expect(isExpiringSoon(quarantined, 30)).toBe(false);
      expect(isExpiringSoon(rejected, 30)).toBe(false);
    });

    it("treats malformed expiry dates as not expiring soon", () => {
      const deal = createDeal({ expiryDate: "not-a-date" });
      expect(isExpiringSoon(deal, 30)).toBe(false);
    });
  });

  // ==========================================================================
  // calculateExpiryUrgency
  // ==========================================================================

  describe("calculateExpiryUrgency", () => {
    it("returns 1.0 for deals already past expiry", () => {
      const deal = createDeal({ expiryDate: isoAt(-1 * DAY_MS) });
      expect(calculateExpiryUrgency(deal)).toBe(1.0);
    });

    it("returns 1.0 at exactly the expiry instant", () => {
      const deal = createDeal({ expiryDate: NOW.toISOString() });
      expect(calculateExpiryUrgency(deal)).toBe(1.0);
    });

    it("returns 0.8 within the 7-day band", () => {
      const deal = createDeal({ expiryDate: isoAt(5 * DAY_MS) });
      expect(calculateExpiryUrgency(deal)).toBe(0.8);
    });

    it("returns 0.8 when days-until-expiry rounds up to exactly 7", () => {
      const deal = createDeal({ expiryDate: isoAt(6 * DAY_MS + HOUR_MS) });
      expect(calculateExpiryUrgency(deal)).toBe(0.8);
    });

    it("returns 0.5 within the 30-day band", () => {
      const deal = createDeal({ expiryDate: isoAt(20 * DAY_MS) });
      expect(calculateExpiryUrgency(deal)).toBe(0.5);
    });

    it("returns 0.5 when days-until-expiry rounds up to exactly 30", () => {
      const deal = createDeal({
        expiryDate: isoAt(29 * DAY_MS + HOUR_MS),
      });
      expect(calculateExpiryUrgency(deal)).toBe(0.5);
    });

    it("returns 0.2 within the 90-day band", () => {
      const deal = createDeal({ expiryDate: isoAt(80 * DAY_MS) });
      expect(calculateExpiryUrgency(deal)).toBe(0.2);
    });

    it("returns 0.2 when days-until-expiry rounds up to exactly 90", () => {
      const deal = createDeal({
        expiryDate: isoAt(89 * DAY_MS + HOUR_MS),
      });
      expect(calculateExpiryUrgency(deal)).toBe(0.2);
    });

    it("returns 0 beyond the 90-day horizon", () => {
      const deal = createDeal({ expiryDate: isoAt(120 * DAY_MS) });
      expect(calculateExpiryUrgency(deal)).toBe(0);
    });

    it("returns 0 when the deal has no expiry date", () => {
      const deal = createDeal();
      deal.expiry.date = undefined;
      expect(calculateExpiryUrgency(deal)).toBe(0);
    });

    it("returns 0 for non-active deals", () => {
      const deal = createDeal({
        metadata: {
          category: [],
          tags: [],
          normalized_at: "2026-05-01T00:00:00Z",
          confidence_score: 0.8,
          status: "quarantined",
        },
        expiryDate: isoAt(3 * DAY_MS),
      });
      expect(calculateExpiryUrgency(deal)).toBe(0);
    });

    it("treats malformed expiry dates as zero urgency", () => {
      const deal = createDeal({ expiryDate: "not-a-date" });
      expect(calculateExpiryUrgency(deal)).toBe(0);
    });
  });

  // ==========================================================================
  // scheduleExpiryCheck
  // ==========================================================================

  describe("scheduleExpiryCheck", () => {
    it("persists the next check roughly one day ahead under the meta key", async () => {
      const { env, kv } = createMockEnv();

      await scheduleExpiryCheck(env);

      expect(kv.has(EXPIRY_CHECK_KEY)).toBe(true);
      const stored = JSON.parse(kv.get(EXPIRY_CHECK_KEY) ?? "{}") as {
        scheduled_at?: string;
        checked_at?: string;
      };
      expect(stored.checked_at).toBe(NOW.toISOString());
      const scheduledAt = new Date(stored.scheduled_at ?? "").getTime();
      // setHours targets 9 AM local time, so allow for timezone offsets.
      expect(scheduledAt).toBeGreaterThan(NOW.getTime() + 12 * HOUR_MS);
      expect(scheduledAt).toBeLessThan(NOW.getTime() + 40 * HOUR_MS);
    });
  });

  // ==========================================================================
  // Validation stats round-trip
  // ==========================================================================

  describe("storeValidationStats / getValidationStats", () => {
    it("stores stats under the validation stats key", async () => {
      const { env, kv } = createMockEnv();

      await storeValidationStats(env, {
        timestamp: NOW.toISOString(),
        total: 10,
        valid: 8,
        invalid: 2,
        errors: 0,
      });

      expect(kv.has(VALIDATION_STATS_KEY)).toBe(true);
    });

    it("round-trips stats through KV JSON", async () => {
      const { env } = createMockEnv();

      await storeValidationStats(env, {
        timestamp: NOW.toISOString(),
        total: 10,
        valid: 8,
        invalid: 2,
        errors: 0,
      });

      const stats = await getValidationStats(env);
      expect(stats).toEqual({
        timestamp: NOW.toISOString(),
        total: 10,
        valid: 8,
        invalid: 2,
        errors: 0,
      });
    });

    it("returns null when no stats have been stored", async () => {
      const { env } = createMockEnv();

      const stats = await getValidationStats(env);

      expect(stats).toBeNull();
    });
  });

  // ==========================================================================
  // getLastValidationResults
  // ==========================================================================

  describe("getLastValidationResults", () => {
    it("returns null when nothing has been recorded", async () => {
      const { env } = createMockEnv();

      const results = await getLastValidationResults(env);

      expect(results).toBeNull();
    });

    it("reads back previously stored sweep results", async () => {
      const { env, kv } = createMockEnv();
      const payload = {
        timestamp: NOW.toISOString(),
        results: { validated: 42, deactivated: 3, notified: 7 },
      };
      kv.set(LAST_VALIDATION_KEY, JSON.stringify(payload));

      const results = await getLastValidationResults(env);

      expect(results).toEqual(payload);
    });
  });

  // ==========================================================================
  // Notified expiring deals dedup window
  // ==========================================================================

  describe("getNotifiedExpiringDeals", () => {
    it("returns an empty list when nothing was recorded", async () => {
      const { env } = createMockEnv();

      const ids = await getNotifiedExpiringDeals(env);

      expect(ids).toEqual([]);
    });

    it("returns recently notified deal ids", async () => {
      const { env, kv } = createMockEnv();
      kv.set(
        NOTIFIED_EXPIRING_KEY,
        JSON.stringify({
          deals: ["deal-1", "deal-2"],
          notified_at: isoAt(-2 * HOUR_MS),
        }),
      );

      const ids = await getNotifiedExpiringDeals(env);

      expect(ids).toEqual(["deal-1", "deal-2"]);
    });

    it("drops notifications older than 24 hours", async () => {
      const { env, kv } = createMockEnv();
      kv.set(
        NOTIFIED_EXPIRING_KEY,
        JSON.stringify({
          deals: ["deal-1"],
          notified_at: isoAt(-25 * HOUR_MS),
        }),
      );

      const ids = await getNotifiedExpiringDeals(env);

      expect(ids).toEqual([]);
    });

    it("includes deals at exactly the 24-hour boundary cutoff", async () => {
      const { env, kv } = createMockEnv();
      kv.set(
        NOTIFIED_EXPIRING_KEY,
        JSON.stringify({
          deals: ["boundary-deal"],
          notified_at: isoAt(-24 * HOUR_MS),
        }),
      );

      const ids = await getNotifiedExpiringDeals(env);

      expect(ids).toEqual(["boundary-deal"]);
    });

    it("swallows malformed payloads and returns an empty list", async () => {
      const { env, kv } = createMockEnv();
      kv.set(NOTIFIED_EXPIRING_KEY, "{broken json");

      const ids = await getNotifiedExpiringDeals(env);

      expect(ids).toEqual([]);
    });
  });

  describe("recordNotifiedExpiringDeals", () => {
    it("merges new ids with existing ones and deduplicates", async () => {
      const { env, kv } = createMockEnv();
      kv.set(
        NOTIFIED_EXPIRING_KEY,
        JSON.stringify({
          deals: ["deal-1"],
          notified_at: isoAt(-1 * HOUR_MS),
        }),
      );

      await recordNotifiedExpiringDeals(env, ["deal-2", "deal-1"]);

      const stored = JSON.parse(kv.get(NOTIFIED_EXPIRING_KEY) ?? "{}") as {
        deals?: string[];
        notified_at?: string;
      };
      expect([...(stored.deals ?? [])].sort()).toEqual(["deal-1", "deal-2"]);
      expect(stored.notified_at).toBe(NOW.toISOString());
    });

    it("starts fresh when no prior record exists", async () => {
      const { env, kv } = createMockEnv();

      await recordNotifiedExpiringDeals(env, ["deal-9"]);

      const stored = JSON.parse(kv.get(NOTIFIED_EXPIRING_KEY) ?? "{}") as {
        deals?: string[];
      };
      expect(stored.deals).toEqual(["deal-9"]);
    });

    it("ignores prior records that fell outside the 24-hour window", async () => {
      const { env, kv } = createMockEnv();
      kv.set(
        NOTIFIED_EXPIRING_KEY,
        JSON.stringify({
          deals: ["stale-deal"],
          notified_at: isoAt(-48 * HOUR_MS),
        }),
      );

      await recordNotifiedExpiringDeals(env, ["fresh-deal"]);

      const stored = JSON.parse(kv.get(NOTIFIED_EXPIRING_KEY) ?? "{}") as {
        deals?: string[];
      };
      expect(stored.deals).toEqual(["fresh-deal"]);
    });
  });
});
