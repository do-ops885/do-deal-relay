import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleDealFeedback } from "../../worker/routes/core/deal-feedback";
import { getDealsByCode } from "../../worker/lib/storage";
import {
  recordDealFeedback,
  getDealFeedbackStats,
} from "../../worker/lib/d1/deal-feedback";
import { checkRateLimit } from "../../worker/lib/rate-limit";
import type { Env } from "../../worker/types";
import type { AuthResult } from "../../worker/lib/auth";
import type { Deal } from "../../worker/types/deal";

vi.mock("../../worker/lib/storage", () => ({
  getDealsByCode: vi.fn(),
}));

vi.mock("../../worker/lib/d1/deal-feedback", () => ({
  recordDealFeedback: vi.fn(),
  getDealFeedbackStats: vi.fn(),
}));

vi.mock("../../worker/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  getClientIdentifier: vi.fn(async () => "ip:127.0.0.1"),
  createRateLimitHeaders: vi.fn(() => new Headers()),
}));

vi.mock("../../worker/lib/eu-ai-act-logger", () => ({
  createComplianceLogger: vi.fn(() => ({
    logOperation: complianceSpies.logOperation,
  })),
}));

const complianceSpies = vi.hoisted(() => ({ logOperation: vi.fn() }));

const sampleDeal: Deal = {
  id: "deal_1",
  code: "AWS500",
  title: "AWS Cloud Credits $500",
  description: "cloud credits",
  url: "https://example.com/aws",
  source: {
    url: "https://example.com",
    domain: "example.com",
    discovered_at: "2026-10-02T00:00:00Z",
    trust_score: 0.9,
  },
  reward: { type: "cash", value: 500, currency: "USD" },
  expiry: { confidence: 1.0, type: "unknown" },
  metadata: {
    status: "active",
    confidence_score: 0.9,
    normalized_at: "2026-10-02T00:00:00Z",
    category: [],
    tags: [],
  },
};

function makeEnv(): Env {
  return { DEALS_DB: { prepare: vi.fn() } } as unknown as Env;
}

function makeAuth(userId = "user-1"): AuthResult {
  return { authenticated: true, userId, role: "user" };
}

function makeRequest(body: unknown): Request {
  return new Request("https://worker.dev/api/deals/AWS500/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkRateLimit).mockResolvedValue({
    allowed: true,
    remaining: 10,
    resetTime: Math.floor(Date.now() / 1000) + 60,
    limit: 10,
  });
  vi.mocked(getDealsByCode).mockResolvedValue([sampleDeal]);
  vi.mocked(recordDealFeedback).mockResolvedValue(true);
  vi.mocked(getDealFeedbackStats).mockResolvedValue({
    total: 1,
    success: 1,
    expired: 0,
    invalid: 0,
    successRatio: 1,
  });
});

describe("POST /api/deals/:code/feedback handler", () => {
  it("records feedback and returns stats with 201", async () => {
    const response = await handleDealFeedback(
      makeRequest({ outcome: "success" }),
      "AWS500",
      makeEnv(),
      makeAuth(),
    );
    expect(response.status).toBe(201);
    expect(recordDealFeedback).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "user-1",
        referralCode: "AWS500",
        outcome: "success",
        sourceChannel: "api",
      }),
    );
    const body = (await response.json()) as {
      code: string;
      inserted: boolean;
      feedback: { successRatio: number };
    };
    expect(body.code).toBe("AWS500");
    expect(body.inserted).toBe(true);
    expect(body.feedback.successRatio).toBe(1);
    expect(complianceSpies.logOperation).toHaveBeenCalledTimes(1);
  });

  it("returns 404 for an unknown code", async () => {
    vi.mocked(getDealsByCode).mockResolvedValue([]);
    const response = await handleDealFeedback(
      makeRequest({ outcome: "success" }),
      "NOPE",
      makeEnv(),
      makeAuth(),
    );
    expect(response.status).toBe(404);
    expect(recordDealFeedback).not.toHaveBeenCalled();
  });

  it("returns 400 for an outcome outside the vocabulary", async () => {
    const response = await handleDealFeedback(
      makeRequest({ outcome: "amazing" }),
      "AWS500",
      makeEnv(),
      makeAuth(),
    );
    expect(response.status).toBe(400);
    expect(recordDealFeedback).not.toHaveBeenCalled();
  });

  it("returns 401 when auth carries no user id", async () => {
    const response = await handleDealFeedback(
      makeRequest({ outcome: "success" }),
      "AWS500",
      makeEnv(),
      { authenticated: true },
    );
    expect(response.status).toBe(401);
    expect(recordDealFeedback).not.toHaveBeenCalled();
  });

  it("returns 429 when the rate limit denies the request", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetTime: Math.floor(Date.now() / 1000) + 30,
      limit: 10,
    });
    const response = await handleDealFeedback(
      makeRequest({ outcome: "success" }),
      "AWS500",
      makeEnv(),
      makeAuth(),
    );
    expect(response.status).toBe(429);
    expect(recordDealFeedback).not.toHaveBeenCalled();
  });

  it("reports revised feedback with inserted=false and updated disposition", async () => {
    vi.mocked(recordDealFeedback).mockResolvedValue(false);
    const response = await handleDealFeedback(
      makeRequest({ outcome: "expired" }),
      "AWS500",
      makeEnv(),
      makeAuth(),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { inserted: boolean };
    expect(body.inserted).toBe(false);
    const [firstCall] = complianceSpies.logOperation.mock.calls;
    expect(firstCall?.[0]?.outputData?.result).toBe("updated");
  });

  it("returns 500 when the D1 write fails", async () => {
    vi.mocked(recordDealFeedback).mockRejectedValue(new Error("d1 down"));
    const response = await handleDealFeedback(
      makeRequest({ outcome: "success" }),
      "AWS500",
      makeEnv(),
      makeAuth(),
    );
    expect(response.status).toBe(500);
  });

  it("succeeds even when compliance logging fails (non-critical)", async () => {
    complianceSpies.logOperation.mockRejectedValueOnce(new Error("log down"));
    const response = await handleDealFeedback(
      makeRequest({ outcome: "success" }),
      "AWS500",
      makeEnv(),
      makeAuth(),
    );
    expect(response.status).toBe(201);
  });
});
