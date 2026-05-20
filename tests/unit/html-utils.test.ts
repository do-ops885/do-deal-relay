import { describe, it, expect } from "vitest";
import {
  extractBySelectors,
  extractFromHtml,
} from "../../worker/lib/html-utils";

describe("html-utils", () => {
  describe("extractBySelectors", () => {
    it("should extract text using CSS selectors", () => {
      const html = `
        <div class="product">
          <h1 class="title">Product A</h1>
          <span class="price">$100</span>
          <a href="/buy/123" class="link">Buy Now</a>
        </div>
      `;
      const selectors = {
        title: ".title",
        price: ".price",
        code: ".link",
      };

      const result = extractBySelectors(html, selectors);

      expect(result.title).toContain("Product A");
      expect(result.price).toContain("$100");
      expect(result.code).toContain("Buy Now");
    });

    it("should handle missing selectors gracefully", () => {
      const html = '<div class="exists">Value</div>';
      const selectors = {
        missing: ".not-here",
        present: ".exists",
      };

      const result = extractBySelectors(html, selectors);

      expect(result.missing).toHaveLength(0);
      expect(result.present).toContain("Value");
    });
  });

  describe("extractFromHtml", () => {
    it("should prioritize selectors over regex", () => {
      const html = `
        <div class="deal">
          <span class="code">REAL_CODE</span>
          <p>Some text with REGEX_CODE</p>
        </div>
      `;
      const config = {
        selectors: { code: ".code" },
        regex_patterns: { code: [/REGEX_[A-Z]+/g] },
      };

      const result = extractFromHtml(html, config);

      expect(result.code).toContain("REAL_CODE");
      expect(result.code).not.toContain("REGEX_CODE");
    });

    it("should fallback to regex when selector returns no results", () => {
      const html = `
        <div class="deal">
          <p>Some text with REGEX_CODE</p>
        </div>
      `;
      const config = {
        selectors: { code: ".non-existent" },
        regex_patterns: { code: [/REGEX_[A-Z]+/g] },
      };

      const result = extractFromHtml(html, config);

      expect(result.code).toContain("REGEX_CODE");
    });

    it("should fallback to regex when no selector is defined", () => {
      const html = `
        <div class="deal">
          <p>Some text with REGEX_CODE</p>
        </div>
      `;
      const config = {
        regex_patterns: { code: [/REGEX_[A-Z]+/g] },
      };

      const result = extractFromHtml(html, config);

      expect(result.code).toContain("REGEX_CODE");
    });
  });
});
