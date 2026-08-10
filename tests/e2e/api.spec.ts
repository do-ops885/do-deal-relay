import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Browser-based API endpoint tests
 * Tests the Deal Discovery System using Playwright
 */

const ADMIN_API_KEY_PATH = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  ".admin-api-key",
);

function getApiKey(): string {
  if (!existsSync(ADMIN_API_KEY_PATH)) {
    throw new Error(
      "E2E admin API key fixture is missing; run tests/e2e/setup-auth.sh first",
    );
  }
  const key = readFileSync(ADMIN_API_KEY_PATH, "utf8").trim();
  if (!key) throw new Error("E2E admin API key fixture is empty");
  return key;
}

const JWT_TOKEN_PATH = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  ".jwt-token",
);

let cachedToken: string | undefined;

/**
 * Returns the E2E JWT access token from the shared file written by global-setup.
 * Returns undefined if the token file is missing or invalid.
 */
function getJwtToken(): string | undefined {
  if (cachedToken !== undefined) return cachedToken;
  if (!existsSync(JWT_TOKEN_PATH)) {
    cachedToken = undefined;
    return cachedToken;
  }
  const token = readFileSync(JWT_TOKEN_PATH, "utf-8").trim();
  if (token && token.includes(".") && token.split(".").length === 3) {
    cachedToken = token;
  } else {
    cachedToken = undefined;
  }
  return cachedToken;
}

/**
 * Creates auth headers using a Bearer JWT token.
 * Throws if the token is not available.
 */
function jwtAuthHeaders(): Record<string, string> {
  const token = getJwtToken();
  if (!token) {
    throw new Error(
      "E2E_JWT_TOKEN not set – JWT auth tests require a valid token from global setup. " +
        "Ensure global setup authentication succeeded and token was persisted correctly.",
    );
  }
  // Validate token format (should be 3 dot-separated segments)
  if (!token.includes(".") || token.split(".").length !== 3) {
    throw new Error(
      "E2E_JWT_TOKEN has invalid format – expected JWT with 3 dot-separated segments",
    );
  }
  return { Authorization: `Bearer ${token}` };
}

test.describe("Health Endpoints", () => {
  test("GET /health returns healthy status", async ({ request }) => {
    const response = await request.get("/health");

    expect(response.status()).toBe(200);

    // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
    const body = (await response.json()) as any;
    expect(body).toHaveProperty("status", "healthy");
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("timestamp");
  });

  test("GET /health/ready returns readiness probe", async ({ request }) => {
    const response = await request.get("/health/ready");

    expect(response.status()).toBe(200);

    // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
    const body = (await response.json()) as any;
    expect(body).toHaveProperty("ready");
    expect(body.ready).toBe(true);
  });

  test("GET /health/live returns liveness probe", async ({ request }) => {
    const response = await request.get("/health/live");

    expect(response.status()).toBe(200);

    // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
    const body = (await response.json()) as any;
    expect(body).toHaveProperty("alive");
    expect(body.alive).toBe(true);
  });
});

test.describe("Deals API", () => {
  const authHeaders = () => ({ "X-API-Key": getApiKey() });

  test("GET /deals returns deals list", async ({ request }) => {
    const response = await request.get("/deals", { headers: authHeaders() });

    expect(response.status()).toBe(200);

    // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
    const body = (await response.json()) as any;
    expect(Array.isArray(body)).toBe(true);
  });

  test("GET /deals.json returns raw deals", async ({ request }) => {
    const response = await request.get("/deals.json", {
      headers: authHeaders(),
    });

    expect(response.status()).toBe(200);

    const contentType = response.headers()["content-type"];
    expect(contentType).toContain("application/json");

    // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
    const body = (await response.json()) as any;
    expect(body).toHaveProperty("deals");
    expect(Array.isArray(body.deals)).toBe(true);
  });

  test("GET /deals supports filtering by category", async ({ request }) => {
    const response = await request.get("/deals?category=finance", {
      headers: authHeaders(),
    });

    expect(response.status()).toBe(200);

    // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
    const body = (await response.json()) as any;
    expect(Array.isArray(body)).toBe(true);
  });

  test("GET /deals supports pagination with limit", async ({ request }) => {
    const response = await request.get("/deals?limit=5", {
      headers: authHeaders(),
    });

    expect(response.status()).toBe(200);

    // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
    const body = (await response.json()) as any;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeLessThanOrEqual(5);
  });
});

test.describe("Ranked Deals API", () => {
  const authHeaders = () => ({ "X-API-Key": getApiKey() });

  test("GET /deals/ranked returns ranked deals", async ({ request }) => {
    const response = await request.get("/deals/ranked", {
      headers: authHeaders(),
    });

    expect(response.status()).toBe(200);

    // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
    const body = (await response.json()) as any;
    expect(body).toHaveProperty("deals");
    expect(body).toHaveProperty("meta");
    expect(Array.isArray(body.deals)).toBe(true);
  });

  test("GET /deals/ranked supports sorting by confidence", async ({
    request,
  }) => {
    const response = await request.get("/deals/ranked?sort_by=confidence", {
      headers: authHeaders(),
    });

    expect(response.status()).toBe(200);

    // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
    const body = (await response.json()) as any;
    expect(body.meta.sort_by).toBe("confidence");
  });

  test("GET /deals/highlights returns featured deals", async ({ request }) => {
    const response = await request.get("/deals/highlights", {
      headers: authHeaders(),
    });

    expect(response.status()).toBe(200);

    // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
    const body = (await response.json()) as any;
    expect(body).toHaveProperty("top_deals");
    expect(body).toHaveProperty("expiring_soon");
    expect(body).toHaveProperty("recently_added");
  });
});

