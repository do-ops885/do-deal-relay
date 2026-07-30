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
    expect(typeof validateRedirect("https://example.com")).toBe("boolean");
    expect(validateRedirect("javascript:alert(1)")).toBe(false);
    expect(validateRedirect("not-a-url")).toBe(false);
  });
});
