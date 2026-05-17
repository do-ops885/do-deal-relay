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
    const body = await response.json();

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
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.referral.status).toBe("active");
  });

  it("should return 409 when reactivating an already active referral", async () => {
    // Seed an active referral
    const referral = {
      id: "active-123",
      code: "ALREADY_ACTIVE",
      status: "active",
      url: "https://example.com/ref",
      domain: "example.com",
    };
    mockKvStorage.set(
      "sources:referral:input:active-123",
      JSON.stringify(referral),
    );
    mockKvStorage.set(
      "sources:referral:index:code",
      JSON.stringify({ already_active: "active-123" }),
    );

    const request = new Request(
      "http://localhost/api/referrals/ALREADY_ACTIVE/reactivate",
      {
        method: "POST",
        headers: {
          ...authHeader,
        },
      },
    );

    const response = await worker.fetch(request, mockEnv);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("Conflict");
  });

  it("should handle Deactivate -> Reactivate round-trip", async () => {
    // Seed an active referral
    const referral = {
      id: "round-trip-123",
      code: "ROUND_TRIP",
      status: "active",
      url: "https://example.com/ref",
      domain: "example.com",
    };
    mockKvStorage.set(
      "sources:referral:input:round-trip-123",
      JSON.stringify(referral),
    );
    mockKvStorage.set(
      "sources:referral:index:code",
      JSON.stringify({ round_trip: "round-trip-123" }),
    );

    // 1. Deactivate
    const deactivateRequest = new Request(
      "http://localhost/api/referrals/ROUND_TRIP/deactivate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: JSON.stringify({
          id: "round-trip-123",
          reason: "Testing round-trip",
        }),
      },
    );

    const deactivateResponse = await worker.fetch(deactivateRequest, mockEnv);
    expect(deactivateResponse.status).toBe(200);

    // Verify it's inactive
    const getRequest1 = new Request("http://localhost/api/referrals/ROUND_TRIP", {
      method: "GET",
    });
    const getResponse1 = await worker.fetch(getRequest1, mockEnv);
    const body1 = await getResponse1.json();
    expect(body1.referral.status).toBe("inactive");

    // 2. Reactivate
    const reactivateRequest = new Request(
      "http://localhost/api/referrals/ROUND_TRIP/reactivate",
      {
        method: "POST",
        headers: {
          ...authHeader,
        },
      },
    );

    const reactivateResponse = await worker.fetch(reactivateRequest, mockEnv);
    expect(reactivateResponse.status).toBe(200);

    // Verify it's active again
    const getRequest2 = new Request("http://localhost/api/referrals/ROUND_TRIP", {
      method: "GET",
    });
    const getResponse2 = await worker.fetch(getRequest2, mockEnv);
    const body2 = await getResponse2.json();
    expect(body2.referral.status).toBe("active");
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
    });

    const response = await worker.fetch(request, mockEnv);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.referral.code).toBe("GETME");
    expect(body.referral.id).toBe("789");
  });
});
