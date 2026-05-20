import { describe, it, expect, vi } from "vitest";
import {
  expandQuery,
  createEmptyExpansion,
} from "../../../../worker/lib/nlq/ai/expansion";

describe("NLQ AI Expansion", () => {
  const mockAi = {
    run: vi.fn(),
  };

  it("should expand known synonyms", async () => {
    const result = await expandQuery(mockAi as any, "broker deal", false);
    expect(result.original).toBe("broker deal");
    expect(result.synonyms.has("broker")).toBe(true);
    expect(result.synonyms.has("deal")).toBe(true);
    expect(result.expanded.length).toBeGreaterThan(0);
    expect(result.expanded).toContain("trading platform deal");
    expect(result.expanded).toContain("broker offer");
  });

  it("should expand with AI when enabled", async () => {
    mockAi.run.mockResolvedValue({
      response: '["best broker deals", "top investment offers"]',
    });

    const result = await expandQuery(mockAi as any, "broker deal", true);
    expect(result.expanded).toContain("best broker deals");
    expect(result.expanded).toContain("top investment offers");
    expect(mockAi.run).toHaveBeenCalled();
  });

  it("should handle AI errors gracefully", async () => {
    mockAi.run.mockRejectedValue(new Error("AI error"));
    const result = await expandQuery(mockAi as any, "broker deal", true);
    expect(result.expanded.length).toBeGreaterThan(0); // Still has synonyms
    // No crash
  });

  it("should create empty expansion", () => {
    const result = createEmptyExpansion("test");
    expect(result.original).toBe("test");
    expect(result.expanded).toEqual([]);
    expect(result.synonyms.size).toBe(0);
  });
});
