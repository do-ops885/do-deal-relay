/**
 * NLQ Hybrid Classifier Tests (T-3)
 *
 * Covers worker/lib/nlq/hybrid: selectMethod routing, the shouldUseAI
 * helper, rule/AI dispatch with and without a model, batch order
 * restoration, stats, and convenience constructors. The Ai binding is an
 * injected stub backed by a Map KV; no gateway or network is required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env } from "../../../worker/types";
import {
  HybridClassifier,
  classifyQuery,
  classifyQueriesBatch,
  createClassifier,
} from "../../../worker/lib/nlq/hybrid/index";
import {
  selectMethod,
  shouldUseAI,
  DEFAULT_CLASSIFIER_OPTIONS,
} from "../../../worker/lib/nlq/hybrid/ai-decision";

vi.mock("../../../worker/lib/global-logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

function makeEnv(): Env {
  const store = new Map<string, unknown>();
  return {
    ENVIRONMENT: "test",
    TRUST_THRESHOLD: "0.2",
    DEALS_SOURCES: {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      put: vi.fn(async (key: string, value: string) => {
        store.set(key, JSON.parse(value) as unknown);
      }),
      delete: vi.fn(),
      list: vi.fn(),
    },
  } as unknown as Env;
}

function makeAiStub(): { run: ReturnType<typeof vi.fn> } {
  return {
    run: vi.fn(async (_model: string, input: unknown) => {
      const prompt = (input as { prompt: string }).prompt;
      if (prompt.includes("Classify the search intent")) {
        return {
          response: JSON.stringify({ intent: "compare", confidence: 0.85 }),
        };
      }
      if (prompt.includes("Extract entities")) {
        return {
          response: JSON.stringify({
            entities: [{ type: "domain", value: "Revolut", confidence: 0.9 }],
          }),
        };
      }
      if (prompt.includes("Expand this search query")) {
        return { response: JSON.stringify(["revolut rivals"]) };
      }
      return { response: "" };
    }),
  };
}

const LONG_QUERY = "find the very best trading deals with cash bonuses!!";
const COMPLEX_QUERY = "what is the best broker for crypto trading today?";

describe("selectMethod", () => {
  it("routes short queries to rules", () => {
    expect(selectMethod("wise", DEFAULT_CLASSIFIER_OPTIONS)).toBe("rule");
  });

  it("routes overlong queries to AI", () => {
    expect(selectMethod(LONG_QUERY, DEFAULT_CLASSIFIER_OPTIONS)).toBe("ai");
    expect(LONG_QUERY.length).toBeGreaterThan(
      DEFAULT_CLASSIFIER_OPTIONS.longQueryThreshold,
    );
  });

  it("routes mid-length complex queries to AI", () => {
    expect(COMPLEX_QUERY.length).toBeGreaterThan(
      DEFAULT_CLASSIFIER_OPTIONS.maxRuleQueryLength,
    );
    expect(COMPLEX_QUERY.length).toBeLessThanOrEqual(
      DEFAULT_CLASSIFIER_OPTIONS.longQueryThreshold,
    );
    expect(selectMethod(COMPLEX_QUERY, DEFAULT_CLASSIFIER_OPTIONS)).toBe("ai");
  });

  it("routes mid-length plain queries to rules", () => {
    const plain = "find trading deals with cash bonuses today!!";
    expect(plain.length).toBeGreaterThan(
      DEFAULT_CLASSIFIER_OPTIONS.maxRuleQueryLength,
    );
    expect(selectMethod(plain, DEFAULT_CLASSIFIER_OPTIONS)).toBe("rule");
  });
});

describe("shouldUseAI", () => {
  it("mirrors the length and complexity gates", () => {
    expect(shouldUseAI("wise")).toBe(false);
    expect(shouldUseAI("wise", { maxRuleQueryLength: 2 })).toBe(true);
    expect(shouldUseAI("best broker?")).toBe(true);
    expect(shouldUseAI("best broker?", { enableAIForComplex: false })).toBe(
      false,
    );
  });
});

describe("HybridClassifier", () => {
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    env = makeEnv();
  });

  it("uses rules for short queries without touching the model", async () => {
    const ai = makeAiStub();
    const classifier = new HybridClassifier(ai as unknown as Ai, env);

    const result = await classifier.classify("wise");

    expect(result.method).toBe("rule");
    expect(result.query.intent.primary).toBe("search");
    expect(ai.run).not.toHaveBeenCalled();
    expect(result.appliedFilters).toEqual(result.query.filters);
  });

  it("falls back to rules when AI is unavailable", async () => {
    const classifier = new HybridClassifier(null, env);

    const result = await classifier.classify(COMPLEX_QUERY);

    expect(result.method).toBe("ai");
    expect(result.query.intent.primary).toBeDefined();
    expect(typeof result.confidence).toBe("number");
  });

  it("uses the model for long queries", async () => {
    const ai = makeAiStub();
    const classifier = new HybridClassifier(ai as unknown as Ai, env);

    const result = await classifier.classify(LONG_QUERY);

    expect(result.method).toBe("ai");
    expect(ai.run).toHaveBeenCalled();
    expect(result.query.intent.primary).toBe("compare");
    expect(result.query.filters.domains).toContain("revolut");
  });

  it("restores original order across mixed batches", async () => {
    const ai = makeAiStub();
    const classifier = new HybridClassifier(ai as unknown as Ai, env);

    const results = await classifier.classifyBatch(["wise", LONG_QUERY]);

    expect(results).toHaveLength(2);
    expect(results[0]?.query.original).toBe("wise");
    expect(results[0]?.method).toBe("rule");
    expect(results[1]?.query.original).toBe(LONG_QUERY);
    expect(results[1]?.method).toBe("ai");
  });

  it("reports availability stats", () => {
    const withAi = new HybridClassifier({} as unknown as Ai, env);
    expect(withAi.getStats().aiAvailable).toBe(true);
    expect(withAi.getStats().cacheEnabled).toBe(true);

    const withoutAi = new HybridClassifier(null, env);
    expect(withoutAi.getStats().aiAvailable).toBe(false);
    expect(withoutAi.getStats().cacheEnabled).toBe(false);
  });
});

describe("convenience functions", () => {
  it("classifyQuery classifies a single query", async () => {
    const result = await classifyQuery("wise", null, makeEnv());

    expect(result.method).toBe("rule");
    expect(result.query.normalized).toBe("wise");
  });

  it("classifyQueriesBatch classifies several queries", async () => {
    const results = await classifyQueriesBatch(
      ["wise", "revolut"],
      null,
      makeEnv(),
    );

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.method)).toEqual(["rule", "rule"]);
  });

  it("createClassifier builds a classifier with options", async () => {
    const classifier = createClassifier(null, makeEnv(), {
      maxRuleQueryLength: 100,
    });

    const result = await classifier.classify(COMPLEX_QUERY);
    expect(result.method).toBe("rule");
  });
});
