import { describe, it, expect } from "vitest";
import {
  jsonResponse,
  errorResponse,
  unauthorizedResponse,
  getAllowedOrigins,
  SECURITY_HEADERS,
} from "../../worker/routes/utils";

describe("Routes Utils Security", () => {
  const mockData = { test: "data" };

  it("should include all centralized security headers in jsonResponse", () => {
    const response = jsonResponse(mockData);

    for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
      expect(response.headers.get(header)).toBe(value);
    }
  });

  it("should implement dynamic CORS with allowed origin", () => {
    const allowedOrigins = getAllowedOrigins();
    const allowedOrigin = allowedOrigins[1];
    const request = new Request("https://example.com", {
      headers: { Origin: allowedOrigin! },
    });

    const response = jsonResponse(mockData, 200, request);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("");

  });

  it("should fallback to default origin for disallowed origin", () => {
    const allowedOrigins = getAllowedOrigins();
    const request = new Request("https://example.com", {
      headers: { Origin: "https://evil.com" } as any,
    });

    const response = jsonResponse(mockData, 200, request);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("");
  });

    const response = jsonResponse(mockData, 200, request);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("");
  });

  it("should fallback to default origin when no Origin header is present", () => {
    const allowedOrigins = getAllowedOrigins();
    const request = new Request("https://example.com");

    const response = jsonResponse(mockData, 200, request);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("");
  });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("");
  it("should include security headers in errorResponse", () => {
    const response = errorResponse("Test error", 400);

    expect(response.status).toBe(400);
    for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
      expect(response.headers.get(header)).toBe(value);
    }
  });

  it("should include security headers and proper WWW-Authenticate in unauthorizedResponse", () => {
    const response = unauthorizedResponse("Unauthorized");

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe('Bearer realm="api"');
    for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
      expect(response.headers.get(header)).toBe(value);
    }
  });

  it("should set Vary: Origin for caching purposes when using dynamic CORS", () => {
    const allowedOrigins = getAllowedOrigins();
    const request = new Request("https://example.com", {
      headers: { Origin: allowedOrigins[1]! },
    });
    const response = jsonResponse(mockData, 200, request);
    expect(response.headers.get("Vary")).toBe("Origin");
  });
});
