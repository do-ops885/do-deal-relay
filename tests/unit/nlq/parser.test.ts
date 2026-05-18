import { describe, it, expect } from "vitest";
import {
  parseQuery,
  cleanQueryForSearch,
} from "../../../worker/lib/nlq/parser";

describe("NLQ Parser", () => {
  describe("parseQuery", () => {
    it("should parse a query into tokens, intent and entities", () => {
      const query = "trading platforms with bonus";
      const parsed = parseQuery(query);

      expect(parsed.originalText).toBe(query);
      expect(parsed.tokens).toBeDefined();
      expect(parsed.intent).toBeDefined();
      expect(parsed.entities).toBeDefined();
      expect(parsed.tokens.length).toBeGreaterThan(0);
    });

    it("should truncate long queries", () => {
      const longQuery = "a".repeat(1000);
      const parsed = parseQuery(longQuery);
      expect(parsed.cleanedText.length).toBeLessThanOrEqual(500); // Default max query length
    });
  });

  describe("cleanQueryForSearch", () => {
    it("should remove stopwords and punctuation for search", () => {
      const query = "find deals with $100 bonus!";
      const cleaned = cleanQueryForSearch(query);

      expect(cleaned).toContain("deals");
      expect(cleaned).toContain("100");
      expect(cleaned).toContain("bonus");
      expect(cleaned).not.toContain("with");
      expect(cleaned).not.toContain("!");
    });
  });
});
