import { describe, it, expect } from "vitest";
import { validateConfig } from "../../worker/lib/config-utils";
import type { Env } from "../../worker/types";
import type { KVNamespace } from "@cloudflare/workers-types";

describe("Enhanced Config Validation", () => {
  const mockKV = {} as KVNamespace;

  const validEnv = {
    DEALS_KV: mockKV,
    METRICS_KV: mockKV,
    AI_GATEWAY_URL: "https://gateway.ai",
    TRUST_THRESHOLD: "0.3",
    ENVIRONMENT: "test",
    GITHUB_REPO: "test/repo",
    NOTIFICATION_THRESHOLD: "100",
  } as unknown as Env;

  it("should pass with all required variables", () => {
    expect(() => validateConfig(validEnv)).not.toThrow();
  });

  it("should throw when DEALS_KV is missing", () => {
    const env = { ...validEnv } as any;
    delete env.DEALS_KV;
    expect(() => validateConfig(env)).toThrow(
      "Missing required config: DEALS_KV",
    );
  });

  it("should throw when METRICS_KV is missing", () => {
    const env = { ...validEnv } as any;
    delete env.METRICS_KV;
    expect(() => validateConfig(env)).toThrow(
      "Missing required config: METRICS_KV",
    );
  });

  it("should throw when AI_GATEWAY_URL is missing", () => {
    const env = { ...validEnv } as any;
    delete env.AI_GATEWAY_URL;
    expect(() => validateConfig(env)).toThrow(
      "Missing required config: AI_GATEWAY_URL",
    );
  });

  it("should throw when TRUST_THRESHOLD is missing", () => {
    const env = { ...validEnv } as any;
    delete env.TRUST_THRESHOLD;
    expect(() => validateConfig(env)).toThrow(
      "Missing required config: TRUST_THRESHOLD",
    );
  });

  it("should throw when multiple variables are missing", () => {
    const env = { ...validEnv } as any;
    delete env.DEALS_KV;
    delete env.METRICS_KV;
    expect(() => validateConfig(env)).toThrow(
      "Missing required config: DEALS_KV, METRICS_KV",
    );
  });

  describe("TRUST_THRESHOLD validation", () => {
    it("should throw when TRUST_THRESHOLD is not a number", () => {
      const env = { ...validEnv, TRUST_THRESHOLD: "abc" } as any;
      expect(() => validateConfig(env)).toThrow(
        "TRUST_THRESHOLD must be a number between 0 and 1",
      );
    });

    it("should throw when TRUST_THRESHOLD is < 0", () => {
      const env = { ...validEnv, TRUST_THRESHOLD: "-0.1" } as any;
      expect(() => validateConfig(env)).toThrow(
        "TRUST_THRESHOLD must be a number between 0 and 1",
      );
    });

    it("should throw when TRUST_THRESHOLD is > 1", () => {
      const env = { ...validEnv, TRUST_THRESHOLD: "1.1" } as any;
      expect(() => validateConfig(env)).toThrow(
        "TRUST_THRESHOLD must be a number between 0 and 1",
      );
    });
  });

  describe("Budget variable validation (retained logic)", () => {
    it("should throw when budget variable is not a number", () => {
      const env = { ...validEnv, CANDIDATE_BUDGET_GLOBAL: "abc" } as any;
      expect(() => validateConfig(env)).toThrow(
        'Invalid CANDIDATE_BUDGET_GLOBAL: "abc" is not a number',
      );
    });

    it("should throw when budget variable is negative", () => {
      const env = { ...validEnv, CANDIDATE_BUDGET_GLOBAL: "-10" } as any;
      expect(() => validateConfig(env)).toThrow(
        "Invalid CANDIDATE_BUDGET_GLOBAL: -10 must be non-negative",
      );
    });
  });
});
