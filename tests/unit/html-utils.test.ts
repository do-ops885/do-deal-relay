import { describe, it, expect } from "vitest";
import { extractFromHtml } from "../../worker/lib/html-utils";

describe("HTML Utilities", () => {
  it("should extract by selectors", () => {
    const html = '<div class="code">TEST</div>';
    const result = extractFromHtml(html, { selectors: { code: ".code" } });
    expect(result["code"]).toContain("TEST");
  });

  it("should fallback to regex", () => {
    const html = "Code is ABC123";
    const result = extractFromHtml(html, {
      regex_patterns: { code: [/ABC\d+/] },
    });
    expect(result["code"]).toContain("ABC123");
  });
});
