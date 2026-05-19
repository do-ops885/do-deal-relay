import { describe, it, expect } from "vitest";
import {
  getTrustThreshold,
  validateConfig,
} from "../../worker/lib/config-utils";
import { CONFIG } from "../../worker/config";
import type { Env } from "../../worker/types";

describe("Config Utilities", () => {
  const mockEnv = {
    ENVIRONMENT: "test",
    GITHUB_REPO: "test/repo",
    NOTIFICATION_THRESHOLD: "100",
    DEALS_PROD: {},
    DEALS_LOG: {},
    DEALS_LOCK: {},
    DEALS_STAGING: {},
    DEALS_SOURCES: {},
    AI_GATEWAY_URL: "http://test",
    WEBHOOK_SECRET: "test-secret",
    API_ENCRYPTION_KEY: "test-key",
    DEALS_DB: {} as any,
    TRUST_THRESHOLD: "0.3",
    WEBHOOK_SECRET: "test-secret",
    API_ENCRYPTION_KEY: "test-key",
    DEALS_DB: {} as any,
  } as unknown as Env;

  describe("getTrustThreshold", () => {
    it("should return default value when TRUST_THRESHOLD is not set", () => {
      expect(getTrustThreshold(mockEnv)).toBe(CONFIG.MIN_TRUST_SCORE);
    });

    it("should return parsed value when TRUST_THRESHOLD is valid", () => {
      const env = { ...mockEnv, TRUST_THRESHOLD: "0.5" };
      expect(getTrustThreshold(env)).toBe(0.5);
    });

    it("should return default value when TRUST_THRESHOLD is invalid", () => {
      const env = { ...mockEnv, TRUST_THRESHOLD: "invalid" };
      expect(getTrustThreshold(env)).toBe(CONFIG.MIN_TRUST_SCORE);
    });

    it("should clamp value to 0 if TRUST_THRESHOLD is negative", () => {
      const env = { ...mockEnv, TRUST_THRESHOLD: "-0.5" };
      expect(getTrustThreshold(env)).toBe(0);
    });

    it("should clamp value to 1 if TRUST_THRESHOLD is greater than 1", () => {
      const env = { ...mockEnv, TRUST_THRESHOLD: "1.5" };
      expect(getTrustThreshold(env)).toBe(1);
    });
  });

  describe("validateConfig", () => {
    it("should throw when mandatory config is missing", () => {
      const env = { ...mockEnv } as any;
      delete env.DEALS_PROD;
      expect(() => validateConfig(env)).toThrow(
        "Missing required config: DEALS_PROD",
      );
    });

    it("should not throw when mandatory config is present and valid", () => {
      const env = { ...mockEnv, TRUST_THRESHOLD: "0.5" };
      expect(() => validateConfig(env)).not.toThrow();
    });

    it("should throw when TRUST_THRESHOLD is not a number", () => {
      const env = { ...mockEnv, TRUST_THRESHOLD: "abc" };
      expect(() => validateConfig(env)).toThrow(
        "TRUST_THRESHOLD must be a number between 0 and 1",
      );
    });

    it("should throw when TRUST_THRESHOLD is below 0", () => {
      const env = { ...mockEnv, TRUST_THRESHOLD: "-0.1" };
      expect(() => validateConfig(env)).toThrow(
        "TRUST_THRESHOLD must be a number between 0 and 1",
      );
    });

    it("should throw when TRUST_THRESHOLD is above 1", () => {
      const env = { ...mockEnv, TRUST_THRESHOLD: "1.1" };
      expect(() => validateConfig(env)).toThrow(
        "TRUST_THRESHOLD must be a number between 0 and 1",
      );
    });
  });
});
