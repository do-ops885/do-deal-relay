import { describe, it, expect } from "vitest";
import * as nlqExports from "../../../worker/lib/nlq/index";

describe("NLQ Module Exports", () => {
  it("should export all expected classes and functions", () => {
    // AI exports
    expect(nlqExports.AIQueryEnhancer).toBeDefined();
    expect(nlqExports.enhanceQuery).toBeDefined();
    expect(nlqExports.isComplexQuery).toBeDefined();
    expect(nlqExports.SYNONYM_MAP).toBeDefined();

    // Hybrid exports
    expect(nlqExports.HybridClassifier).toBeDefined();
    expect(nlqExports.classifyQuery).toBeDefined();
    expect(nlqExports.shouldUseAI).toBeDefined();

    // Parser exports
    expect(nlqExports.tokenize).toBeDefined();
    expect(nlqExports.parseQuery).toBeDefined();
    expect(nlqExports.extractEntities).toBeDefined();

    // Query Builder exports
    expect(nlqExports.buildStructuredQuery).toBeDefined();
    expect(nlqExports.executeStructuredQuery).toBeDefined();
    expect(nlqExports.explainQuery).toBeDefined();
  });
});
