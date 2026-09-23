import { describe, it, expect, vi } from "vitest";
import { scoreDealAgainstQuery } from "../../../worker/lib/alerts/matcher";
import {
  formatAlertMessage,
  sendAlertNotification,
} from "../../../worker/lib/alerts/notifier";
import type { Deal } from "../../../worker/types/deal";
import type { AlertSubscriptionRow } from "../../../worker/lib/d1/alert-subscriptions";
import type { Env } from "../../../worker/types";

describe("Alert Matcher and Notifier Unit Tests", () => {
  const sampleDeal: Deal = {
    id: "deal_1",
    code: "AWS500",
    title: "AWS Cloud Credits $500",
    description: "Get $500 in cloud credits for startups",
    url: "https://example.com/aws",
    source: {
      url: "https://example.com",
      domain: "example.com",
      discovered_at: "2026-09-20T00:00:00Z",
      trust_score: 0.9,
    },
    reward: {
      type: "cash",
      value: 500,
      currency: "USD",
    },
    expiry: {
      confidence: 1.0,
      type: "unknown",
    },
    metadata: {
      status: "active",
      confidence_score: 0.9,
      normalized_at: "2026-09-20T00:00:00Z",
      category: ["cloud", "hosting"],
      tags: ["aws", "credits"],
    },
  };

  const sampleSub: AlertSubscriptionRow = {
    id: "sub_123",
    user_id: "user_1",
    saved_query_id: "q_1",
    channel: "email",
    destination: "user@example.com",
    threshold: 0.5,
    frequency: "instant",
    active: 1,
    created_at: 1000,
    updated_at: 1000,
    query: "cloud credits",
  };

  it("should score deal correctly against query string", () => {
    expect(
      scoreDealAgainstQuery(sampleDeal, "cloud credits"),
    ).toBeGreaterThanOrEqual(0.5);
    expect(scoreDealAgainstQuery(sampleDeal, "unrelated query xyz")).toBe(0);
    expect(scoreDealAgainstQuery(sampleDeal, "")).toBe(0);
  });

  it("should format alert notification message correctly", () => {
    const msg = formatAlertMessage(sampleSub, [sampleDeal]);
    expect(msg).toContain('Query: _"cloud credits"_');
    expect(msg).toContain("AWS Cloud Credits $500");
    expect(msg).toContain("AWS500");
  });

  it("should execute sendAlertNotification for email channel", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    const mockEnv = {
      DEALS_DB: {} as any,
      WEBHOOK_SECRET: "test-secret",
      API_ENCRYPTION_KEY: "test-key",
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
      TRUST_THRESHOLD: "0.3",
      NOTIFICATION_THRESHOLD: "100",
      AI_GATEWAY_URL: "https://gateway.ai.cloudflare.com/v1/test",
    } as unknown as Env;

    const res = await sendAlertNotification(mockEnv, sampleSub, [sampleDeal]);
    expect(res.subscriptionId).toBe("sub_123");

    vi.unstubAllGlobals();
  });
});
