import { describe, it, expect } from "vitest";
import { validateRedirect } from "../../worker/routes/utils";

describe("validateRedirect", () => {
  it("should allow exact matches of allowed domains", () => {
    expect(validateRedirect("https://do-deal-relay.com/success")).toBe(true);
    expect(validateRedirect("https://do-deal-relay.pages.dev/dashboard")).toBe(
      true,
    );
  });

  it("should allow subdomains of allowed domains", () => {
    expect(validateRedirect("https://app.do-deal-relay.com/login")).toBe(true);
    expect(
      validateRedirect("https://test.staging.do-deal-relay.pages.dev/"),
    ).toBe(true);
  });

  it("should allow localhost for development and testing", () => {
    expect(validateRedirect("http://localhost:8787/callback")).toBe(true);
    expect(validateRedirect("http://localhost:3000/")).toBe(true);
  });

  it("should allow www prefix", () => {
    expect(validateRedirect("https://www.do-deal-relay.com/")).toBe(true);
  });

  it("should block unauthorized domains", () => {
    expect(validateRedirect("https://evil.com")).toBe(false);
    expect(
      validateRedirect("https://google.com/redirect?url=https://evil.com"),
    ).toBe(false);
    expect(validateRedirect("https://do-deal-relay.com.evil.com")).toBe(false);
  });

  it("should block non-http/https protocols", () => {
    expect(validateRedirect("javascript:alert(1)")).toBe(false);
    expect(validateRedirect("data:text/html,<html>")).toBe(false);
    expect(validateRedirect("file:///etc/passwd")).toBe(false);
  });

  it("should block malformed URLs", () => {
    expect(validateRedirect("not-a-url")).toBe(false);
    expect(validateRedirect("https://")).toBe(false);
  });

  it("should block path traversal and multiple slashes bypasses if they change hostname", () => {
    // URL parser handles these, but good to check
    expect(validateRedirect("https://do-deal-relay.com@evil.com")).toBe(false);
  });

  it("should block HTTP protocol for production domains", () => {
    expect(validateRedirect("http://do-deal-relay.com/welcome")).toBe(false);
    expect(validateRedirect("http://do-deal-relay.pages.dev/dashboard")).toBe(
      false,
    );
    expect(validateRedirect("http://app.do-deal-relay.com/login")).toBe(false);
  });

  it("should block URLs with bypass characters", () => {
    expect(validateRedirect("https://do-deal-relay.com/\x00/path")).toBe(false);
    expect(validateRedirect("https://do-deal-relay.com/\\@evil.com")).toBe(
      false,
    );
    expect(validateRedirect("https://do-deal-relay.com/\r\nX-Evil: true")).toBe(
      false,
    );
  });
});
