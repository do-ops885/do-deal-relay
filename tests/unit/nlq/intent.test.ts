import { describe, it, expect } from "vitest";
import {
  classifyIntent,
  isComparisonQuery,
  isRankingQuery,
  extractRankingCriteria,
} from "../../../worker/lib/nlq/intent";

describe("NLQ Intent Classifier", () => {
  describe("classifyIntent", () => {
    it("should classify search intent by default", () => {
      const result = classifyIntent("trading platforms");
      expect(result.intent).toBe("search");
    });

    it("should classify compare intent", () => {
      const result = classifyIntent("compare trading212 and robinhood");
      expect(result.intent).toBe("compare");
    });

    it("should classify count intent", () => {
      const result = classifyIntent("how many deals are there");
      expect(result.intent).toBe("count");
    });

    it("should classify rank intent", () => {
      const result = classifyIntent("best signup bonus");
      expect(result.intent).toBe("rank");
    });
  });

  describe("isComparisonQuery", () => {
    it("should detect comparison queries", () => {
      expect(isComparisonQuery("compare A vs B")).toBe(true);
      expect(isComparisonQuery("difference between A and B")).toBe(true);
      expect(isComparisonQuery("just a search")).toBe(false);
    });
  });

  describe("isRankingQuery", () => {
    it("should detect ranking queries", () => {
      expect(isRankingQuery("top 10 deals")).toBe(true);
      expect(isRankingQuery("best bonus")).toBe(true);
      expect(isRankingQuery("sort by reward")).toBe(true);
      expect(isRankingQuery("regular search")).toBe(false);
    });
  });

  describe("extractRankingCriteria", () => {
    it("should extract reward_value criteria", () => {
      expect(extractRankingCriteria("highest bonus")).toBe("reward_value");
    });

    it("should extract confidence_score criteria", () => {
      expect(extractRankingCriteria("most trusted deals")).toBe(
        "confidence_score",
      );
    });

    it("should extract relevance criteria", () => {
      expect(extractRankingCriteria("most relevant deals")).toBe("relevance");
    });
  });
});
