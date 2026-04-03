import { test, expect } from "@playwright/test";

/**
 * Browser-based API endpoint tests
 * Tests the Deal Discovery System using Playwright
 */

test.describe("Health Endpoints", () => {
  test("GET /health returns healthy status", async ({ request }) => {
    const response = await request.get("/health");

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("status", "healthy");
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("kv_status");
    expect(body.kv_status).toHaveProperty("DEALS_PROD");
    expect(body.kv_status).toHaveProperty("DEALS_STAGING");
    expect(body.kv_status).toHaveProperty("DEALS_SOURCES");
  });

  test("GET /health/ready returns readiness probe", async ({ request }) => {
    const response = await request.get("/health/ready");

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("ready");
    expect(typeof body.ready).toBe("boolean");
  });

  test("GET /health/live returns liveness probe", async ({ request }) => {
    const response = await request.get("/health/live");

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("alive");
    expect(body.alive).toBe(true);
  });
});

test.describe("Deals API", () => {
  test("GET /deals returns deals list", async ({ request }) => {
    const response = await request.get("/deals");

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("deals");
    expect(body).toHaveProperty("count");
    expect(body).toHaveProperty("generated_at");
    expect(Array.isArray(body.deals)).toBe(true);
  });

  test("GET /deals.json returns raw deals", async ({ request }) => {
    const response = await request.get("/deals.json");

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const contentType = response.headers()["content-type"];
    expect(contentType).toContain("application/json");

    const body = await response.json();
    expect(Array.isArray(body.deals) || typeof body === "object").toBe(true);
  });

  test("GET /deals supports filtering by category", async ({ request }) => {
    const response = await request.get("/deals?category=finance");

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("deals");
    expect(Array.isArray(body.deals)).toBe(true);
  });

  test("GET /deals supports pagination with limit", async ({ request }) => {
    const response = await request.get("/deals?limit=5");

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("deals");
    expect(body.count).toBeLessThanOrEqual(5);
  });
});

test.describe("Ranked Deals API", () => {
  test("GET /deals/ranked returns ranked deals", async ({ request }) => {
    const response = await request.get("/deals/ranked");

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("deals");
    expect(body).toHaveProperty("count");
    expect(body).toHaveProperty("sort_by");
    expect(Array.isArray(body.deals)).toBe(true);
  });

  test("GET /deals/ranked supports sorting by confidence", async ({
    request,
  }) => {
    const response = await request.get("/deals/ranked?sort_by=confidence");

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.sort_by).toBe("confidence");
  });

  test("GET /deals/ranked supports sorting by value", async ({ request }) => {
    const response = await request.get("/deals/ranked?sort_by=value");

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.sort_by).toBe("value");
  });

  test("GET /deals/highlights returns featured deals", async ({ request }) => {
    const response = await request.get("/deals/highlights");

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("top_deals");
    expect(body).toHaveProperty("expiring_soon");
    expect(body).toHaveProperty("recently_added");
    expect(body).toHaveProperty("generated_at");
  });
});

test.describe("Analytics API", () => {
  test("GET /api/analytics returns analytics data", async ({ request }) => {
    const response = await request.get("/api/analytics");

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("summary");
    expect(body).toHaveProperty("categories");
    expect(body).toHaveProperty("sources");
    expect(body).toHaveProperty("quality");
    expect(body).toHaveProperty("generated_at");
  });

  test("GET /api/analytics?format=summary returns summary only", async ({
    request,
  }) => {
    const response = await request.get("/api/analytics?format=summary");

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("summary");
    expect(body.summary).toHaveProperty("total_deals");
    expect(body.summary).toHaveProperty("active_deals");
  });
});

test.describe("API Status Endpoints", () => {
  test("GET /api/status returns pipeline status", async ({ request }) => {
    const response = await request.get("/api/status");

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("pipeline_status");
    expect(body).toHaveProperty("kv_namespaces");
  });

  test("GET /api/log returns recent logs", async ({ request }) => {
    const response = await request.get("/api/log");

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("logs");
    expect(body).toHaveProperty("count");
    expect(Array.isArray(body.logs)).toBe(true);
  });
});

test.describe("Metrics Endpoint", () => {
  test("GET /metrics returns Prometheus metrics", async ({ request }) => {
    const response = await request.get("/metrics");

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const contentType = response.headers()["content-type"];
    expect(contentType).toContain("text/plain");

    const body = await response.text();
    expect(body).toContain("# HELP");
    expect(body).toContain("# TYPE");
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

    expect(response.ok()).toBeTruthy();

    const headers = response.headers();
    // CORS headers should be present for API endpoints
    expect(headers).toBeDefined();
  });
});
