import { describe, it, expect } from "vitest";
import { validateReferralUrl } from "../../worker/lib/security";

describe("validateReferralUrl", () => {
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

  it("should block non-HTTPS referral URLs", () => {
    expect(
      validateReferralUrl("http://example.com/ref?code=123", "example.com"),
    ).toBe(false);
    expect(
      validateReferralUrl("ftp://example.com/ref?code=123", "example.com"),
    ).toBe(false);
  });

  it("should block referral URLs with mismatched domains", () => {
    expect(
      validateReferralUrl("https://evil.com/ref?code=123", "example.com"),
    ).toBe(false);
    expect(
      validateReferralUrl("https://example.org/ref?code=123", "example.com"),
    ).toBe(false);
  });

  it("should block referral URLs containing backslashes or dangerous control characters", () => {
    expect(
      validateReferralUrl(
        "https://example.com\\evil.com/ref?code=123",
        "example.com",
      ),
    ).toBe(false);
    expect(
      validateReferralUrl(
        "https://example.com\x00/ref?code=123",
        "example.com",
      ),
    ).toBe(false);
    expect(
      validateReferralUrl(
        "https://example.com\x0d/ref?code=123",
        "example.com",
      ),
    ).toBe(false);
    expect(
      validateReferralUrl(
        "https://example.com\x0a/ref?code=123",
        "example.com",
      ),
    ).toBe(false);
    expect(
      validateReferralUrl("https://example.com\t/ref?code=123", "example.com"),
    ).toBe(false);
  });

  it("should block suspicious redirect search parameters pointing to other domains", () => {
    expect(
      validateReferralUrl(
        "https://example.com/ref?redirect=https://evil.com",
        "example.com",
      ),
    ).toBe(false);
    expect(
      validateReferralUrl(
        "https://example.com/ref?url=//evil.com",
        "example.com",
      ),
    ).toBe(false);
    expect(
      validateReferralUrl(
        "https://example.com/ref?next=ftp://evil.com",
        "example.com",
      ),
    ).toBe(false);
  });

  it("should allow suspicious redirect search parameters if they point to the safe target domain", () => {
    expect(
      validateReferralUrl(
        "https://example.com/ref?redirect=https://example.com/dashboard",
        "example.com",
      ),
    ).toBe(true);
    expect(
      validateReferralUrl(
        "https://example.com/ref?url=https://www.example.com/welcome",
        "example.com",
      ),
    ).toBe(true);
  });

  it("should handle invalid URLs gracefully without crashing", () => {
    expect(validateReferralUrl("not-a-valid-url", "example.com")).toBe(false);
  });
});
