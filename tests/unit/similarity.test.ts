import { describe, expect, it } from "vitest";
import {
  CATEGORY_MATCH_WEIGHT,
  DOMAIN_MATCH_WEIGHT,
  TAG_MATCH_WEIGHT,
  countOverlap,
  normalizeTerms,
  scoreSimilarDeal,
  type SimilarDealCandidate,
} from "../../worker/lib/similarity";

function makeDeal(
  category: unknown,
  tags: unknown,
  domain: string,
): SimilarDealCandidate {
  return { metadata: { category, tags }, source: { domain } };
}

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

describe("scoreSimilarDeal", () => {
  it("should match manual split scoring (category*3 + domain*2 + tag*1)", () => {
    const targetCategories = normalizeTerms(["Finance", "DeFi"]);
    const targetTags = normalizeTerms(["bonus", "cashback"]);
    const targetDomain = "example.com";
    const deal = makeDeal(
      ["finance", "shopping"],
      ["BONUS", "extra"],
      "Example.COM",
    );

    // Old-split semantics: score each field against its own counterpart.
    const dealCategories = normalizeTerms(["finance", "shopping"]);
    const dealTags = normalizeTerms(["BONUS", "extra"]);
    const expected =
      countOverlap(targetCategories, dealCategories) * CATEGORY_MATCH_WEIGHT +
      DOMAIN_MATCH_WEIGHT +
      countOverlap(targetTags, dealTags) * TAG_MATCH_WEIGHT;

    expect(
      scoreSimilarDeal(targetCategories, targetTags, targetDomain, deal),
    ).toBe(expected);
    expect(expected).toBe(
      CATEGORY_MATCH_WEIGHT + DOMAIN_MATCH_WEIGHT + TAG_MATCH_WEIGHT,
    );
  });

  it("should reject tag-as-category cross-field contamination", () => {
    // Target wants category "crypto" but the deal only carries it as a tag.
    // Split scoring must contribute 0 for the category weight; the old
    // combined dealTerms bug scored +3 here via
    // countOverlap(targetCategories, combined) * 3.
    const targetCategories = normalizeTerms(["crypto"]);
    const targetTags = normalizeTerms([]);
    const crossDeal = makeDeal(["other"], ["crypto"], "other.com");
    expect(
      scoreSimilarDeal(targetCategories, targetTags, "example.com", crossDeal),
    ).toBe(0);

    // Sanity: the same term as a real category still scores full weight.
    const positiveDeal = makeDeal(["crypto"], ["other"], "other.com");
    expect(
      scoreSimilarDeal(
        targetCategories,
        targetTags,
        "example.com",
        positiveDeal,
      ),
    ).toBe(CATEGORY_MATCH_WEIGHT);
  });

  it("should reject category-as-tag cross-field contamination", () => {
    // Target wants tag "bonus" but the deal only carries it as a category.
    // Split scoring must contribute 0 for the tag weight; the old combined
    // dealTerms bug scored +1 here via countOverlap(targetTags, combined).
    const targetCategories = normalizeTerms([]);
    const targetTags = normalizeTerms(["bonus"]);
    const crossDeal = makeDeal(["bonus"], ["other"], "other.com");
    expect(
      scoreSimilarDeal(targetCategories, targetTags, "example.com", crossDeal),
    ).toBe(0);

    // Sanity: the same term as a real tag still scores full weight.
    const positiveDeal = makeDeal(["other"], ["bonus"], "other.com");
    expect(
      scoreSimilarDeal(
        targetCategories,
        targetTags,
        "example.com",
        positiveDeal,
      ),
    ).toBe(TAG_MATCH_WEIGHT);
  });

  it("should trim whitespace before matching (documents trim behavior)", () => {
    // normalizeTerms trims leading/trailing whitespace then lowercases, so
    // padded entries such as "  DEFI  " normalize to "defi" and still match.
    // Without trim, padded entries would miss and under-score.
    const targetCategories = normalizeTerms(["defi"]);
    const paddedCategory = makeDeal(["  DEFI  "], [], "other.com");
    expect(
      scoreSimilarDeal(
        targetCategories,
        normalizeTerms([]),
        "example.com",
        paddedCategory,
      ),
    ).toBe(CATEGORY_MATCH_WEIGHT);

    const paddedTag = makeDeal([], ["  Bonus "], "other.com");
    expect(
      scoreSimilarDeal(
        normalizeTerms([]),
        normalizeTerms(["bonus"]),
        "example.com",
        paddedTag,
      ),
    ).toBe(TAG_MATCH_WEIGHT);
  });

  it("should score domain case-insensitively", () => {
    const deal = makeDeal([], [], "Example.COM");
    expect(
      scoreSimilarDeal(
        normalizeTerms([]),
        normalizeTerms([]),
        "example.com",
        deal,
      ),
    ).toBe(DOMAIN_MATCH_WEIGHT);
    expect(
      scoreSimilarDeal(
        normalizeTerms([]),
        normalizeTerms([]),
        "Example.Com",
        deal,
      ),
    ).toBe(DOMAIN_MATCH_WEIGHT);
  });
});
