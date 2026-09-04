import { describe, expect, it } from "vitest";
import { countOverlap, normalizeTerms } from "../../worker/lib/similarity";

describe("normalizeTerms", () => {
  it("should lowercase terms for case-insensitive matching", () => {
    const upper = normalizeTerms(["DeFi", "CRYPTO"]);
    const lower = normalizeTerms(["defi", "crypto"]);
    expect(upper).toEqual(lower);
    expect(upper.has("defi")).toBe(true);
    expect(upper.has("crypto")).toBe(true);
  });

  it("should count duplicate terms once", () => {
    const terms = normalizeTerms(["DeFi", "defi", " DEFI ", "crypto"]);
    expect(terms.size).toBe(2);
    const candidate = normalizeTerms(["defi"]);
    expect(countOverlap(terms, candidate)).toBe(1);
  });

  it("should return empty set for empty inputs", () => {
    expect(normalizeTerms([]).size).toBe(0);
    expect(normalizeTerms(undefined).size).toBe(0);
    expect(normalizeTerms(null).size).toBe(0);
    expect(normalizeTerms("defi").size).toBe(0);
    expect(countOverlap(new Set<string>(), new Set<string>())).toBe(0);
    expect(countOverlap(normalizeTerms(["defi"]), new Set<string>())).toBe(0);
    expect(countOverlap(new Set<string>(), normalizeTerms(["defi"]))).toBe(0);
  });

  it("should ignore non-string entries", () => {
    const terms = normalizeTerms([
      "defi",
      123,
      null,
      undefined,
      { tag: "crypto" },
      "",
      "   ",
    ]);
    expect(terms.size).toBe(1);
    expect(terms.has("defi")).toBe(true);
  });
});

describe("countOverlap", () => {
  it("should match parity spot-check vs inline expectation", () => {
    const targetRaw = ["Finance", "DeFi", "defi"];
    const dealCategories = ["finance", "shopping"];
    const dealTags = ["DEFI", "bonus"];

    const target = normalizeTerms(targetRaw);
    const dealTerms = normalizeTerms([...dealCategories, ...dealTags]);

    const expected = new Set(
      targetRaw.map((entry) => entry.trim().toLowerCase()),
    );
    let inlineCount = 0;
    for (const term of expected) {
      const dealLower = [...dealCategories, ...dealTags].map((entry) =>
        entry.toLowerCase(),
      );
      if (dealLower.includes(term)) {
        inlineCount += 1;
      }
    }

    expect(countOverlap(target, dealTerms)).toBe(inlineCount);
    expect(countOverlap(target, dealTerms)).toBe(2);
  });
});
