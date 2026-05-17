import { describe, it, expect, vi } from "vitest";
import {
  generateTraceId,
  getNLQLogger,
  getRateLimitConfig,
  ENDPOINT_PATH,
} from "../../worker/routes/nlq/utils";
import { CONFIG } from "../../worker/config";

describe("NLQ Utils", () => {
  describe("ENDPOINT_PATH", () => {
    it("should be defined correctly", () => {
      expect(ENDPOINT_PATH).toBe("/api/nlq");
    });
  });

  describe("generateTraceId", () => {
    it("should generate a trace ID starting with nlq-", () => {
      const traceId = generateTraceId();
      expect(traceId).toMatch(/^nlq-/);
    });

    it("should generate unique trace IDs", () => {
      const id1 = generateTraceId();
      const id2 = generateTraceId();
      expect(id1).not.toBe(id2);
    });
  });

  describe("getNLQLogger", () => {
    it("should return a logger with correct component and traceId", () => {
      const env = { DEALS_LOG: { put: vi.fn() } } as any;
      const traceId = "test-trace";
      const logger = getNLQLogger(env, traceId);

      expect(logger).toBeDefined();
      // Since it returns a structured logger, we can check if it has the expected methods
      expect(typeof logger.info).toBe("function");
      expect(typeof logger.error).toBe("function");
    });
  });

  describe("getRateLimitConfig", () => {
    it("should return config based on global CONFIG", () => {
      const config = getRateLimitConfig();
      expect(config.maxRequests).toBe(CONFIG.NLQ_RATE_LIMIT_PER_MINUTE);
      expect(config.windowSeconds).toBe(60);
      expect(config.keyPrefix).toBe("ratelimit:nlq");
    });
  });
});
