/**
 * NLQ Rule Classifier Tests (T-3)
 *
 * Covers worker/lib/nlq/hybrid/rule-classifier.ts: intent detection,
 * rule entity extraction, expansions, filter building, confidence math,
 * normalization, and the classifyWithRules fast path. Fully synchronous
 * with no mocks required.
 */

import { describe, it, expect } from "vitest";
import type { Env } from "../../../worker/types";
import {
  classifyWithRules,
  normalizeQuery,
  detectIntent,
  extractEntitiesWithRules,
  buildExpansions,
  buildFiltersFromEntities,
  calculateRuleConfidence,
} from "../../../worker/lib/nlq/hybrid/rule-classifier";
import type { Entity, ExtractedIntent } from "../../../worker/lib/nlq/ai/types";

const mockEnv = {
  ENVIRONMENT: "test",
  TRUST_THRESHOLD: "0.2",
} as unknown as Env;

function intent(
  primary: ExtractedIntent["primary"],
  confidence: number,
): ExtractedIntent {
  return { primary, confidence };
}

describe("detectIntent", () => {
  it("detects rank for best/top queries", () => {
    expect(detectIntent("best crypto deals").primary).toBe("rank");
    expect(detectIntent("top trading apps").primary).toBe("rank");
  });

  it("detects compare for versus queries", () => {
    expect(detectIntent("compare wise versus revolut").primary).toBe("compare");
    expect(detectIntent("alternatives to coinbase").primary).toBe("compare");
  });

  it("detects filter for cash-only queries", () => {
    expect(detectIntent("cash only deals").primary).toBe("filter");
  });

  it("detects discover for listing queries", () => {
    expect(detectIntent("show all deals").primary).toBe("discover");
  });

  it("defaults single words and empty input to search", () => {
    expect(detectIntent("wise")).toEqual({
      primary: "search",
      confidence: 0.7,
    });
    expect(detectIntent("")).toEqual({ primary: "search", confidence: 0.5 });
  });
});

describe("extractEntitiesWithRules", () => {
  it("extracts categories and reward types", () => {
    const entities = extractEntitiesWithRules("crypto wallet with cash bonus");

    expect(entities).toContainEqual(
      expect.objectContaining({ type: "category", value: "crypto" }),
    );
    expect(entities).toContainEqual(
      expect.objectContaining({ type: "reward_type", value: "cash" }),
    );
  });

  it("extracts positive and negative sentiment with impact", () => {
    const positive = extractEntitiesWithRules("best broker");
    expect(positive).toContainEqual(
      expect.objectContaining({
        type: "sentiment",
        value: "positive",
        metadata: { impact: 0.3 },
      }),
    );

    const negative = extractEntitiesWithRules("avoid this scam");
    expect(negative).toContainEqual(
      expect.objectContaining({
        type: "sentiment",
        value: "negative",
        metadata: { impact: -0.5 },
      }),
    );
  });

  it("extracts domains with high confidence", () => {
    const entities = extractEntitiesWithRules("deals on coinbase.com today");

    expect(entities).toContainEqual({
      type: "domain",
      value: "coinbase.com",
      confidence: 0.85,
    });
  });

  it("returns no entities for plain queries", () => {
    expect(extractEntitiesWithRules("hello there")).toEqual([]);
  });
});

describe("buildExpansions", () => {
  it("expands category synonyms into query variants", () => {
    const entities: Entity[] = [
      { type: "category", value: "crypto", confidence: 0.8 },
    ];

    const expansion = buildExpansions("crypto deals", entities);

    expect(expansion.expanded).toHaveLength(3);
    expect(expansion.expanded).toContain("cryptocurrency deals");
    expect(expansion.synonyms.get("crypto")).toEqual([
      "cryptocurrency",
      "digital assets",
      "crypto exchange",
    ]);
  });

  it("returns empty expansions without a category", () => {
    const expansion = buildExpansions("wise deals", []);

    expect(expansion.expanded).toEqual([]);
    expect(expansion.synonyms.size).toBe(0);
  });
});

describe("buildFiltersFromEntities", () => {
  it("ranks up positive sentiment", () => {
    const filters = buildFiltersFromEntities(
      [
        {
          type: "sentiment",
          value: "positive",
          confidence: 0.7,
          metadata: { impact: 0.3 },
        },
      ],
      mockEnv,
    );

    expect(filters.minTrustScore).toBe(0.8);
    expect(filters.minRanking).toBe(0.8);
  });

  it("uses the default threshold for negative sentiment without env", () => {
    const filters = buildFiltersFromEntities([
      {
        type: "sentiment",
        value: "negative",
        confidence: 0.7,
        metadata: { impact: -0.5 },
      },
    ]);

    expect(filters.sentimentFilter).toBe("negative");
    expect(filters.minTrustScore).toBe(0.3);
  });

  it("accumulates categories, rewards, and domains", () => {
    const filters = buildFiltersFromEntities(
      [
        { type: "category", value: "crypto", confidence: 0.8 },
        { type: "reward_type", value: "cash", confidence: 0.75 },
        { type: "domain", value: "wise.com", confidence: 0.85 },
      ],
      mockEnv,
    );

    expect(filters.categories).toEqual(["crypto"]);
    expect(filters.rewardTypes).toEqual(["cash"]);
    expect(filters.domains).toEqual(["wise.com"]);
  });
});

describe("calculateRuleConfidence", () => {
  it("derives confidence from intent alone without entities", () => {
    expect(calculateRuleConfidence([], intent("search", 0.5))).toBeCloseTo(0.3);
  });

  it("boosts non-search intents and caps at 0.95", () => {
    const confidence = calculateRuleConfidence(
      [{ type: "domain", value: "wise.com", confidence: 0.85 }],
      intent("rank", 0.9),
    );
    expect(confidence).toBeCloseTo(0.895, 5);
    expect(confidence).toBeLessThanOrEqual(0.95);

    const capped = calculateRuleConfidence(
      [{ type: "domain", value: "wise.com", confidence: 1 }],
      intent("rank", 0.9),
    );
    expect(capped).toBeLessThanOrEqual(0.95);
  });
});

describe("normalizeQuery", () => {
  it("trims, lowercases, and collapses whitespace", () => {
    expect(normalizeQuery("  BEST   Crypto  ")).toBe("best crypto");
  });
});

describe("classifyWithRules", () => {
  it("classifies end to end with filters and timing", () => {
    const result = classifyWithRules("best crypto", Date.now(), mockEnv);

    expect(result.original).toBe("best crypto");
    expect(result.normalized).toBe("best crypto");
    expect(result.intent.primary).toBe("rank");
    expect(result.filters.minRanking).toBe(0.8);
    expect(result.aiConfidence).toBeGreaterThan(0);
    expect(typeof result.processingTimeMs).toBe("number");
  });
});
