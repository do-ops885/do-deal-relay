import { test, expect } from "@playwright/test";

/**
 * Browser-based API endpoint tests
 * Tests the Deal Discovery System using Playwright
 */

const API_KEY = process.env.TEST_API_KEY || "";
const IS_CI = !!process.env.CI;

test.describe("Health Endpoints", () => {
  test("GET /health returns healthy status", async ({ request }) => {
    const response = await request.get("/health");

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("status", "healthy");
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("timestamp");
  });

  test("GET /health/ready returns readiness probe", async ({ request }) => {
    const response = await request.get("/health/ready");

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("ready");
    expect(body.ready).toBe(true);
  });

  test("GET /health/live returns liveness probe", async ({ request }) => {
    const response = await request.get("/health/live");

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("alive");
    expect(body.alive).toBe(true);
  });
});

test.describe("Deals API", () => {
  const authHeaders = { "X-API-Key": API_KEY };

  test("GET /deals returns deals list", async ({ request }) => {
    const response = await request.get("/deals", { headers: authHeaders });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("GET /deals.json returns raw deals", async ({ request }) => {
    const response = await request.get("/deals.json", { headers: authHeaders });

    expect(response.status()).toBe(200);

    const contentType = response.headers()["content-type"];
    expect(contentType).toContain("application/json");

    const body = await response.json();
    expect(body).toHaveProperty("deals");
    expect(Array.isArray(body.deals)).toBe(true);
  });

  test("GET /deals supports filtering by category", async ({ request }) => {
    const response = await request.get("/deals?category=finance", {
      headers: authHeaders,
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("GET /deals supports pagination with limit", async ({ request }) => {
    const response = await request.get("/deals?limit=5", {
      headers: authHeaders,
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeLessThanOrEqual(5);
  });
});

test.describe("Ranked Deals API", () => {
  const authHeaders = { "X-API-Key": API_KEY };

  test("GET /deals/ranked returns ranked deals", async ({ request }) => {
    const response = await request.get("/deals/ranked", {
      headers: authHeaders,
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("deals");
    expect(body).toHaveProperty("meta");
    expect(Array.isArray(body.deals)).toBe(true);
  });

  test("GET /deals/ranked supports sorting by confidence", async ({
    request,
  }) => {
    const response = await request.get("/deals/ranked?sort_by=confidence", {
      headers: authHeaders,
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.meta.sort_by).toBe("confidence");
  });

  test("GET /deals/highlights returns featured deals", async ({ request }) => {
    const response = await request.get("/deals/highlights", {
      headers: authHeaders,
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("top_deals");
    expect(body).toHaveProperty("expiring_soon");
    expect(body).toHaveProperty("recently_added");
  });
});

test.describe("Protected API Endpoints", () => {
  const authHeaders = { "X-API-Key": API_KEY };

  test.beforeEach(() => {
    if (IS_CI && !API_KEY) {
      throw new Error("TEST_API_KEY must be provided in CI environment");
    }
  });

  test("GET /api/analytics returns analytics data (requires auth)", async ({
    request,
  }) => {
    const response = await request.get("/api/analytics", {
      headers: authHeaders,
    });

    if (API_KEY) {
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty("qualityMetrics");
    } else {
      expect(response.status()).toBe(401);
    }
  });

  test("GET /api/status returns pipeline status (requires auth)", async ({
    request,
  }) => {
    const response = await request.get("/api/status", {
      headers: authHeaders,
    });

    if (API_KEY) {
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty("locked");
    } else {
      expect(response.status()).toBe(401);
    }
  });

  test("GET /api/log returns recent logs (requires auth)", async ({
    request,
  }) => {
    const response = await request.get("/api/log", {
      headers: authHeaders,
    });

    if (API_KEY) {
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty("logs");
      expect(Array.isArray(body.logs)).toBe(true);
    } else {
      expect(response.status()).toBe(401);
    }
  });

  test("GET /metrics returns Prometheus metrics (requires auth)", async ({
    request,
  }) => {
    const response = await request.get("/metrics", {
      headers: authHeaders,
    });

    if (API_KEY) {
      expect(response.status()).toBe(200);
      const contentType = response.headers()["content-type"];
      expect(contentType).toContain("text/plain");
      const body = await response.text();
      expect(body).toContain("# HELP");
    } else {
      expect(response.status()).toBe(401);
    }
  });
});

test.describe("404 Handling", () => {
  test("Invalid endpoint returns 404", async ({ request }) => {
    const response = await request.get("/invalid-endpoint");

    expect(response.status()).toBe(404);
  });
});

test.describe("CORS Headers", () => {
  test("API endpoints include CORS headers", async ({ request }) => {
    const response = await request.get("/health");

    expect(response.status()).toBe(200);

    const headers = response.headers();
    expect(headers["access-control-allow-origin"]).toBeDefined();
  });
});