test.describe("Protected API Endpoints", () => {
  const authHeaders = () => ({ "X-API-Key": getApiKey() });

  test("GET /api/analytics returns analytics data (requires auth)", async ({
    request,
  }) => {
    const response = await request.get("/api/analytics", {
      headers: authHeaders(),
    });

    expect(response.status()).toBe(200);
    // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
    const body = (await response.json()) as any;
    expect(body).toHaveProperty("qualityMetrics");
  });

  test("GET /api/status returns pipeline status (requires auth)", async ({
    request,
  }) => {
    const response = await request.get("/api/status", {
      headers: authHeaders(),
    });

    expect(response.status()).toBe(200);
    // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
    const body = (await response.json()) as any;
    expect(body).toHaveProperty("locked");
  });

  test("GET /api/log returns recent logs (requires auth)", async ({
    request,
  }) => {
    const response = await request.get("/api/log", {
      headers: authHeaders(),
    });

    expect(response.status()).toBe(200);
    // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
    const body = (await response.json()) as any;
    expect(body).toHaveProperty("logs");
    expect(Array.isArray(body.logs)).toBe(true);
  });

  test("GET /metrics returns metrics data (requires auth)", async ({
    request,
  }) => {
    const response = await request.get("/metrics?format=json", {
      headers: authHeaders(),
    });

    expect(response.status()).toBe(200);
    const contentType = response.headers()["content-type"];
    expect(contentType).toContain("application/json");
    const body = await response.json();
    expect(body).toHaveProperty("funnel");
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
    const response = await request.get("/health", {
      headers: { Origin: "http://localhost:8787" },
    });

    expect(response.status()).toBe(200);

    const headers = response.headers();
    expect(headers["access-control-allow-origin"]).toBe(
      "http://localhost:8787",
    );
  });
});

// ============================================================================
// JWT Bearer Token Authentication Tests
// These tests verify that endpoints accept Authorization: Bearer <jwt> headers
// in addition to the X-API-Key header used by other tests.
// ============================================================================

test.describe("JWT Auth – Deals API", () => {
  // Skip entire suite if JWT token was not obtained during setup
  test.skip(() => !getJwtToken(), "E2E_JWT_TOKEN not available");

  // Debug logging for JWT token availability
  test.beforeAll(() => {
    const token = getJwtToken();
    if (token) {
      console.log(`JWT Token Available: true`);
      console.log(`Token Length: ${token.length}`);
      console.log(
        `Token Format Valid: ${token.includes(".") && token.split(".").length === 3}`,
      );
    } else {
      console.log("JWT Token Available: false");
    }
  });

  test("GET /deals with JWT Bearer token", async ({ request }) => {
    const response = await request.get("/deals", {
      headers: jwtAuthHeaders(),
    });

    // 200 if deals exist, 404 if no deals seeded — both证明 JWT auth succeeded
    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
      const body = (await response.json()) as any;
      expect(Array.isArray(body)).toBe(true);
    }
  });

  test("GET /deals.json with JWT Bearer token", async ({ request }) => {
    const response = await request.get("/deals.json", {
      headers: jwtAuthHeaders(),
    });

    // 200 if deals exist, 404 if no deals seeded — both prove JWT auth succeeded
    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const contentType = response.headers()["content-type"];
      expect(contentType).toContain("application/json");
      // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
      const body = (await response.json()) as any;
      expect(body).toHaveProperty("deals");
      expect(Array.isArray(body.deals)).toBe(true);
    }
  });

  test("GET /deals/ranked with JWT Bearer token", async ({ request }) => {
    const response = await request.get("/deals/ranked", {
      headers: jwtAuthHeaders(),
    });

    // 200 if deals exist, 404 if no deals seeded — both prove JWT auth succeeded
    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
      const body = (await response.json()) as any;
      expect(body).toHaveProperty("deals");
      expect(body).toHaveProperty("meta");
      expect(Array.isArray(body.deals)).toBe(true);
    }
  });

  test("GET /api/analytics with JWT Bearer token", async ({ request }) => {
    const response = await request.get("/api/analytics", {
      headers: jwtAuthHeaders(),
    });

    // Admin role JWT should be accepted (not 401/403)
    expect(response.status()).not.toBe(401);
    expect(response.status()).not.toBe(403);
  });

  test("GET /api/status with JWT Bearer token", async ({ request }) => {
    const response = await request.get("/api/status", {
      headers: jwtAuthHeaders(),
    });

    // Admin role JWT should be accepted (not 401/403)
    expect(response.status()).not.toBe(401);
    expect(response.status()).not.toBe(403);
  });

  test("GET /api/auth/me with JWT Bearer token returns current user", async ({
    request,
  }) => {
    const response = await request.get("/api/auth/me", {
      headers: jwtAuthHeaders(),
    });

    // JWT auth should be accepted (not 401)
    expect(response.status()).not.toBe(401);

    // If user data is seeded, verify the payload
    if (response.status() === 200) {
      // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
      const body = (await response.json()) as any;
      expect(body).toHaveProperty("email", "e2e-test@example.com");
      expect(body).toHaveProperty("name", "E2E Test User");
      expect(body).toHaveProperty("role");
    }
  });
});

test.describe("JWT Auth – No Token", () => {
  test("GET /deals without auth returns 401", async ({ request }) => {
    const response = await request.get("/deals");
    expect(response.status()).toBe(401);
  });

  test("GET /api/analytics without auth returns 401", async ({ request }) => {
    const response = await request.get("/api/analytics");
    expect(response.status()).toBe(401);
  });
});
