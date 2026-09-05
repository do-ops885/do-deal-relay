/**
 * NLQ AI Enhancer Tests (T-3)
 *
 * Covers worker/lib/nlq/ai: shouldUseAI matrix, enhance empty/fast/AI
 * paths, failure and invalid-JSON fallbacks, confidence clamping,
 * cache hit/miss, batch chunking, and the isComplexQuery helper.
 * The Ai binding is an injected stub; no gateway, KV credentials,
 * or network access is required.
 */

import { describe, it, expect, vi } from "vitest";
import type { Env } from "../../../worker/types";
import {
  AIQueryEnhancer,
  enhanceQuery,
  enhanceQueriesBatch,
  isComplexQuery,
} from "../../../worker/lib/nlq/ai/index";

vi.mock("../../../worker/lib/global-logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

function makeKvStore(): {
  store: Map<string, unknown>;
  kv: {
    get: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
  };
} {
  const store = new Map<string, unknown>();
  return {
    store,
    kv: {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      put: vi.fn(async (key: string, value: string) => {
        store.set(key, JSON.parse(value) as unknown);
      }),
      delete: vi.fn(),
      list: vi.fn(),
    },
  };
}

function makeEnv(
  kv: ReturnType<typeof makeKvStore>["kv"] | undefined = undefined,
): Env {
  return {
    ENVIRONMENT: "test",
    TRUST_THRESHOLD: "0.2",
    ...(kv === undefined ? {} : { DEALS_SOURCES: kv }),
  } as unknown as Env;
}

function makeAiStub(): { run: ReturnType<typeof vi.fn> } {
  return {
    run: vi.fn(async (_model: string, input: unknown) => {
      const prompt = (input as { prompt: string }).prompt;
      if (prompt.includes("Classify the search intent")) {
        return {
          response: JSON.stringify({ intent: "rank", confidence: 0.9 }),
        };
      }
      if (prompt.includes("Extract entities")) {
        return {
          response: JSON.stringify({
            entities: [{ type: "domain", value: "Coinbase", confidence: 0.9 }],
          }),
        };
      }
      if (prompt.includes("Expand this search query")) {
        return { response: JSON.stringify(["coinbase alternatives"]) };
      }
      return { response: "" };
    }),
  };
}

describe("shouldUseAI", () => {
  it("flags comparison and recommendation queries as complex", () => {
    const enhancer = new AIQueryEnhancer({} as unknown as Ai, makeEnv(), {
      useCache: false,
    });
    expect(enhancer.shouldUseAI("best crypto deals")).toBe(true);
    expect(enhancer.shouldUseAI("how do referrals work")).toBe(true);
    expect(enhancer.shouldUseAI("is this a scam")).toBe(true);
    expect(enhancer.shouldUseAI("wise vs revolut")).toBe(true);
  });

  it("treats simple and empty queries as non-complex", () => {
    const enhancer = new AIQueryEnhancer({} as unknown as Ai, makeEnv(), {
      useCache: false,
    });
    expect(enhancer.shouldUseAI("wise")).toBe(false);
    expect(enhancer.shouldUseAI("")).toBe(false);
    expect(enhancer.shouldUseAI("   ")).toBe(false);
  });
});

describe("enhance", () => {
  it("returns an empty shape for blank queries without calling AI", async () => {
    const ai = makeAiStub();
    const enhancer = new AIQueryEnhancer(ai as unknown as Ai, makeEnv(), {
      useCache: false,
    });

    const result = await enhancer.enhance("   ");

    expect(result.entities).toEqual([]);
    expect(result.intent).toEqual({ primary: "search", confidence: 0.5 });
    expect(result.aiConfidence).toBe(0.5);
    expect(ai.run).not.toHaveBeenCalled();
  });

  it("uses rule entities and intent-only AI for simple queries", async () => {
    const ai = makeAiStub();
    const enhancer = new AIQueryEnhancer(ai as unknown as Ai, makeEnv(), {
      useCache: false,
    });

    const result = await enhancer.enhance("wise crypto deals");

    expect(result.normalized).toBe("wise crypto deals");
    expect(result.entities.map((e) => e.type)).toContain("category");
    // Only the intent call reaches the model; entities/expansion stay local
    expect(ai.run).toHaveBeenCalledOnce();
    expect(result.expansion.expanded.length).toBeGreaterThan(0);
    expect(result.expansion.expanded).not.toContain("coinbase alternatives");
  });

  it("merges AI entities, intent, and expansions for complex queries", async () => {
    const ai = makeAiStub();
    const enhancer = new AIQueryEnhancer(ai as unknown as Ai, makeEnv(), {
      useCache: false,
    });

    const result = await enhancer.enhance("best crypto deals");

    expect(result.intent.primary).toBe("rank");
    expect(result.entities.map((e) => e.type)).toEqual(
      expect.arrayContaining(["sentiment", "category", "domain"]),
    );
    expect(result.filters.domains).toContain("coinbase");
    expect(result.filters.categories).toContain("crypto");
    expect(result.expansion.expanded).toContain("coinbase alternatives");
    expect(ai.run).toHaveBeenCalledTimes(3);
  });

  it("falls back gracefully when the model rejects", async () => {
    const ai = { run: vi.fn().mockRejectedValue(new Error("boom")) };
    const enhancer = new AIQueryEnhancer(ai as unknown as Ai, makeEnv(), {
      useCache: false,
    });

    const result = await enhancer.enhance("best crypto deals");

    expect(result.intent).toEqual({ primary: "search", confidence: 0.5 });
    expect(result.entities.length).toBeGreaterThan(0);
    expect(result.entities.map((e) => e.type)).not.toContain("domain");
    expect(result.expansion.expanded).not.toContain("coinbase alternatives");
  });

  it("falls back gracefully on invalid model JSON", async () => {
    const ai = { run: vi.fn().mockResolvedValue({ response: "not json {{{" }) };
    const enhancer = new AIQueryEnhancer(ai as unknown as Ai, makeEnv(), {
      useCache: false,
    });

    const result = await enhancer.enhance("best crypto deals");

    expect(result.intent).toEqual({ primary: "search", confidence: 0.5 });
    expect(result.entities.map((e) => e.type)).toEqual(
      expect.arrayContaining(["sentiment", "category"]),
    );
  });

  it("clamps out-of-range model confidences", async () => {
    const ai = {
      run: vi.fn(async (_model: string, input: unknown) => {
        const prompt = (input as { prompt: string }).prompt;
        if (prompt.includes("Classify the search intent")) {
          return {
            response: JSON.stringify({ intent: "rank", confidence: -2 }),
          };
        }
        if (prompt.includes("Extract entities")) {
          return {
            response: JSON.stringify({
              entities: [{ type: "domain", value: "Kraken", confidence: 5 }],
            }),
          };
        }
        return { response: JSON.stringify([]) };
      }),
    };
    const enhancer = new AIQueryEnhancer(ai as unknown as Ai, makeEnv(), {
      useCache: false,
    });

    const result = await enhancer.enhance("kraken deals");

    expect(result.intent.confidence).toBe(0);
    for (const entity of result.entities) {
      expect(entity.confidence).toBeGreaterThanOrEqual(0);
      expect(entity.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("applies the env trust threshold for negative sentiment", async () => {
    const ai = {
      run: vi.fn(async () => ({
        response: JSON.stringify({ intent: "search", confidence: 0.5 }),
      })),
    };
    const enhancer = new AIQueryEnhancer(ai as unknown as Ai, makeEnv(), {
      useCache: false,
    });

    const result = await enhancer.enhance("avoid this scam broker");

    expect(result.filters.sentimentFilter).toBe("negative");
    expect(result.filters.minTrustScore).toBe(0.2);
  });

  it("serves the second identical query from cache", async () => {
    const ai = makeAiStub();
    const { kv } = makeKvStore();
    const enhancer = new AIQueryEnhancer(ai as unknown as Ai, makeEnv(kv), {
      minConfidenceThreshold: 0.1,
    });

    const first = await enhancer.enhance("best crypto deals");
    const callsAfterFirst = ai.run.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    const second = await enhancer.enhance("best crypto deals");

    expect(ai.run.mock.calls.length).toBe(callsAfterFirst);
    expect(second.intent).toEqual(first.intent);
    expect(second.entities).toEqual(first.entities);
  });

  it("truncates queries to maxQueryLength", async () => {
    const ai = makeAiStub();
    const enhancer = new AIQueryEnhancer(ai as unknown as Ai, makeEnv(), {
      useCache: false,
      maxQueryLength: 10,
    });

    const result = await enhancer.enhance("best crypto deals for trading");

    expect(result.normalized).toBe("best crypt");
  });
});

describe("convenience functions", () => {
  it("enhanceQuery enhances through a shared path", async () => {
    const ai = makeAiStub();

    const result = await enhanceQuery("wise", ai as unknown as Ai, makeEnv(), {
      useCache: false,
    });

    expect(result.normalized).toBe("wise");
    expect(result.intent.primary).toBe("rank");
  });

  it("enhanceQueriesBatch handles more than one chunk", async () => {
    const ai = makeAiStub();
    const queries = [
      "wise",
      "revolut",
      "coinbase",
      "kraken",
      "etoro",
      "freetrade",
    ];

    const results = await enhanceQueriesBatch(
      queries,
      ai as unknown as Ai,
      makeEnv(),
      { useCache: false },
    );

    expect(results).toHaveLength(6);
    expect(results.map((r) => r.normalized)).toEqual(queries);
  });

  it("isComplexQuery mirrors shouldUseAI", () => {
    expect(isComplexQuery("best crypto")).toBe(true);
    expect(isComplexQuery("wise")).toBe(false);
  });
});
