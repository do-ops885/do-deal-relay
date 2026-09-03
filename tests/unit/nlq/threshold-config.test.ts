import { describe, it, expect } from "vitest";
import { buildFiltersFromEntities } from "../../../worker/lib/nlq/hybrid/rule-classifier";
import { AIQueryEnhancer } from "../../../worker/lib/nlq/ai/index";
import type { Env } from "../../../worker/types";

describe("NLQ Threshold Configuration", () => {
  const mockEnv = {
    ENVIRONMENT: "test",
    GITHUB_REPO: "test/repo",
    NOTIFICATION_THRESHOLD: "100",
    TRUST_THRESHOLD: "0.2",
  } as Env;

  describe("Rule-based classifier", () => {
    it("should apply environment-specific threshold to negative sentiment filters", () => {
      const entities = [
        {
          type: "sentiment" as const,
          value: "terrible",
          confidence: 0.9,
          metadata: { impact: -0.5 },
        },
      ];

      const filters = buildFiltersFromEntities(entities, mockEnv);
      expect(filters.minTrustScore).toBe(0.2);
    });

    it("should use default threshold if env is not provided", () => {
      const entities = [
        {
          type: "sentiment" as const,
          value: "terrible",
          confidence: 0.9,
          metadata: { impact: -0.5 },
        },
      ];

      const filters = buildFiltersFromEntities(entities);
      expect(filters.minTrustScore).toBe(0.3);
    });
  });

  describe("AI-based classifier", () => {
    it("should apply environment-specific threshold in buildFilters", async () => {
      const mockAi = {} as Ai;
      const enhancer = new AIQueryEnhancer(mockAi, mockEnv);

      const entities = [
        {
          type: "sentiment" as const,
          value: "terrible",
          confidence: 0.9,
          metadata: { impact: -1 },
        },
      ];

      // Accessing private method for testing purposes
      const filters = (enhancer as any).buildFilters(entities, mockEnv);
      expect(filters.minTrustScore).toBe(0.2);
    });
  });
});
