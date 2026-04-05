/**
 * NLQ Utilities Tests
 *
 * Tests for the NLQ utility functions (utils.ts).
 * Covers trace ID generation, logger creation, and rate limit config.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { KVNamespace, D1Database } from "@cloudflare/workers-types";
import {
  generateTraceId,
  getNLQLogger,
  getRateLimitConfig,
  ENDPOINT_PATH,
} from "../../../worker/routes/nlq/utils";
import type { Env } from "../../../worker/types";

describe("NLQ Utilities", () => {
  let mockEnv: Env;

  beforeEach(() => {
    mockEnv = {
      DEALS_PROD: {} as KVNamespace,
      DEALS_STAGING: {} as KVNamespace,
      DEALS_LOG: {
        get: vi.fn(async () => null),
        put: vi.fn(async () => {}),
        delete: vi.fn(async () => {}),
      } as unknown as KVNamespace,
      DEALS_LOCK: {} as KVNamespace,
      DEALS_SOURCES: {} as KVNamespace,
      DEALS_DB: {} as D1Database,
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
      NOTIFICATION_THRESHOLD: "100",
    } as Env;
  });

  // ============================================================================
  // ENDPOINT_PATH
  // ============================================================================

  describe("ENDPOINT_PATH", () => {
    it("should be defined as /api/nlq", () => {
      expect(ENDPOINT_PATH).toBe("/api/nlq");
    });

    it("should be a string type", () => {
      expect(typeof ENDPOINT_PATH).toBe("string");
    });

    it("should start with /api", () => {
      expect(ENDPOINT_PATH).toMatch(/^\/api/);
    });
  });

  // ============================================================================
  // generateTraceId
  // ============================================================================

  describe("generateTraceId", () => {
    it("should generate a trace ID starting with nlq-", () => {
      const traceId = generateTraceId();

      expect(traceId).toMatch(/^nlq-/);
    });

    it("should include a timestamp component", () => {
      const traceId = generateTraceId();
      const parts = traceId.split("-");

      // Second part should be a large number (timestamp)
      const timestamp = parseInt(parts[1], 10);
      expect(timestamp).toBeGreaterThan(1000000000000);
      expect(timestamp).toBeLessThan(Date.now() + 1000);
    });

    it("should include a random suffix", () => {
      const traceId = generateTraceId();
      const parts = traceId.split("-");

      // Third part should be a random alphanumeric string
      expect(parts[2]).toMatch(/^[a-z0-9]+$/);
    });

    it("should generate unique IDs on consecutive calls", () => {
      const id1 = generateTraceId();
      const id2 = generateTraceId();

      expect(id1).not.toBe(id2);
    });

    it("should generate IDs with consistent format", () => {
      const traceId = generateTraceId();

      // Format: nlq-{timestamp}-{random}
      expect(traceId).toMatch(/^nlq-\d+-[a-z0-9]+$/);
    });

    it("should generate IDs with reasonable length", () => {
      const traceId = generateTraceId();

      // Should be reasonably short for logging
      expect(traceId.length).toBeGreaterThan(10);
      expect(traceId.length).toBeLessThan(50);
    });

    it("should work with rapid successive calls", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateTraceId());
      }

      // Most should be unique (some may collide if called in same ms)
      expect(ids.size).toBeGreaterThan(90);
    });

    it("should not contain special characters", () => {
      const traceId = generateTraceId();

      expect(traceId).toMatch(/^[a-z0-9-]+$/);
    });
  });

  // ============================================================================
  // getNLQLogger
  // ============================================================================

  describe("getNLQLogger", () => {
    it("should return a logger object", () => {
      const traceId = generateTraceId();
      const logger = getNLQLogger(mockEnv, traceId);

      expect(logger).toBeDefined();
      expect(typeof logger).toBe("object");
    });

    it("should return a logger with info method", () => {
      const traceId = generateTraceId();
      const logger = getNLQLogger(mockEnv, traceId);

      expect(typeof logger.info).toBe("function");
    });

    it("should return a logger with error method", () => {
      const traceId = generateTraceId();
      const logger = getNLQLogger(mockEnv, traceId);

      expect(typeof logger.error).toBe("function");
    });

    it("should return a logger with warn method", () => {
      const traceId = generateTraceId();
      const logger = getNLQLogger(mockEnv, traceId);

      expect(typeof logger.warn).toBe("function");
    });

    it("should return a logger with debug method", () => {
      const traceId = generateTraceId();
      const logger = getNLQLogger(mockEnv, traceId);

      expect(typeof logger.debug).toBe("function");
    });

    it("should return a logger with withPhase method", () => {
      const traceId = generateTraceId();
      const logger = getNLQLogger(mockEnv, traceId);

      expect(typeof logger.withPhase).toBe("function");
    });

    it("should create independent loggers for different trace IDs", () => {
      const logger1 = getNLQLogger(mockEnv, "trace-1");
      const logger2 = getNLQLogger(mockEnv, "trace-2");

      expect(logger1).not.toBe(logger2);
    });

    it("should not throw when env has minimal properties", () => {
      const minimalEnv = {
        DEALS_LOG: {
          get: vi.fn(async () => null),
          put: vi.fn(async () => {}),
          delete: vi.fn(async () => {}),
        } as unknown as KVNamespace,
      } as Env;

      expect(() => getNLQLogger(minimalEnv, "trace-1")).not.toThrow();
    });
  });

  // ============================================================================
  // getRateLimitConfig
  // ============================================================================

  describe("getRateLimitConfig", () => {
    it("should return an object with expected properties", () => {
      const config = getRateLimitConfig();

      expect(config).toHaveProperty("maxRequests");
      expect(config).toHaveProperty("windowSeconds");
      expect(config).toHaveProperty("keyPrefix");
    });

    it("should use NLQ rate limit from config (30 per minute)", () => {
      const config = getRateLimitConfig();

      expect(config.maxRequests).toBe(30);
    });

    it("should use 60 second window", () => {
      const config = getRateLimitConfig();

      expect(config.windowSeconds).toBe(60);
    });

    it("should use nlq key prefix", () => {
      const config = getRateLimitConfig();

      expect(config.keyPrefix).toBe("ratelimit:nlq");
    });

    it("should return consistent config on multiple calls", () => {
      const config1 = getRateLimitConfig();
      const config2 = getRateLimitConfig();

      expect(config1.maxRequests).toBe(config2.maxRequests);
      expect(config1.windowSeconds).toBe(config2.windowSeconds);
      expect(config1.keyPrefix).toBe(config2.keyPrefix);
    });

    it("should return a new object each call (not cached reference)", () => {
      const config1 = getRateLimitConfig();
      const config2 = getRateLimitConfig();

      expect(config1).not.toBe(config2);
    });

    it("should have positive maxRequests", () => {
      const config = getRateLimitConfig();

      expect(config.maxRequests).toBeGreaterThan(0);
    });

    it("should have positive windowSeconds", () => {
      const config = getRateLimitConfig();

      expect(config.windowSeconds).toBeGreaterThan(0);
    });

    it("should have a non-empty key prefix", () => {
      const config = getRateLimitConfig();

      expect(config.keyPrefix.length).toBeGreaterThan(0);
    });

    it("should have key prefix that contains nlq", () => {
      const config = getRateLimitConfig();

      expect(config.keyPrefix).toContain("nlq");
    });
  });
});
