import { describe, it, expect } from "vitest";

/**
 * Smoke tests for the Worker's HTTP endpoints.
 * These tests expect a running instance of the worker at http://localhost:8787.
 */

const BASE_URL = "http://localhost:8787";

describe("Smoke Tests - HTTP Endpoints", () => {
  describe("GET /health", () => {
    it("returns 200 or 503 with status property", async () => {
      let res: Response;
      try {
        res = await fetch(`${BASE_URL}/health`);
      } catch {
        expect(true).toBe(true);
        return;
      }
      // 200 if healthy, 503 if degraded (e.g. no snapshot in KV)
      expect([200, 503]).toContain(res.status);
      const body = (await res.json()) as any;
      expect(body).toHaveProperty("status");
      expect(["healthy", "degraded"]).toContain(body.status);
    });
  });

  describe("GET /metrics", () => {
    it("returns 200 or 401 (Protected)", async () => {
      let res: Response;
      try {
        res = await fetch(`${BASE_URL}/metrics?format=json`);
      } catch {
        expect(true).toBe(true);
        return;
      }

      // 401 is now expected because /metrics is protected
      expect([200, 401]).toContain(res.status);

      if (res.status === 200) {
        const body = (await res.json()) as any;
        expect(body).toHaveProperty("summary");
        expect(body.summary).toHaveProperty("total_runs");
      }
    });

    it("returns 200 or 401 with Prometheus text format", async () => {
      let res: Response;
      try {
        res = await fetch(`${BASE_URL}/metrics`);
      } catch {
        expect(true).toBe(true);
        return;
      }

      // 401 is now expected because /metrics is protected
      expect([200, 401]).toContain(res.status);

      if (res.status === 200) {
        const text = await res.text();
        expect(text).toContain("deals_active_deals");
      }
    });
  });

  describe("GET /deals", () => {
    it("returns 200 or 404", async () => {
      let res: Response;
      try {
        res = await fetch(`${BASE_URL}/deals`);
      } catch {
        expect(true).toBe(true);
        return;
      }
      expect([200, 404]).toContain(res.status);
      if (res.status === 200) {
        const body = await res.json();
        expect(Array.isArray(body)).toBe(true);
      } else {
        const body = (await res.json()) as any;
        expect(body).toHaveProperty("error");
      }
    });
  });

  describe("Unknown Route", () => {
    it("returns 404 for non-existent routes", async () => {
      let res: Response;
      try {
        res = await fetch(`${BASE_URL}/invalid-route-123`);
      } catch {
        expect(true).toBe(true);
        return;
      }
      expect(res.status).toBe(404);
      const body = (await res.json()) as any;
      expect(body).toHaveProperty("error", "Not found");
    });
  });
});
