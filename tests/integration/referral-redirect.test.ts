import { describe, it, expect, vi, beforeEach } from "vitest";
import worker from "../../worker/index";
import type { Env } from "../../worker/types";

describe("Referral Redirect Security", () => {
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

  function seedReferral(referral: {
    id: string;
    code: string;
    status: string;
  }): void {
    mockKvStorage.set(
      `sources:referral:input:${referral.id}`,
      JSON.stringify({
        url: "https://example.com/ref",
        domain: "example.com",
        ...referral,
      }),
    );
    mockKvStorage.set(
      "sources:referral:index:code",
      JSON.stringify({
        [referral.code.toLowerCase()]: referral.id,
      }),
    );
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
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
      AI_GATEWAY_URL: "https://example.com",
      TRUST_THRESHOLD: "0.5",
      NOTIFICATION_THRESHOLD: "10",
    } as unknown as Env;
  });

  it("should return JSON response when no redirect parameter is provided", async () => {
    seedReferral({ id: "123", code: "MYCODE", status: "active" });

    const request = new Request("http://localhost/api/referrals/MYCODE", {
      headers: { ...authHeader },
    });
    const response = await worker.fetch(request, mockEnv);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      referral: { code: string };
      error?: string;
    };
    expect(body.referral.code).toBe("MYCODE");
  });

  it("should redirect to an allowed domain", async () => {
    seedReferral({ id: "123", code: "MYCODE", status: "active" });

    const request = new Request(
      "http://localhost/api/referrals/MYCODE?redirect=https://do-deal-relay.com/welcome",
      { headers: { ...authHeader } },
    );
    const response = await worker.fetch(request, mockEnv);

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "https://do-deal-relay.com/welcome",
    );
  });

  it("should block redirect to an unauthorized domain", async () => {
    seedReferral({ id: "123", code: "MYCODE", status: "active" });

    const request = new Request(
      "http://localhost/api/referrals/MYCODE?redirect=https://evil-phishing-site.com",
      { headers: { ...authHeader } },
    );
    const response = await worker.fetch(request, mockEnv);

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      referral: { code: string };
      error?: string;
    };
    expect(body.error).toBe("Invalid redirect URL");
  });

  it("should block redirect with malicious protocol", async () => {
    seedReferral({ id: "123", code: "MYCODE", status: "active" });

    const request = new Request(
      "http://localhost/api/referrals/MYCODE?redirect=javascript:alert('XSS')",
      { headers: { ...authHeader } },
    );
    const response = await worker.fetch(request, mockEnv);

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      referral: { code: string };
      error?: string;
    };
    expect(body.error).toBe("Invalid redirect URL");
  });

  it("should handle invalid redirect URL format", async () => {
    seedReferral({ id: "123", code: "MYCODE", status: "active" });

    const request = new Request(
      "http://localhost/api/referrals/MYCODE?redirect=not-a-valid-url",
      { headers: { ...authHeader } },
    );
    const response = await worker.fetch(request, mockEnv);

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      referral: { code: string };
      error?: string;
    };
    expect(body.error).toBe("Invalid redirect URL");
  });

  it("should allow redirect to localhost in test environment", async () => {
    seedReferral({ id: "123", code: "MYCODE", status: "active" });

    const request = new Request(
      "http://localhost/api/referrals/MYCODE?redirect=http://localhost:3000/callback",
      { headers: { ...authHeader } },
    );
    const response = await worker.fetch(request, mockEnv);

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "http://localhost:3000/callback",
    );
  });
});
