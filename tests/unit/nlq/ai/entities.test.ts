import { describe, it, expect, vi } from "vitest";
import {
  extractEntities,
  extractRuleBasedEntities,
  deduplicateEntities,
} from "../../../../worker/lib/nlq/ai/entities";

describe("NLQ AI Entities", () => {
  const mockAi = {
    run: vi.fn(),
  };

  it("should extract rule-based entities correctly", () => {
    const entities: any[] = [];
    extractRuleBasedEntities(
      "best crypto deal better than coinbase on binance.com",
      entities,
    );

    expect(
      entities.some((e) => e.type === "sentiment" && e.value === "best"),
    ).toBe(true);
    expect(
      entities.some((e) => e.type === "category" && e.value === "crypto"),
    ).toBe(true);
    expect(
      entities.some((e) => e.type === "domain" && e.value === "binance.com"),
    ).toBe(true);
    expect(
      entities.some((e) => e.type === "comparator" && e.value === "coinbase"),
    ).toBe(true);
  });

  it("should extract entities with AI when enabled", async () => {
    mockAi.run.mockResolvedValue({
      response: JSON.stringify({
        entities: [{ type: "domain", value: "robinhood", confidence: 0.95 }],
      }),
    });

    const result = await extractEntities(
      mockAi as any,
      "robinhood stocks",
      true,
    );
    expect(result.some((e) => e.value === "robinhood")).toBe(true);
    expect(mockAi.run).toHaveBeenCalled();
  });

  it("should deduplicate entities keeping highest confidence", () => {
    const entities: any[] = [
      { type: "category", value: "crypto", confidence: 0.5 },
      { type: "category", value: "crypto", confidence: 0.9 },
      { type: "domain", value: "binance", confidence: 0.8 },
    ];

    const result = deduplicateEntities(entities);
    expect(result.length).toBe(2);
    const crypto = result.find((e) => e.value === "crypto");
    expect(crypto?.confidence).toBe(0.9);
  });

  it("should handle AI extraction failures gracefully", async () => {
    mockAi.run.mockRejectedValue(new Error("AI Failure"));
    const result = await extractEntities(mockAi as any, "crypto", true);
    expect(result.length).toBeGreaterThan(0); // Still has rule-based results
  });
});
