import { describe, it, expect } from "vitest";
import {
  extractBySelectors,
  extractFromHtml,
} from "../../worker/lib/html-utils";

describe("html-utils", () => {
  const sampleHtml = `
    <html>
      <body>
        <div class="deal">
          <h1 class="product-title">Premium VPN</h1>
          <p class="description">Get 3 months free with this code</p>
          <span class="referral-code">VPN-SAVE-2026</span>
          <div class="reward-info">$50 Cash Back</div>
          <a class="referral-link" href="https://example.com/join/VPN-SAVE-2026">Claim Deal</a>
        </div>
        <div class="deal">
          <h1 class="product-title">Cloud Hosting</h1>
          <p class="description">Sign up for a bonus</p>
          <span class="referral-code">HOST-FREE-66</span>
          <div class="reward-info">10% Off</div>
          <a class="referral-link" href="https://example.com/join/HOST-FREE-66">Claim Deal</a>
        </div>
      </body>
    </html>
  `;

  describe("extractBySelectors", () => {
    it("should extract multiple elements using selectors", () => {
      const selectors = {
        code: ".referral-code",
        reward: ".reward-info",
        title: ".product-title",
      };

      const result = extractBySelectors(sampleHtml, selectors);

      expect(result["code"]).toEqual(["VPN-SAVE-2026", "HOST-FREE-66"]);
      expect(result["reward"]).toEqual(["$50 Cash Back", "10% Off"]);
      expect(result["title"]).toEqual(["Premium VPN", "Cloud Hosting"]);
    });

    it("should return empty arrays for non-matching selectors", () => {
      const selectors = {
        nonexistent: ".no-such-class",
      };

      const result = extractBySelectors(sampleHtml, selectors);
      expect(result["nonexistent"]).toEqual([]);
    });

    it("should filter out empty text content", () => {
      const htmlWithEmpty = `<div></div><div class="test">Data</div>`;
      const result = extractBySelectors(htmlWithEmpty, { test: "div" });
      expect(result["test"]).toEqual(["Data"]);
    });
  });

  describe("extractFromHtml", () => {
    it("should use selectors when they match", () => {
      const config = {
        selectors: {
          code: ".referral-code",
        },
        regex_patterns: {
          code: [/CODE:([A-Z-]+)/g],
        },
      };

      const result = extractFromHtml(sampleHtml, config);
      expect(result["code"]).toEqual(["VPN-SAVE-2026", "HOST-FREE-66"]);
    });

    it("should fall back to regex when selectors don't match", () => {
      const config = {
        selectors: {
          code: ".wrong-class",
        },
        regex_patterns: {
          code: [/(VPN-[A-Z-]+-\d+)/g],
        },
      };

      const result = extractFromHtml(sampleHtml, config);
      expect(result["code"]).toEqual(["VPN-SAVE-2026"]);
    });

    it("should fall back to regex when no selectors are provided", () => {
      const config = {
        regex_patterns: {
          reward: [/\$(\d+) Cash Back/g],
        },
      };

      const result = extractFromHtml(sampleHtml, config);
      expect(result["reward"]).toEqual(["50"]);
    });

    it("should handle multiple regex patterns for a field", () => {
      const config = {
        regex_patterns: {
          data: [/(\d+)%/g, /\$(\d+)/g],
        },
      };

      const result = extractFromHtml(sampleHtml, config);
      // Order depends on pattern application and match order in HTML
      expect(result["data"]).toContain("50");
      expect(result["data"]).toContain("10");
    });
  });
});
