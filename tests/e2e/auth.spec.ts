import { test, expect } from "@playwright/test";

/**
 * E2E tests for API Authentication and Authorization
 * Verifies that protected endpoints correctly handle authentication tokens,
 * role-based access control, and expiration.
 */

// biome-ignore-start lint/security/noSecrets: test fixtures, not real keys
const ADMIN_KEY = "ddr_admin_test_key_0000000000000000";
const USER_KEY = "ddr_user_test_key_0000000000000000";
const EXPIRED_KEY = "ddr_expired_test_key_0000000000000000";
// biome-ignore-end lint/security/noSecrets

test.describe("Authentication (401)", () => {
  test("GET /metrics returns 401 when unauthenticated", async ({ request }) => {
    const response = await request.get("/metrics");
    expect(response.status()).toBe(401);
    // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
    const body: Record<string, unknown> = (await response.json()) as any;
    expect(body.error).toBe("Missing API key");
  });

  test("GET /metrics returns 401 with invalid format key", async ({
    request,
  }) => {
    const response = await request.get("/metrics", {
      headers: { "X-API-Key": "invalid-format" },
    });
    expect(response.status()).toBe(401);
    // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
    const body: Record<string, unknown> = (await response.json()) as any;
    expect(body.error).toBe("Invalid API key format");
  });

  test("GET /metrics returns 401 with non-existent key", async ({
    request,
  }) => {
    const response = await request.get("/metrics", {
      headers: { "X-API-Key": "ddr_nonexistent_key_123456789" },
    });
    expect(response.status()).toBe(401);
    // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
    const body: Record<string, unknown> = (await response.json()) as any;
    expect(body.error).toBe("Invalid API key");
  });

  test("GET /metrics returns 401 with expired key", async ({ request }) => {
    const response = await request.get("/metrics", {
      headers: { "X-API-Key": EXPIRED_KEY },
    });
    expect(response.status()).toBe(401);
    // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
    const body: Record<string, unknown> = (await response.json()) as any;
    expect(body.error).toBe("API key expired");
  });
});

test.describe("Authorization (403)", () => {
  test("GET /metrics returns 403 for user role (admin required)", async ({
    request,
  }) => {
    const response = await request.get("/metrics", {
      headers: { "X-API-Key": USER_KEY },
    });
    expect(response.status()).toBe(403);
    // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
    const body: Record<string, unknown> = (await response.json()) as any;
    expect(body.error).toBe("Required role: admin");
  });

  test("GET /api/status returns 403 for user role (admin required)", async ({
    request,
  }) => {
    const response = await request.get("/api/status", {
      headers: { "X-API-Key": USER_KEY },
    });
    expect(response.status()).toBe(403);
  });
});

test.describe("Successful Authenticated Access", () => {
  test("GET /metrics returns 200 for admin role", async ({ request }) => {
    const response = await request.get("/metrics?format=json", {
      headers: { "X-API-Key": ADMIN_KEY },
    });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");
  });

  test("GET /api/status returns 200 for admin role", async ({ request }) => {
    const response = await request.get("/api/status", {
      headers: { "X-API-Key": ADMIN_KEY },
    });
    expect(response.status()).toBe(200);
    // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
    const body: Record<string, unknown> = (await response.json()) as any;
    expect(body).toHaveProperty("locked");
  });

  test("POST /api/submit accepts user role (returns 400 instead of 401/403)", async ({
    request,
  }) => {
    // We send an empty body which should trigger a validation error (400)
    // but the fact it reaches validation means auth passed.
    const response = await request.post("/api/submit", {
      headers: { "X-API-Key": USER_KEY },
      data: {},
    });

    // Auth should pass, but validation should fail with 400
    expect(response.status()).toBe(400);
    // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
    const body: Record<string, unknown> = (await response.json()) as any;
    expect(body.error).toBeDefined();
    expect(body.error).not.toBe("Unauthorized");
    expect(body.error).not.toBe("Forbidden");
  });
});

test.describe("Authentication Methods", () => {
  test("Accepts Bearer token in Authorization header", async ({ request }) => {
    const response = await request.get("/api/status", {
      headers: { Authorization: `Bearer ${ADMIN_KEY}` },
    });
    expect(response.status()).toBe(200);
  });
});
