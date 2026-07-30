import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { validateReferralUrl } from "../../worker/lib/security";

describe("validateReferralUrl", () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe("valid URLs", () => {
    it("should allow valid HTTPS referral URLs matching the target domain", () => {
      expect(
        validateReferralUrl("https://example.com/ref?code=123", "example.com"),
      ).toBe(true);
      expect(
        validateReferralUrl(
          "https://www.example.com/ref?code=123",
          "example.com",
        ),
      ).toBe(true);
      expect(
        validateReferralUrl(
          "https://example.com/ref?code=123",
          "www.example.com",
        ),
      ).toBe(true);
    });

    it("should allow URLs with normal query parameters", () => {
      expect(
        validateReferralUrl(
          "https://example.com/page?foo=bar&baz=qux",
          "example.com",
        ),
      ).toBe(true);
    });
  });

  describe("protocol enforcement", () => {
    it("should block HTTP referral URLs", () => {
      expect(
        validateReferralUrl("http://example.com/ref?code=123", "example.com"),
      ).toBe(false);
    });

    it("should block FTP referral URLs", () => {
      expect(
        validateReferralUrl("ftp://example.com/ref?code=123", "example.com"),
      ).toBe(false);
    });

    it("should block javascript: scheme", () => {
      expect(
        validateReferralUrl("javascript:alert(1)//example.com", "example.com"),
      ).toBe(false);
    });

    it("should block data: scheme", () => {
      expect(
        validateReferralUrl(
          "data:text/html,<script>alert(1)</script>",
          "example.com",
        ),
      ).toBe(false);
    });
  });

  describe("domain matching", () => {
    it("should block mismatched domains", () => {
      expect(
        validateReferralUrl("https://evil.com/ref?code=123", "example.com"),
      ).toBe(false);
      expect(
        validateReferralUrl("https://example.org/ref?code=123", "example.com"),
      ).toBe(false);
    });

    it("should block subdomain spoofing", () => {
      expect(
        validateReferralUrl("https://evil-example.com/ref", "example.com"),
      ).toBe(false);
      expect(
        validateReferralUrl("https://example.com.evil.com/ref", "example.com"),
      ).toBe(false);
    });

    it("should block host header injection via @", () => {
      expect(
        validateReferralUrl("https://example.com@evil.com/ref", "example.com"),
      ).toBe(false);
    });
  });

  describe("control character rejection (raw)", () => {
    it("should block null byte", () => {
      expect(
        validateReferralUrl(
          "https://example.com\x00/ref?code=123",
          "example.com",
        ),
      ).toBe(false);
    });

    it("should block carriage return", () => {
      expect(
        validateReferralUrl(
          "https://example.com\x0d/ref?code=123",
          "example.com",
        ),
      ).toBe(false);
    });

    it("should block line feed", () => {
      expect(
        validateReferralUrl(
          "https://example.com\x0a/ref?code=123",
          "example.com",
        ),
      ).toBe(false);
    });

    it("should block horizontal tab", () => {
      expect(
        validateReferralUrl(
          "https://example.com\t/ref?code=123",
          "example.com",
        ),
      ).toBe(false);
    });

    it("should block vertical tab", () => {
      expect(
        validateReferralUrl(
          "https://example.com\x0b/ref?code=123",
          "example.com",
        ),
      ).toBe(false);
    });

    it("should block form feed", () => {
      expect(
        validateReferralUrl(
          "https://example.com\x0c/ref?code=123",
          "example.com",
        ),
      ).toBe(false);
    });

    it("should block DEL character", () => {
      expect(
        validateReferralUrl(
          "https://example.com\x7f/ref?code=123",
          "example.com",
        ),
      ).toBe(false);
    });

    it("should block backspace", () => {
      expect(
        validateReferralUrl(
          "https://example.com\x08/ref?code=123",
          "example.com",
        ),
      ).toBe(false);
    });
  });

  describe("encoded control character rejection", () => {
    it("should block %00 (encoded null byte)", () => {
      expect(
        validateReferralUrl(
          "https://example.com%00/ref?code=123",
          "example.com",
        ),
      ).toBe(false);
    });

    it("should block %0a (encoded line feed)", () => {
      expect(
        validateReferralUrl(
          "https://example.com%0a/ref?code=123",
          "example.com",
        ),
      ).toBe(false);
    });

    it("should block %0d (encoded carriage return)", () => {
      expect(
        validateReferralUrl(
          "https://example.com%0d/ref?code=123",
          "example.com",
        ),
      ).toBe(false);
    });

    it("should block %09 (encoded tab)", () => {
      expect(
        validateReferralUrl(
          "https://example.com%09/ref?code=123",
          "example.com",
        ),
      ).toBe(false);
    });

    it("should block %7f (encoded DEL)", () => {
      expect(
        validateReferralUrl(
          "https://example.com%7f/ref?code=123",
          "example.com",
        ),
      ).toBe(false);
    });

    it("should block %5c (encoded backslash)", () => {
      expect(
        validateReferralUrl(
          "https://example.com%5cevil.com/ref?code=123",
          "example.com",
        ),
      ).toBe(false);
    });

    it("should block uppercase hex variants", () => {
      expect(
        validateReferralUrl(
          "https://example.com%0A/ref?code=123",
          "example.com",
        ),
      ).toBe(false);
      expect(
        validateReferralUrl(
          "https://example.com%0D/ref?code=123",
          "example.com",
        ),
      ).toBe(false);
      expect(
        validateReferralUrl(
          "https://example.com%5C/ref?code=123",
          "example.com",
        ),
      ).toBe(false);
    });
  });

  describe("double-encoding rejection", () => {
    it("should block %2500 (double-encoded null byte)", () => {
      expect(
        validateReferralUrl(
          "https://example.com%2500/ref?code=123",
          "example.com",
        ),
      ).toBe(false);
    });

    it("should block %250a (double-encoded line feed)", () => {
      expect(
        validateReferralUrl(
          "https://example.com%250a/ref?code=123",
          "example.com",
        ),
      ).toBe(false);
    });

    it("should block %255c (double-encoded backslash)", () => {
      expect(
        validateReferralUrl(
          "https://example.com%255c/ref?code=123",
          "example.com",
        ),
      ).toBe(false);
    });
  });

  describe("backslash / UNC path rejection", () => {
    it("should block raw backslash in URL", () => {
      expect(
        validateReferralUrl(
          "https://example.com\\evil.com/ref?code=123",
          "example.com",
        ),
      ).toBe(false);
    });

    it("should block Windows UNC path", () => {
      expect(
        validateReferralUrl("\\\\evil.com\\share\\file", "example.com"),
      ).toBe(false);
    });
  });

  describe("suspicious redirect parameter bypasses", () => {
    it("should block redirect param pointing to external domain", () => {
      expect(
        validateReferralUrl(
          "https://example.com/ref?redirect=https://evil.com",
          "example.com",
        ),
      ).toBe(false);
    });

    it("should block url param with protocol-relative external URL", () => {
      expect(
        validateReferralUrl(
          "https://example.com/ref?url=//evil.com",
          "example.com",
        ),
      ).toBe(false);
    });

    it("should block next param with ftp:// scheme", () => {
      expect(
        validateReferralUrl(
          "https://example.com/ref?next=ftp://evil.com",
          "example.com",
        ),
      ).toBe(false);
    });

    it("should block redirect param with backslash bypass", () => {
      expect(
        validateReferralUrl(
          "https://example.com/ref?redirect=\\evil.com",
          "example.com",
        ),
      ).toBe(false);
    });

    it("should block return param with external URL", () => {
      expect(
        validateReferralUrl(
          "https://example.com/ref?return=https://evil.com/path",
          "example.com",
        ),
      ).toBe(false);
    });

    it("should block callback param with external URL", () => {
      expect(
        validateReferralUrl(
          "https://example.com/ref?callback=https://evil.com/hook",
          "example.com",
        ),
      ).toBe(false);
    });

    it("should allow redirect param pointing to same domain", () => {
      expect(
        validateReferralUrl(
          "https://example.com/ref?redirect=https://example.com/dashboard",
          "example.com",
        ),
      ).toBe(true);
    });

    it("should allow url param pointing to same domain with www", () => {
      expect(
        validateReferralUrl(
          "https://example.com/ref?url=https://www.example.com/welcome",
          "example.com",
        ),
      ).toBe(true);
    });
  });

  describe("invalid / edge case URLs", () => {
    it("should handle invalid URLs gracefully", () => {
      expect(validateReferralUrl("not-a-valid-url", "example.com")).toBe(false);
    });

    it("should handle empty string", () => {
      expect(validateReferralUrl("", "example.com")).toBe(false);
    });

    it("should handle whitespace-only input", () => {
      expect(validateReferralUrl("   ", "example.com")).toBe(false);
    });

    it("should handle very long URLs", () => {
      const longPath = "a".repeat(5000);
      expect(
        validateReferralUrl(`https://example.com/${longPath}`, "example.com"),
      ).toBe(true);
    });

    it("should block URL with colon in path (port spoofing)", () => {
      expect(
        validateReferralUrl(
          "https://example.com:443@evil.com/ref",
          "example.com",
        ),
      ).toBe(false);
    });
  });

  describe("logging", () => {
    it("should log a warning when rejecting due to dangerous characters", () => {
      validateReferralUrl("https://example.com\x00/evil", "example.com");
      expect(consoleWarnSpy).toHaveBeenCalled();
      const logCall = consoleWarnSpy.mock.calls[0]?.[0] as string;
      expect(logCall).toContain("dangerous characters");
    });

    it("should log a warning when rejecting due to domain mismatch", () => {
      validateReferralUrl("https://evil.com/path", "example.com");
      expect(consoleWarnSpy).toHaveBeenCalled();
      const logCall = consoleWarnSpy.mock.calls[0]?.[0] as string;
      expect(logCall).toContain("domain mismatch");
    });

    it("should log a warning when rejecting non-HTTPS", () => {
      validateReferralUrl("http://example.com/path", "example.com");
      expect(consoleWarnSpy).toHaveBeenCalled();
      const logCall = consoleWarnSpy.mock.calls[0]?.[0] as string;
      expect(logCall).toContain("non-HTTPS");
    });

    it("should log a warning for suspicious param bypass", () => {
      validateReferralUrl(
        "https://example.com/ref?redirect=https://evil.com",
        "example.com",
      );
      expect(consoleWarnSpy).toHaveBeenCalled();
      const logCall = consoleWarnSpy.mock.calls[0]?.[0] as string;
      expect(logCall).toContain("suspicious param");
    });
  });
});
