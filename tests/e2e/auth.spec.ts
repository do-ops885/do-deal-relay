import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

const AUTH_FIXTURE_PATH = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  ".auth-fixtures",
);

type AuthFixtureName = "ADMIN_API_KEY" | "USER_API_KEY" | "EXPIRED_API_KEY";

function getAuthFixture(name: AuthFixtureName): string {
  if (!existsSync(AUTH_FIXTURE_PATH)) {
    throw new Error(
      "E2E auth fixture is missing; run tests/e2e/setup-auth.sh first",
    );
  }
  const entry = readFileSync(AUTH_FIXTURE_PATH, "utf8")
    .split("\\n")
    .find((line) => line.startsWith(`${name}=`));
  const value = entry?.slice(name.length + 1).trim();
  if (!value) throw new Error(`E2E auth fixture ${name} is empty`);
  return value;
}

/**
 * E2E tests for API Authentication and Authorization
 * Verifies that protected endpoints correctly handle authentication tokens,
 * role-based access control, and expiration.
 */

const ADMIN_KEY = getAuthFixture("ADMIN_API_KEY");
const USER_KEY = getAuthFixture("USER_API_KEY");
const EXPIRED_KEY = getAuthFixture("EXPIRED_API_KEY");

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
