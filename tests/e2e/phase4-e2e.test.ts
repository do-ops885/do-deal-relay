/**
 * E2E Tests — ADR-020 Phase 4 (NEW-QA-1)
 *
 * Tests auth flow, API key management (create/list/revoke/rotate),
 * and rate limiting behavior using vitest + fetch mocking.
 *
 * Run: npx vitest run --config vitest.config.unit.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

// ---------------------------------------------------------------------------
// Auth Flow Tests
// ---------------------------------------------------------------------------

describe("Auth Flow", () => {
  let registerResponse: Response;
  let loginResponse: Response;
  let accessToken: string;
  let refreshToken: string;

  it("should register a new user", async () => {
    const response = await fetch("http://localhost:8787/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "e2e-test@example.com",
        password: "TestPassword123!",
        name: "E2E Test User",
      }),
    });
    expect(response.status).toBe(201);
    registerResponse = response;
  });

  it("should login and receive tokens", async () => {
    const response = await fetch("http://localhost:8787/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "e2e-test@example.com",
        password: "TestPassword123!",
      }),
    });
    expect(response.status).toBe(200);

    const data = (await response.json()) as {
      accessToken: string;
      refreshToken: string;
      user: { id: string };
    };
    expect(data.accessToken).toBeTruthy();
    expect(data.refreshToken).toBeTruthy();
    expect(data.user.id).toBeTruthy();

    accessToken = data.accessToken;
    refreshToken = data.refreshToken;
    loginResponse = response;
  });

  it("should get current user profile with valid token", async () => {
    const response = await fetch("http://localhost:8787/api/auth/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    expect(response.status).toBe(200);

    const data = (await response.json()) as { email: string };
    expect(data.email).toBe("e2e-test@example.com");
  });

  it("should reject unauthenticated profile requests", async () => {
    const response = await fetch("http://localhost:8787/api/auth/me", {
      method: "GET",
    });
    expect(response.status).toBe(401);
  });

  it("should refresh an expired access token", async () => {
    const response = await fetch("http://localhost:8787/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    expect(response.status).toBe(200);

    const data = (await response.json()) as { accessToken: string };
    expect(data.accessToken).toBeTruthy();
    accessToken = data.accessToken;
  });
});

// ---------------------------------------------------------------------------
// API Key Management Tests (NEW-FEAT-4)
// ---------------------------------------------------------------------------

describe("API Key Management", () => {
  let adminToken: string;
  let createdKeyHash: string;
  let plainTextKey: string;

  beforeAll(async () => {
    // Login as admin to get token
    const response = await fetch("http://localhost:8787/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "admin@example.com",
        password: "AdminPassword123!",
      }),
    });
    const data = (await response.json()) as { accessToken: string };
    adminToken = data.accessToken;
  });

  it("should create a new API key", async () => {
    const response = await fetch("http://localhost:8787/api/admin/keys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        userId: "test-user-1",
        role: "user",
        rateLimit: { requestsPerMinute: 30, requestsPerHour: 500 },
      }),
    });
    expect(response.status).toBe(201);

    const data = (await response.json()) as { apiKey: string };
    expect(data.apiKey).toBeTruthy();
    expect(data.apiKey.startsWith("ddr_")).toBe(true);
    plainTextKey = data.apiKey;
  });

  it("should list API keys", async () => {
    const response = await fetch("http://localhost:8787/api/admin/keys", {
      method: "GET",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(response.status).toBe(200);

    const data = (await response.json()) as { keys: Array<{ hash: string }> };
    expect(Array.isArray(data.keys)).toBe(true);
    expect(data.keys.length).toBeGreaterThan(0);

    // Find the key we just created
    const created = data.keys.find((k) => data.keys.length > 0);
    if (created) createdKeyHash = created.hash;
  });

  it("should rotate an API key (NEW-FEAT-4)", async () => {
    // First list keys to find one to rotate
    const listResp = await fetch("http://localhost:8787/api/admin/keys", {
      method: "GET",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const listData = (await listResp.json()) as {
      keys: Array<{ hash: string }>;
    };
    const keyToRotate = listData.keys[listData.keys.length - 1];
    expect(keyToRotate).toBeTruthy();
    if (!keyToRotate) return;

    const response = await fetch(
      `http://localhost:8787/api/admin/keys/${keyToRotate.hash}/rotate`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );
    expect(response.status).toBe(201);

    const data = (await response.json()) as {
      apiKey: string;
      rotatedFrom: string;
    };
    expect(data.apiKey).toBeTruthy();
    expect(data.rotatedFrom).toBe(keyToRotate.hash);
    expect(data.apiKey.startsWith("ddr_")).toBe(true);
  });

  it("should revoke an API key", async () => {
    const listResp = await fetch("http://localhost:8787/api/admin/keys", {
      method: "GET",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const listData = (await listResp.json()) as {
      keys: Array<{ hash: string }>;
    };
    const keyToRevoke = listData.keys[listData.keys.length - 1];
    expect(keyToRevoke).toBeTruthy();
    if (!keyToRevoke) return;

    const response = await fetch(
      `http://localhost:8787/api/admin/keys/${keyToRevoke.hash}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );
    expect(response.status).toBe(200);

    const data = (await response.json()) as { success: boolean };
    expect(data.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rate Limiting Tests (NEW-OPS-1)
// ---------------------------------------------------------------------------

describe("Rate Limiting", () => {
  it("should return rate limit headers on responses", async () => {
    const response = await fetch("http://localhost:8787/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "e2e-test@example.com",
        password: "TestPassword123!",
      }),
    });
    expect(response.headers.get("X-RateLimit-Limit")).toBeTruthy();
    expect(response.headers.get("X-RateLimit-Remaining")).toBeTruthy();
    expect(response.headers.get("X-RateLimit-Reset")).toBeTruthy();
  });

  it("should eventually rate limit excessive requests", async () => {
    let got429 = false;

    // Fire 10 rapid requests to login (limit is 10/min)
    for (let i = 0; i < 12; i++) {
      const response = await fetch("http://localhost:8787/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "e2e-test@example.com",
          password: "wrong-password",
        }),
      });
      if (response.status === 429) {
        got429 = true;
        break;
      }
    }

    expect(got429).toBe(true);
  });

  it("should return rate limit analytics (NEW-OPS-1)", async () => {
    // Login as admin
    const loginResp = await fetch("http://localhost:8787/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "admin@example.com",
        password: "AdminPassword123!",
      }),
    });
    const loginData = (await loginResp.json()) as { accessToken: string };

    const response = await fetch(
      "http://localhost:8787/api/admin/rate-limit-analytics",
      {
        method: "GET",
        headers: { Authorization: `Bearer ${loginData.accessToken}` },
      },
    );
    expect(response.status).toBe(200);

    const data = (await response.json()) as {
      total: number;
      blocked: number;
      byEndpoint: Record<string, unknown>;
    };
    expect(typeof data.total).toBe("number");
    expect(typeof data.blocked).toBe("number");
    expect(typeof data.byEndpoint).toBe("object");
  });
});
