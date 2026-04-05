import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateId,
  getWebhookKV,
  DEFAULT_RETRY_POLICY,
  WEBHOOK_RATE_LIMIT_TTL,
} from "../../../worker/lib/webhook/types";
import type { Env } from "../../../worker/types";

describe("Webhook Types", () => {
  // ============================================================================
  // generateId() Tests
  // ============================================================================

  describe("generateId()", () => {
    it("should return a string", () => {
      const id = generateId();
      expect(typeof id).toBe("string");
    });

    it("should include timestamp component", () => {
      const id = generateId();
      const parts = id.split("_");
      expect(parts.length).toBeGreaterThanOrEqual(2);
      // First part should be base36 timestamp
      expect(() => parseInt(parts[0], 36)).not.toThrow();
    });

    it("should include UUID component", () => {
      const id = generateId();
      const parts = id.split("_");
      // UUID hex part (first segment of UUID before first dash)
      expect(parts[1]).toMatch(/^[0-9a-f]+$/);
    });

    it("should generate unique IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateId());
      }
      expect(ids.size).toBe(100);
    });

    it("should generate IDs with consistent format", () => {
      const id = generateId();
      // Format: <base36_timestamp>_<uuid_segment>
      // base36 can contain both digits and letters
      expect(id).toMatch(/^[0-9a-z]+_[0-9a-f]+$/);
    });
  });

  // ============================================================================
  // getWebhookKV() Tests
  // ============================================================================

  describe("getWebhookKV()", () => {
    it("should prefer DEALS_WEBHOOKS over DEALS_STAGING", () => {
      const mockKvWebhooks = { get: vi.fn(), put: vi.fn() } as any;
      const mockKvStaging = { get: vi.fn(), put: vi.fn() } as any;
      const env = {
        DEALS_WEBHOOKS: mockKvWebhooks,
        DEALS_STAGING: mockKvStaging,
      } as any;

      const result = getWebhookKV(env);
      expect(result).toBe(mockKvWebhooks);
    });

    it("should fallback to DEALS_STAGING when DEALS_WEBHOOKS is absent", () => {
      const mockKvStaging = { get: vi.fn(), put: vi.fn() } as any;
      const env = {
        DEALS_STAGING: mockKvStaging,
      } as any;

      const result = getWebhookKV(env);
      expect(result).toBe(mockKvStaging);
    });

    it("should return DEALS_WEBHOOKS when it is the only binding", () => {
      const mockKvWebhooks = { get: vi.fn(), put: vi.fn() } as any;
      const env = {
        DEALS_WEBHOOKS: mockKvWebhooks,
      } as any;

      const result = getWebhookKV(env);
      expect(result).toBe(mockKvWebhooks);
    });

    it("should return null when no KV bindings are available", () => {
      const env = {} as any;

      const result = getWebhookKV(env);
      expect(result).toBeNull();
    });

    it("should return null when both bindings are undefined", () => {
      const env = {
        DEALS_WEBHOOKS: undefined,
        DEALS_STAGING: undefined,
      } as any;

      const result = getWebhookKV(env);
      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // DEFAULT_RETRY_POLICY Tests
  // ============================================================================

  describe("DEFAULT_RETRY_POLICY", () => {
    it("should have max_attempts of 5", () => {
      expect(DEFAULT_RETRY_POLICY.max_attempts).toBe(5);
    });

    it("should have initial_delay_ms of 1000", () => {
      expect(DEFAULT_RETRY_POLICY.initial_delay_ms).toBe(1000);
    });

    it("should have max_delay_ms of 60000", () => {
      expect(DEFAULT_RETRY_POLICY.max_delay_ms).toBe(60000);
    });

    it("should have backoff_multiplier of 2", () => {
      expect(DEFAULT_RETRY_POLICY.backoff_multiplier).toBe(2);
    });

    it("should have all required RetryPolicy fields", () => {
      expect(DEFAULT_RETRY_POLICY).toHaveProperty("max_attempts");
      expect(DEFAULT_RETRY_POLICY).toHaveProperty("initial_delay_ms");
      expect(DEFAULT_RETRY_POLICY).toHaveProperty("max_delay_ms");
      expect(DEFAULT_RETRY_POLICY).toHaveProperty("backoff_multiplier");
    });

    it("should produce reasonable backoff sequence", () => {
      const { initial_delay_ms, backoff_multiplier, max_delay_ms } =
        DEFAULT_RETRY_POLICY;
      // Attempt 1: 1000ms, Attempt 2: 2000ms, Attempt 3: 4000ms, Attempt 4: 8000ms, Attempt 5: 16000ms
      for (let attempt = 1; attempt <= 5; attempt++) {
        const delay =
          initial_delay_ms * Math.pow(backoff_multiplier, attempt - 1);
        expect(delay).toBeLessThanOrEqual(max_delay_ms);
        expect(delay).toBeGreaterThan(0);
      }
    });
  });

  // ============================================================================
  // WEBHOOK_RATE_LIMIT_TTL Tests
  // ============================================================================

  describe("WEBHOOK_RATE_LIMIT_TTL", () => {
    it("should equal 3600 seconds (1 hour)", () => {
      expect(WEBHOOK_RATE_LIMIT_TTL).toBe(3600);
    });

    it("should be a positive integer", () => {
      expect(WEBHOOK_RATE_LIMIT_TTL).toBeGreaterThan(0);
      expect(Number.isInteger(WEBHOOK_RATE_LIMIT_TTL)).toBe(true);
    });
  });
});
