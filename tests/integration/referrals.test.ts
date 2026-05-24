import { describe, it, expect, vi, beforeEach } from "vitest";
import worker from "../../worker/index";
import type { Env } from "../../worker/types";

describe("Referral Deactivation", () => {
  const authHeader = { "X-API-Key": "ddr_admin_test_key_123" };
  let mockKvStorage: Map<string, unknown>;
  let mockEnv: Env;

  function mockKvFactory(prefix: string) {
    return {
      get: vi.fn(async (key: string, type?: string) => {
        const fullKey = `${prefix}:${key}`;
        const value = mockKvStorage.get(fullKey);
        if (value === undefined) return null;
        if (type === "json" && typeof value === "string") {
          return JSON.parse(value);
        }
        return value;
      }),
      put: vi.fn(async (key: string, value: string) => {
        const fullKey = `${prefix}:${key}`;
        mockKvStorage.set(fullKey, value);
      }),
    };
  }

  beforeEach(async () => {
    mockKvStorage = new Map();
    // Set up auth
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      encoder.encode("ddr_admin_test_key_123"),
    );
    const hash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    mockKvStorage.set(
      "sources:apikey:" + hash,
      JSON.stringify({ role: "admin", userId: "test-user" }),
    );

    mockEnv = {
      DEALS_SOURCES: mockKvFactory("sources"),
      DEALS_PROD: mockKvFactory("prod"),
      DEALS_LOG: mockKvFactory("log"),
      DEALS_LOCK: mockKvFactory("lock"),
      DEALS_DB: {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          first: vi.fn(),
          run: vi.fn().mockResolvedValue({ success: true }),
          all: vi.fn().mockResolvedValue({ results: [] }),
        }),
      } as any,
      AI_GATEWAY_URL: "https://example.com",
      WEBHOOK_SECRET: "test-secret",
      API_ENCRYPTION_KEY: "test-key",
      EMAIL_WEBHOOK_SECRET: "test-email-secret",
      EMAIL_WEBHOOK_SECRET: "test-email-secret",
      EMAIL_WEBHOOK_SECRET: "test-email-secret",
      EMAIL_WEBHOOK_SECRET: "test-email-secret",
      EMAIL_WEBHOOK_SECRET: "test-email-secret",
      EMAIL_WEBHOOK_SECRET: "test-email-secret",
      TRUST_THRESHOLD: "0.5",
      NOTIFICATION_THRESHOLD: "10",
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
    } as unknown as Env;
  });

  it("should deactivate a referral via POST /api/referrals/:code/deactivate", async () => {
    // Seed a referral
    const referral = {
      id: "123",
      code: "MYCODE",
      status: "active",
      url: "https://example.com/ref",
      domain: "example.com",
    };
    mockKvStorage.set("sources:referral:input:123", JSON.stringify(referral));
    mockKvStorage.set(
      "sources:referral:index:code",
      JSON.stringify({ mycode: "123" }),
    );

    const request = new Request(
      "http://localhost/api/referrals/MYCODE/deactivate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: JSON.stringify({ id: "123", reason: "test" }),
      },
    );

    const response = await worker.fetch(request, mockEnv);
    const body = (await response.json()) as any;

    if (response.status !== 200) {
      console.log("Error response:", JSON.stringify(body, null, 2));
    }

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.referral.code).toBe("MYCODE");
  });

  it("should return 404 for non-existent referral deactivation", async () => {
    const request = new Request(
      "http://localhost/api/referrals/NONEXISTENT/deactivate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: JSON.stringify({ id: "999", reason: "test" }),
      },
    );

    const response = await worker.fetch(request, mockEnv);
    expect(response.status).toBe(404);
  });

  it("should reactivate a referral via POST /api/referrals/:code/reactivate", async () => {
    // Seed an inactive referral
    const referral = {
      id: "456",
      code: "INACTIVE",
      status: "inactive",
      url: "https://example.com/ref",
      domain: "example.com",
    };
    mockKvStorage.set("sources:referral:input:456", JSON.stringify(referral));
    mockKvStorage.set(
      "sources:referral:index:code",
      JSON.stringify({ inactive: "456" }),
    );

    const request = new Request(
      "http://localhost/api/referrals/INACTIVE/reactivate",
      {
        method: "POST",
        headers: {
          ...authHeader,
        },
      },
    );

    const response = await worker.fetch(request, mockEnv);
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.referral.status).toBe("active");
  });

  // --- Helper: seed referral data into mock KV ---
  function seedReferral(data: {
    id: string;
    code: string;
    status: string;
    url?: string;
    domain?: string;
    reason?: string;
  }) {
    const ref = {
      url: "https://example.com/ref",
      domain: "example.com",
      ...data,
    };
    mockKvStorage.set(`sources:referral:input:${data.id}`, JSON.stringify(ref));
    mockKvStorage.set(
      "sources:referral:index:code",
      JSON.stringify({ [data.code.toLowerCase()]: data.id }),
    );
  }

  // --- Helper: create an authenticated POST request ---
  function createAuthenticatedPostRequest(path: string, body?: object) {
    return new Request(`http://localhost${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  it("should return 409 when reactivating an already active referral", async () => {
    seedReferral({
      id: "active-123",
      code: "ALREADY_ACTIVE",
      status: "active",
    });

    const request = createAuthenticatedPostRequest(
      "/api/referrals/ALREADY_ACTIVE/reactivate",
    );

    const response = await worker.fetch(request, mockEnv);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(409);
    expect(body.error).toBe("Conflict");
  });

  it("should return 404 when reactivating a non-existent referral code", async () => {
    const request = createAuthenticatedPostRequest(
      "/api/referrals/MISSING_CODE/reactivate",
    );

    const response = await worker.fetch(request, mockEnv);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(404);
    expect(body.error).toBe("Referral not found");
  });

  it("should handle Deactivate -> Reactivate round-trip", async () => {
    seedReferral({
      id: "round-trip-123",
      code: "ROUND_TRIP",
      status: "active",
    });

    const deactivateRequest = createAuthenticatedPostRequest(
      "/api/referrals/ROUND_TRIP/deactivate",
      { id: "round-trip-123", reason: "Testing round-trip" },
    );

    const deactivateResponse = await worker.fetch(deactivateRequest, mockEnv);
    expect(deactivateResponse.status).toBe(200);

    const getRequest1 = new Request(
      "http://localhost/api/referrals/ROUND_TRIP",
      {
        method: "GET",
        headers: authHeader,
      },
    );
    const getResponse1 = await worker.fetch(getRequest1, mockEnv);
    const body1 = (await getResponse1.json()) as Record<string, unknown>;
    expect((body1.referral as Record<string, unknown>).status).toBe("inactive");

    const reactivateRequest = createAuthenticatedPostRequest(
      "/api/referrals/ROUND_TRIP/reactivate",
    );

    const reactivateResponse = await worker.fetch(reactivateRequest, mockEnv);
    expect(reactivateResponse.status).toBe(200);

    const getRequest2 = new Request(
      "http://localhost/api/referrals/ROUND_TRIP",
      {
        method: "GET",
        headers: authHeader,
      },
    );
    const getResponse2 = await worker.fetch(getRequest2, mockEnv);
    const body2 = (await getResponse2.json()) as Record<string, unknown>;
    expect((body2.referral as Record<string, unknown>).status).toBe("active");
  });
  it("should return referral details via GET /api/referrals/:code", async () => {
    // Seed a referral
    const referral = {
      id: "789",
      code: "GETME",
      status: "active",
      url: "https://example.com/ref",
      domain: "example.com",
    };
    mockKvStorage.set("sources:referral:input:789", JSON.stringify(referral));
    mockKvStorage.set(
      "sources:referral:index:code",
      JSON.stringify({ getme: "789" }),
    );

    const request = new Request("http://localhost/api/referrals/GETME", {
      method: "GET",
      headers: authHeader,
    });

    const response = await worker.fetch(request, mockEnv);
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(body.referral.code).toBe("GETME");
    expect(body.referral.id).toBe("789");
  });
});
