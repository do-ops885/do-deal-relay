import { describe, it, expect } from "vitest";
import {
  jsonResponse,
  errorResponse,
  unauthorizedResponse,
  forbiddenResponse,
  validateUrl,
  validateRedirect,
} from "../../worker/routes/utils";

describe("Route Utilities", () => {
  it("should create JSON response", () => {
    const response = jsonResponse({ test: true }, 200);
    expect(response.status).toBe(200);
  });

  it("should create error response", () => {
    const response = errorResponse("Test error", 400);
    expect(response.status).toBe(400);
  });

  it("should create unauthorized response", () => {
    const response = unauthorizedResponse("Auth required");
    expect(response.status).toBe(401);
  });

  it("should create forbidden response", () => {
    const response = forbiddenResponse("Forbidden");
    expect(response.status).toBe(403);
  });

  it("should validate URLs", () => {
    expect(validateUrl("http://example.com")).toBeNull();
    expect(validateUrl("not-a-url")).toBeNull();

    // Valid HTTPS URL
    expect(validateUrl("https://example.com")).toBe("https://example.com");
    expect(validateUrl("https://example.com/some/path")).toBe(
      "https://example.com/some/path",
    );

    // Localhost allowed with HTTP or HTTPS
    expect(validateUrl("https://localhost")).toBe("https://localhost");
    expect(validateUrl("https://localhost/path")).toBe(
      "https://localhost/path",
    );

    // Block common redirect bypasses
    expect(validateUrl("https://example.com//google.com")).toBeNull();
    expect(validateUrl("https://example.com/path//to/something")).toBeNull();
    expect(validateUrl("https://example.com/path/../to/something")).toBeNull();
    expect(validateUrl("https://example.com@google.com")).toBeNull();
  });

  it("should validate redirects", () => {
    // Valid allowed redirect domains
    expect(validateRedirect("https://do-deal-relay.com")).toBe(true);
    expect(validateRedirect("https://do-deal-relay.pages.dev")).toBe(true);
    expect(validateRedirect("https://localhost")).toBe(true);
    expect(validateRedirect("http://localhost")).toBe(true);
    expect(validateRedirect("https://www.do-deal-relay.com")).toBe(true); // leading www. is stripped and allowed

    // Invalid/unallowed redirect domains
    expect(validateRedirect("https://example.com")).toBe(false);
    expect(validateRedirect("javascript:alert(1)")).toBe(false);
    expect(validateRedirect("not-a-url")).toBe(false);

    // Unsafe: Protocols other than HTTPS (except localhost)
    expect(validateRedirect("http://do-deal-relay.com")).toBe(false);

    // Security Hardening: Block dangerous characters
    expect(validateRedirect("https://do-deal-relay.com\\attacker.com")).toBe(
      false,
    );
    expect(validateRedirect("https://do-deal-relay.com\x00attacker.com")).toBe(
      false,
    );
    expect(
      validateRedirect(
        "https://do-deal-relay.com\x0d\x0aLocation: https://attacker.com",
      ),
    ).toBe(false);

    // Security Hardening: Block URL-encoded and double-encoded dangerous characters
    expect(validateRedirect("https://do-deal-relay.com%5cattacker.com")).toBe(
      false,
    );
    expect(validateRedirect("https://do-deal-relay.com%00attacker.com")).toBe(
      false,
    );
    expect(
      validateRedirect(
        "https://do-deal-relay.com%0d%0aLocation: https://attacker.com",
      ),
    ).toBe(false);
    expect(validateRedirect("https://do-deal-relay.com%255cattacker.com")).toBe(
      false,
    );

    // Security Hardening: Block userinfo, path traversal, multiple slashes, and protocol-relative bypasses
    expect(validateRedirect("https://do-deal-relay.com@attacker.com")).toBe(
      false,
    );
    expect(validateRedirect("https://do-deal-relay.com/../attacker.com")).toBe(
      false,
    );
    expect(validateRedirect("https://do-deal-relay.com//attacker.com")).toBe(
      false,
    );
    expect(
      validateRedirect("https://do-deal-relay.com/path//to/resource"),
    ).toBe(false);
    expect(validateRedirect("//do-deal-relay.com")).toBe(false);
  });
});
