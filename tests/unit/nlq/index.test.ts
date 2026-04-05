/**
 * NLQ Route Handler Tests
 *
 * Tests for the main NLQ request router (index.ts).
 * Covers route matching, method dispatching, and error responses.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { KVNamespace, D1Database } from "@cloudflare/workers-types";
import { handleNLQRequest } from "../../../worker/routes/nlq/index";
import type { Env } from "../../../worker/types";

// Mock the handlers module
vi.mock("../../../worker/routes/nlq/handlers", () => ({
  handleNLQ: vi.fn(async () => new Response(JSON.stringify({ success: true }))),
  handleNLQGet: vi.fn(
    async () => new Response(JSON.stringify({ success: true })),
  ),
  handleNLQExplain: vi.fn(
    async () => new Response(JSON.stringify({ success: true })),
  ),
  executeNLQ: vi.fn(),
  parseNaturalLanguageQuery: vi.fn(),
}));

import * as handlers from "../../../worker/routes/nlq/handlers";

describe("NLQ Route Handler", () => {
  let mockEnv: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv = {
      DEALS_PROD: {} as KVNamespace,
      DEALS_STAGING: {} as KVNamespace,
      DEALS_LOG: {} as KVNamespace,
      DEALS_LOCK: {} as KVNamespace,
      DEALS_SOURCES: {} as KVNamespace,
      DEALS_DB: {} as D1Database,
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
      NOTIFICATION_THRESHOLD: "100",
    } as Env;
  });

  describe("handleNLQRequest", () => {
    it("should route POST /api/nlq to handleNLQ", async () => {
      const request = new Request("http://localhost/api/nlq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "find trading deals" }),
      });
      const url = new URL(request.url);

      await handleNLQRequest(request, url, mockEnv);

      expect(handlers.handleNLQ).toHaveBeenCalledWith(request, mockEnv);
    });

    it("should route GET /api/nlq to handleNLQGet", async () => {
      const request = new Request("http://localhost/api/nlq?q=trading");
      const url = new URL(request.url);

      await handleNLQRequest(request, url, mockEnv);

      expect(handlers.handleNLQGet).toHaveBeenCalledWith(url, mockEnv);
    });

    it("should route POST /api/nlq/explain to handleNLQExplain", async () => {
      const request = new Request("http://localhost/api/nlq/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "find deals" }),
      });
      const url = new URL(request.url);

      await handleNLQRequest(request, url, mockEnv);

      expect(handlers.handleNLQExplain).toHaveBeenCalledWith(request, mockEnv);
    });

    it("should route GET /api/nlq/explain to handleNLQExplain", async () => {
      const request = new Request("http://localhost/api/nlq/explain?q=deals");
      const url = new URL(request.url);

      await handleNLQRequest(request, url, mockEnv);

      expect(handlers.handleNLQExplain).toHaveBeenCalledWith(request, mockEnv);
    });

    it("should return 405 for DELETE /api/nlq", async () => {
      const request = new Request("http://localhost/api/nlq", {
        method: "DELETE",
      });
      const url = new URL(request.url);

      const response = await handleNLQRequest(request, url, mockEnv);

      expect(response.status).toBe(405);
      const body = await response.json();
      expect(body.code).toBe("METHOD_NOT_ALLOWED");
      expect(body.error).toBe("Method not allowed");
    });

    it("should return 405 for PUT /api/nlq", async () => {
      const request = new Request("http://localhost/api/nlq", {
        method: "PUT",
      });
      const url = new URL(request.url);

      const response = await handleNLQRequest(request, url, mockEnv);

      expect(response.status).toBe(405);
      const body = await response.json();
      expect(body.code).toBe("METHOD_NOT_ALLOWED");
    });

    it("should return 404 for unknown NLQ path", async () => {
      const request = new Request("http://localhost/api/nlq/unknown");
      const url = new URL(request.url);

      const response = await handleNLQRequest(request, url, mockEnv);

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.code).toBe("NOT_FOUND");
      expect(body.error).toBe("Not found");
    });

    it("should return 404 for completely different path", async () => {
      const request = new Request("http://localhost/api/deals");
      const url = new URL(request.url);

      const response = await handleNLQRequest(request, url, mockEnv);

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toBe("Not found");
    });

    it("should return JSON content type for error responses", async () => {
      const request = new Request("http://localhost/api/nlq/bad", {
        method: "GET",
      });
      const url = new URL(request.url);

      const response = await handleNLQRequest(request, url, mockEnv);

      expect(response.headers.get("Content-Type")).toContain(
        "application/json",
      );
    });

    it("should include CORS headers in error responses", async () => {
      const request = new Request("http://localhost/api/nlq/missing", {
        method: "GET",
      });
      const url = new URL(request.url);

      const response = await handleNLQRequest(request, url, mockEnv);

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });
});
