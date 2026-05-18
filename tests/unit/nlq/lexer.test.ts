import { describe, it, expect } from "vitest";
import { tokenize, removeStopwords } from "../../../worker/lib/nlq/lexer";

describe("NLQ Lexer", () => {
  describe("tokenize", () => {
    it("should tokenize a simple query", () => {
      const tokens = tokenize("trading platforms");
      expect(tokens).toHaveLength(2);
      expect(tokens[0]).toMatchObject({
        value: "trading",
        type: "word",
        normalized: "trading",
      });
      expect(tokens[1]).toMatchObject({
        value: "platforms",
        type: "word",
        normalized: "platforms",
      });
    });

    it("should handle currency symbols and numbers", () => {
      const tokens = tokenize("bonus of $100");
      expect(tokens.map((t) => t.value)).toContain("$");
      expect(tokens.map((t) => t.value)).toContain("100");
      const dollar = tokens.find((t) => t.value === "$");
      const hundred = tokens.find((t) => t.value === "100");
      expect(dollar?.type).toBe("currency");
      expect(hundred?.type).toBe("number");
    });

    it("should classify stopwords", () => {
      const tokens = tokenize("deals with bonus");
      const withToken = tokens.find((t) => t.value === "with");
      expect(withToken?.type).toBe("stopword");
    });

    it("should handle operators", () => {
      const tokens = tokenize("reward > 50");
      const op = tokens.find((t) => t.value === ">");
      expect(op?.type).toBe("operator");
    });

    it("should handle smart quotes and whitespace", () => {
      const tokens = tokenize('  "deal" \u201Cquoted\u201D  ');
      expect(tokens.map((t) => t.normalized)).toContain('"quoted"');
      expect(tokens.some((t) => t.value.includes('"'))).toBe(true);
    });
  });

  describe("removeStopwords", () => {
    it("should filter out stopwords and punctuation", () => {
      const tokens = tokenize("deals with bonus!");
      const filtered = removeStopwords(tokens);
      expect(filtered.map((t) => t.type)).not.toContain("stopword");
      expect(filtered.map((t) => t.type)).not.toContain("punctuation");
      expect(filtered.map((t) => t.value)).toContain("deals");
      expect(filtered.map((t) => t.value)).toContain("bonus");
    });
  });
});
