import { describe, it, expect, vi } from "vitest";
import { handleSubscribe } from "../../../worker/routes/webhooks/subscriptions";

// Mock security module validateFetchUrl to ensure test hermeticity without live DNS calls
vi.mock("../../../worker/lib/security", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../worker/lib/security")>();
  return {
    ...actual,
    validateFetchUrl: vi.fn().mockImplementation(async (url: string) => {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:") return false;
        if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost")
          return false;
        return true;
      } catch {
        return false;
      }
    }),
  };
});

// Mock global-logger to avoid pollution
vi.mock("../../../worker/lib/global-logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock the webhook lib
vi.mock("../../../worker/lib/webhook/index", () => ({
  createSubscription: vi.fn().mockResolvedValue({
    id: "sub_123",
    url: "https://example.com/webhook",
    events: ["referral.created"],
    secret: "sec_123",
    active: true,
    created_at: new Date().toISOString(),
  }),
  VALID_WEBHOOK_EVENTS: ["referral.created", "referral.updated"],
}));

describe("Webhook Subscription SSRF Protection", () => {
  const mockEnv = {
    WEBHOOK_API_KEYS: {
      get: vi.fn().mockResolvedValue(
        JSON.stringify({
          userId: "user_1",
          role: "admin",
          rateLimit: { requestsPerMinute: 60, requestsPerHour: 1000 },
        }),
      ),
      put: vi.fn(),
    },
    DEALS_SOURCES: {
      get: vi.fn(),
      put: vi.fn(),
    },
  } as any;

  it("should block subscription to private IP", async () => {
    const request = new Request("https://api.test/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "ddr_12345678901234567890123456789012_1234567890",
      },
      body: JSON.stringify({
        url: "https://127.0.0.1/admin",
        events: ["referral.created"],
      }),
    });

    const response = await handleSubscribe(request, mockEnv);
    const data = (await response.json()) as any;

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/disallowed|SSRF|blocked/i);
  });

  it("should block subscription to non-HTTPS URL", async () => {
    const request = new Request("https://api.test/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "ddr_12345678901234567890123456789012_1234567890",
      },
      body: JSON.stringify({
        url: "http://example.com/webhook",
        events: ["referral.created"],
      }),
    });

    const response = await handleSubscribe(request, mockEnv);
    const data = (await response.json()) as any;

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/disallowed|SSRF|blocked/i);
  });

  it("should allow public HTTPS URLs", async () => {
    const request = new Request("https://api.test/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "ddr_12345678901234567890123456789012_1234567890",
      },
      body: JSON.stringify({
        url: "https://example.com/webhook",
        events: ["referral.created"],
      }),
    });

    const response = await handleSubscribe(request, mockEnv);
    expect(response.status).toBe(201);
  });
});
