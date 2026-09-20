import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleNLQRequest } from "../../../worker/routes/nlq/index";
import type { Env } from "../../../worker/types";

vi.mock("../../../worker/lib/auth", () => ({
  authenticateRequest: vi.fn().mockResolvedValue({
    authenticated: true,
    userId: "user_test_123",
  }),
}));

describe("NLQ Alert Subscription Endpoints", () => {
  let mockEnv: Env;
  let mockD1: any;

  beforeEach(() => {
    const prep = vi.fn().mockImplementation((query: string) => ({
      bind: vi.fn().mockImplementation((...params: any[]) => ({
        run: vi.fn().mockResolvedValue({ results: [], meta: { changes: 1, rows_read: 0, rows_written: 0 } }),
        all: vi.fn().mockResolvedValue({ results: [], meta: { rows_read: 0, rows_written: 0 } }),
        first: vi.fn().mockResolvedValue({ cnt: 0 }),
      })),
      run: vi.fn().mockResolvedValue({ results: [], meta: { changes: 1, rows_read: 0, rows_written: 0 } }),
      all: vi.fn().mockResolvedValue({ results: [], meta: { rows_read: 0, rows_written: 0 } }),
      first: vi.fn().mockResolvedValue({ cnt: 0 }),
    }));

    mockD1 = {
      prepare: prep,
      withSession: vi.fn().mockReturnValue({
        prepare: prep,
        getBookmark: vi.fn().mockReturnValue("bookmark"),
      }),
    };

    mockEnv = {
      DEALS_DB: mockD1,
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
      TRUST_THRESHOLD: "0.3",
      NOTIFICATION_THRESHOLD: "100",
      AI_GATEWAY_URL: "https://gateway.ai.cloudflare.com/v1/test",
      WEBHOOK_SECRET: "test-secret",
      API_ENCRYPTION_KEY: "test-key",
    } as unknown as Env;
  });

  it("should return 503 if DEALS_DB is not configured for POST /api/nlq/alerts", async () => {
    const envWithoutDB = { ...mockEnv, DEALS_DB: undefined } as unknown as Env;
    const req = new Request("https://example.com/api/nlq/alerts", {
      method: "POST",
      body: JSON.stringify({
        saved_query_id: "q1",
        channel: "telegram",
        destination: "123456",
      }),
    });
    const url = new URL(req.url);

    const res = await handleNLQRequest(req, url, envWithoutDB);
    expect(res.status).toBe(503);
    const body = (await res.json()) as any;
    expect(body.code).toBe("DATABASE_UNAVAILABLE");
  });

  it("should return 400 validation error for invalid channel on POST /api/nlq/alerts", async () => {
    const req = new Request("https://example.com/api/nlq/alerts", {
      method: "POST",
      body: JSON.stringify({
        saved_query_id: "q1",
        channel: "invalid_channel",
        destination: "123456",
      }),
    });
    const url = new URL(req.url);

    const res = await handleNLQRequest(req, url, mockEnv);
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("should return 200 list of subscriptions on GET /api/nlq/alerts", async () => {
    const req = new Request("https://example.com/api/nlq/alerts?limit=10", {
      method: "GET",
    });
    const url = new URL(req.url);

    const res = await handleNLQRequest(req, url, mockEnv);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.subscriptions).toBeDefined();
  });

  it("should handle DELETE /api/nlq/alerts/:id", async () => {
    const req = new Request("https://example.com/api/nlq/alerts/sub_123", {
      method: "DELETE",
    });
    const url = new URL(req.url);

    const res = await handleNLQRequest(req, url, mockEnv);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.deleted).toBe("sub_123");
  });
});
